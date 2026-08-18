import asyncio
import aiohttp
import time

CHUNKS = [
    f"models/characters/arisu/chunk_{i}.bin" for i in range(6)
]

MIRRORS = [
    "https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/",
    "https://fastly.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/",
    "https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/",
]

async def fetch_chunk(session, chunk_rel_path, sem):
    async with sem:
        for mirror in MIRRORS:
            url = mirror + chunk_rel_path
            try:
                t0 = time.time()
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.read()
                        dt = time.time() - t0
                        print(f"Downloaded {chunk_rel_path} ({len(data)/1024/1024:.1f}MB) in {dt:.2f}s from {mirror[:30]}...")
                        return data
            except Exception as e:
                pass
        raise RuntimeError(f"Failed to fetch {chunk_rel_path}")

async def test_parallel():
    sem = asyncio.Semaphore(6)
    t0 = time.time()
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_chunk(session, c, sem) for c in CHUNKS]
        results = await asyncio.gather(*tasks)
    total_time = time.time() - t0
    total_mb = sum(len(r) for r in results) / 1024 / 1024
    print(f"\n--- SUCCESS ---")
    print(f"Downloaded {len(results)} chunks ({total_mb:.1f} MB) in {total_time:.2f}s!")
    print(f"Average throughput: {total_mb / total_time:.2f} MB/s")

if __name__ == '__main__':
    asyncio.run(test_parallel())
