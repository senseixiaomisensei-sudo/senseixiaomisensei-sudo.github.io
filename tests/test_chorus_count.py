"""Count-policy counterexamples; not a listening or singer-identity score."""
import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app.chorus_worker import RATE, split_evidence
from app.chorus_quality import accept_pair, merge_duplicate_leaves
from app.chorus_medley import prefer_candidate


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

    def test_manual_count_cannot_force_duplicate_stems(self):
        pair=self.tones();pair[1]=pair[0]*.8
        self.assertFalse(accept_pair(split_evidence(pair),manual=True))
        leaves,merged=merge_duplicate_leaves(list(pair))
        self.assertEqual(len(leaves),1);self.assertEqual(len(merged),1)
        np.testing.assert_allclose(leaves[0],pair.sum(axis=0),atol=1e-7)

    def test_similar_but_independent_singers_not_merged(self):
        t=np.arange(RATE*4)/RATE
        pair=np.array([.2*np.sin(2*np.pi*190*t),.2*np.sin(2*np.pi*194*t)],dtype=np.float32)
        leaves,merged=merge_duplicate_leaves(list(pair))
        self.assertEqual(len(leaves),2);self.assertEqual(merged,[])

    def test_manual_alternating_sources_are_reviewable_not_automatically_counted(self):
        pair=self.tones();pair[0,RATE*2:]=0;pair[1,:RATE*2]=0
        info=split_evidence(pair)
        self.assertTrue(accept_pair(info,manual=True));self.assertFalse(accept_pair(info,manual=False))

    def test_recursive_duplicate_merge_keeps_all_samples(self):
        pair=self.tones();leaves=[pair[0]*.6,pair[1],pair[0]*.4]
        merged,evidence=merge_duplicate_leaves(leaves)
        self.assertEqual(len(merged),2)
        np.testing.assert_allclose(np.sum(merged,axis=0),np.sum(leaves,axis=0),atol=1e-7)

    def test_alternate_separator_only_replaces_an_established_leaking_result(self):
        clean=split_evidence(self.tones())
        leaking={**clean,'crossTalkRisk':True,'sharedCoherenceMedian':.81,'highCoherenceRatio':.43}
        self.assertTrue(prefer_candidate(leaking,clean))
        self.assertFalse(prefer_candidate(clean,clean))
        self.assertFalse(prefer_candidate(leaking,clean,assignment_uncertain=True))
        self.assertFalse(prefer_candidate(leaking,{**clean,'distinctCandidate':False}))
        self.assertFalse(prefer_candidate(leaking,{**leaking,'sharedCoherenceMedian':.80}))


if __name__ == '__main__':
    unittest.main()
