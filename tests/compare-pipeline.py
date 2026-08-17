import wave, struct, math
import numpy as np
import onnxruntime as ort

# 1. Read input 16k mono wav
wav_path = r'E:\大肥鱼\rvc-local\convert\test-input-16k.wav'
with wave.open(wav_path, 'rb') as w:
    sr = w.getframerate()
    n_frames = w.getnframes()
    raw = w.readframes(n_frames)
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

print(f'Input audio: {len(audio)} samples, {len(audio)/16000:.2f}s')

# Normalize audio
audio = audio - np.mean(audio)
max_peak = np.max(np.abs(audio))
if max_peak > 0.9:
    audio = audio / max_peak * 0.9

# 2. HuBERT Feature extraction
hubert_sess = ort.InferenceSession(r'E:\大肥鱼\site\models\base\hubert.onnx', providers=['CPUExecutionProvider'])
hubert_inp = audio.reshape(1, -1).astype(np.float32)
padding_mask = np.zeros((1, hubert_inp.shape[1]), dtype=bool)

hubert_out = hubert_sess.run(['features'], {'source': hubert_inp, 'padding_mask': padding_mask})[0]
print(f'HuBERT output shape: {hubert_out.shape}') # (1, 768, frames) or (1, frames, 768)

if hubert_out.shape[1] == 768:
    # Transpose to (1, frames, 768)
    feats = np.transpose(hubert_out, (0, 2, 1))
else:
    feats = hubert_out

print(f'Transposed feats: {feats.shape}')

# 3. RMVPE Pitch extraction
rmvpe_sess = ort.InferenceSession(r'E:\大肥鱼\site\models\base\rmvpe.onnx', providers=['CPUExecutionProvider'])
rmvpe_inp = audio.reshape(1, -1).astype(np.float32)
rmvpe_out = rmvpe_sess.run(['output'], {'input': rmvpe_inp})[0]
print(f'RMVPE output shape: {rmvpe_out.shape}') # (1, 360, frames) or (1, frames)

# Process RMVPE output to get F0 in Hz
if len(rmvpe_out.shape) == 3:
    # (1, 360, frames) -> argmax or weighted sum
    # In RMVPE: cents = 10 * (2000 + 5 * i)
    # f0 = 10 * (2 ** (cents / 1200))
    cents_bins = 2000 + 5 * np.arange(360)
    f0_bins = 10 * (2 ** (cents_bins / 1200.0))
    probs = rmvpe_out[0] # (360, frames)
    # softmax if logits
    exp_p = np.exp(probs - np.max(probs, axis=0, keepdims=True))
    probs = exp_p / np.sum(exp_p, axis=0, keepdims=True)
    f0 = np.sum(probs * f0_bins[:, None], axis=0)
    # V/UV threshold
    max_prob = np.max(probs, axis=0)
    f0[max_prob < 0.3] = 0
else:
    f0 = rmvpe_out.flatten()

print(f'RMVPE F0 frames: {len(f0)}, min: {np.min(f0[f0>0]) if np.any(f0>0) else 0:.1f}Hz, max: {np.max(f0):.1f}Hz')

# Test both repeat and linear upsampling
model_sess = ort.InferenceSession(r'E:\大肥鱼\site\models\characters\tomori.onnx', providers=['CPUExecutionProvider'])

for mode in ['repeat', 'linear']:
    if mode == 'repeat':
        # Repeat every frame 2x: (1, 2*T, 768)
        feats_up = np.repeat(feats, 2, axis=1)
    else:
        # Linear interpolation
        t_orig = np.linspace(0, 1, feats.shape[1])
        t_new = np.linspace(0, 1, feats.shape[1] * 2)
        feats_up = np.zeros((1, feats.shape[1] * 2, feats.shape[2]), dtype=np.float32)
        for d in range(feats.shape[2]):
            feats_up[0, :, d] = np.interp(t_new, t_orig, feats[0, :, d])

    # Align frame counts
    n_frames = min(feats_up.shape[1], len(f0))
    phone = feats_up[:, :n_frames, :].astype(np.float32)
    phone_len = np.array([n_frames], dtype=np.int64)
    nsff0 = f0[:n_frames].reshape(1, n_frames).astype(np.float32)

    # Quantize pitch
    F0_MIN = 50.0
    F0_MAX = 1100.0
    F0_MEL_MIN = 1127.0 * np.log(1.0 + F0_MIN / 700.0)
    F0_MEL_MAX = 1127.0 * np.log(1.0 + F0_MAX / 700.0)
    
    pitch = np.zeros((1, n_frames), dtype=np.int64)
    for i in range(n_frames):
        hz = nsff0[0, i]
        if hz <= 0:
            pitch[0, i] = 1
        else:
            mel = 1127.0 * np.log(1.0 + hz / 700.0)
            q = (mel - F0_MEL_MIN) * 254.0 / (F0_MEL_MAX - F0_MEL_MIN) + 1.0
            pitch[0, i] = int(np.clip(round(q), 1, 255))

    sid = np.array([0], dtype=np.int64)

    # Run RVC inference
    inputs = {
        'phone': phone,
        'phone_lengths': phone_len,
        'pitch': pitch,
        'nsff0': nsff0,
        'sid': sid
    }
    synth_out = model_sess.run(None, inputs)
    out_audio = synth_out[0].flatten()
    sr_out = int(synth_out[1][0]) if len(synth_out) > 1 else 40000

    print(f'Mode [{mode}]: output audio length {len(out_audio)}, sr={sr_out}, min={np.min(out_audio):.2f}, max={np.max(out_audio):.2f}')

    # Peak normalize
    max_p = np.max(np.abs(out_audio))
    norm_audio = (out_audio / max_p * 0.85) if max_p > 0.85 else out_audio
    pcm = np.clip(norm_audio * 32767.0, -32768, 32767).astype(np.int16)

    out_file = f'E:\\大肥鱼\\site\\tests\\synth_out_{mode}.wav'
    with wave.open(out_file, 'wb') as dst:
        dst.setnchannels(1)
        dst.setsampwidth(2)
        dst.setframerate(sr_out)
        dst.writeframes(pcm.tobytes())
    print(f'Saved {out_file} ({len(pcm)/sr_out:.2f}s)')
