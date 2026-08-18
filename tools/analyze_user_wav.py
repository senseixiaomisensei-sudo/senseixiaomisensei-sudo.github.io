import soundfile as sf
import numpy as np
import scipy.signal as signal
import math

def analyze_audio():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    print(f"--- Audio Analysis for {path} ---")
    print(f"Length: {len(data)} samples ({len(data)/sr:.3f}s) at {sr}Hz")
    print(f"Peak: {np.max(np.abs(data)):.4f}, RMS: {np.sqrt(np.mean(data**2)):.4f}")
    
    # 1. FFT Spectral distribution in frequency bands
    fft_vals = np.abs(np.fft.rfft(data))
    freqs = np.fft.rfftfreq(len(data), 1.0 / sr)
    
    bands = [
        ("Sub-bass (0-150Hz)", 0, 150),
        ("Bass/Fundamental (150-500Hz)", 150, 500),
        ("Low-Mid Body (500-1500Hz)", 500, 1500),
        ("Mid Presence (1500-3000Hz)", 1500, 3000),
        ("Harsh/Metallic Band (3000-6000Hz)", 3000, 6000),
        ("Sibilance (6000-10000Hz)", 6000, 10000),
        ("Air/Ultra-high (>10000Hz)", 10000, 20000),
    ]
    
    total_power = np.sum(fft_vals**2)
    for name, low, high in bands:
        mask = (freqs >= low) & (freqs < high)
        p = np.sum(fft_vals[mask]**2)
        print(f"  {name:35s}: {p/total_power*100:6.2f}% energy")

    # 2. Time-frequency Spectrogram & Peak Resonance Search
    f, t, Sxx = signal.spectrogram(data, sr, nperseg=1024, noverlap=512)
    # Find static/ringing frequencies across time
    mean_spec = np.mean(Sxx, axis=1)
    
    # Find peaks in spectrum
    peaks, props = signal.find_peaks(mean_spec, prominence=np.max(mean_spec)*0.02, distance=5)
    print("\nProminent spectral resonance peaks:")
    for p in peaks:
        if f[p] > 200:
            print(f"  Freq: {f[p]:.1f} Hz, Power: {mean_spec[p]:.6f}")

    # 3. Check for high-frequency comb-filtering or phase cancellation
    # Autocorrelation of the spectrum (cepstral / comb filter detection)
    print("\nAnalyzing comb filtering / robotic periodicity...")
    # Frame by frame autocorrelation
    frame_size = 2048
    hop = 1024
    num_frames = (len(data) - frame_size) // hop
    max_corrs = []
    for i in range(num_frames):
        frame = data[i*hop : i*hop + frame_size] * np.hanning(frame_size)
        corr = np.correlate(frame, frame, mode='full')
        corr = corr[len(corr)//2 :]
        corr = corr / (corr[0] + 1e-8)
        # Search for secondary peaks in 1ms - 10ms range (100Hz - 1000Hz)
        min_lag = int(sr * 0.001) # 1ms
        max_lag = int(sr * 0.015) # 15ms
        if len(corr) > max_lag:
            max_corrs.append(np.max(corr[min_lag:max_lag]))
            
    print(f"Mean periodic peak correlation in voiced frames: {np.mean(max_corrs):.4f}")

if __name__ == '__main__':
    analyze_audio()
