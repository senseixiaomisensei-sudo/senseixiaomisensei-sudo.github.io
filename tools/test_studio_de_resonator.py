import soundfile as sf
import numpy as np
import scipy.signal as signal
import math

def test_studio_dynamic_de_resonator():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    print(f"--- Testing Studio-Grade Dynamic De-Resonator on {path} ---")
    
    # 1. Warmth filter (Peaking at 200Hz, +1.0dB, Q=0.7)
    # Direct biquad peaking formula
    def make_peaking(fc, gain_db, q, fs):
        A = 10.0 ** (gain_db / 40.0)
        w0 = 2.0 * np.pi * fc / fs
        alpha = np.sin(w0) / (2.0 * q)
        b0 = 1.0 + alpha * A
        b1 = -2.0 * np.cos(w0)
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * np.cos(w0)
        a2 = 1.0 - alpha / A
        return np.array([b0, b1, b2]) / a0, np.array([a0, a1, a2]) / a0

    def make_highshelf(fc, gain_db, fs):
        A = 10.0 ** (gain_db / 40.0)
        w0 = 2.0 * np.pi * fc / fs
        cosW = np.cos(w0)
        sinW = np.sin(w0)
        alpha = sinW / 2.0 * np.sqrt((A + 1.0/A)*(1.0/0.7 - 1.0) + 2.0)
        b0 = A * ((A + 1.0) + (A - 1.0) * cosW + 2.0 * np.sqrt(A) * alpha)
        b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosW)
        b2 = A * ((A + 1.0) + (A - 1.0) * cosW - 2.0 * np.sqrt(A) * alpha)
        a0 = (A + 1.0) - (A - 1.0) * cosW + 2.0 * np.sqrt(A) * alpha
        a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosW)
        a2 = (A + 1.0) - (A - 1.0) * cosW - 2.0 * np.sqrt(A) * alpha
        return np.array([b0, b1, b2]) / a0, np.array([a0, a1, a2]) / a0

    # Base warmth
    b_warm, a_warm = make_peaking(200, 1.0, 0.7, sr)
    out = signal.lfilter(b_warm, a_warm, data)

    # Dynamic detection (Harsh 3400-5600Hz vs Voice body 300-2000Hz)
    b_det_harsh, a_det_harsh = signal.butter(2, [3400.0 / (sr/2), 5600.0 / (sr/2)], btype='bandpass')
    b_det_body, a_det_body = signal.butter(2, [300.0 / (sr/2), 2000.0 / (sr/2)], btype='bandpass')
    
    det_harsh = signal.lfilter(b_det_harsh, a_det_harsh, out)
    det_body = signal.lfilter(b_det_body, a_det_body, out)
    
    block_size = int(sr * 0.005) # 5ms
    num_blocks = len(out) // block_size
    gain_db_env = np.zeros(len(out), dtype=np.float32)
    smoothed_gain_db = 0.0
    
    for b in range(num_blocks):
        st = b * block_size
        en = min(st + block_size, len(out))
        rms_harsh = np.sqrt(np.mean(det_harsh[st:en]**2) + 1e-6)
        rms_body = np.sqrt(np.mean(det_body[st:en]**2) + 1e-6)
        ratio = rms_harsh / (rms_body + 1e-4)
        
        target_gain_db = 0.0
        if ratio > 0.20:
            target_gain_db = -min(9.5, (ratio - 0.20) * 22.0)
        elif rms_harsh > 0.07:
            target_gain_db = -min(8.0, (rms_harsh - 0.07) * 35.0)
            
        for i in range(st, en):
            if target_gain_db < smoothed_gain_db:
                smoothed_gain_db += 0.35 * (target_gain_db - smoothed_gain_db)
            else:
                smoothed_gain_db += 0.02 * (target_gain_db - smoothed_gain_db)
            gain_db_env[i] = smoothed_gain_db

    # Dynamic time-varying IIR filter processing (sample by sample direct form II transposed)
    # Target notch center: 4200 Hz, Q: 1.0
    w0 = 2.0 * np.pi * 4200.0 / sr
    cosW = np.cos(w0)
    sinW = np.sin(w0)
    alpha = sinW / (2.0 * 1.0)
    
    # Process dynamic notch
    processed = np.zeros_like(out)
    s1, s2 = 0.0, 0.0
    for i in range(len(out)):
        g_db = gain_db_env[i]
        if abs(g_db) < 0.05:
            # Bypass when no shouting
            processed[i] = out[i]
            s1 = 0.0
            s2 = 0.0
        else:
            A = 10.0 ** (g_db / 40.0)
            b0 = 1.0 + alpha * A
            b1 = -2.0 * cosW
            b2 = 1.0 - alpha * A
            a0 = 1.0 + alpha / A
            a1 = -2.0 * cosW
            a2 = 1.0 - alpha / A
            
            nb0 = b0 / a0
            nb1 = b1 / a0
            nb2 = b2 / a0
            na1 = a1 / a0
            na2 = a2 / a0
            
            x0 = out[i]
            y0 = nb0 * x0 + s1
            s1 = nb1 * x0 - na1 * y0 + s2
            s2 = nb2 * x0 - na2 * y0
            processed[i] = y0

    # Soft knee saturation limiter
    for i in range(len(processed)):
        val = processed[i]
        av = abs(val)
        if av > 0.70:
            overshoot = av - 0.70
            comp = 0.70 + 0.18 * math.tanh(overshoot / 0.18)
            processed[i] = math.copysign(comp, val)
            
    out_file = r'E:\Data\01-Browsers\Downloads\Chrome\studio_fixed.wav'
    sf.write(out_file, processed, sr)
    print(f"Generated studio-grade audio: {out_file}")
    
    # Evaluate scream section (3.5s - 5.5s)
    st_s = int(3.5 * sr)
    en_s = int(5.5 * sr)
    fft_raw = np.abs(np.fft.rfft(data[st_s:en_s]))
    fft_clean = np.abs(np.fft.rfft(processed[st_s:en_s]))
    freqs = np.fft.rfftfreq(en_s - st_s, 1.0 / sr)
    
    harsh_m = (freqs >= 3200) & (freqs <= 5500)
    p_raw = np.sum(fft_raw[harsh_m]**2)
    p_clean = np.sum(fft_clean[harsh_m]**2)
    print(f"Harmonic scream metallic reduction: {(1.0 - p_clean/p_raw)*100:.2f}%")
    print(f"Max peak: {np.max(np.abs(processed)):.4f}")

if __name__ == '__main__':
    test_studio_dynamic_de_resonator()
