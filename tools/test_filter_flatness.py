import numpy as np
import scipy.signal as signal

def test_filter_flatness():
    sr = 40000
    # Create an impulse
    impulse = np.zeros(4096)
    impulse[0] = 1.0
    
    # Simulate the biquads from inference.worker.js
    def biquad_lp(fc, q, fs):
        w0 = 2 * np.pi * fc / fs
        alpha = np.sin(w0) / (2 * q)
        cosW = np.cos(w0)
        b = [(1 - cosW)/2, 1 - cosW, (1 - cosW)/2]
        a = [1 + alpha, -2 * cosW, 1 - alpha]
        return np.array(b)/a[0], np.array(a)/a[0]
        
    def biquad_hp(fc, q, fs):
        w0 = 2 * np.pi * fc / fs
        alpha = np.sin(w0) / (2 * q)
        cosW = np.cos(w0)
        b = [(1 + cosW)/2, -(1 + cosW), (1 + cosW)/2]
        a = [1 + alpha, -2 * cosW, 1 - alpha]
        return np.array(b)/a[0], np.array(a)/a[0]
        
    def biquad_bp(fc, q, fs):
        w0 = 2 * np.pi * fc / fs
        alpha = np.sin(w0) / (2 * q)
        cosW = np.cos(w0)
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cosW, 1 - alpha]
        return np.array(b)/a[0], np.array(a)/a[0]

    b_l1, a_l1 = biquad_lp(2500, 0.54, sr)
    b_l2, a_l2 = biquad_lp(2500, 1.30, sr)
    low = signal.lfilter(b_l2, a_l2, signal.lfilter(b_l1, a_l1, impulse))
    
    b_h1, a_h1 = biquad_hp(6500, 0.54, sr)
    b_h2, a_h2 = biquad_hp(6500, 1.30, sr)
    high = signal.lfilter(b_h2, a_h2, signal.lfilter(b_h1, a_h1, impulse))
    
    b_m1, a_m1 = biquad_bp(4000, 0.9, sr)
    b_m2, a_m2 = biquad_bp(4000, 0.9, sr)
    mid = signal.lfilter(b_m2, a_m2, signal.lfilter(b_m1, a_m1, impulse))
    
    # Sum when gain = 1
    summed = low + mid + high
    
    w, h = signal.freqz(summed, 1, worN=2048, fs=sr)
    mag_db = 20 * np.log10(np.abs(h) + 1e-12)
    
    print(f"Max dB variation in filter sum (should be 0 dB for flat reconstruction):")
    print(f"  Min dB: {np.min(mag_db):.2f} dB, Max dB: {np.max(mag_db):.2f} dB")
    print(f"  Dip at 2500Hz: {mag_db[np.argmin(np.abs(w - 2500))]:.2f} dB")
    print(f"  Dip at 6500Hz: {mag_db[np.argmin(np.abs(w - 6500))]:.2f} dB")

if __name__ == '__main__':
    test_filter_flatness()
