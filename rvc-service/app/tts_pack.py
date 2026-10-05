"""Reproducible BF16 storage for the GPT already inferred in BF16 upstream."""
from pathlib import Path
import sys

def pack_bf16(source, target):
    import torch
    if torch.__version__.split('+')[0] != '2.7.1':
        raise ValueError('RVC_TTS_PACK_RUNTIME_INVALID')
    weights = torch.load(source, map_location='cpu', weights_only=True, mmap=True)
    def convert(value):
        if isinstance(value, torch.Tensor):
            return value.to(torch.bfloat16) if value.dtype == torch.float32 else value
        if isinstance(value, dict): return {key: convert(item) for key, item in value.items()}
        if isinstance(value, list): return [convert(item) for item in value]
        if isinstance(value, tuple): return tuple(convert(item) for item in value)
        if value is None or isinstance(value, (str, int, float, bool)): return value
        raise ValueError('RVC_TTS_PACK_STRUCTURE_INVALID')
    packed = convert(weights)
    # The basename is fixed because torch's zip archive includes it.
    if Path(target).name != 'gpt.pth': raise ValueError('RVC_TTS_PACK_PATH_INVALID')
    torch.save(packed, target)

if __name__ == '__main__': pack_bf16(sys.argv[1],sys.argv[2])
