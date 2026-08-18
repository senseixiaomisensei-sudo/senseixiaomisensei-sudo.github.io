import numpy as np
import scipy.signal as signal
import math
import soundfile as sf

def create_biquad_peaking(fc, gain_db, q, fs):
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * fc / fs
    alpha = math.sin(w0) / (2.0 * q)
    b0 = 1.0 + alpha * A
    b1 = -2.0 * math.cos(w0)
    b2 = 1.0 - alpha * A
    a0 = 1.0 + alpha / A
    a1 = -2.0 * math.cos(w0)
    a2 = 1.0 - alpha / A
    return [b0/a0, b1/a0, b2/a0], [1.0, a1/a0, a2/a0]

def create_biquad_bandpass(fc, q, fs):
    w0 = 2.0 * math.pi * fc / fs
    alpha = math.sin(w0) / (2.0 * q)
    b0 = alpha
    b1 = 0.0
    b2 = -alpha
    a0 = 1.0 + alpha
    a1 = -2.0 * math.cos(w0)
    a2 = 1.0 - alpha
    return [b0/a0, b1/a0, b2/a0], [1.0, a1/a0, a2/a0]

def create_biquad_high_shelf(fc, gain_db, fs):
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * fc / fs
    cosW = math.cos(w0)
    sinW = math.sin(w0)
    alpha = sinW / 2.0 * math.sqrt((A + 1.0/A)*(1.0/0.7 - 1.0) + 2.0)
    b0 = A * ((A + 1.0) + (A - 1.0) * cosW + 2.0 * math.sqrt(A) * alpha)
    b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosW)
    b2 = A * ((A + 1.0) + (A - 1.0) * cosW - 2.0 * math.sqrt(A) * alpha)
    a0 = (A + 1.0) - (A - 1.0) * cosW + 2.0 * math.sqrt(A) * alpha
    a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosW)
    a2 = (A + 1.0) - (A - 1.0) * cosW - 2.0 * math.sqrt(A) * alpha
    return [b0/a0, b1/a0, b2/a0], [1.0, a1/a0, a2/a0]

def apply_anti_metallic_dsp(audio, sample_rate=40000):
    output = np.copy(audio)
    
    # 1. Warmth
    b_w, a_w = create_biquad_peaking(220, 1.2, 0.7, sample_rate)
    output = signal.lfilter(b_w, a_w, output)
    
    # 2. Dynamic Harshness Suppression (3900Hz Q=1.1 vs 1000Hz body)
    b_harsh, a_harsh = create_biquad_bandpass(3900, 1.1, sample_rate)
    b_body, a_body = create_biquad_bandpass(1000, 0.5, sample_rate)
    
    harsh_sig = signal.lfilter(b_harsh, a_harsh, output)
    body_sig = signal.lfilter(b_body, a_body, output)
    
    block_size = int(sample_rate * 0.005)
    num_blocks = len(output) // block_size
    gain_env = np.ones(len(output), dtype=np.float32)
    smoothed_gain = 1.0
    attack_coeff = 0.20
    release_coeff = 0.025
    
    for b in range(num_blocks):
        st = b * block_size
        en = min(st + block_size, len(output))
        rms_h = np.sqrt(np.mean(harsh_sig[st:en]**2) + 1e-6)
        rms_b = np.sqrt(np.mean(body_sig[st:en]**2) + 1e-6)
        ratio = rms_h / (rms_b + 1e-4)
        
        target_gain = 1.0
        if ratio > 0.35:
            red_db = min(7.5, (ratio - 0.35) * 15.0)
            target_gain = 10.0 ** (-red_db / 20.0)
        elif rms_h > 0.12:
            red_db = min(6.0, (rms_h - 0.12) * 25.0)
            target_gain = 10.0 ** (-red_db / 20.0)
            
        for i in range(st, en):
            if target_gain < smoothed_gain:
                smoothed_gain += attack_coeff * (target_gain - smoothed_gain)
            else:
                smoothed_gain += release_coeff * (target_gain - smoothed_gain)
            gain_env[i] = smoothed_gain
            
    output = output - harsh_sig * (1.0 - gain_env)
    
    # 3. Presence & Air
    b_p, a_p = create_biquad_peaking(3600, 0.6, 0.8, sample_rate)
    output = signal.lfilter(b_p, a_p, output)
    b_a, a_a = create_biquad_high_shelf(11000, 1.0, sample_rate)
    output = signal.lfilter(b_a, a_a, output)
    
    # 4. Soft-knee vocal limiter
    for i in range(len(output)):
        val = output[i]
        av = abs(val)
        if av > 0.75:
            overshoot = av - 0.75
            comp = 0.75 + 0.20 * math.tanh(overshoot / 0.20)
            output[i] = math.copysign(comp, val)
            
    return output

if __name__ == '__main__':
    for path in [
        r'E:\Data\01-Browsers\Downloads\Chrome\4bce3ad5-9575-42fd-8472-838f6282db91.wav',
        r'E:\Data\01-Browsers\Downloads\Chrome\clean_converted_sample.wav'
    ]:
        try:
            data, sr = sf.read(path)
            if len(data.shape) > 1:
                data = data[:, 0]
            clean = apply_anti_metallic_dsp(data, sr)
            out_path = path.replace('.wav', '_antimetal.wav')
            sf.write(out_path, clean, sr)
            print(f'Processed {path} -> Peak: {np.max(np.abs(clean)):.4f}, RMS: {np.sqrt(np.mean(clean**2)):.4f}')
        except Exception as e:
            print(f'Error: {e}')
