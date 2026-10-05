"""Multi-engine contracts; real synthesis is recorded separately in acceptance audio."""
import asyncio, hashlib, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app import tts_engines as t
from app import tts_models as m

class TtsEnginesTest(unittest.TestCase):
    def test_required_component_sizes_are_within_budget(self):
        self.assertEqual(len(m.MODELS),3)
        for model in m.MODELS.values():
            self.assertLessEqual(model['downloadBytes'],3_000_000_000)
            if model.get('files'): self.assertEqual(model['downloadBytes'],sum(x['bytes'] for x in model['files']))
        self.assertIn('speech_tokenizer/model.safetensors',[x['path'] for x in m.MODELS['qwen3-06b']['files']])

    def test_unsupported_tone_and_language_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'RVC_TTS_STYLE_UNSUPPORTED'): t.validate_options('qwen3-06b','zh','happy')
        with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_LANGUAGE'): t.validate_options('kokoro','ja')
        with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_MODEL'): t.spec('../../weights')
        self.assertEqual(t.validate_options('cosyvoice-instruct','en','gentle')['id'],'cosyvoice-instruct')

    def test_unknown_voice_cannot_reach_worker(self):
        with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_VOICE'): t.validate_options('qwen3-06b','zh','neutral','not-a-speaker')

    def test_verified_file_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'weights';path.write_bytes(b'original')
            expected={'bytes':8,'sha256':hashlib.sha256(b'original').hexdigest()}
            m.verify_file(path,expected);path.write_bytes(b'corrupt!')
            with self.assertRaisesRegex(ValueError,'RVC_TTS_DOWNLOAD_INVALID'): m.verify_file(path,expected)

    def test_failed_probe_cannot_mark_engine_ready(self):
        state={'state':'validating','ready':False}
        with patch.dict(t._states,{'qwen3-06b':state}),patch.object(t,'verify_install'),patch.object(t,'_probe',side_effect=ValueError('RVC_TTS_SYNTH_FAILED')):
            t._verify('qwen3-06b',Path('unit-test'))
            self.assertFalse(state['ready']);self.assertEqual(state['code'],'RVC_TTS_SYNTH_FAILED')

    def test_repeated_install_does_not_create_another_download(self):
        with patch.object(t,'status',return_value={'ready':False,'state':'validating','installAvailable':True}),patch.object(t.threading,'Thread') as thread:
            t.install('qwen3-06b');t.install('qwen3-06b');thread.assert_not_called()

if __name__=='__main__':unittest.main()
