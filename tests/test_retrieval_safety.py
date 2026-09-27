import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.retrieval_safety import stable_retrieval, validate_index
from app.inference_errors import InferenceStageError
from app.stage_evidence import observe


class RetrievalTests(unittest.TestCase):
    def test_legacy_zero_and_tiny_distance_failure_is_preserved_as_evidence(self):
        scores = np.array([[0,1,2], [1e-20,1e-19,1]], dtype=np.float32)
        with np.errstate(all='ignore'):
            weights = (1/scores)**2
            weights /= weights.sum(axis=1, keepdims=True)
        self.assertFalse(np.isfinite(weights).all())

    def test_positive_distances_match_legacy_formula(self):
        rng = np.random.default_rng(19)
        scores = rng.uniform(.1, 100, (40,8)).astype(np.float32)
        neighbors = rng.integers(0,100, (40,8))
        vectors = rng.normal(size=(100,256)).astype(np.float32)
        query = rng.normal(size=(40,256)).astype(np.float32)
        weights = (1/scores)**2
        weights /= weights.sum(axis=1, keepdims=True)
        expected = (vectors[neighbors]*weights[:,:,None]).sum(axis=1)
        actual, stats = stable_retrieval(scores,neighbors,vectors,query)
        np.testing.assert_allclose(actual,expected,atol=5e-7,rtol=1e-5)
        self.assertEqual(stats['usedRows'],40)

    def test_zero_tiny_invalid_and_missing_neighbors(self):
        vectors = np.array([[1.,2.],[3.,4.],[9.,10.]],dtype=np.float32)
        query = np.full((6,2),7.)
        scores = [[0,1,2],[0,0,2],[1e-30,1e-29,1],
                  [0,0,1],[np.inf,-2,np.nan],[-1e-7,2,4]]
        ix = [[0,1,2],[0,1,2],[0,1,2],[-1,9,1],[-1,1,2],[0,1,2]]
        actual, stats = stable_retrieval(scores,ix,vectors,query)
        np.testing.assert_allclose(actual[0],vectors[0])
        np.testing.assert_allclose(actual[1],(vectors[0]+vectors[1])/2)
        np.testing.assert_allclose(actual[2],(vectors[0]+.01*vectors[1])/1.01,atol=3e-7)
        np.testing.assert_allclose(actual[3],vectors[1])
        np.testing.assert_array_equal(actual[4],query[4])
        np.testing.assert_array_equal(actual[5],vectors[0])
        self.assertEqual(stats['fallbackRows'],1)
        self.assertTrue(np.isfinite(actual).all())

    def test_wrong_metric_dimension_empty_and_corrupt_vectors(self):
        good = dict(metric_type=1,d=2,ntotal=3)
        validate_index(SimpleNamespace(**good),np.ones((3,2)),2)
        for change in ({'metric_type':0},{'d':3},{'ntotal':0}):
            with self.assertRaises(InferenceStageError):
                validate_index(SimpleNamespace(**(good|change)),np.ones((3,2)),2)
        with self.assertRaises(InferenceStageError):
            validate_index(SimpleNamespace(**good),np.full((3,2),np.nan),2)

    def test_nonfinite_detected_before_integer_quantization(self):
        for name in ('hubert','retrieved-features','protected-features','generator-float'):
            pipe = SimpleNamespace(stage_records=[], diagnostic_f0_dir=None)
            with self.assertRaises(InferenceStageError) as error:
                observe(pipe,name,np.array([.1,np.nan,.3]))
            self.assertEqual(error.exception.stage,name)
            self.assertEqual(pipe.stage_records[0]['nonFinite'],1)


if __name__=='__main__':
    unittest.main()
