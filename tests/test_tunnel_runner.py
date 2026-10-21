import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from run_cloudflared import run


class TunnelRunnerTests(unittest.TestCase):
    def test_headless_child_ignores_proxies_and_exposes_logs_before_exit(self):
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / 'tunnel.log'

            def child(command, **options):
                self.assertEqual(command, ['cloudflared.exe', 'tunnel', '--url', 'http://127.0.0.1:8090',
                    '--no-autoupdate', '--protocol', 'http2', '--quick-service', 'http://127.0.0.1:8091'])
                self.assertNotIn('HTTPS_PROXY', options['env'])
                self.assertEqual(options['env']['NO_PROXY'], '*')
                self.assertEqual(options['creationflags'], getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                options['stderr'].write(b'https://test.trycloudflare.com\n')
                self.assertEqual(Path(str(log)+'.err').read_bytes(), b'https://test.trycloudflare.com\n')
                return SimpleNamespace(returncode=17)

            with patch.dict(os.environ, {'HTTPS_PROXY': 'http://127.0.0.1:9'}), patch('run_cloudflared.subprocess.run', side_effect=child):
                self.assertEqual(run('cloudflared.exe', 'http://127.0.0.1:8090', 'http2', 'http://127.0.0.1:8091', log), 17)


if __name__ == '__main__':
    unittest.main()
