"""Count-policy counterexamples; not a listening or singer-identity score."""
import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app.chorus_worker import RATE, split_evidence


class CountEvidence(unittest.TestCase):
    def tones(self):
        t = np.arange(RATE * 4) / RATE
        return np.array([.2 * np.sin(2 * np.pi * 190 * t), .2 * np.sin(2 * np.pi * 275 * t)], dtype=np.float32)

    def test_alternating_delivery_is_insufficient_for_two_people(self):
        pair = self.tones()
        pair[0, RATE * 2:] = 0
        pair[1, :RATE * 2] = 0
        evidence = split_evidence(pair)
        self.assertFalse(evidence['distinctCandidate'])
        self.assertEqual(evidence['simultaneousSeconds'], 0)

    def test_low_level_leak_and_correlated_duplicates_are_not_new_singers(self):
        pair = self.tones()
        pair[1] *= .1
        self.assertFalse(split_evidence(pair)['distinctCandidate'])
        pair[1] = pair[0] * .8
        self.assertFalse(split_evidence(pair)['distinctCandidate'])

    def test_sustained_independent_overlap_remains_a_candidate(self):
        self.assertTrue(split_evidence(self.tones())['distinctCandidate'])


if __name__ == '__main__':
    unittest.main()
