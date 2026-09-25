import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.main import join_long_audio, split_long_audio


class SongChunkTests(unittest.TestCase):
    def test_full_song_has_three_recorded_overlaps_and_no_join_dip(self):
        rate = 16000
        duration = 59.582
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.wav"
            target = Path(root) / "joined.wav"
            # Smooth song-like oscillation plus weak percussion at each seam.
            t = np.arange(round(duration * rate)) / rate
            wave = .1 * np.sin(2 * np.pi * 220 * t)
            for seam in (14.77, 29.54, 44.31):
                start = round(seam * rate)
                wave[start:start + 500] += .03 * np.exp(-np.arange(500) / 60)
            sf.write(source, wave, rate, subtype="FLOAT")
            chunks = split_long_audio(source, Path(root) / "chunks", duration)
            manifest = json.loads((Path(root) / "chunks" / "manifest.json").read_text())
            self.assertEqual(len(chunks), 4)
            self.assertEqual(len(manifest["overlaps"]), 3)
            join_long_audio(chunks, target, duration)
            joined, joined_rate = sf.read(target)
            self.assertEqual(joined_rate, rate)
            self.assertLess(abs(len(joined) - len(wave)), rate * .02)
            for overlap in manifest["overlaps"]:
                midpoint = round((overlap["startSeconds"] + overlap["endSeconds"]) * rate / 2)
                section = slice(midpoint - 800, midpoint + 800)
                original_rms = np.sqrt(np.mean(wave[section] ** 2))
                joined_rms = np.sqrt(np.mean(joined[section] ** 2))
                self.assertLess(abs(joined_rms / original_rms - 1), .03)


if __name__ == "__main__":
    unittest.main()
