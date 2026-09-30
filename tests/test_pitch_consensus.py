import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.pitch_consensus import choose_supported_pitch, _period_correlation


class PitchConsensusTests(unittest.TestCase):
    def test_fractional_period_strong_harmonics_do_not_lower_correct_high_note(self):
        t=np.arange(16000)/16000
        for hz in (820., 773.3, 911.7):
            for harmonic in range(2,9):
                if hz*harmonic>=7600: continue
                with self.subTest(hz=hz,harmonic=harmonic):
                    audio=.02*np.sin(2*np.pi*hz*t)+.2*np.sin(2*np.pi*hz*harmonic*t)
                    primary=np.full(100,hz);wrong=np.full(100,hz/2)
                    result,evidence=choose_supported_pitch(primary,wrong,wrong,audio,
                        confidence=np.ones(100),time_origin_seconds=30.)
                    np.testing.assert_array_equal(result,primary)
                    self.assertGreater(_period_correlation(audio[4000:4960],16000,hz),.99)
                    self.assertTrue(evidence['harmonic_ambiguity'][50])
                    self.assertIn('ambiguity',evidence['decision_reason'][50])
                    self.assertEqual(evidence['absolute_time_seconds'][50],30.5)

    def test_correct_low_note_and_wrong_integer_multiple_remain_ambiguous(self):
        t=np.arange(16000)/16000
        for harmonic in range(2,9):
            audio=.02*np.sin(2*np.pi*211.3*t)+.2*np.sin(2*np.pi*211.3*harmonic*t)
            primary=np.full(100,211.3);wrong=primary*harmonic
            result,_=choose_supported_pitch(primary,wrong,wrong,audio,confidence=np.full(100,.05))
            np.testing.assert_array_equal(result,primary)

    def test_real_octave_jump_ornament_glide_and_vibrato_are_not_flattened(self):
        t=np.arange(16000)/16000
        for hz in (np.where(t<.5,410.,820.), 700+80*t,
                   710+20*np.sin(2*np.pi*5*t),np.where((t>.4)&(t<.42),900.,700.)):
            audio=.2*np.sin(2*np.pi*np.cumsum(hz)/16000)
            primary=hz[::160];wrong=primary/2
            result,_=choose_supported_pitch(primary,wrong,wrong,audio)
            np.testing.assert_array_equal(result,primary)

    def test_breathy_consonants_and_noisy_shouts_are_not_forced_to_candidate(self):
        rng=np.random.default_rng(820)
        for audio in (rng.normal(0,.05,16000),rng.normal(0,.003,16000),
                      .02*np.sin(2*np.pi*820*np.arange(16000)/16000)+rng.normal(0,.1,16000)):
            primary=np.full(100,820.);wrong=np.full(100,410.)
            result,_=choose_supported_pitch(primary,wrong,wrong,audio)
            np.testing.assert_array_equal(result,primary)

    def test_wrong_double_frequency_can_be_corrected_with_real_fundamental_evidence(self):
        audio=.2*np.sin(2*np.pi*411.3*np.arange(16000)/16000)
        correct=np.full(100,411.3);primary=correct*2
        result,evidence=choose_supported_pitch(primary,correct,correct,audio)
        np.testing.assert_array_equal(result,correct)
        self.assertFalse(evidence['harmonic_ambiguity'].any())

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
