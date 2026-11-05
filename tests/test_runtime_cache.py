import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.runtime_cache import configure_numba_cache


class RuntimeCacheTests(unittest.TestCase):
    def test_cache_is_writable_outside_the_python_installation(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=True):
            root = Path(temporary)
            cache = configure_numba_cache(root)
            self.assertEqual(cache, root.resolve() / "cache" / "numba")
            self.assertEqual(os.environ["NUMBA_CACHE_DIR"], str(cache))
            self.assertEqual(list(cache.iterdir()), [])

    def test_explicit_cache_directory_is_preserved_and_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "operator-cache"
            with patch.dict(os.environ, {"NUMBA_CACHE_DIR": str(target)}):
                self.assertEqual(configure_numba_cache(Path(temporary)), target.resolve())

    def test_create_denial_fails_once_instead_of_entering_tempfile_retry_loop(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=True):
            with patch.object(Path, "touch", side_effect=PermissionError("denied")) as create:
                with self.assertRaisesRegex(RuntimeError, "RVC_CACHE_UNWRITABLE"):
                    configure_numba_cache(Path(temporary))
                self.assertEqual(create.call_count, 1)
            self.assertNotIn("NUMBA_CACHE_DIR", os.environ)

    def test_delete_denial_also_fails_once_before_starting_numba(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=True):
            with patch.object(Path, "unlink", side_effect=PermissionError("delete denied")) as remove:
                with self.assertRaisesRegex(RuntimeError, "RVC_CACHE_UNWRITABLE"):
                    configure_numba_cache(Path(temporary))
                self.assertEqual(remove.call_count, 1)
            self.assertNotIn("NUMBA_CACHE_DIR", os.environ)


if __name__ == "__main__":
    unittest.main()
