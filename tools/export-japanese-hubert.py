"""Export the checkpoint-required Japanese HuBERT without waveform normalization.

The input contract matches the browser's existing content encoder interface.
Use the same pinned safetensors as the service; compare ONNX against eager
PyTorch on real source audio before packaging any browser fragments.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import torch


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('encoder', type=Path)
    parser.add_argument('audio', type=Path, help='Real 16 kHz mono float input')
    parser.add_argument('output', type=Path)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
    from app.content_encoder import JAPANESE_FILES, JAPANESE_REVISION
    for name, expected in JAPANESE_FILES.items():
        assert sha256(args.encoder / name) == expected, name
    from transformers import HubertModel
    model = HubertModel.from_pretrained(
        str(args.encoder), local_files_only=True, use_safetensors=True,
        attn_implementation='eager',
    ).float().eval()
    torch.set_num_threads(4)

    class Wrapper(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.hubert = model

        def forward(self, source):
            return self.hubert(source[:, 0, :]).last_hidden_state

    wrapper = Wrapper().eval()
    import soundfile as sf
    audio, rate = sf.read(args.audio, dtype='float32')
    assert rate == 16000 and audio.ndim == 1 and np.isfinite(audio).all()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not args.verify_only:
        with torch.inference_mode():
            torch.onnx.export(
                wrapper, (torch.from_numpy(audio[:16640][None, None, :]),),
                str(args.output), input_names=['source'], output_names=['features'],
                opset_version=17, dynamic_axes={'source': {2: 'samples'}, 'features': {1: 'frames'}},
                dynamo=False,
            )
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(args.output), options, providers=['CPUExecutionProvider'])
    comparisons = []
    for start, length in ((0, 16000), (16000, 16640), (32000, 21440), (0, 64000)):
        source = audio[start:start + length][None, None, :]
        assert source.shape[-1] == length
        with torch.inference_mode():
            reference = wrapper(torch.from_numpy(source)).numpy()
        actual = session.run(None, {'source': source})[0]
        maximum = float(np.max(np.abs(reference - actual)))
        mean = float(np.mean(np.abs(reference - actual)))
        assert actual.shape == reference.shape and actual.shape[-1] == 768
        assert np.isfinite(actual).all() and maximum < 0.0003, maximum
        result = dict(startSample=start, samples=length, shape=list(actual.shape),
                      maximumAbsoluteError=maximum, meanAbsoluteError=mean)
        comparisons.append(result)
        print(json.dumps(result), flush=True)
    record = dict(encoder='hubert-base-japanese', outputLayer=12, featureDimension=768,
                  inputSampleRate=16000, waveformNormalization=False,
                  source='https://huggingface.co/yky-h/japanese-hubert-base',
                  revision=JAPANESE_REVISION, sourceHashes=JAPANESE_FILES,
                  sourceAudioSha256=sha256(args.audio), onnxSha256=sha256(args.output),
                  onnxBytes=args.output.stat().st_size, comparisons=comparisons,
                  torchVersion=torch.__version__, onnxruntimeVersion=ort.__version__)
    args.output.with_suffix('.json').write_text(json.dumps(record, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
