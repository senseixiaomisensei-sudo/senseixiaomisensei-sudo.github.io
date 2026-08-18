import requests

def check_momofu():
    url = "https://huggingface.co/api/models/momofu/Hoshino_RVCv2"
    r = requests.get(url, timeout=10)
    if r.ok:
        data = r.json()
        print("Files in momofu/Hoshino_RVCv2:")
        for s in data.get("siblings", []):
            print(" ", s.get("rfilename"))
    else:
        print("momofu failed:", r.status_code)

if __name__ == '__main__':
    check_momofu()
