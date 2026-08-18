import soundfile as sf
import numpy as np

def compare():
    raw_path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav'
    fixed_path = r'E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a_fixed_metallic.wav'
    
    raw_data, sr = sf.read(raw_path)
    fixed_data, _ = sf.read(fixed_path)
    
    # Analyze the scream region (3.5s - 5.5s)
    st = int(3.5 * sr)
    en = int(5.5 * sr)
    
    raw_scream = raw_data[st:en]
    fixed_scream = fixed_data[st:en]
    
    fft_raw = np.abs(np.fft.rfft(raw_scream * np.hanning(len(raw_scream))))
    fft_fixed = np.abs(np.fft.rfft(fixed_scream * np.hanning(len(fixed_scream))))
    freqs = np.fft.rfftfreq(len(raw_scream), 1.0 / sr)
    
    # Check metallic band (3000Hz - 6000Hz) vs fundamental core (300Hz - 1500Hz)
    core_mask = (freqs >= 300) & (freqs <= 1500)
    harsh_mask = (freqs >= 3000) & (freqs <= 6000)
    
    raw_core = np.sum(fft_raw[core_mask]**2)
    raw_harsh = np.sum(fft_raw[harsh_mask]**2)
    
    fixed_core = np.sum(fft_fixed[core_mask]**2)
    fixed_harsh = np.sum(fft_fixed[harsh_mask]**2)
    
    print(f"Raw Scream Core Power: {raw_core:.2e}, Harsh Power: {raw_harsh:.2e}, Ratio: {raw_harsh/raw_core*100:.2f}%")
    print(f"Fixed Scream Core Power: {fixed_core:.2e}, Harsh Power: {fixed_harsh:.2e}, Ratio: {fixed_harsh/fixed_core*100:.2f}%")
    print(f"Harshness Reduction: {(1.0 - (fixed_harsh/fixed_core)/(raw_harsh/raw_core))*100:.2f}%")

if __name__ == '__main__':
    compare()
