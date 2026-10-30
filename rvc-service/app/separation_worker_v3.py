"""Isolated v3 separation worker: vocals -> lead/backing -> dry lead.

Stage order (each stage optional; a missing model or a failure skips only
that stage and is recorded):

1. main vocal/instrumental separation (``--model``)
2. lead/backing split of the vocal stem (``--karaoke-model``); only the lead
   is converted, the backing harmony stays in the accompaniment. A per-window
   guard hands the whole vocal to the lead wherever the karaoke model
   swallowed the lead (prevents unconverted original-voice passages).
3. dereverb of the lead (``--dereverb-model``); the dry lead goes to RVC and
   the removed-reverb energy ratio is reported for a matched room return.

Output JSON (last stdout line) keeps the legacy keys ``vocals`` (the stem to
convert), ``instrumental`` (everything that is not converted) and
``sampleRate`` so the parent and the separation cache stay compatible.
"""
from __future__ import annotations

import argparse
import gc
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from pymss import create_separator, load_audio


def channel_last(audio: np.ndarray) -> np.ndarray:
    value = np.asarray(audio, dtype=np.float32)
    if value.ndim == 1:
        return value[:, None]
    if value.ndim != 2:
        raise ValueError(f"Unsupported separated audio shape: {value.shape}")
    if value.shape[0] <= 8 and value.shape[1] > value.shape[0]:
        return value.T
    return value


def find_stem(results, *names):
    for wanted in names:
        for key, value in results.items():
            if str(key).casefold() == wanted.casefold():
                return channel_last(value)
    return None


def run_model(model, model_dir, device, audio_cl, overlap):
    """Run one pymss model on channel-last audio; returns {stem: channel-last}."""
    with create_separator(
        model, model_dir=str(model_dir), device=device, device_ids=[0],
        output_format="wav", use_tta=False, store_dirs=str(model_dir),
        save_as_folder=False,
        inference_params={"batch_size": 1, "chunk_size": 352800, "overlap_size": overlap,
                          "standardize": False, "normalize": False, "use_amp": device == "cuda"},
    ) as separator:
        results = separator.separate(np.ascontiguousarray(audio_cl.T), pbar=False)
    out = {str(k): channel_last(v) for k, v in results.items()}
    del results
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return out


def fit(x, n):
    if len(x) >= n:
        return x[:n]
    return np.pad(x, ((0, n - len(x)), (0, 0)))


def lead_guard(vocals, lead, rate, window=.5, floor_db=-12.0):
    """Give the full vocal back to the lead where the karaoke model lost it.

    In every 500 ms window where the vocal stem is active but the lead
    carries less than ``floor_db`` of its energy (the model labelled the
    lead as backing), the lead becomes the full vocal there (200 ms raised
    cosine transitions). Returns (guarded_lead, fraction_of_windows_guarded).
    """
    n = len(vocals)
    hop = int(rate * window)
    vm = vocals.mean(axis=1)
    lm = lead.mean(axis=1)
    count = max(1, int(np.ceil(n / hop)))
    v_rms = np.array([np.sqrt(np.mean(vm[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(count)])
    l_rms = np.array([np.sqrt(np.mean(lm[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(count)])
    active = v_rms > max(1e-3, np.percentile(v_rms, 90) * 10 ** (-30 / 20))
    lost = active & (20 * np.log10(l_rms / v_rms) < floor_db)
    if not lost.any():
        return lead, 0.0
    weight = np.repeat(lost.astype(np.float64), hop)[:n]
    ramp = int(rate * .2)
    kernel = np.hanning(2 * ramp + 1)
    kernel /= kernel.sum()
    weight = np.clip(np.convolve(weight, kernel, mode="same"), 0, 1)[:, None]
    return lead * (1 - weight) + vocals * weight, float(lost[active].mean()) if active.any() else 0.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--karaoke-model", default="")
    parser.add_argument("--dereverb-model", default="")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--overlap", type=int, default=264600)
    args = parser.parse_args()

    source = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    model_dir = Path(args.model_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not source.is_file() or not model_dir.is_dir():
        raise FileNotFoundError("Separation input or model directory is missing")
    device = args.device
    if device == "cuda" and not torch.cuda.is_available():
        device = "cpu"

    mix, sample_rate = load_audio(str(source), sr=44100, mono=False)
    mix_cl = channel_last(mix)
    n = len(mix_cl)
    stages = {}

    results = run_model(args.model, model_dir, device, mix_cl, args.overlap)
    vocals = find_stem(results, "vocals", "vocal")
    instrumental = find_stem(results, "instrumental", "other")
    if vocals is None:
        raise RuntimeError(f"PyMSS did not return a vocals stem: {sorted(results)}")
    vocals = fit(vocals, n)
    instrumental = fit(instrumental, n) if instrumental is not None else mix_cl - vocals
    stages["main"] = {"model": args.model, "ok": True}

    lead = vocals
    backing = np.zeros_like(vocals)
    if args.karaoke_model:
        try:
            k = run_model(args.karaoke_model, model_dir, device, vocals, args.overlap)
            k_lead = find_stem(k, "vocals", "lead", "lead_vocals", "karaoke")
            k_back = find_stem(k, "backing_vocal", "backing", "back", "instrumental", "other")
            if k_lead is None and k_back is not None:
                k_lead = vocals - fit(k_back, n)
            if k_lead is None:
                raise RuntimeError(f"karaoke stems {sorted(k)}")
            k_lead = fit(k_lead, n)
            guarded, fraction = lead_guard(vocals, k_lead, sample_rate)
            lead = guarded
            backing = vocals - lead
            v_e = float(np.sum(vocals ** 2)) + 1e-12
            stages["karaoke"] = {"model": args.karaoke_model, "ok": True,
                                 "backingEnergyRatio": float(np.sum(backing ** 2) / v_e),
                                 "guardedWindowFraction": fraction, "stems": sorted(k)}
        except Exception as error:  # stage-local fallback
            lead, backing = vocals, np.zeros_like(vocals)
            stages["karaoke"] = {"model": args.karaoke_model, "ok": False, "error": str(error)[:300]}

    dry = lead
    reverb = np.zeros_like(lead)
    if args.dereverb_model:
        try:
            d = run_model(args.dereverb_model, model_dir, device, lead, args.overlap)
            d_dry = find_stem(d, "noreverb", "dry", "no_reverb", "vocals", "other")
            d_wet = find_stem(d, "reverb", "wet")
            if d_dry is None and d_wet is not None:
                d_dry = lead - fit(d_wet, n)
            if d_dry is None:
                raise RuntimeError(f"dereverb stems {sorted(d)}")
            dry = fit(d_dry, n)
            reverb = lead - dry
            ratio = float(np.sum(reverb ** 2) / (np.sum(dry ** 2) + 1e-12))
            stages["dereverb"] = {"model": args.dereverb_model, "ok": True,
                                  "wetToDryDb": float(10 * np.log10(ratio + 1e-12)), "stems": sorted(d)}
        except Exception as error:
            dry, reverb = lead, np.zeros_like(lead)
            stages["dereverb"] = {"model": args.dereverb_model, "ok": False, "error": str(error)[:300]}

    # Everything that is not converted stays in the accompaniment except the
    # removed lead reverb (it carries the original singer's timbre; the
    # parent re-applies a matched room to the converted lead instead).
    accompaniment = instrumental + backing
    for value in (dry, accompaniment, vocals, backing, reverb):
        if not np.isfinite(value).all():
            raise FloatingPointError("PyMSS returned non-finite samples")
    paths = {
        "vocals": output_dir / "vocals.wav",
        "instrumental": output_dir / "instrumental.wav",
        "vocalsFull": output_dir / "vocals-full.wav",
        "backing": output_dir / "backing.wav",
        "leadReverb": output_dir / "lead-reverb.wav",
    }
    sf.write(paths["vocals"], dry, sample_rate, format="WAV", subtype="FLOAT")
    sf.write(paths["instrumental"], accompaniment, sample_rate, format="WAV", subtype="FLOAT")
    sf.write(paths["vocalsFull"], vocals, sample_rate, format="WAV", subtype="FLOAT")
    sf.write(paths["backing"], backing, sample_rate, format="WAV", subtype="FLOAT")
    sf.write(paths["leadReverb"], reverb, sample_rate, format="WAV", subtype="FLOAT")
    payload = {k: str(v) for k, v in paths.items()}
    payload.update(sampleRate=sample_rate, device=device, stages=stages, chain="v3")
    (output_dir / "v3-stages.json").write_text(json.dumps(stages, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=True))


if __name__ == "__main__":
    main()
