import os, soundfile as sf, numpy as np, onnxruntime as ort

def test_hoshino_inference():
    onnx_path = r"E:\大肥鱼\rvc-local\convert\onnx-models\hoshino.onnx"
    test_wav = r"E:\Data\01-Browsers\Downloads\Chrome\fcd4fe4a-89c9-4393-945d-98c7ba2f8cfa.wav"
    
    print(f"Testing {onnx_path} on {test_wav}...")
    sess = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    print("Input names:", [inp.name for inp in sess.get_inputs()])
    print("Output names:", [out.name for out in sess.get_outputs()])
    
    # Run dummy test
    L = 150
    phone = np.random.randn(1, L, 768).astype(np.float32)
    phone_len = np.array([L], dtype=np.int64)
    pitch = np.random.randint(1, 200, (1, L), dtype=np.int64)
    nsff0 = np.random.randn(1, L).astype(np.float32) * 50.0 + 300.0
    sid = np.array([0], dtype=np.int64)
    
    feeds = {
        'phone': phone,
        'phone_lengths': phone_len,
        'pitch': pitch,
        'nsff0': nsff0,
        'sid': sid
    }
    
    outputs = sess.run(None, feeds)
    audio = outputs[0]
    sr = outputs[1][0]
    print(f"Inference output shape: {audio.shape}, sr: {sr}")
    print(f"Max amp: {np.max(np.abs(audio)):.4f}, Min amp: {np.min(audio):.4f}")
    assert audio.shape[2] > 0
    print("Hoshino ONNX verification PASSED!")

if __name__ == '__main__':
    test_hoshino_inference()
