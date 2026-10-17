import sys
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from starlette.datastructures import Headers, UploadFile
from app.main import analyze_audio_profile, probe_duration, safe_extension, normalize_audio, RvcServiceError


class RecordingCompatibilityTests(unittest.TestCase):
    def test_mobile_audio_metadata(self):
        for name, mime in [
            ("speech.mp3", "audio/mp3"),
            ("speech.mp3", "audio/x-mp3"),
            ("speech.mp3", "application/octet-stream"),
            ("speech.mp3", "audio/mpeg; codecs=mp3"),
            ("recording.m4a", "audio/mp4;codecs=mp4a.40.2"),
            ("recording.m4a", "video/mp4"),
            ("speech.wav", "audio/vnd.wave"),
            ("recording.ogg", "application/ogg"),
        ]:
            with self.subTest(name=name, mime=mime):
                upload = UploadFile(io.BytesIO(), filename=name, headers=Headers({"content-type": mime}))
                self.assertEqual(safe_extension(upload), name.rsplit(".", 1)[-1])
        for name, mime in [("input.exe", "audio/mpeg"), ("input.mp3", "text/html")]:
            with self.subTest(name=name, mime=mime), self.assertRaises(RvcServiceError):
                safe_extension(UploadFile(io.BytesIO(), filename=name, headers=Headers({"content-type": mime})))

    def test_supported_containers_decode_to_model_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for extension, codec in [("wav", "pcm_s16le"), ("mp3", "libmp3lame"),
                                     ("m4a", "aac"), ("ogg", "libopus"),
                                     ("webm", "libopus"), ("flac", "flac"), ("aac", "aac")]:
                with self.subTest(extension=extension):
                    source = root / ("input." + extension)
                    output = root / (extension + "-normalized.wav")
                    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                                    "sine=frequency=260:duration=2", "-c:a", codec, str(source)],
                                   capture_output=True, check=True)
                    normalize_audio(source, output)
                    self.assertAlmostEqual(probe_duration(output), 2, delta=.15)

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
