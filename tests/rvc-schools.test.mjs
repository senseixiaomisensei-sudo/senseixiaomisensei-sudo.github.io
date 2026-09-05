import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../assets/rvc-schools.js", import.meta.url), "utf8"), context);
const directory = context.window.PostPrepSchools;
test("school directory does not invent installed voices", () => {
  assert.equal(directory.schools.length, 3);
  assert.equal(directory.schoolFor({ id: "ayane" }), "abydos");
  assert.equal(directory.schoolFor({ id: "hikari" }), "highlander");
  assert.equal(directory.schoolFor({ id: "eri" }), "wildhunt");
  assert.equal(directory.schoolFor({ id: "gojo" }), "");
  const ids = directory.schools.flatMap(school => school.students.map(student => student[0]));
  assert.equal(new Set(ids).size, ids.length);
});
test("all five Abydos voices have real browser assets", () => {
  const catalog = JSON.parse(fs.readFileSync(new URL("../assets/rvc-models.json", import.meta.url), "utf8"));
  for (const student of directory.schools[0].students) {
    const model = catalog.models.find(item => item.id === student[0]);
    assert.ok(model, student[0]);
    for (const asset of [...model.chunks, model.retrieval]) {
      assert.ok(fs.statSync(new URL("../" + asset, import.meta.url)).size > 0, asset);
    }
  }
});
