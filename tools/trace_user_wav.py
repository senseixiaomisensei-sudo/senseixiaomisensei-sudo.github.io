import soundfile as sf
import numpy as np
import scipy.signal as signal
import math

def trace_audio_detail():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    print(f"Total samples: {len(data)}, duration: {len(data)/sr:.3f}s")
    
    # Break into 0.5s segments to analyze RMS, zero crossings, spectral centroid, spectral rolloff, spectral flatness
    seg_len = int(sr * 0.5)
    num_segs = len(data) // seg_len
    
    for s in range(num_segs):
        seg = data[s*seg_len : (s+1)*seg_len]
        rms = np.sqrt(np.mean(seg**2))
        peak = np.max(np.abs(seg))
        
        # Zero crossing rate
        zcr = np.sum(np.abs(np.diff(np.sign(seg)))) / (2 * len(seg))
        
        # FFT
        fft = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        freqs = np.fft.rfftfreq(len(seg), 1.0/sr)
        
        # Spectral centroid
        centroid = np.sum(freqs * fft) / (np.sum(fft) + 1e-8)
        
        # Spectral Flatness (Wiener entropy): exp(mean(log(p))) / mean(p)
        power = fft**2 + 1e-12
        flatness = np.exp(np.mean(np.log(power))) / np.mean(power)
        
        # Upper harmonic ratio (>2500Hz / total)
        high_mask = freqs >= 2500
        high_ratio = np.sum(power[high_mask]) / np.sum(power)
        
        print(f"[{s*0.5:4.1f}s - {(s+1)*0.5:4.1f}s] Peak: {peak:.4f}, RMS: {rms:.4f}, Centroid: {centroid:6.1f}Hz, HighRatio: {high_ratio*100:5.2f}%, Flatness: {flatness:.6f}")

if __name__ == '__main__':
    trace_audio_detail()
