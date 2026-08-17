import os, sys, wave, math
import numpy as np
import onnxruntime as ort
from scipy import signal

MODELS = [
    ("arisu", r"E:\大肥鱼\rvc-local\convert\onnx-models\arisu.onnx"),
    ("shiroko", r"E:\大肥鱼\rvc-local\convert\onnx-models\shiroko.onnx"),
    ("yuuka", r"E:\大肥鱼\rvc-local\convert\onnx-models\yuuka.onnx"),
    ("hina", r"E:\大肥鱼\rvc-local\convert\onnx-models\hina.onnx"),
    ("noa", r"E:\大肥鱼\rvc-local\convert\onnx-models\noa.onnx"),
    ("koharu", r"E:\大肥鱼\rvc-local\convert\onnx-models\koharu.onnx"),
]

def test_model(name, model_path):
    print(f"\nTesting {name} ({os.path.basename(model_path)})...")
    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    
    # Generate test feature inputs (simulate 3.5s speech)
    T_frames = 350
    phone = np.random.randn(1, T_frames, 768).astype(np.float32) * 0.5
    phone_lengths = np.array([T_frames], dtype=np.int64)
    # F0 around 260Hz (typical girl vocal pitch)
    pitch_hz = 260.0
    pitch_midi = int(12 * math.log2(pitch_hz / 440.0) + 69)
    pitch = np.full((1, T_frames), pitch_midi, dtype=np.int64)
    nsff0 = np.full((1, T_frames), pitch_hz, dtype=np.float32)
    sid = np.array([0], dtype=np.int64)
    
    feeds = {
        "phone": phone,
        "phone_lengths": phone_lengths,
        "pitch": pitch,
        "nsff0": nsff0,
        "sid": sid
    }
    
    outputs = session.run(None, feeds)
    audio = outputs[0].squeeze()
    sr = int(outputs[1][0]) if len(outputs) > 1 else 40000
    
    max_peak = np.max(np.abs(audio))
    rms = np.sqrt(np.mean(audio**2))
    
    # Spectral test
    f, t, Zxx = signal.stft(audio, fs=sr, nperseg=1024, noverlap=512)
    magnitude = np.abs(Zxx)
    low_band = np.mean(magnitude[(f >= 100) & (f <= 4000), :])
    high_noise = np.mean(magnitude[f > 12000, :])
    snr_db = 20 * np.log10(low_band / (high_noise + 1e-6))
    
    print(f"  Sample Rate: {sr} Hz, Audio Length: {len(audio)} samples ({len(audio)/sr:.2f}s)")
    print(f"  Max Peak: {max_peak:.4f}, RMS: {rms:.4f}")
    print(f"  Acoustic SNR: {snr_db:.2f} dB")
    
    if max_peak > 0.01 and snr_db > 15:
        print(f"  >>> PASSED QUALITY CERTIFICATION <<<")
        return True
    else:
        print(f"  >>> FAILED QUALITY CHECK <<<")
        return False

if __name__ == "__main__":
    results = [test_model(n, p) for n, p in MODELS]
    print(f"\nSummary: {sum(results)} / {len(MODELS)} models passed!")
