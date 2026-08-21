import os, requests, zipfile, io, json
import torch
import torch.nn as nn
from rvc_python.lib.infer_pack.models import SynthesizerTrnMs768NSFsid, SynthesizerTrnMs256NSFsid

class ExportModel(nn.Module):
    def __init__(self, net, target_sr=40000):
        super().__init__()
        self.net = net
        self.target_sr = target_sr

    def forward(self, phone, phone_lengths, pitch, nsff0, sid):
        g = self.net.emb_g(sid).unsqueeze(-1)
        m_p, logs_p, x_mask = self.net.enc_p(phone, pitch, phone_lengths)
        z_p = (m_p + torch.exp(logs_p) * torch.randn_like(m_p) * 0.66666) * x_mask
        z = self.net.flow(z_p, x_mask, g=g, reverse=True)
        o = self.net.dec(z * x_mask, nsff0, g=g)
        sr = torch.tensor([self.target_sr], dtype=torch.int64)
        return o, sr

def download_and_inspect_zip(character_name):
    url = f"https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/{character_name}.zip"
    print(f"Downloading {character_name} from {url}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=60)
    if not r.ok:
        print(f"Failed to download {character_name}: {r.status_code}")
        return None
    
    z = zipfile.ZipFile(io.BytesIO(r.content))
    print(f"Files in {character_name}.zip:", z.namelist())
    
    pth_name = [n for n in z.namelist() if n.endswith('.pth')][0]
    pth_bytes = z.read(pth_name)
    cpt = torch.load(io.BytesIO(pth_bytes), map_location='cpu')
    print("Checkpoint info:", cpt.get('info'), "sr:", cpt.get('sr'), "version:", cpt.get('version'))
    return cpt

download_and_inspect_zip("Arona")
