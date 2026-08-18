import soundfile as sf
import numpy as np
import scipy.signal as signal

def deep_listen():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    print(f"Sampling rate: {sr}")
    
    # 1. Look for High-Frequency Chirps / Glitches / Ringing
    # STFT with high temporal resolution
    hop = 160
    nfft = 1024
    f, t, Zxx = signal.stft(data, sr, nperseg=nfft, noverlap=nfft - hop)
    mag = np.abs(Zxx)
    
    # Identify frequency bins with abnormal steady energy or excessive comb harmonics
    mean_mag_over_time = np.mean(mag, axis=1)
    
    # Find peaks in average spectrum
    peaks, _ = signal.find_peaks(mean_mag_over_time, prominence=0.005)
    print("\nSpectral peaks throughout whole audio:")
    for p in peaks:
        print(f"  {f[p]:7.1f} Hz : Mean Magnitude = {mean_mag_over_time[p]:.6f}")
        
    # Check if there are aliased frequencies above 8kHz
    high_aliasing = np.mean(mag[f > 8000]) / (np.mean(mag[(f > 300) & (f < 3000)]) + 1e-6)
    print(f"\nHigh frequency aliasing ratio (>8kHz vs voice body): {high_aliasing*100:.2f}%")

if __name__ == '__main__':
    deep_listen()
