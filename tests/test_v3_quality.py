"""v3 cover-quality stages: switch semantics, bounded DSP and safe fallbacks."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'rvc-service'))
from app import v3_quality as q  # noqa: E402
from app import separation_runtime  # noqa: E402


class SwitchTests(unittest.TestCase):
    def test_master_switch_disables_every_stage(self):
        with patch.dict(os.environ, {'RVC_V3': '0', 'RVC_V3_DEESS': '1'}):
            self.assertFalse(any(q.status()['stages'].values()))
            self.assertFalse(q.status()['master'])

    def test_defaults_and_individual_override(self):
        env = {k: v for k, v in os.environ.items() if not k.startswith('RVC_V3')}
        with patch.dict(os.environ, env, clear=True):
            # unset master switch = legacy chain (safe default)
            self.assertFalse(q.status()['master'])
            self.assertFalse(any(q.status()['stages'].values()))
        env = {**env, 'RVC_V3': '1'}
        with patch.dict(os.environ, env, clear=True):
            # only the stages that passed the lite A/B are on by default
            on = {k for k, v in q.status()['stages'].items() if v}
            self.assertEqual(on, {'loudness', 'limiter'})
            self.assertFalse(q.enabled('PHRASE_OCTAVE'))  # opt-in only
        with patch.dict(os.environ, {**env, 'RVC_V3_DEESS': '1', 'RVC_V3_LIMITER': '0'}, clear=True):
            self.assertTrue(q.enabled('DEESS'))
            self.assertFalse(q.enabled('HARSH'))
            self.assertFalse(q.enabled('LIMITER'))

    def test_model_auto_fetch_is_opt_in(self):
        from app import v3_models
        env = {k: v for k, v in os.environ.items() if not k.startswith('RVC_V3')}
        with patch.object(v3_models.threading, 'Thread') as thread:
            for extra in ({}, {'RVC_V3': '1'}, {'RVC_V3_AUTO_FETCH': '1'}):
                with patch.dict(os.environ, {**env, **extra}, clear=True):
                    self.assertFalse(v3_models.start_background_fetch())
            thread.assert_not_called()

    def test_disabled_finish_returns_input_unchanged(self):
        x = np.random.default_rng(1).standard_normal(48000) * .1
        self.assertIs(q.finish_vocal(x, 48000, x, 48000, deess=False, harsh=False), x)


class PitchRepairTests(unittest.TestCase):
    def test_short_octave_island_is_folded_but_sustained_leap_is_kept(self):
        f0 = np.full(400, 220.0)
        f0[100:108] = 440.0           # 80 ms island: tracker error
        f0[200:300] = 440.0           # 1 s real octave leap: music
        out, report = q.repair_pitch(f0)
        np.testing.assert_allclose(out[100:108], 220.0)
        np.testing.assert_allclose(out[200:300], 440.0)
        self.assertEqual(report['octaveIslands'], 1)

    def test_unvoiced_frames_never_become_voiced_without_audio(self):
        f0 = np.full(200, 300.0)
        f0[50:60] = 0
        f0[120] = 0
        out, _ = q.repair_pitch(f0)
        self.assertTrue(np.all(out[50:60] == 0))
        self.assertEqual(out[120], 0)

    def test_dropout_bridge_requires_waveform_support(self):
        rate, hop = 16000, 160
        t = np.arange(rate) / rate
        f0 = np.full(100, 200.0)
        f0[50] = 0
        noise = np.random.default_rng(0).standard_normal(rate) * .2
        out_noise, rep = q.repair_pitch(f0, noise, rate, hop)
        self.assertEqual(out_noise[50], 0)
        vowel = .3 * np.sin(2 * np.pi * 200 * t)
        out_vowel, rep = q.repair_pitch(f0, vowel, rate, hop)
        self.assertAlmostEqual(out_vowel[50], 200.0, delta=1)
        self.assertEqual(rep['bridged'], 1)

    def test_single_frame_spike_removed_vibrato_kept(self):
        frames = np.arange(300)
        f0 = 300 * 2 ** (.5 * np.sin(2 * np.pi * 5.5 * frames / 100) / 12)  # +-50 cent vibrato
        f0[150] *= 2 ** (5 / 12)
        out, report = q.repair_pitch(f0)
        self.assertEqual(report['spikes'], 1)
        keep = np.r_[0:149, 152:300]
        np.testing.assert_allclose(out[keep], f0[keep])

    def test_phrase_octave_plan_moves_only_whole_out_of_range_phrases(self):
        f0 = np.zeros(600)
        f0[0:150] = 900.0   # out of range phrase
        f0[300:450] = 400.0  # in range
        offsets, moved = q.phrase_octave_plan(f0, ceiling_hz=700, floor_hz=200)
        self.assertTrue(np.all(offsets[0:150] == -12))
        self.assertTrue(np.all(offsets[300:450] == 0))
        self.assertEqual(len(moved), 1)

    def test_range_guard_enables_register_adaptation_only_beyond_range(self):
        env = dict(ceilingHz=700., floorHz=180.)
        f0 = np.full(500, 300.)
        self.assertEqual(q.auto_register_strength(f0, 0, env, 0.)[0], 0.)
        f0[:200] = 900.
        strength, info = q.auto_register_strength(f0, 0, env, 0.)
        self.assertGreaterEqual(strength, .4)
        self.assertLessEqual(strength, .8)
        self.assertEqual(q.auto_register_strength(f0, 0, None, .3)[0], .3)


class FinishingTests(unittest.TestCase):
    def test_harsh_excess_is_reduced_but_source_like_air_is_kept(self):
        rate = 40000
        t = np.arange(rate * 2) / rate
        vowel = sum(.3 / k * np.sin(2 * np.pi * 220 * k * t) for k in range(1, 12))
        from scipy.signal import butter, sosfilt
        buzz = sosfilt(butter(4, [5000, 9000], 'band', fs=rate, output='sos'),
                       np.random.default_rng(2).standard_normal(len(t))) * .15
        report = {}
        out = q.finish_vocal(vowel + buzz, rate, vowel, rate, report=report)

        def hf(x):
            spec = np.abs(np.fft.rfft(x)) ** 2
            f = np.fft.rfftfreq(len(x), 1 / rate)
            return 10 * np.log10(spec[(f > 4500) & (f < 9500)].sum())
        self.assertLess(hf(out), hf(vowel + buzz) - 2)          # excess cut
        self.assertLessEqual(report['maxHarshDb'], 6.0 + 1e-6)  # bounded
        same = q.finish_vocal(vowel, rate, vowel, rate)
        self.assertLess(np.max(np.abs(same - vowel)), 0.02)     # no excess -> ~unchanged

    def test_true_peak_limiter_reaches_ceiling_and_leaves_quiet_audio(self):
        rate = 48000
        t = np.arange(rate) / rate
        loud = 1.6 * np.sin(2 * np.pi * 997 * t)
        out = q.true_peak_limit(np.stack([loud, loud], 1), rate, -1.0)
        from scipy.signal import resample_poly
        self.assertLessEqual(20 * np.log10(np.abs(resample_poly(out, 4, 1, axis=0)).max()), -0.99)
        quiet = .1 * np.sin(2 * np.pi * 997 * t)
        np.testing.assert_allclose(q.true_peak_limit(quiet, rate, -1.0), quiet)

    def test_lufs_matches_bs1770_reference_tone(self):
        rate = 48000
        tone = .1 * np.sin(2 * np.pi * 997 * np.arange(rate * 4) / rate)
        self.assertAlmostEqual(q.integrated_lufs(tone, rate), -23.0, delta=.3)
        self.assertAlmostEqual(q.integrated_lufs(np.stack([tone, tone], 1), rate), -20.0, delta=.3)

    def test_reverb_return_is_capped(self):
        rate = 16000
        dry = np.random.default_rng(3).standard_normal(rate) * .1
        out = q.reverb_return(dry, rate, wet_to_dry_db=0.0)
        wet = out - dry
        self.assertLessEqual(10 * np.log10(np.mean(wet ** 2) / np.mean(dry ** 2)), -9.5)
        np.testing.assert_array_equal(q.reverb_return(dry, rate, -80.0), dry)

    def test_hires_wav_encoding_is_48k_24bit(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'RVC_V3': '1', 'RVC_V3_HIRES': '1'}):
            src = Path(tmp) / 'in.wav'
            dst = Path(tmp) / 'out.wav'
            sf.write(src, np.zeros((44100, 2)) + .01, 44100, subtype='FLOAT')
            self.assertTrue(q.encode_wav(src, dst))
            info = sf.info(dst)
            self.assertEqual((info.samplerate, info.subtype, info.channels), (48000, 'PCM_24', 2))
            self.assertAlmostEqual(info.duration, 1.0, delta=.01)
        with patch.dict(os.environ, {'RVC_V3': '0'}):
            self.assertFalse(q.encode_wav(src, dst))


class SeparationFallbackTests(unittest.TestCase):
    def test_lead_guard_returns_full_vocal_where_lead_was_lost(self):
        sys.path.insert(0, str(ROOT / 'rvc-service' / 'app'))
        import importlib.util
        spec = importlib.util.find_spec('pymss')
        if spec is None:
            self.skipTest('pymss not installed')
        from app.separation_worker_v3 import lead_guard
        rate = 44100
        vocals = np.random.default_rng(4).standard_normal((rate * 3, 2)) * .1
        lead = vocals.copy()
        lead[rate:2 * rate] *= .01       # karaoke model swallowed the lead
        guarded, fraction = lead_guard(vocals, lead, rate)
        self.assertGreater(fraction, .2)
        self.assertLess(np.max(np.abs(guarded[int(1.3 * rate):int(1.7 * rate)] - vocals[int(1.3 * rate):int(1.7 * rate)])), 1e-9)

    def test_v3_failure_falls_back_to_legacy_worker(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'out'
            output.mkdir()
            vocals = output / 'vocals.wav'
            music = output / 'instrumental.wav'
            vocals.write_bytes(b'x')
            music.write_bytes(b'x')
            calls = []

            def run(command, **kwargs):
                calls.append(Path(command[1]).name)
                if command[1].endswith('separation_worker_v3.py'):
                    return subprocess.CompletedProcess(command, 1, '', 'boom')
                return subprocess.CompletedProcess(command, 0, json.dumps(
                    {'vocals': str(vocals), 'instrumental': str(music), 'sampleRate': 44100}), '')
            plan = {'main': 'm.ckpt', 'karaoke': 'k.ckpt', 'dereverb': '', 'files': []}
            with patch.object(separation_runtime, '_v3_plan', return_value=plan), \
                    patch.object(separation_runtime, 'separation_status', return_value={'ready': True}), \
                    patch.object(separation_runtime.subprocess, 'run', side_effect=run), \
                    patch.object(separation_runtime.separation_cache, 'cache_root', return_value=None):
                stems = separation_runtime.separate_song(Path(tmp) / 'in.wav', output)
            self.assertEqual(calls, ['separation_worker_v3.py', 'separation_worker.py'])
            self.assertEqual(stems.chain, 'legacy')

    def test_without_v3_models_plan_is_legacy(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(separation_runtime, 'separation_status', return_value={'ready': True}):
            from app import v3_models
            with patch.object(v3_models, 'models_dir', return_value=Path(tmp)):
                self.assertIsNone(separation_runtime._v3_plan())

    def test_v3_worker_keeps_legacy_payload_keys(self):
        source = (ROOT / 'rvc-service/app/separation_worker_v3.py').read_text(encoding='utf-8')
        for key in ('"vocals"', '"instrumental"', 'sampleRate', 'ensure_ascii=True'):
            self.assertIn(key, source)


if __name__ == '__main__':
    unittest.main()
