import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.pitch_consensus import choose_supported_pitch


class PitchConsensusTests(unittest.TestCase):
    def test_subperiod_reference_does_not_veto_supported_non_octave_correction(self):
        t=np.arange(16000)/16000
        audio=.2*np.sin(2*np.pi*408*t)+.2*np.sin(2*np.pi*816*t)
        primary=np.full(100,408.);primary[40:65]=337.
        alt=np.full(100,408.);independent=np.full(100,136.)
        result,evidence=choose_supported_pitch(primary,alt,independent,audio)
        np.testing.assert_array_equal(result,alt)
        self.assertTrue(evidence['harmonic_family'][50])

    def test_subperiod_ambiguity_keeps_original_without_strong_waveform_evidence(self):
        audio=.2*np.sin(2*np.pi*408*np.arange(16000)/16000)
        primary=np.full(100,337.);alt=np.full(100,408.)
        result,_=choose_supported_pitch(primary,alt,np.full(100,136.),audio)
        np.testing.assert_array_equal(result,primary)

    def test_low_salience_wrong_note_can_use_two_supported_high_register_tracks(self):
        audio=.2*np.sin(2*np.pi*1160*np.arange(16000)/16000)
        primary=np.full(100,1160.);primary[40:55]=410.
        high=np.full(100,1160.)
        result,evidence=choose_supported_pitch(primary,np.zeros(100),high,audio,
            independent_cc=high,confidence=np.full(100,.05))
        np.testing.assert_array_equal(result,high)
        self.assertEqual(np.flatnonzero(evidence['accepted']).tolist(),list(range(40,55)))

    def test_strong_third_partial_does_not_change_real_lower_note(self):
        t=np.arange(16000)/16000
        audio=.02*np.sin(2*np.pi*408*t)+.2*np.sin(2*np.pi*1224*t)
        primary=np.full(100,408.);alt=np.full(100,1224.)
        result,evidence=choose_supported_pitch(primary,alt,alt,audio,
            independent_cc=alt,confidence=np.full(100,.05))
        np.testing.assert_array_equal(result,primary)
        self.assertFalse(evidence['high_register'].any())

    def test_secondary_evidence_cannot_fill_unvoiced_or_overrule_confident_pitch(self):
        t=np.arange(16000)/16000;audio=.2*np.sin(2*np.pi*1250*t)
        for primary,confidence in [(np.zeros(100),np.full(100,.05)),(np.full(100,410.),np.ones(100))]:
            high=np.full(100,1250.)
            result,_=choose_supported_pitch(primary,np.zeros(100),high,audio,
                independent_cc=high,confidence=confidence)
            np.testing.assert_array_equal(result,primary)

    def test_non_octave_mistrack_requires_two_trackers_and_waveform_support(self):
        audio = .2*np.sin(2*np.pi*450*np.arange(16000)/16000)
        correct = np.full(100, 450.)
        primary = correct.copy()
        primary[40:55] = 330
        fixed, evidence = choose_supported_pitch(primary, correct, correct, audio)
        np.testing.assert_array_equal(fixed, correct)
        self.assertEqual(np.flatnonzero(evidence['accepted']).tolist(), list(range(40,55)))
        # Candidate consensus is mandatory, even with favorable correlation.
        unchanged, _ = choose_supported_pitch(primary, correct, primary, audio)
        np.testing.assert_array_equal(unchanged, primary)

    def test_real_lower_note_with_strong_upper_partial_is_preserved(self):
        t = np.arange(16000)/16000
        audio = .03*np.sin(2*np.pi*220*t)+.2*np.sin(2*np.pi*440*t)
        primary = np.full(100,220.)
        alternative = np.full(100,440.)
        result, _ = choose_supported_pitch(primary, alternative, alternative, audio)
        np.testing.assert_array_equal(result, primary)

    def test_unvoiced_extreme_pitch_and_weak_material_are_not_rewritten(self):
        rng = np.random.default_rng(19)
        for primary, alternative, audio in [
            (np.zeros(100),np.full(100,440.),rng.normal(0,.03,16000)),
            (np.full(100,1238.),np.full(100,413.),.2*np.sin(2*np.pi*1238*np.arange(16000)/16000)),
            (np.full(100,330.),np.full(100,450.),.0001*np.sin(2*np.pi*450*np.arange(16000)/16000)),
        ]:
            result, _ = choose_supported_pitch(primary,alternative,alternative,audio)
            np.testing.assert_array_equal(result,primary)

    def test_short_disagreement_is_evidence_not_automatic_repair(self):
        primary=np.full(100,450.);primary[40:42]=330
        alt=np.full(100,450.)
        result,_=choose_supported_pitch(primary,alt,alt,.2*np.sin(2*np.pi*450*np.arange(16000)/16000))
        np.testing.assert_array_equal(result,primary)

    def test_single_independent_tracker_dropout_does_not_create_wrong_note_island(self):
        primary=np.full(100,450.);primary[40:55]=330
        alt=np.full(100,450.);independent=alt.copy();independent[47]=0
        audio=.2*np.sin(2*np.pi*450*np.arange(16000)/16000)
        result,evidence=choose_supported_pitch(primary,alt,independent,audio)
        np.testing.assert_array_equal(result,alt)
        self.assertTrue(evidence['bridged'][47])
        primary[47]=0
        result,_=choose_supported_pitch(primary,alt,independent,audio)
        self.assertEqual(result[47],0)
