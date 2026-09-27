"""Stable squared-inverse weights for FAISS *L2* distances only."""
import numpy as np

from app.inference_errors import InferenceStageError


def validate_index(index, vectors, feature_dimension):
    # FAISS METRIC_L2 == 1. Inner products are not nonnegative distances.
    if int(index.metric_type) != 1:
        raise InferenceStageError('retrieval-contract', 'Expected an L2 index')
    if int(index.d) != feature_dimension:
        raise InferenceStageError('retrieval-contract', 'Feature/index dimension mismatch')
    if int(index.ntotal) < 1 or vectors.shape != (index.ntotal, feature_dimension):
        raise InferenceStageError('retrieval-contract', 'Empty or incomplete index vectors')
    if not np.isfinite(vectors).all():
        raise InferenceStageError('retrieval-vectors', 'Non-finite index vectors')


def stable_retrieval(scores, neighbors, vectors, original):
    scores = np.asarray(scores, dtype=np.float64)
    neighbors = np.asarray(neighbors)
    original = np.asarray(original)
    if scores.shape != neighbors.shape or scores.shape[0] != len(original):
        raise InferenceStageError('retrieval-search', 'Invalid result shape')
    if not np.isfinite(original).all():
        raise InferenceStageError('hubert', 'Non-finite query features')
    neighbor_ok = (neighbors >= 0) & (neighbors < len(vectors))
    finite = np.isfinite(scores)
    # Only a small absolute float32 L2 roundoff is treated as an exact match.
    # Large negative values stay invalid; no absolute-value or nan_to_num fix.
    roundoff = finite & (scores < 0) & (scores >= -1e-6)
    distances = np.where(roundoff, 0., scores)
    valid = neighbor_ok & finite & (distances >= 0)
    zero = valid & (distances == 0)
    zero_rows = zero.any(axis=1)
    positive = valid & (distances > 0)
    minima = np.min(np.where(positive, distances, np.inf), axis=1, keepdims=True)
    ratios = np.zeros_like(scores)
    np.divide(minima, distances, out=ratios, where=positive & ~zero_rows[:, None])
    weights = np.where(zero_rows[:, None], zero.astype(np.float64), ratios**2)
    total = weights.sum(axis=1, keepdims=True)
    np.divide(weights, total, out=weights, where=total > 0)
    active_rows = total[:, 0] > 0
    # Invalid -1 neighbors must never resolve to the last vector. Masking
    # happens before gather and weight application, not after synthesis.
    safe_neighbors = np.where(valid, neighbors, 0)
    retrieved = np.sum(vectors[safe_neighbors].astype(np.float64)*weights[:, :, None], axis=1)
    result = np.array(original, dtype=np.float32, copy=True)
    result[active_rows] = retrieved[active_rows]
    if not np.isfinite(result).all():
        raise InferenceStageError('retrieved-features', 'Non-finite weighted features')
    return result, {
        'rows': len(scores), 'usedRows': int(active_rows.sum()),
        'fallbackRows': int((~active_rows).sum()),
        'zeroDistanceRows': int(zero_rows.sum()),
        'zeroDistances': int(zero.sum()),
        'invalidNeighbors': int((~neighbor_ok).sum()),
        'nonFiniteDistances': int((~finite).sum()),
        'negativeDistances': int((finite & (distances < 0)).sum()),
        'negativeRoundoffDistances': int(roundoff.sum()),
    }
