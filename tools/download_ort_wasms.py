import os, urllib.request

def download_ort_files():
    ort_dir = r"E:\大肥鱼\site\assets\rvc-engine\ort126"
    os.makedirs(ort_dir, exist_ok=True)
    
    files_to_download = [
        "ort-wasm-simd.wasm",
        "ort-wasm-simd.mjs",
        "ort-wasm-simd.jsep.wasm",
        "ort-wasm-simd.jsep.mjs",
        "ort-wasm-simd.jspi.wasm",
        "ort-wasm-simd.jspi.mjs",
        "ort-wasm-simd.asyncify.wasm",
        "ort-wasm-simd.asyncify.mjs",
        "ort-wasm.wasm",
        "ort-wasm.mjs",
        "ort-wasm.jsep.wasm",
        "ort-wasm.jsep.mjs",
        "ort-wasm.jspi.wasm",
        "ort-wasm.jspi.mjs",
        "ort-wasm.asyncify.wasm",
        "ort-wasm.asyncify.mjs",
    ]
    
    base_urls = [
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist",
        "https://unpkg.com/onnxruntime-web@1.26.0/dist"
    ]
    
    for f in files_to_download:
        dest_path = os.path.join(ort_dir, f)
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
            print(f"Already exists ({os.path.getsize(dest_path)} bytes): {f}")
            continue
            
        downloaded = False
        for base in base_urls:
            url = f"{base}/{f}"
            try:
                print(f"Downloading {f} from {base}...")
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=15) as resp, open(dest_path, "wb") as out:
                    out.write(resp.read())
                print(f"  Success: {f} ({os.path.getsize(dest_path)} bytes)")
                downloaded = True
                break
            except Exception as e:
                print(f"  Failed from {base}: {e}")
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                    
        if not downloaded:
            print(f"ERROR: could not download {f}")

if __name__ == '__main__':
    download_ort_files()
