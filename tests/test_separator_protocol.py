"""Actual child-process encoding contracts; these do not emulate inference."""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'rvc-service'))
from app import separation_runtime,chorus_runtime

class SeparatorProtocolTests(unittest.TestCase):
    def test_worker_json_survives_legacy_windows_console_encoding(self):
        tree=ast.parse((ROOT/'rvc-service/app/separation_worker.py').read_text(encoding='utf-8'))
        main=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='main')
        result_print=main.body[-1]
        self.assertIsInstance(result_print,ast.Expr)
        # Execute the real worker's result serialization in a legacy-code-page
        # subprocess, without importing its GPU implementation.
        expression=ast.unparse(result_print)
        expected='E:/大肥鱼/中文输出/声音.wav'
        script='import json\nfrom pathlib import Path\nvocals_path=Path('+repr(expected)+')\ninstrumental_path=Path('+repr(expected)+')\nsample_rate=44100\ndevice="cuda"\n'+expression
        result=subprocess.run([sys.executable,'-c',script],capture_output=True,
            env={**os.environ,'PYTHONIOENCODING':'cp936','PYTHONUTF8':'0'},check=True)
        self.assertEqual(json.loads(result.stdout.decode('utf-8'))['vocals'],str(Path(expected)))
    def test_adapters_force_utf8_and_validate_real_unicode_output_paths(self):
        with tempfile.TemporaryDirectory(prefix='中文分离-') as tmp:
            output=Path(tmp)/'中文目录';output.mkdir()
            vocals=output/'vocals.wav';music=output/'instrumental.wav'
            vocals.write_bytes(b'contract');music.write_bytes(b'contract')
            payload={'vocals':str(vocals),'instrumental':str(music),'sampleRate':44100}
            def complete(*args,**kwargs):
                self.assertEqual(kwargs['env']['PYTHONIOENCODING'],'utf-8')
                self.assertEqual(kwargs['env']['PYTHONUTF8'],'1')
                return subprocess.CompletedProcess(args[0],0,json.dumps(payload), '')
            with patch.object(separation_runtime,'separation_status',return_value={'ready':True}),patch.object(separation_runtime.subprocess,'run',side_effect=complete):
                stems=separation_runtime.separate_song(Path(tmp)/'input.wav',output)
            self.assertEqual(stems.vocals,vocals.resolve())
            payload={'tracks':[str(vocals),str(music)]}
            with patch.object(chorus_runtime,'chorus_status',return_value={'ready':True}),patch.object(chorus_runtime.subprocess,'run',side_effect=complete):
                self.assertEqual(len(chorus_runtime.separate_singers(Path(tmp)/'input.wav',output,'2')['tracks']),2)

if __name__=='__main__':unittest.main()
