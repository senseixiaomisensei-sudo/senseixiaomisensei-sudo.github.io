import os, io, torch
import torch.nn as nn
from rvc_python.lib.infer_pack.models import SynthesizerTrnMs768NSFsid, SynthesizerTrnMs256NSFsid

class ExportWrapper(nn.Module):
    def __init__(self, net, target_sr=40000):
        super().__init__()
        self.net = net
        self.target_sr = target_sr

    def forward(self, phone, phone_lengths, pitch, nsff0, sid):
        g = self.net.emb_g(sid).unsqueeze(-1)
        m_p, logs_p, x_mask = self.net.enc_p(phone, pitch, phone_lengths)
        z_p = m_p * x_mask
        z = self.net.flow(z_p, x_mask, g=g, reverse=True)
        o = self.net.dec(z * x_mask, nsff0, g=g)
        sr = torch.tensor([self.target_sr], dtype=torch.int64)
        return o, sr

def export_hoshino_v2():
    pth_path = r"E:\大肥鱼\site\tools\Hoshino_v2.pth"
    cpt = torch.load(pth_path, map_location='cpu')
    
    config = cpt.get('config')
    version = cpt.get('version', 'v2')
    sr_str = cpt.get('sr', '40k')
    sr = 48000 if '48' in str(sr_str) else 40000
    
    print(f"Hoshino v2 properties: version={version}, sample_rate={sr}, config_len={len(config) if config else 0}")
    print(f"Config: {config}")
    
    # In some RVC checkpoints, config has 19 items: [spec_channels, segment_size, inter_channels, hidden_channels, filter_channels, n_heads, n_layers, kernel_size, p_dropout, resblock, resblock_kernel_sizes, resblock_dilation_sizes, upsample_rates, upsample_initial_channel, upsample_kernel_sizes, spk_embed_dim, gin_channels, sr, ...]
    # SynthesizerTrnMs768NSFsid accepts 18 arguments (excluding self)
    args = config[:18] if len(config) >= 18 else config
    net = SynthesizerTrnMs768NSFsid(*args, is_half=False)
    feat_dim = 768
        
    net.load_state_dict(cpt['weight'], strict=False)
    net.eval()
    print("State dict loaded successfully!")
    
    wrapper = ExportWrapper(net, target_sr=sr)
    
    L = 100
    phone = torch.randn(1, L, feat_dim)
    phone_lengths = torch.tensor([L], dtype=torch.int64)
    pitch = torch.randint(1, 200, (1, L), dtype=torch.int64)
    nsff0 = torch.randn(1, L) * 200.0 + 200.0
    sid = torch.tensor([0], dtype=torch.int64)
    
    onnx_out = r"E:\大肥鱼\rvc-local\convert\onnx-models\hoshino.onnx"
    os.makedirs(os.path.dirname(onnx_out), exist_ok=True)
    print(f"Exporting to {onnx_out}...")
    torch.onnx.export(
        wrapper,
        (phone, phone_lengths, pitch, nsff0, sid),
        onnx_out,
        input_names=["phone", "phone_lengths", "pitch", "nsff0", "sid"],
        output_names=["audio", "sr"],
        dynamic_axes={
            "phone": {1: "phone_len"},
            "pitch": {1: "phone_len"},
            "nsff0": {1: "phone_len"},
            "audio": {2: "audio_len"}
        },
        opset_version=17
    )
    sz = os.path.getsize(onnx_out)
    print(f"Successfully exported {onnx_out}: {sz/1024/1024:.2f} MB ({sz:,} bytes)")

if __name__ == '__main__':
    export_hoshino_v2()
