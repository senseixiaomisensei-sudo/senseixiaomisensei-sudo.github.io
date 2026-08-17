import wave, math, struct
import numpy as np

# Load test audio
wav_path = r'E:\大肥鱼\site\tests\debug-output.wav'
with wave.open(wav_path, 'rb') as w:
    sr = w.getframerate()
    audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

# 1. Biquad filter implementation for Vocal Polish (Warmth, Clarity, Air)
def biquad_filter(audio, b0, b1, b2, a1, a2):
    y = np.zeros_like(audio)
    x1, x2, y1, y2 = 0.0, 0.0, 0.0, 0.0
    for i in range(len(audio)):
        x0 = audio[i]
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y[i] = y0
        x2 = x1
        x1 = x0
        y2 = y1
        y1 = y0
    return y

def peaking_eq(fc, gain_db, q, fs=40000):
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * math.pi * fc / fs
    alpha = math.sin(w0) / (2 * q)
    b0 = 1 + alpha * A
    b1 = -2 * math.cos(w0)
    b2 = 1 - alpha * A
    a0 = 1 + alpha / A
    a1 = -2 * math.cos(w0)
    a2 = 1 - alpha / A
    return b0/a0, b1/a0, b2/a0, a1/a0, a2/a0

def high_shelf_eq(fc, gain_db, fs=40000):
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * math.pi * fc / fs
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    alpha = sin_w0 / 2 * math.sqrt((A + 1/A)*(1/0.7 - 1) + 2)
    b0 = A * ((A + 1) + (A - 1) * cos_w0 + 2 * math.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0)
    b2 = A * ((A + 1) + (A - 1) * cos_w0 - 2 * math.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * cos_w0 + 2 * math.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * cos_w0)
    a2 = (A + 1) - (A - 1) * cos_w0 - 2 * math.sqrt(A) * alpha
    return b0/a0, b1/a0, b2/a0, a1/a0, a2/a0

# Apply Warmth (220Hz, +1.2dB)
b0, b1, b2, a1, a2 = peaking_eq(220, 1.2, 0.7, sr)
audio_warm = biquad_filter(audio, b0, b1, b2, a1, a2)

# Apply Clarity / Presence (3800Hz, +1.5dB)
b0, b1, b2, a1, a2 = peaking_eq(3800, 1.5, 0.8, sr)
audio_clear = biquad_filter(audio_warm, b0, b1, b2, a1, a2)

# Apply Air / Breathiness (11000Hz, +1.3dB)
b0, b1, b2, a1, a2 = high_shelf_eq(11000, 1.3, sr)
audio_polished = biquad_filter(audio_clear, b0, b1, b2, a1, a2)

# Peak normalize
max_peak = np.max(np.abs(audio_polished))
if max_peak > 0.85:
    audio_polished = audio_polished / max_peak * 0.85

pcm = np.clip(audio_polished * 32767.0, -32768, 32767).astype(np.int16)

out_path = r'E:\大肥鱼\site\tests\polished_sample.wav'
with wave.open(out_path, 'wb') as dst:
    dst.setnchannels(1)
    dst.setsampwidth(2)
    dst.setframerate(sr)
    dst.writeframes(pcm.tobytes())

print(f'Polished audio written to {out_path}')
print(f'Max Peak: {np.max(np.abs(pcm))}, RMS: {np.sqrt(np.mean(pcm.astype(float)**2)):.2f}')
