import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
test("all public pages load the reversible shared glass style without emoji", async () => {
  const pages = (await readdir(root)).filter(name => name.endsWith(".html"));
  for (const name of pages) {
    const source = await readFile(new URL(name, root), "utf8");
    assert.equal((source.match(/assets\/liquid-ui\.js/g) || []).length, 1, name);
    assert.equal((source.match(/assets\/liquid-ui\.css/g) || []).length, 1, name);
    assert.doesNotMatch(source, /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u, name);
  }
  for (const name of ["assets/rvc.js", "assets/postprep.js", "assets/rvc-schools.js", "assets/liquid-ui.js"]) {
    assert.doesNotMatch(await readFile(new URL(name, root), "utf8"), /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u, name);
  }
});
test("glass preview remains local, bounded and motion-accessible", async () => {
  const source = await readFile(new URL("assets/liquid-ui.js", root), "utf8");
  const css = await readFile(new URL("assets/liquid-ui.css", root), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|createMediaElementSource/u);
  assert.match(source, /file\.size > 20 \* 1024 \* 1024/u);
  assert.match(source, /URL\.revokeObjectURL/u);
  assert.match(source, /localStorage\.setItem\(key, root\.dataset\.ui\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /@supports not \(backdrop-filter/u);
});
