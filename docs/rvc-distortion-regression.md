# RVC distortion regression — 2026-09-06

The cloud adapter ignored the operator model's `meta.json` `noiseScale`.
Browser exports consumed the configured 0.30–0.35, while the pinned upstream
cloud synthesizer always sampled its latent prior at 0.66666. This made the
cloud noise setting ineffective for every voice.

The adapter now reads and validates that setting, using 0.35 when absent or
invalid. A hook on each loaded model's prior adjusts its log standard
deviation by `log(configured / 0.66666)`. In the upstream sampling equation
this changes only the random residual. It leaves the mean, voiced mask,
continuous pitch, checkpoint tensors and NSF excitation unchanged. Both
v1/v2 and F0/non-F0 upstream inference methods use the same equation. The
hook is installed before inference or CUDA graph capture.

The supplied original is a screen recording containing AAC in an MP4
container despite its `.mp3` extension. Its decoded audio lasts 9.009 s.
The supplied old MP3 lasts 7.720 s. Neither exhibits full-scale clipping.
The old file has substantial pitch doubling/jumps; its original request
settings and pre-conversion upload are not retained, so the exact cause of
that historical output cannot be inferred from these two files alone.

Before this change, fresh conversions at the user's stated defaults already
preserved the recording's approximately 134 Hz median pitch and 9 s duration.
This was verified through both the authenticated service and the deployed
browser UI. The user confirmed that this fresh sample greatly reduced the
reported distortion, with some remaining raspiness. That confirmation
predates the noise-configuration fix and is not evidence of its effect.

Validation covers metadata fallback, float16/float32 sampling equivalence,
preservation of masks/means/weights, isolation between model instances,
pitch safety, the existing audio-quality tests, and real conversions of the
same recording through every public voice. Signal checks establish finite,
non-silent, unclipped output with preserved duration; they do not establish
that every character sounds subjectively free of raspiness.

The patched loopback service completed all 30 public voices with this 9 s
fixture: every output passed the checks above, with a maximum peak of
0.878245 and no non-finite samples. The 25 audio-quality/voice-clarity tests,
7 pitch-safety tests and 2 synthesis-noise tests passed. Production process
activation remains pending: the automatic service restart was rejected by
the execution policy, so these results must not be described as a deployed
post-fix public-UI test.

Operator reproduction tools:

- `tools/diagnose-rvc-distortion.py`: compare decoding, preprocessing and F0
  methods on a supplied recording, retaining audio and pitch tracks locally.
- `tools/verify-rvc-regression-clip.py`: exercise selected installed voices
  with a WAV fixture through an authenticated loopback service and save audio
  plus signal measurements. The token is read from an operator-provided file
  and never printed or stored with the results.
- `tests/test-rvc-inference.mjs`: supports `POSTPREP_RVC_TEST_URL` to exercise
  the deployed UI at its actual origin, including its public conversion and
  download routes.
