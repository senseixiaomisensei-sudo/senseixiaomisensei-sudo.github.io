"""Pinned upstream VC synthesis with signal-guided feature blending.

The implementation follows the verified 2.3.260718 ``Pipeline.vc`` call
contract.  Only scalar retrieval/protect blending is replaced by smooth
per-frame weights; the HuBERT and generator paths remain upstream.
"""

from time import time

import numpy as np

from app.feature_policy import adaptive_feature_weights


def adaptive_vc(self, model, net_g, sid, audio0, pitch, pitchf, times,
                index, index_vectors, index_rate, version, protect):
    import torch
    import torch.nn.functional as F
    from infer.hubert import extract_hubert_features
    from tools.cuda_graph import cuda_graph_enabled, run_cuda_graph

    t0 = time()
    source = torch.from_numpy(audio0).half() if self.is_half else torch.from_numpy(audio0).float()
    if source.dim() == 2:
        source = source.mean(-1)
    if source.dim() != 1:
        raise ValueError("RVC source audio must be mono")
    source = source.view(1, -1)
    padding_mask = torch.zeros(source.shape, dtype=torch.bool, device=self.device)
    with torch.no_grad():
        feats = extract_hubert_features(model, source.to(self.device), version, padding_mask=padding_mask)
    original_feats = feats.clone() if protect < 0.5 and pitchf is not None else None
    frame_pitch = pitchf[0].detach().cpu().numpy() if pitchf is not None else np.zeros(audio0.shape[0] // self.window)
    index_weights, source_blend = adaptive_feature_weights(
        audio0, frame_pitch, index_rate, protect, self.sr, self.window
    )

    if index is not None and index_vectors is not None and index_rate > 0:
        query = feats[0].float().cpu().numpy()
        score, nearest = index.search(query, k=8)
        safe_score = np.maximum(score, 1e-8)
        weights = 1 / np.square(safe_score)
        weights /= np.maximum(weights.sum(axis=1, keepdims=True), 1e-12)
        retrieved = np.sum(index_vectors[nearest] * weights[..., None], axis=1)
        # Large nearest-neighbour distance makes an index match less reliable.
        # Relative distance avoids assuming a particular model's FAISS scale.
        first = safe_score[:, 0]
        typical = max(1e-8, float(np.median(first[np.isfinite(first)])))
        trust = np.clip(typical / first, 0.45, 1.0)
        positions = np.linspace(0, max(0, len(index_weights) - 1), len(query))
        strength = np.interp(positions, np.arange(len(index_weights)), index_weights) * trust
        strength = torch.as_tensor(strength, device=self.device, dtype=feats.dtype)[None, :, None]
        retrieved = torch.as_tensor(retrieved, device=self.device, dtype=feats.dtype)[None]
        feats = feats + (retrieved - feats) * strength

    feats = F.interpolate(feats.permute(0, 2, 1), scale_factor=2).permute(0, 2, 1)
    if original_feats is not None:
        original_feats = F.interpolate(original_feats.permute(0, 2, 1), scale_factor=2).permute(0, 2, 1)
    t1 = time()
    p_len = min(audio0.shape[0] // self.window, feats.shape[1])
    if pitch is not None and pitchf is not None:
        pitch = pitch[:, :p_len]
        pitchf = pitchf[:, :p_len]
    if original_feats is not None and p_len > 0:
        fraction = np.interp(np.arange(p_len), np.arange(len(source_blend)), source_blend)
        fraction = torch.as_tensor(fraction, device=self.device, dtype=feats.dtype)[None, :, None]
        feats[:, :p_len] = feats[:, :p_len] * fraction + original_feats[:, :p_len] * (1 - fraction)
    lengths = torch.tensor([p_len], device=self.device).long()
    with torch.no_grad():
        if pitch is not None and pitchf is not None:
            synthesized = run_cuda_graph(
                net_g, "rvc-synth-f0",
                lambda phone, size, coarse, continuous, speaker: net_g.infer(phone, size, coarse, continuous, speaker)[0],
                feats, lengths, pitch, pitchf, sid,
            )
        else:
            synthesized = run_cuda_graph(
                net_g, "rvc-synth-no-f0",
                lambda phone, size, speaker: net_g.infer(phone, size, speaker)[0],
                feats, lengths, sid,
            )
        audio1 = synthesized[0, 0].data.cpu().float().numpy()
    if torch.cuda.is_available() and not cuda_graph_enabled(self.device):
        torch.cuda.empty_cache()
    t2 = time()
    times[0] += t1 - t0
    times[2] += t2 - t1
    return audio1
