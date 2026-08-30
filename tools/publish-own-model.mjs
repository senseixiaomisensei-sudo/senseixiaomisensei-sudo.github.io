#!/usr/bin/env node
// 一键把你自己训练/转换的 RVC 模型发布成站点分片模型的本地脚本。
//
// 用法（在 site 目录下运行）：
//   node tools/publish-own-model.mjs --model "E:\path\to\your-model.pth" --name mychar --title "我的角色" --tags 我的,角色
//   node tools/publish-own-model.mjs --model "E:\path\to\your-model.onnx" --name mychar --title "我的角色"
//
// 说明：
//   * .pth 会借助 rvc-local/convert 下已安装的 rvc-onnx-web 依赖先转成 onnx。
//   * 输出到 site/models/characters/<name>/chunk_*.bin，并更新 site/models/manifest.json。
//   * 命令末尾会打印一段需粘贴进 site/assets/rvc-models.json 的模型配置片段（默认音高可自行微调）。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const CHAR_DST = path.join(SITE_ROOT, "models", "characters");
const MANIFEST_PATH = path.join(SITE_ROOT, "models", "manifest.json");
const RVC_LOCAL = path.join(SITE_ROOT, "..", "rvc-local", "convert");
const CHUNK_SIZE = 20 * 1024 * 1024;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

async function toOnnx(modelPath, name) {
  const ext = path.extname(modelPath).toLowerCase();
  if (ext === ".onnx") return { onnxPath: modelPath };
  if (ext !== ".pth") throw new Error("仅支持 .pth / .onnx 输入");

  const req = createRequire(path.join(RVC_LOCAL, "package.json"));
  const mod = await import(pathToFileURL(req.resolve("rvc-onnx-web")).href);
  const fsP = await import("node:fs/promises");

  console.log(`[1/4] 正在把 .pth 转换为 onnx（依赖 rvc-local/convert 的 rvc-onnx-web）...`);
  const buf = await fsP.readFile(modelPath);
  const { onnxBuffer, sampleRate } = await mod.pthToOnnx(buf, { opsetVersion: 17 });
  const tmpDir = path.join(SITE_ROOT, "node_modules", ".cache");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${name}.onnx`);
  await fsP.writeFile(tmpPath, Buffer.from(onnxBuffer));
  console.log(`    转换完成: ${(onnxBuffer.byteLength / 1024 / 1024).toFixed(1)} MB, sampleRate=${sampleRate}`);
  return { onnxPath: tmpPath };
}

async function chunkAndManifest(onnxPath, name) {
  console.log(`[2/4] 正在分片 ${name}...`);
  const dstDir = path.join(CHAR_DST, name);
  fs.mkdirSync(dstDir, { recursive: true });
  const buf = fs.readFileSync(onnxPath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const totalChunks = Math.ceil(buf.length / CHUNK_SIZE);
  const chunkList = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buf.length);
    fs.writeFileSync(path.join(dstDir, `chunk_${i}.bin`), buf.subarray(start, end));
    chunkList.push(`models/characters/${name}/chunk_${i}.bin`);
  }

  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); } catch {}
  manifest[`${name}.onnx`] = { totalSize: buf.length, sha256, chunks: chunkList };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`    已写 ${totalChunks} 个分片，并更新 manifest.json`);
  return { totalChunks, chunkList };
}

function printCatalogSnippet(name, title, tags, totalChunks) {
  const tagArr = tags.split(",").map((s) => s.trim()).filter(Boolean);
  const chunks = Array.from({ length: totalChunks }, (_, i) => `models/characters/${name}/chunk_${i}.bin`);
  const indent = "      ";
  const snippet = `{
${indent}"id": "${name}",
${indent}"name": "${title}",
${indent}"avatarText": "${title.slice(0, 4)}",
${indent}"description": "${title}（本机新增角色）",
${indent}"tags": ${JSON.stringify(tagArr.length ? tagArr : ["女声"])},
${indent}"defaultPitch": 12,
${indent}"chunks": [
${chunks.map((c) => `${indent}  "${c}",`).join("\n").replace(/,\s*$/, "")}
${indent}]
${indent}}`;
  console.log("\n[3/4] 请把下面这段 JSON 粘贴（替换或追加）到 site/assets/rvc-models.json 的 models 数组：\n");
  console.log(snippet, "\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelPath = path.resolve(args.model || "");
  const name = (args.name || "").replace(/[^a-zA-Z0-9_-]/g, "") || "mymodel";
  const title = (args.title || name).trim();
  const tags = (args.tags || "女声").trim();

  if (!modelPath || !fs.existsSync(modelPath)) throw new Error(`模型文件不存在: ${modelPath}`);

  const { onnxPath } = await toOnnx(modelPath, name);
  const { totalChunks } = await chunkAndManifest(onnxPath, name);
  printCatalogSnippet(name, title, tags, totalChunks);
  console.log("[4/4] 完成。现在可让访客加载该角色；若不希望公开展示，请删除 models/characters/<name>/ 目录并撤掉该 JSON 片段。");
}

main().catch((e) => {
  console.error("发布失败：", e.message);
  process.exit(1);
});
