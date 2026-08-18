import soundfile as sf
import numpy as np
import scipy.signal as signal

def inspect_scream_section():
    path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    data, sr = sf.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
        
    start_samp = int(3.5 * sr)
    end_samp = int(5.5 * sr)
    section = data[start_samp:end_samp]
    
    # Save this exact 2s section as a snippet for inspection
    sf.write(r'E:\Data\01-Browsers\Downloads\Chrome\scream_section.wav', section, sr)
    print(f"Saved scream_section.wav: {len(section)} samples ({len(section)/sr:.2f}s)")
    
    # Analyze frequency spectrum of this scream section
    fft = np.abs(np.fft.rfft(section * np.hanning(len(section))))
    freqs = np.fft.rfftfreq(len(section), 1.0 / sr)
    
    # Find the top 10 resonance peaks in this scream
    peak_indices, _ = signal.find_peaks(fft, height=np.max(fft)*0.05, distance=int(len(fft)/200))
    sorted_peaks = sorted(peak_indices, key=lambda idx: fft[idx], reverse=True)[:15]
    sorted_peaks.sort()
    
    print("\nTop resonance peaks in scream section (3.5s - 5.5s):")
    for p in sorted_peaks:
        print(f"  Freq: {freqs[p]:7.1f} Hz, Amplitude: {fft[p]:10.2f}")

if __name__ == '__main__':
    inspect_scream_section()
