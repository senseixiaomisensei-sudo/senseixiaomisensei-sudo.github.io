import os
import sys
import numpy as np
import soundfile as sf

def main():
    print("Testing DSP simulation for shouting/loud vocal inputs...")
    sample_rate = 40000
    duration = 3.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    
    # 1. Simulate shouting vocal: high amplitude (0.95), high fundamental pitch (450Hz), lots of strong upper harmonics (900, 1350, 1800, 2250, 2700, 3150, 3600, 4050, 4500, 4950 Hz) + vocal fry / roughness
    f0 = 420.0 + 30.0 * np.sin(2 * np.pi * 5 * t)  # shouting vibrato/waver
    phase = 2 * np.pi * np.cumsum(f0) / sample_rate
    
    scream = np.zeros_like(t)
    for h in range(1, 20):
        # Dense comb harmonics typical of shouting + NSF synthesizer
        amp = 1.0 / (h ** 0.7)
        scream += amp * np.sin(h * phase + np.random.uniform(0, np.pi))
    
    # Normalize scream to high volume
    scream = scream / np.max(np.abs(scream)) * 0.95
    print(f"Generated synthetic shout: duration={duration}s, max_peak={np.max(np.abs(scream)):.4f}")

    # Let's inspect metallic resonance in 2.8kHz - 5.5kHz region
    # Measure spectral energy ratio
    fft_vals = np.abs(np.fft.rfft(scream))
    freqs = np.fft.rfftfreq(len(scream), 1.0 / sample_rate)
    
    harsh_band = (freqs >= 2800) & (freqs <= 5500)
    total_energy = np.sum(fft_vals ** 2)
    harsh_energy = np.sum(fft_vals[harsh_band] ** 2)
    print(f"Initial harsh/metallic band energy ratio: {harsh_energy / total_energy * 100:.2f}%")

if __name__ == '__main__':
    main()
