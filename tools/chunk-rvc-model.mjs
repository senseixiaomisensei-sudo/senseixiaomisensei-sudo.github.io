import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [sourceArg, modelId, manifestName = `${modelId}.onnx`] = process.argv.slice(2);
if (!sourceArg || !modelId) {
  throw new Error("Usage: node tools/chunk-rvc-model.mjs <model.onnx> <model-id> [manifest-name]");
}

const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(sourceArg);
const destination = path.join(root, "models", "characters", modelId);
const chunkSize = 20 * 1024 * 1024;
const bytes = await readFile(source);
const chunkPaths = [];
await mkdir(destination, { recursive: true });

for (let offset = 0, index = 0; offset < bytes.length; offset += chunkSize, index += 1) {
  const name = `chunk_${index}.bin`;
  const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
  await writeFile(path.join(destination, name), chunk);
  chunkPaths.push(`models/characters/${modelId}/${name}`);
}

const manifestPath = path.join(root, "models", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest[manifestName] = {
  totalSize: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  chunks: chunkPaths,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`${modelId}: ${bytes.length} bytes, ${chunkPaths.length} chunks`);
