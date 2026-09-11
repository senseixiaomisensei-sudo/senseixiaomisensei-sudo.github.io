"""Export the pinned official V1 HuBERT (layer 9 + projection) for browsers."""
import argparse
import sys
from pathlib import Path
import numpy as np
import torch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("runtime", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(args.runtime.resolve()))
    from infer.hubert import HubertModelWithFinalProj
    model = HubertModelWithFinalProj.from_pretrained(
        str(args.runtime / "assets/hubert_base"), local_files_only=True,
        attn_implementation="eager",
    ).float().eval()

    class Wrapper(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.hubert = model

        def forward(self, source):
            result = self.hubert(source[:, 0, :], output_hidden_states=True)
            return self.hubert.final_proj(result.hidden_states[9])

    wrapper = Wrapper().eval()
    torch.manual_seed(0)
    source = torch.randn(1, 1, 16640) * 0.05
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not args.verify_only:
        with torch.inference_mode():
            torch.onnx.export(wrapper, (source,), str(args.output),
                input_names=["source"], output_names=["features"], opset_version=17,
                dynamic_axes={"source": {2: "samples"}, "features": {1: "frames"}},
                dynamo=False)
    import onnxruntime as ort
    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])
    for length in (16000, 16640, 21440):
        audio = torch.randn(1, 1, length) * 0.05
        with torch.inference_mode():
            reference = wrapper(audio).numpy()
        actual = session.run(None, {"source": audio.numpy()})[0]
        error = float(np.max(np.abs(reference - actual)))
        assert actual.shape[-1] == 256 and error < 0.0002, (length, error)
        print(f"samples={length} shape={actual.shape} max_error={error}", flush=True)


if __name__ == "__main__":
    main()
