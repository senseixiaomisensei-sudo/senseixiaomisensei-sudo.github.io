"""Multi-engine contracts; real synthesis is recorded separately in acceptance audio."""
import asyncio, hashlib, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app import tts_engines as t
from app import tts_models as m

class TtsEnginesTest(unittest.TestCase):
    def test_required_component_sizes_are_within_budget(self):
        self.assertEqual(set(m.MODELS),{'qwen3-17b','qwen3-06b','indextts-25'})
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

    def test_premium_qwen_has_native_tones_and_a_fixed_small_bundle(self):
        model=m.MODELS['qwen3-17b']
        self.assertEqual(model['revision'],'0c0e3051f131929182e2c023b9537f8b1c68adfe')
        self.assertEqual(model['emotionMode'],'native-instructions')
        self.assertEqual(model['defaultVoice'],'serena')
        self.assertEqual(t.validate_options('qwen3-17b','ja','gentle')['id'],'qwen3-17b')

    def test_health_only_validates_the_selected_installed_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for key in m.MODELS:
                (root/key).mkdir();(root/key/'installed.json').write_text('{}')
            states={key:{'state':'not-installed','ready':False} for key in m.MODELS}
            with patch.object(t,'ROOT',root),patch.dict(t._states,states),patch.object(t.legacy,'status',return_value={'ready':False}),patch.object(t.threading,'Thread') as thread:
                t.status('qwen3-17b')
                self.assertEqual(thread.call_count,1)
                self.assertEqual(thread.call_args.kwargs['args'][0],'qwen3-17b')
                self.assertEqual(t._states['indextts-25']['state'],'not-installed')

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
