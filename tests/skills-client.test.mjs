import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL("../assets/postprep.js", import.meta.url);
const pagePath = new URL("../skills.html", import.meta.url);
const skillPaths = [
  new URL("../skills/postprep-content-studio/SKILL.md", import.meta.url),
  new URL("../skills/postprep-frontend-quality/SKILL.md", import.meta.url),
  new URL("../skills/postprep-skill-curator/SKILL.md", import.meta.url),
];

test("Skills hub keeps local files local and sends GitHub discovery through the protected cloud request", async () => {
  const [client, page] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(page, /data-page="skills"/);
  assert.match(page, /id="skills-local-file"/);
  assert.match(page, /id="skills-search-form"/);
  assert.match(client, /function initSkillsHub\(\)/);
  assert.match(client, /new FileReader\(\)/);
  assert.match(client, /requestCloudText\("skillSearch"/);
  assert.match(client, /localPreviewContent\.textContent/);
  assert.doesNotMatch(client, /api\.github\.com/);
  assert.match(client, /\{ id: "skills", href: "skills\.html"/);
});

test("downloadable PostPrep Skills are complete original MIT Skill files", async () => {
  const files = await Promise.all(skillPaths.map((path) => readFile(path, "utf8")));
  for (const source of files) {
    assert.match(source, /^---\r?\nname: postprep-/);
    assert.match(source, /\r?\ndescription: .+/);
    assert.match(source, /License: MIT/);
    assert.doesNotMatch(source, /\[TODO|TODO:/);
  }
});
