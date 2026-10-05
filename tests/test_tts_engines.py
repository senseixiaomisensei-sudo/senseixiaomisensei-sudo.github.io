"""Multi-engine contracts; real synthesis is recorded separately in acceptance audio."""
import asyncio, hashlib, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app import tts_engines as t
from app import tts_models as m

class TtsEnginesTest(unittest.TestCase):
    def test_required_component_sizes_are_within_budget(self):
        self.assertEqual(set(m.MODELS),{'qwen3-06b','indextts-25'})
        for model in m.MODELS.values():
            self.assertLessEqual(model.get('installedBytes',model['downloadBytes']),6_000_000_000)
            self.assertEqual(model['downloadBytes'],sum(x.get('sourceBytes',x['bytes']) for x in model['files']))
            if 'installedBytes' in model: self.assertEqual(model['installedBytes'],sum(x['bytes'] for x in model['files']))
        self.assertIn('speech_tokenizer/model.safetensors',[x['path'] for x in m.MODELS['qwen3-06b']['files']])

    def test_unsupported_tone_and_language_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'RVC_TTS_STYLE_UNSUPPORTED'): t.validate_options('qwen3-06b','zh','happy')
        with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_LANGUAGE'): t.validate_options('indextts-25','ko')
        with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_MODEL'): t.spec('../../weights')
        self.assertEqual(t.validate_options('indextts-25','en','calm')['id'],'indextts-25')
        for removed in ['cosyvoice-instruct','kokoro']:
            with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_MODEL'): t.spec(removed)

    def test_recent_model_pins_all_auxiliary_sources_and_native_emotion(self):
        model=m.MODELS['indextts-25']
        self.assertEqual(model['releasedAt'],'2026-08-10')
        self.assertEqual(model['emotionMode'],'native-vectors')
        for file in model['files']:
            if not file.get('bundledPath'): self.assertEqual(len(file['revision']),40)
            self.assertTrue(file.get('sha256') or file.get('gitBlob'))
        gpt=next(f for f in model['files'] if f['path']=='gpt.pth')
        self.assertEqual(gpt['transform'],'bf16-gpt-torch-2.7.1')
        self.assertEqual(len(gpt['sourceSha256']),64)

    def test_unknown_voice_cannot_reach_worker(self):
        with self.assertRaisesRegex(ValueError,'RVC_TTS_INVALID_VOICE'): t.validate_options('qwen3-06b','zh','neutral','not-a-speaker')

    def test_accepted_default_reference_is_bundled_and_verified(self):
        model=m.MODELS['indextts-25']
        self.assertEqual(model['defaultVoice'],'female-soft')
        file=next(f for f in model['files'] if f['path']=='voices/female-soft.wav')
        m.verify_file(Path(m.__file__).parent/file['bundledPath'],file)
        self.assertEqual(model['voiceProfiles']['female-soft']['sha256'],file['sha256'])
        self.assertIn(file['sha256'][:12],model['bundleRevision'])

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
