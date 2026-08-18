import os, sys, io, zipfile, requests
import torch
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

def export_hoshino():
    zip_url = "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/TakanashiHoshino.zip"
    print(f"Downloading {zip_url}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(zip_url, headers=headers, timeout=120)
    if not r.ok:
        print(f"Failed to download: {r.status_code}")
        return False
        
    print(f"Downloaded {len(r.content)/1024/1024:.2f} MB")
    z = zipfile.ZipFile(io.BytesIO(r.content))
    print(f"Archive contents: {z.namelist()}")
    
    pth_files = [n for n in z.namelist() if n.endswith('.pth')]
    if not pth_files:
        print("No .pth found!")
        return False
        
    pth_data = z.read(pth_files[0])
    cpt = torch.load(io.BytesIO(pth_data), map_location='cpu')
    config = cpt.get('config')
    version = cpt.get('version', 'v2')
    sr_str = cpt.get('sr', '40k')
    sr = 48000 if '48' in str(sr_str) else 40000
    
    print(f"Loaded {pth_files[0]}: version={version}, sr={sr}, config_len={len(config) if config else 0}")
    
    if version == 'v1' or (config and config[4] == 256):
        net = SynthesizerTrnMs256NSFsid(*config, is_half=False)
        feat_dim = 256
    else:
        net = SynthesizerTrnMs768NSFsid(*config, is_half=False)
        feat_dim = 768
        
    net.load_state_dict(cpt['weight'], strict=False)
    net.eval()
    
    wrapper = ExportWrapper(net, target_sr=sr)
    
    L = 100
    phone = torch.randn(1, L, feat_dim)
    phone_lengths = torch.tensor([L], dtype=torch.int64)
    pitch = torch.randint(1, 200, (1, L), dtype=torch.int64)
    nsff0 = torch.randn(1, L) * 200.0 + 200.0
    sid = torch.tensor([0], dtype=torch.int64)
    
    onnx_out = r"E:\大肥鱼\rvc-local\convert\onnx-models\hoshino.onnx"
    os.makedirs(os.path.dirname(onnx_out), exist_ok=True)
    print(f"Exporting ONNX to {onnx_out}...")
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
    print(f"Exported successfully! Size: {os.path.getsize(onnx_out)/1024/1024:.2f} MB")
    return True

if __name__ == '__main__':
    export_hoshino()
