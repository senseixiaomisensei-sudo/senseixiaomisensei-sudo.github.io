import requests, time

def test_china_mirrors():
    chunk_path = "models/characters/arisu/chunk_0.bin"
    raw_gh_url = f"https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/{chunk_path}"
    
    mirrors = [
        # Direct Same-Origin
        ("./", f"https://senseixiaomisensei-sudo.github.io/{chunk_path}"),
        # jsDelivr CN CDNs
        ("jsd.cdn.zzko.cn", f"https://jsd.cdn.zzko.cn/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{chunk_path}"),
        ("cdn.jsdmirror.com", f"https://cdn.jsdmirror.com/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{chunk_path}"),
        ("cdn.jsdelivr.net", f"https://cdn.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{chunk_path}"),
        ("testingcf.jsdelivr.net", f"https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{chunk_path}"),
        ("gcore.jsdelivr.net", f"https://gcore.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/{chunk_path}"),
        # GH Proxy Mirrors (Popular in CN)
        ("ghproxy.net", f"https://ghproxy.net/{raw_gh_url}"),
        ("mirror.ghproxy.com", f"https://mirror.ghproxy.com/{raw_gh_url}"),
        ("gh-proxy.com", f"https://gh-proxy.com/{raw_gh_url}"),
        ("raw.fgit.cf", f"https://raw.fgit.cf/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/{chunk_path}")
    ]
    
    print("Testing Mainland China Accelerated Mirrors:")
    for name, url in mirrors:
        t0 = time.time()
        try:
            r = requests.head(url, timeout=4, headers={"User-Agent": "Mozilla/5.0"})
            dt = (time.time() - t0) * 1000
            print(f"[{r.status_code}] {dt:6.1f}ms : {name:20s} -> {url}")
        except Exception as e:
            dt = (time.time() - t0) * 1000
            print(f"[ERR ] {dt:6.1f}ms : {name:20s} ({str(e)[:45]})")

if __name__ == '__main__':
    test_china_mirrors()
