import requests, time, traceback

def test_full_browser_flow():
    base_url = "https://senseixiaomisensei-sudo.github.io"
    
    print(f"1. Testing rvc.html and script version...")
    try:
        r = requests.get(f"{base_url}/rvc.html?t={time.time()}", timeout=5)
        print(f"  [HTML] {r.status_code}, len={len(r.text)}")
        for line in r.text.splitlines():
            if "rvc.js" in line or "rvc-web-runtime" in line:
                print(f"  [SCRIPT TAG] {line.strip()}")
    except Exception as e:
        print(f"  [ERR] {e}")

    print("\n2. Testing all 19 Hubert chunks from same-origin...")
    hubert_ok = 0
    for i in range(19):
        u = f"{base_url}/models/base/hubert/chunk_{i}.bin"
        try:
            r = requests.head(u, timeout=5)
            if r.status_code == 200:
                hubert_ok += 1
            else:
                print(f"  Hubert chunk_{i}.bin: HTTP {r.status_code}")
        except Exception as e:
            print(f"  Hubert chunk_{i}.bin err: {e}")
    print(f"  Hubert chunks accessible: {hubert_ok}/19")

    print("\n3. Testing all 18 RMVPE chunks from same-origin...")
    rmvpe_ok = 0
    for i in range(18):
        u = f"{base_url}/models/base/rmvpe/chunk_{i}.bin"
        try:
            r = requests.head(u, timeout=5)
            if r.status_code == 200:
                rmvpe_ok += 1
            else:
                print(f"  RMVPE chunk_{i}.bin: HTTP {r.status_code}")
        except Exception as e:
            print(f"  RMVPE chunk_{i}.bin err: {e}")
    print(f"  RMVPE chunks accessible: {rmvpe_ok}/18")

    print("\n4. Testing all 6 Hoshino chunks from same-origin...")
    hoshino_ok = 0
    for i in range(6):
        u = f"{base_url}/models/characters/hoshino/chunk_{i}.bin"
        try:
            r = requests.head(u, timeout=5)
            if r.status_code == 200:
                hoshino_ok += 1
            else:
                print(f"  Hoshino chunk_{i}.bin: HTTP {r.status_code}")
        except Exception as e:
            print(f"  Hoshino chunk_{i}.bin err: {e}")
    print(f"  Hoshino chunks accessible: {hoshino_ok}/6")

    print("\n5. Testing ONNX Runtime Web WASM files...")
    wasm_files = [
        "assets/rvc-engine/ort126/ort-wasm-simd-threaded.wasm",
        "assets/rvc-engine/ort126/ort-wasm-simd.wasm",
        "assets/rvc-engine/ort126/ort-wasm.wasm",
        "assets/rvc-engine/inference.worker.js",
        "assets/rvc-engine/rvc-web-runtime.js"
    ]
    for w in wasm_files:
        u = f"{base_url}/{w}"
        try:
            r = requests.head(u, timeout=5)
            print(f"  [{r.status_code}] {r.headers.get('content-length')} bytes : {w}")
        except Exception as e:
            print(f"  [ERR] {w} -> {e}")

if __name__ == '__main__':
    test_full_browser_flow()
