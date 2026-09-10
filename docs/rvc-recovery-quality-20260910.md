# RVC recovery and voice-input quality — 2026-09-10

## Confirmed findings

- The GPU service was healthy while the tunnel and watchdog were absent.
  The scheduled watchdog was disabled; the logon launcher used Windows
  PowerShell although its tunnel probe requires PowerShell 7.
- The reported screenshot used song mode. The existing automatic fallback
  intentionally supports dry vocals only; browser inference cannot separate
  accompaniment. Momoi has a local model; Maki's published catalog explicitly
  restricts that voice to cloud conversion.
- Cloud speech preprocessing applied half-cycle speech expansion after FFT
  denoising. This can lift weak noise/breath components. FFT gain smoothing
  was disabled, increasing the risk of granular denoising artifacts.

## Changes

- Restored the tunnel/Worker configuration, enabled the watchdog task, and
  changed the logon action to PowerShell 7. The machine-local
  `E:\大肥鱼\rvc-local\start-all.ps1` now serializes startup with a mutex,
  validates watchdog PID ownership, and launches the registered watchdog task
  when available. These host changes are not repository-managed.
- Connection timeouts have an explicit fallback code; English network errors
  are recognized. Song outages retain the upload and expose an explicit local
  continuation button that warns it does not separate accompaniment. No
  silent mode change or claim of local song separation is made. Cloud-only
  models explain why they cannot fall back.
- Removed speech half-cycle expansion and enabled modest FFT gain smoothing
  (`gs=8`), retaining the existing 6 dB noise reduction, wind high-pass and
  peak guard. Separated singing stems are not denoised twice.

## Validation

- 35 focused JavaScript tests passed, including real cloud-request control
  flow with a 303.6 s fixture duration, bounded retries, retained input,
  automatic dry-voice fallback and explicit song continuation.
- Two real FFmpeg tests passed for quiet room noise, wind, voiced tone,
  synthetic breath/cough transients and silence. Synthetic transients test
  signal preservation, not subjective human vocal authenticity.
- The original Maki regression recording completed after service restart:
  9.0 s, peak 0.5661, no non-finite samples. A public-browser song-mode run
  also completed separation, conversion, remix and download in 39.7 s.
- Audio evidence is retained under `E:\bug\0910修复验收`.

Quick tunnels remain dependent on the host, network and provider. The repairs
improve recovery; they do not establish uninterrupted cloud availability or
guarantee removal of all subjective grain from every checkpoint.
