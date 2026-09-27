"""Paired counterexamples from the distortion incident (not listening tests)."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app.pitch_safety import safe_get_f0
from app.audio_dynamics import preserve_dynamics


class IncidentTests(unittest.TestCase):
    def test_true_short_octave_is_not_rewritten(self):
        track = np.r_[np.full(10, 440.), np.full(3, 880.), np.full(10, 440.)]
        wave = .2 * np.sin(2*np.pi*np.cumsum(np.repeat(track, 160))/16000)
        pipe = SimpleNamespace(sr=16000, window=160, pitch_median_radius=0,
            model_rmvpe=SimpleNamespace(infer_from_audio=lambda *a, **k: track.copy()))
        _, actual = safe_get_f0(pipe, wave, len(track), 0, 'rmvpe')
        np.testing.assert_array_equal(actual, track)

    def test_vibrato_glissandi_and_uv_are_not_smoothed_by_default(self):
        track = np.r_[np.geomspace(80, 1900, 70), 0, 0,
                      440 * 2**(.4*np.sin(np.arange(70)*.31)/12)]
        pipe = SimpleNamespace(sr=16000, window=160, pitch_median_radius=0,
            model_rmvpe=SimpleNamespace(infer_from_audio=lambda *a, **k: track.copy()))
        _, actual = safe_get_f0(pipe, np.zeros(len(track)*160), len(track), 3, 'rmvpe')
        np.testing.assert_allclose(actual, track*2**(3/12))

    def test_weak_signal_threshold_has_no_ten_db_gain_step(self):
        sr = 16000
        t = np.arange(sr*2)/sr
        carrier = np.sqrt(2)*np.sin(2*np.pi*400*t)
        source = carrier*np.where(t < 1, .0029, .0031)
        target = carrier*.1
        result = preserve_dynamics(target, sr, source, sr, .5)
        keep = abs(target) > 1e-4
        gain = result[keep]/target[keep]
        left = np.median(gain[t[keep] < .95])
        right = np.median(gain[t[keep] > 1.25])
        self.assertLess(abs(20*np.log10(right/left)), 1.)

    def test_near_threshold_oscillation_does_not_modulate_voice(self):
        sr = 16000
        t = np.arange(sr*3)/sr
        carrier = np.sqrt(2)*np.sin(2*np.pi*400*t)
        target = carrier*.1
        source = carrier*(.003+.0001*np.sin(2*np.pi*3*t))
        result = preserve_dynamics(target, sr, source, sr, .5)
        keep = (abs(target)>1e-4) & (t>.5)
        db = 20*np.log10(result[keep]/target[keep])
        self.assertLess(np.ptp(db), 1.)


if __name__ == '__main__':
    unittest.main()
