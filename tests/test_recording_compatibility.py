import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.main import analyze_audio_profile, probe_duration, RvcServiceError


class RecordingCompatibilityTests(unittest.TestCase):
    def test_streaming_webm_without_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "recording.webm"
            result = subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "sine=frequency=260:duration=2", "-c:a", "libopus",
                "-f", "webm", "pipe:1",
            ], capture_output=True, check=True)
            path.write_bytes(result.stdout)
            raw = subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ], text=True).strip()
            self.assertEqual(raw, "N/A")
            self.assertAlmostEqual(probe_duration(path), 2, places=1)
            self.assertFalse(analyze_audio_profile(path).high_pitch)
            self.assertTrue(analyze_audio_profile(path, 12).high_pitch)

    def test_invalid_recording_is_still_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.webm"
            path.write_bytes(b"not audio")
            with self.assertRaises(RvcServiceError):
                probe_duration(path)


if __name__ == "__main__":
    unittest.main()
