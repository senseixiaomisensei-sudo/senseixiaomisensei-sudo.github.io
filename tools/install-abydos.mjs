import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.resolve(root, "../rvc-local");
const extra = process.argv.includes("--maki-hanako");
const stage = path.join(runtime, extra ? "work/maki-hanako-expansion" : "work/abydos-expansion");
const ids = extra ? (process.argv.includes("--maki-only") ? ["maki"] : ["maki", "hanako"]) : ["nonomi", "serika", "ayane"];
const report = JSON.parse(fs.readFileSync(path.join(stage, "verification/report.json"), "utf8"));
for (const id of ids) {
  if (!report.voices.some(voice => voice.id === id && voice.passedSignalChecks)) {
    throw new Error("Voice has not passed signal checks: " + id);
  }
}
const catalogPath = path.join(root, "assets/rvc-models.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
for (const id of ids) {
  const folder = path.join(stage, id);
  const verified = JSON.parse(fs.readFileSync(path.join(folder, "verified.json"), "utf8"));
  const result = spawnSync(process.execPath, [path.join(root, "tools/chunk-rvc-model.mjs"), path.join(folder, id + ".onnx"), id], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Chunking failed: " + id);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "models/manifest.json"), "utf8"));
  const model = {
    ...verified,
    avatarText: { nonomi: "野乃美", serika: "芹香", ayane: "绫音", maki: "真纪", hanako: "花子" }[id],
    description: (extra ? (id === "maki" ? "千年科学学园 · 仅服务端转换" : "圣三一综合学园") : "阿拜多斯对策委员会") + " · 日语社区 RVC 声线",
    tags: ["女声", "蔚蓝档案", extra ? (id === "maki" ? "千年" : "圣三一") : "阿拜多斯"],
    collectionId: "blue-archive", collectionName: "蔚蓝档案",
    defaultPitch: 0, pitchNote: "同音域输入建议 0；跨音域请先试听小幅调整",
    noiseScale: 0.3, defaultIndexRate: 0.3,
    license: "Community model; character/performer authorization unverified",
    retrieval: "models/characters/" + id + "/retrieval.bin",
    chunks: manifest[id + ".onnx"].chunks,
  };
  fs.copyFileSync(path.join(folder, "retrieval.bin"), path.join(root, model.retrieval));
  const existing = catalog.models.findIndex(item => item.id === id);
  if (existing < 0) catalog.models.push(model);
  else catalog.models[existing] = model;
  const mounted = path.join(runtime, "models", id);
  fs.mkdirSync(mounted, { recursive: true });
  for (const file of ["model.pth", "model.index"]) {
    const dest = path.join(mounted, file);
    if (fs.existsSync(dest)) {
      if (!fs.readFileSync(dest).equals(fs.readFileSync(path.join(folder, file)))) throw new Error("Refusing to overwrite existing voice: " + dest);
    } else fs.copyFileSync(path.join(folder, file), dest);
  }
  fs.writeFileSync(path.join(mounted, "meta.json"), JSON.stringify(model, null, 2) + "\n");
}
catalog.version = extra ? 16 : 15;
catalog.updatedAt = "2026-09-05";
catalog._readme = "新增模型通过安全权重加载、结构、索引和真实音频信号检查。信号检查不代表主观音色质量或角色授权。真纪 V1 仅支持服务端转换。";
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
const clientPath = path.join(root, "assets/rvc.js");
const client = fs.readFileSync(clientPath, "utf8");
const marker = "  const EMBEDDED_RVC_CATALOG = ";
const start = client.indexOf(marker);
const end = client.indexOf("\n  function readCloudSubmissionTimestamp", start);
if (start < 0 || end < 0) throw new Error("Embedded catalog markers not found");
fs.writeFileSync(clientPath, client.slice(0, start) + marker + JSON.stringify(catalog.models, null, 2) + ";\n" + client.slice(end));
console.log("Installed and synchronized:", ids.join(", "));
