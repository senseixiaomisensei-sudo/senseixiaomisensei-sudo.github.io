import requests, time, threading

def test_fast_racing():
    cleanPath = "models/characters/hoshino/chunk_0.bin"
    rawGhUrl = f"https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/{cleanPath}"
    
    urls = [
        f"https://senseixiaomisensei-sudo.github.io/{cleanPath}",
        f"https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{cleanPath}",
        f"https://gh-proxy.com/{rawGhUrl}",
        f"https://cdn.jsdmirror.com/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{cleanPath}",
        f"https://gcore.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{cleanPath}"
    ]
    
    results = {}
    
    def fetch_url(idx, u):
        t0 = time.time()
        try:
            r = requests.get(u, stream=True, timeout=8)
            first_chunk = next(r.iter_content(65536))
            dt = (time.time() - t0) * 1000
            results[idx] = (r.status_code, dt, len(first_chunk), u)
            print(f"[{r.status_code}] {dt:6.1f}ms : Node {idx} ({u[:50]}...)")
        except Exception as e:
            dt = (time.time() - t0) * 1000
            results[idx] = ("ERR", dt, str(e), u)
            print(f"[ERR ] {dt:6.1f}ms : Node {idx} -> {e}")

    threads = []
    for i, u in enumerate(urls):
        t = threading.Thread(target=fetch_url, args=(i, u))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    print("\nRacing test completed successfully!")

if __name__ == '__main__':
    test_fast_racing()
