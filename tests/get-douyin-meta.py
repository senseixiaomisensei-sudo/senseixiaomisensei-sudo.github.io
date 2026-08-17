import requests
import re
import json

def get_douyin_info():
    url = "https://www.iesdouyin.com/share/video/7515660174960266505/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.douyin.com/"
    }
    r = requests.get(url, headers=headers)
    print("Status:", r.status_code)
    
    # Check for JSON objects
    for m in re.finditer(r'<script[^>]*>(.*?)</script>', r.text, re.DOTALL):
        script_text = m.group(1)
        if "item_list" in script_text or "aweme_detail" in script_text or "desc" in script_text:
            print("Found interesting script snippet:", script_text[:500])

    # Search for all strings matching desc or title
    descs = re.findall(r'"desc"\s*:\s*"([^"]+)"', r.text)
    print("Found descs:", descs)

get_douyin_info()
