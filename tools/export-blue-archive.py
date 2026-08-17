import os, sys, io, math, zipfile, requests, json
import torch
import torch.nn as nn
from rvc_python.lib.infer_pack.models import SynthesizerTrnMs768NSFsid, SynthesizerTrnMs256NSFsid

CHARACTERS = [
    {
        "id": "arisu",
        "zipName": "TendouAlice",
        "name": "天童爱丽丝 (Alice)",
        "desc": "《蔚蓝档案》千年游戏开发部 · 邦邦卡邦~ 纯真机械勇者少女音 · RVC v2",
        "tags": ["女声", "蔚蓝档案", "千年"],
        "defaultPitch": 2,
        "avatarText": "爱丽丝"
    },
    {
        "id": "shiroko",
        "zipName": "SunaokamiShiroko",
        "name": "砂狼白子 (Shiroko)",
        "desc": "《蔚蓝档案》阿拜多斯对策委员会 · 沉稳酷飒行动派少女音 · RVC v2",
        "tags": ["女声", "蔚蓝档案", "阿拜多斯"],
        "defaultPitch": 1,
        "avatarText": "白子"
    },
    {
        "id": "yuuka",
        "zipName": "HayaseYuuka",
        "name": "早濑优香 (Yuuka)",
        "desc": "《蔚蓝档案》千年研讨会会计 · 傲娇理智计算系少女音 · RVC v2",
        "tags": ["女声", "蔚蓝档案", "千年"],
        "defaultPitch": 2,
        "avatarText": "优香"
    },
    {
        "id": "hina",
        "zipName": "SorasakiHina",
        "name": "空崎日奈 (Hina)",
        "desc": "《蔚蓝档案》格黑娜风纪委员会长 · 威严中带着疲倦的温柔少女音 · RVC v2",
        "tags": ["女声", "蔚蓝档案", "格黑娜"],
        "defaultPitch": 1,
        "avatarText": "日奈"
    },
    {
        "id": "noa",
        "zipName": "UshioNoa",
        "name": "生盐诺亚 (Noa)",
        "desc": "《蔚蓝档案》千年研讨会书记 · 温柔腹黑记录系少女音 · RVC v2",
        "tags": ["女声", "蔚蓝档案", "千年"],
        "defaultPitch": 2,
        "avatarText": "诺亚"
    },
    {
        "id": "koharu",
        "zipName": "ShimoeKoharu",
        "name": "下江小春 (Koharu)",
        "desc": "《蔚蓝档案》三一补课部 · 色情是不行的！死刑！傲娇纯情少女音 · RVC v2",
        "tags": ["女声", "蔚蓝档案", "三一"],
        "defaultPitch": 3,
        "avatarText": "小春"
    }
]

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

def process_character(char_info):
    cid = char_info["id"]
    zip_name = char_info["zipName"]
    onnx_out = rf"E:\大肥鱼\rvc-local\convert\onnx-models\{cid}.onnx"
    
    print(f"\n==========================================")
    print(f"Processing {char_info['name']} ({zip_name})...")
    
    url = f"https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/{zip_name}.zip"
    print(f"Downloading from {url}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=120)
    if not r.ok:
        print(f"Error downloading {zip_name}: {r.status_code}")
        return False

    z = zipfile.ZipFile(io.BytesIO(r.content))
    pth_files = [n for n in z.namelist() if n.endswith('.pth')]
    if not pth_files:
        print(f"No .pth found in {zip_name}.zip")
        return False

    pth_data = z.read(pth_files[0])
    cpt = torch.load(io.BytesIO(pth_data), map_location='cpu')
    config = cpt.get('config')
    version = cpt.get('version', 'v2')
    sr_str = cpt.get('sr', '40k')
    sr = 48000 if '48' in str(sr_str) else 40000
    
    print(f"Loaded {pth_files[0]}: version={version}, sr={sr}, config_len={len(config) if config else 0}")
    
    # Instantiate Model
    if version == 'v1' or (config and config[4] == 256):
        net = SynthesizerTrnMs256NSFsid(*config, is_half=False)
        feat_dim = 256
    else:
        net = SynthesizerTrnMs768NSFsid(*config, is_half=False)
        feat_dim = 768
        
    net.load_state_dict(cpt['weight'], strict=False)
    net.eval()
    
    wrapper = ExportWrapper(net, target_sr=sr)
    
    # Dummy inputs for ONNX trace (pitch within [0, 255])
    L = 100
    phone = torch.randn(1, L, feat_dim)
    phone_lengths = torch.tensor([L], dtype=torch.int64)
    pitch = torch.randint(1, 200, (1, L), dtype=torch.int64)
    nsff0 = torch.randn(1, L) * 200.0 + 200.0
    sid = torch.tensor([0], dtype=torch.int64)
    
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
    print(f"Exported successfully! Size: {os.path.getsize(onnx_out):,} bytes")
    return True

if __name__ == "__main__":
    success_chars = []
    for char in CHARACTERS:
        ok = process_character(char)
        if ok:
            success_chars.append(char)
    print(f"\nAll done! Successfully exported {len(success_chars)} models.")
