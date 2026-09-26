"""Make a static-gain A/B pair; no compression or timbre processing."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def lufs(path: Path) -> float:
    result = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(path),
                             "-af", "ebur128=peak=true", "-f", "null", "NUL"],
                            capture_output=True, check=True, timeout=180)
    matches = re.findall(r"\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS",
                         result.stderr.decode("utf-8", errors="replace"))
    if not matches:
        raise ValueError("No integrated loudness measurement")
    return float(matches[-1])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source_lufs = {"before": lufs(args.before), "after": lufs(args.after)}
    target = min(source_lufs.values()) - .5
    report = {"targetLufs": target, "items": {}}
    for label, source in (("before", args.before), ("after", args.after)):
        gain = target - source_lufs[label]
        destination = args.output / f"{label}-matched.wav"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
                        "-af", f"volume={gain:.4f}dB", "-c:a", "pcm_f32le", str(destination)],
                       check=True, timeout=180)
        report["items"][label] = {"source": str(source), "sourceLufs": source_lufs[label],
                                   "staticGainDb": round(gain, 4), "output": str(destination),
                                   "matchedLufs": lufs(destination)}
    (args.output / "equal-loudness.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
