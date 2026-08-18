import requests, time

def test_relative_and_proxies():
    cleanPath = "models/base/rmvpe/chunk_0.bin"
    raw_gh_url = f"https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/{cleanPath}"
    
    candidates = [
        ("Same-Origin Direct", f"https://senseixiaomisensei-sudo.github.io/{cleanPath}"),
        ("gh-proxy.com", f"https://gh-proxy.com/{raw_gh_url}"),
        ("ghproxy.net", f"https://ghproxy.net/{raw_gh_url}"),
        ("testingcf.jsdelivr.net", f"https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{cleanPath}"),
        ("gcore.jsdelivr.net", f"https://gcore.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{cleanPath}"),
    ]
    
    for name, u in candidates:
        t0 = time.time()
        try:
            r = requests.head(u, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
            dt = (time.time() - t0) * 1000
            print(f"[{r.status_code}] {dt:6.1f}ms : {name:22s} ({r.headers.get('content-length')} bytes)")
        except Exception as e:
            dt = (time.time() - t0) * 1000
            print(f"[ERR ] {dt:6.1f}ms : {name:22s} -> {e}")

if __name__ == '__main__':
    test_relative_and_proxies()
