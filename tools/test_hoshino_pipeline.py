import os, soundfile as sf, numpy as np, onnxruntime as ort
import scipy.signal as signal

def run_full_pipeline_test():
    test_wav_path = r"E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav"
    data, sr = sf.read(test_wav_path)
    if len(data.shape) > 1: data = data[:, 0]
    
    print(f"Loaded input wav: {len(data)/sr:.2f}s, sr={sr}")
    
    # 1. Resample to 16000
    if sr != 16000:
        num_samples = int(len(data) * 16000 / sr)
        data_16k = signal.resample(data, num_samples).astype(np.float32)
    else:
        data_16k = data.astype(np.float32)
        
    hubert_path = r"E:\大肥鱼\rvc-local\onnx-base\hubert.onnx"
    rmvpe_path = r"E:\大肥鱼\rvc-local\onnx-base\rmvpe.onnx"
    hoshino_path = r"E:\大肥鱼\rvc-local\convert\onnx-models\hoshino.onnx"
    
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    
    print("Loading HuBERT...")
    hubert_sess = ort.InferenceSession(hubert_path, opts, providers=['CPUExecutionProvider'])
    print("Loading RMVPE...")
    rmvpe_sess = ort.InferenceSession(rmvpe_path, opts, providers=['CPUExecutionProvider'])
    print("Loading Hoshino...")
    hoshino_sess = ort.InferenceSession(hoshino_path, opts, providers=['CPUExecutionProvider'])
    
    # Run HuBERT
    src = data_16k[None, :]
    mask = np.zeros((1, src.shape[1]), dtype=bool)
    feats_out = hubert_sess.run(None, {'source': src, 'padding_mask': mask})[0]
    # feats_out: [1, T, 768]
    print("HuBERT output shape:", feats_out.shape)
    
    # Upsample 2x
    T = feats_out.shape[1]
    upsampled = np.zeros((1, T * 2, 768), dtype=np.float32)
    for i in range(T):
        upsampled[0, i * 2] = feats_out[0, i]
        upsampled[0, i * 2 + 1] = feats_out[0, i]
        
    # Run RMVPE
    # rmvpe input
    rmvpe_in = data_16k[None, :]
    f0 = rmvpe_sess.run(None, {'waveform': rmvpe_in})[0][0]
    print("RMVPE f0 len:", len(f0))
    
    # Shift pitch (Hoshino default pitch: +2)
    shift_semitones = 2.0
    factor = 2.0 ** (shift_semitones / 12.0)
    shifted_f0 = np.clip(f0 * factor, 0, 820.0).astype(np.float32)
    
    # Quantized pitch
    L = min(upsampled.shape[1], len(shifted_f0))
    pitch_q = np.zeros(L, dtype=np.int64)
    F0_MIN, F0_MAX = 50.0, 1100.0
    F0_MEL_MIN = 1127.0 * np.log(1.0 + F0_MIN / 700.0)
    F0_MEL_MAX = 1127.0 * np.log(1.0 + F0_MAX / 700.0)
    
    for i in range(L):
        hz = shifted_f0[i]
        if hz <= 0:
            pitch_q[i] = 1
        else:
            mel = 1127.0 * np.log(1.0 + hz / 700.0)
            q = (mel - F0_MEL_MIN) * 254.0 / (F0_MEL_MAX - F0_MEL_MIN) + 1.0
            pitch_q[i] = int(np.clip(np.round(q), 1, 255))
            
    # Run Hoshino synthesis
    feeds = {
        'phone': upsampled[:, :L, :],
        'phone_lengths': np.array([L], dtype=np.int64),
        'pitch': pitch_q[None, :],
        'nsff0': shifted_f0[None, :L],
        'sid': np.array([0], dtype=np.int64)
    }
    
    out_audio = hoshino_sess.run(None, feeds)[0][0, 0]
    out_sr = 40000
    
    out_path = r"E:\Data\01-Browsers\Downloads\Chrome\hoshino_test_output.wav"
    sf.write(out_path, out_audio, out_sr)
    print(f"Generated Hoshino test audio: {out_path} ({len(out_audio)/out_sr:.2f}s)")
    print(f"Peak amplitude: {np.max(np.abs(out_audio)):.4f}")

if __name__ == '__main__':
    run_full_pipeline_test()
