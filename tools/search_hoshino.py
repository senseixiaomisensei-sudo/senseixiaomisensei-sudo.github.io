import requests

def search_hf():
    # Check repository files of LordDavis778/BlueArchivevoicemodels
    url = "https://huggingface.co/api/models/LordDavis778/BlueArchivevoicemodels"
    try:
        r = requests.get(url, timeout=15)
        if r.ok:
            data = r.json()
            siblings = data.get("siblings", [])
            print(f"Total files in LordDavis778/BlueArchivevoicemodels: {len(siblings)}")
            for s in siblings:
                fn = s.get("rfilename", "")
                if "hoshino" in fn.lower() or "takanashi" in fn.lower() or "hosh" in fn.lower():
                    print(f"Found match: {fn}")
                elif any(k in fn.lower() for k in ["hoshino", "shina", "mika", "arona", "asuna", "azusa"]):
                    print(f"Candidate: {fn}")
        else:
            print(f"Repo API returned: {r.status_code}")
    except Exception as e:
        print(f"Error: {e}")

    # Also search huggingface models API for hoshino rvc
    search_url = "https://huggingface.co/api/models?search=hoshino%20rvc"
    try:
        r2 = requests.get(search_url, timeout=15)
        if r2.ok:
            items = r2.json()
            print(f"\nSearch results for 'hoshino rvc': {len(items)}")
            for item in items[:10]:
                print(f"  Model ID: {item.get('id')}")
    except Exception as e:
        print(f"Error search: {e}")

if __name__ == '__main__':
    search_hf()
