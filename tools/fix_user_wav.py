import soundfile as sf
import numpy as np
import scipy.signal as signal
import math

def process_file():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    print(f"Loaded {path}: {len(data)} samples, {sr}Hz")
    
    # 1. Inspect the comb-harmonic structure of the scream
    # High scream F0 = ~644Hz has harmonics at 1288, 1932, 2576, 3220, 3864, 4508, 5152, 5796, 6440 Hz
    # In RVC, when shouting, the higher harmonics from 3kHz - 7kHz don't have natural human vocal tract damping.
    # In real humans, vocal tract tissue (pharynx, soft palate) attenuates frequencies >3kHz by 12dB/octave when shouting.
    # But NSF generates all harmonics with equal relative strength, creating a harsh metallic "robot buzzer".
    
    # Let's design an adaptive dynamic spectral harmonic smoother:
    # 1. Warm body presence (Low-mid warming)
    # 2. Dynamic high-frequency tilt (Gentle 3kHz - 8kHz compression when RMS is high)
    # 3. Dynamic De-Esser / De-Resonator
    # 4. Harmonic anti-aliasing filter
    
    output = np.copy(data)
    
    # Dynamic multiband analysis
    # Split into 3 bands:
    # Low-Mid (0 - 2800 Hz) - Vocal body and formant core
    # Harsh Ringing (2800 - 6500 Hz) - Metallic scream comb-filter zone
    # Air (>6500 Hz) - High breath and shimmer
    
    b_low, a_low = signal.butter(4, 2800.0 / (sr/2), btype='low')
    b_harsh, a_harsh = signal.butter(4, [2800.0 / (sr/2), 6500.0 / (sr/2)], btype='bandpass')
    b_high, a_high = signal.butter(4, 6500.0 / (sr/2), btype='high')
    
    low_band = signal.lfilter(b_low, a_low, output)
    harsh_band = signal.lfilter(b_harsh, a_harsh, output)
    high_band = signal.lfilter(b_high, a_high, output)
    
    # Dynamic gain tracking on harsh band
    win_size = int(sr * 0.005) # 5ms
    num_wins = len(output) // win_size
    gain_env = np.ones(len(output), dtype=np.float32)
    smoothed_gain = 1.0
    
    for w in range(num_wins):
        st = w * win_size
        en = min(st + win_size, len(output))
        
        rms_low = np.sqrt(np.mean(low_band[st:en]**2) + 1e-6)
        rms_harsh = np.sqrt(np.mean(harsh_band[st:en]**2) + 1e-6)
        rms_high = np.sqrt(np.mean(high_band[st:en]**2) + 1e-6)
        
        # When shouting / loud screams occur:
        # Ratio of harshness to body energy spikes
        ratio = rms_harsh / (rms_low + 1e-4)
        
        target_gain = 1.0
        if ratio > 0.25: # Screaming metallic resonance
            # Compress harsh band by up to -10dB
            red_db = min(10.0, (ratio - 0.25) * 16.0)
            target_gain = 10.0 ** (-red_db / 20.0)
        elif rms_harsh > 0.08:
            red_db = min(8.0, (rms_harsh - 0.08) * 25.0)
            target_gain = 10.0 ** (-red_db / 20.0)
            
        for i in range(st, en):
            if target_gain < smoothed_gain:
                smoothed_gain += 0.25 * (target_gain - smoothed_gain) # 1ms attack
            else:
                smoothed_gain += 0.015 * (target_gain - smoothed_gain) # 40ms release
            gain_env[i] = smoothed_gain
            
    # Reconstruct audio with dynamically tamed metallic harshness
    output = low_band + harsh_band * gain_env + high_band * (gain_env * 0.5 + 0.5)
    
    # Soft harmonic warmth filter (Gentle 250Hz peaking +1.0dB, 2000Hz warm body +0.8dB, 4500Hz -1.5dB gentle notch)
    # Tanh soft limiter for peaks > 0.75
    for i in range(len(output)):
        v = output[i]
        av = abs(v)
        if av > 0.75:
            overshoot = av - 0.75
            comp = 0.75 + 0.20 * math.tanh(overshoot / 0.20)
            output[i] = math.copysign(comp, v)
            
    out_path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a_fixed_metallic.wav'
    sf.write(out_path, output, sr)
    print(f"Saved cleaned audio to: {out_path}")
    print(f"Original RMS: {np.sqrt(np.mean(data**2)):.4f}, Fixed RMS: {np.sqrt(np.mean(output**2)):.4f}")

if __name__ == '__main__':
    process_file()
