import requests, time

def test_chunk_urls():
    test_chunk = "models/characters/arisu/chunk_0.bin"
    urls = [
        f"https://fastly.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{test_chunk}",
        f"https://cdn.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{test_chunk}",
        f"https://gcore.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{test_chunk}",
        f"https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{test_chunk}",
        f"https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/{test_chunk}"
    ]
    
    print("Testing mirror availability and speeds:")
    for u in urls:
        t0 = time.time()
        try:
            r = requests.head(u, timeout=5)
            dt = (time.time() - t0) * 1000
            print(f"[{r.status_code}] {dt:6.1f}ms : {u}")
        except Exception as e:
            dt = (time.time() - t0) * 1000
            print(f"[ERR ] {dt:6.1f}ms : {u} ({e})")

if __name__ == '__main__':
    test_chunk_urls()
