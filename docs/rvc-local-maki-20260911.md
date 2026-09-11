# RVC local Maki, automatic fallback and 15-minute covers

- The public gateway returned HTTP 530 while the host watchdog/tunnel were absent.
  Restarting the existing scheduled watchdog restored the tunnel and Worker routing.
  The service was restarted after changing the limit; authenticated health confirms
  `ready=true`, `maxAudioSeconds=900`, `training=false`.
- The local continuation button is always visible. Transient cloud failures retry
  once, then automatically switch to local mode, including song inputs. A warning
  explains that local processing converts the mix and cannot separate accompaniment.
- Maki is RVC V1: local inference now selects a dedicated 256-dimensional HuBERT
  model (layer 9 plus final projection), not the V2 768-dimensional model.
  Export verification against the pinned official PyTorch model passed at three
  input lengths; maximum absolute error was 0.0000372. Fourteen public chunks have
  verified sizes and a SHA-256 manifest. Existing character weights are unchanged.
- Browser testing exposed NotReadableError when large model Blobs spilled to
  temporary storage. Fresh downloads now supply their memory buffers directly;
  unreadable cached models are evicted and fetched again.
- Focused JavaScript checks: 28 passed, including long fixed-window processing,
  model integrity, cache recovery, fallback control flow and duration contracts.
  Python boundary test accepts 900 seconds and rejects 900.01 before decoding.
- Real 9-second Maki browser conversion and injected song-outage automatic local
  conversion both passed. Audio evidence: `E:\bug\0911修复验收`.

Local fallback does not provide local accompaniment separation. The 15-minute
boundary test does not claim a complete 15-minute song was rendered on a phone.
Cloud availability still depends on the host staying awake and connected.
