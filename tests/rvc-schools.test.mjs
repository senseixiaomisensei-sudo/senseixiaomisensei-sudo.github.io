import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../assets/rvc-schools.js", import.meta.url), "utf8"), context);
const directory = context.window.PostPrepSchools;
test("school directory does not invent installed voices", () => {
  assert.equal(directory.schools.length, 8);
  assert.equal(directory.schoolFor({ id: "ayane" }), "abydos");
  assert.equal(directory.schoolFor({ id: "hikari" }), "highlander");
  assert.equal(directory.schoolFor({ id: "eri" }), "wildhunt");
  assert.equal(directory.schoolFor({ id: "gojo" }), "");
  const ids = directory.schools.flatMap(school => school.students.map(student => student[0]));
  assert.equal(new Set(ids).size, ids.length);
});

test("every installed Blue Archive voice belongs to a visible directory", () => {
  const catalog = JSON.parse(fs.readFileSync(new URL("../assets/rvc-models.json", import.meta.url), "utf8"));
  directory.syncCatalog(catalog.models);
  for (const model of catalog.models.filter(model => model.collectionId === "blue-archive")) {
    const school = directory.schools.find(school => school.id === directory.schoolFor(model));
    assert.ok(school, model.id);
    assert.ok(school.students.some(student => student[0] === model.id), model.id);
  }
  assert.equal(directory.schoolFor({ tags: ["圣三一"] }), "trinity");
});

test("Odyssey retains its roster after syncing without claiming installed voices", () => {
  directory.syncCatalog([]);
  const school = directory.schools.find(item => item.id === "odyssey");
  assert.equal(school.students.length, 2);
  assert.equal(directory.schoolFor({ id: "toumi-kokoro" }), "odyssey");
  assert.equal(directory.schoolFor({ tags: ["奥德修斯"] }), "odyssey");
  const catalog = JSON.parse(fs.readFileSync(new URL("../assets/rvc-models.json", import.meta.url), "utf8"));
  assert.equal(catalog.models.filter(m => directory.schoolFor(m) === "odyssey").length, 0);
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
