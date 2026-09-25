import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../assets/rvc.js", import.meta.url), "utf8");
test("complete browser client parses without duplicate declarations", () => {
  assert.doesNotThrow(() => new Function(source));
});

test("cloud output retains the server format and raw bytes", () => {
  assert.match(source, /const nextResultUrl = URL\.createObjectURL\(rawOutputBlob\)/);
  assert.match(source, /state\.resultUrl = nextResultUrl/);
  assert.match(source, /if \(previousResultUrl\) URL\.revokeObjectURL\(previousResultUrl\)/);
  assert.match(source, /Date\.now\(\)\}\.\$\{outputFormat\}/);
  assert.doesNotMatch(source, /await polishCloudVoiceAudio\(rawOutputBlob\)/);
});

test("protected media playback falls back to the downloaded blob", () => {
  assert.match(source, /await attachResultAudio\(resultAudio, mediaUrl \|\| nextResultUrl, Boolean\(mediaUrl\)\)/);
  assert.match(source, /await attachResultAudio\(resultAudio, nextResultUrl, false\)/);
});
