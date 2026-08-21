"""Compress an RVC FAISS IVF index into a browser-friendly centroid codebook."""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

import faiss
import numpy as np
from sklearn.cluster import KMeans


MAGIC = b"PPRI"
VERSION = 1


def load_index(path: Path):
    raw = np.frombuffer(path.read_bytes(), dtype=np.uint8)
    return faiss.deserialize_index(raw)


def extract_ivf_centroids(index) -> tuple[np.ndarray, np.ndarray]:
    ivf = faiss.extract_index_ivf(index)
    centroids = np.empty((ivf.nlist, ivf.d), dtype=np.float32)
    ivf.quantizer.reconstruct_n(0, ivf.nlist, centroids)
    sizes = np.asarray([max(1, ivf.invlists.list_size(i)) for i in range(ivf.nlist)], dtype=np.float64)
    return centroids, sizes


def compress(centroids: np.ndarray, weights: np.ndarray, target: int, seed: int) -> np.ndarray:
    if len(centroids) <= target:
        return np.ascontiguousarray(centroids, dtype=np.float32)
    model = KMeans(
        n_clusters=target,
        init="k-means++",
        n_init=10,
        max_iter=300,
        random_state=seed,
        algorithm="lloyd",
    )
    model.fit(centroids, sample_weight=weights)
    return np.ascontiguousarray(model.cluster_centers_, dtype=np.float32)


def weighted_distortion(source: np.ndarray, weights: np.ndarray, codebook: np.ndarray) -> float:
    distances = np.sum((source[:, None, :] - codebook[None, :, :]) ** 2, axis=2)
    nearest = np.min(distances, axis=1)
    return float(np.average(nearest, weights=weights))


def weighted_variance(source: np.ndarray, weights: np.ndarray) -> float:
    mean = np.average(source, axis=0, weights=weights)
    return float(np.average(np.sum((source - mean) ** 2, axis=1), weights=weights))


def write_codebook(path: Path, codebook: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    header = struct.pack("<4sIII", MAGIC, VERSION, len(codebook), codebook.shape[1])
    path.write_bytes(header + codebook.astype("<f4", copy=False).tobytes(order="C"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--centroids", type=int, default=192)
    parser.add_argument("--seed", type=int, default=20260821)
    args = parser.parse_args()
    if args.centroids < 8 or args.centroids > 1024:
        raise ValueError("--centroids must be between 8 and 1024")

    index = load_index(args.index.resolve())
    source, weights = extract_ivf_centroids(index)
    codebook = compress(source, weights, args.centroids, args.seed)
    distortion = weighted_distortion(source, weights, codebook)
    variance = weighted_variance(source, weights)
    write_codebook(args.output.resolve(), codebook)
    print(
        f"source_centroids={len(source)} output_centroids={len(codebook)} "
        f"dimension={codebook.shape[1]} weighted_distortion={distortion:.8f} "
        f"relative_distortion={distortion / max(variance, 1e-12):.6f} "
        f"bytes={args.output.stat().st_size}"
    )


if __name__ == "__main__":
    main()
