"""Keep Numba caches out of a read-only Python installation."""
import os
import uuid
from pathlib import Path


def configure_numba_cache(state_root: Path) -> Path:
    cache = Path(os.environ.get("NUMBA_CACHE_DIR") or state_root / "cache" / "numba").resolve()
    probe = cache / f".write-probe-{uuid.uuid4().hex}"
    try:
        cache.mkdir(parents=True, exist_ok=True)
        # Avoid tempfile here: on Windows its PermissionError retry loop can
        # run millions of times when create is allowed but delete is denied.
        probe.touch(exist_ok=False)
        probe.unlink()
    except OSError as error:
        raise RuntimeError(f"RVC_CACHE_UNWRITABLE: {cache}") from error
    os.environ["NUMBA_CACHE_DIR"] = str(cache)
    return cache
