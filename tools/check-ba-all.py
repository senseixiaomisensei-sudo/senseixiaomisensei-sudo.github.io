import requests, zipfile, io, torch

names = ['TendouAlice', 'HayaseYuuka', 'SunaokamiShiroko', 'SorasakiHina', 'ShirasuAzusa', 'UshioNoa', 'ShimoeKoharu', 'AsagiMutsuki', 'KirifujiNagisa', 'TakanashiHoshino']
for name in names:
    url = f"https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/{name}.zip"
    try:
        r = requests.get(url, timeout=30)
        if r.ok:
            z = zipfile.ZipFile(io.BytesIO(r.content))
            pth_name = [n for n in z.namelist() if n.endswith('.pth')][0]
            cpt = torch.load(io.BytesIO(z.read(pth_name)), map_location='cpu')
            sr = cpt.get('sr')
            ver = cpt.get('version', 'v1')
            info = cpt.get('info')
            print(f"{name}: sr={sr}, ver={ver}, info={info}")
        else:
            print(f"Failed {name}: {r.status_code}")
    except Exception as e:
        print(f"Error {name}: {e}")
