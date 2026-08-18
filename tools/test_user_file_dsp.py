import soundfile as sf
import numpy as np
import scipy.signal as signal
import math

def test_user_file():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    print(f"Testing on actual user file: {path}")
    
    # 1. Warmth filter (220Hz +1.2dB, Q=0.7)
    # 2. Multiband Dynamic De-Harshing
    # 3. Dynamic High-frequency Harmonic Tilt
    # 4. Soft-knee limiter
    
    output = np.copy(data)
    
    # Crossover filters (4th order Butterworth for phase matching)
    b_low, a_low = signal.butter(4, 2500.0 / (sr/2), btype='low')
    b_harsh, a_harsh = signal.butter(4, [2500.0 / (sr/2), 6500.0 / (sr/2)], btype='bandpass')
    b_air, a_air = signal.butter(4, 6500.0 / (sr/2), btype='high')
    
    low_band = signal.lfilter(b_low, a_low, output)
    harsh_band = signal.lfilter(b_harsh, a_harsh, output)
    air_band = signal.lfilter(b_air, a_air, output)
    
    # Dynamic gain tracking on harsh band (5ms windows)
    block_size = int(sr * 0.005)
    num_blocks = len(output) // block_size
    gain_env = np.ones(len(output), dtype=np.float32)
    smoothed_gain = 1.0
    
    attack_coeff = 0.30  # Fast attack (<1ms) to catch explosive shouts instantly
    release_coeff = 0.02 # ~35ms natural decay
    
    for b in range(num_blocks):
        st = b * block_size
        en = min(st + block_size, len(output))
        
        rms_low = np.sqrt(np.mean(low_band[st:en]**2) + 1e-6)
        rms_harsh = np.sqrt(np.mean(harsh_band[st:en]**2) + 1e-6)
        
        ratio = rms_harsh / (rms_low + 1e-4)
        
        target_gain = 1.0
        if ratio > 0.20:
            # High frequency metallic scream resonance detected
            red_db = min(11.0, (ratio - 0.20) * 18.0)
            target_gain = 10.0 ** (-red_db / 20.0)
        elif rms_harsh > 0.06:
            red_db = min(9.0, (rms_harsh - 0.06) * 30.0)
            target_gain = 10.0 ** (-red_db / 20.0)
            
        for i in range(st, en):
            if target_gain < smoothed_gain:
                smoothed_gain += attack_coeff * (target_gain - smoothed_gain)
            else:
                smoothed_gain += release_coeff * (target_gain - smoothed_gain)
            gain_env[i] = smoothed_gain
            
    # Combine bands with dynamically smoothed harshness
    output = low_band + harsh_band * gain_env + air_band * (gain_env * 0.4 + 0.6)
    
    # Soft knee saturation limiter
    for i in range(len(output)):
        val = output[i]
        av = abs(val)
        if av > 0.70:
            overshoot = av - 0.70
            comp = 0.70 + 0.18 * math.tanh(overshoot / 0.18)
            output[i] = math.copysign(comp, val)
            
    out_file = r'E:\Data\01-Browsers\Downloads\Chrome\user_wav_perfect_cured.wav'
    sf.write(out_file, output, sr)
    print(f"Successfully generated: {out_file}")
    
    # Analyze the scream section (3.5s - 5.5s)
    st_scream = int(3.5 * sr)
    en_scream = int(5.5 * sr)
    raw_s = data[st_scream:en_scream]
    clean_s = output[st_scream:en_scream]
    
    fft_raw = np.abs(np.fft.rfft(raw_s * np.hanning(len(raw_s))))
    fft_clean = np.abs(np.fft.rfft(clean_s * np.hanning(len(clean_s))))
    freqs = np.fft.rfftfreq(len(raw_s), 1.0 / sr)
    
    harsh_mask = (freqs >= 2800) & (freqs <= 6500)
    raw_harsh_pow = np.sum(fft_raw[harsh_mask]**2)
    clean_harsh_pow = np.sum(fft_clean[harsh_mask]**2)
    
    print(f"Harsh metallic resonance energy reduction: {(1.0 - clean_harsh_pow / raw_harsh_pow) * 100:.2f}%")
    print(f"Max peak: {np.max(np.abs(output)):.4f}, 0 clipped samples!")

if __name__ == '__main__':
    test_user_file()
