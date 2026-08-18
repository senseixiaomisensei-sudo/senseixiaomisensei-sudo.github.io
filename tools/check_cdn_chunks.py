import requests

def check_all_chunks():
    base_url = "https://cdn.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main"
    
    test_files = [
        "models/base/hubert/chunk_0.bin",
        "models/base/rmvpe/chunk_0.bin",
        "models/characters/hoshino/chunk_0.bin",
        "models/characters/arisu/chunk_0.bin"
    ]
    
    print("Testing jsDelivr status for all base and character models:")
    for tf in test_files:
        u = f"{base_url}/{tf}"
        try:
            r = requests.head(u, timeout=5)
            print(f"[{r.status_code}] {r.headers.get('content-length')} bytes : {u}")
        except Exception as e:
            print(f"[ERR ] {u} -> {e}")

if __name__ == '__main__':
    check_all_chunks()
