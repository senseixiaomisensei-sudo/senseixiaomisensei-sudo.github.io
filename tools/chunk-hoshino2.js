import fs from "node:fs";
import path from "node:path";

const CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB per chunk (same as existing)

const src = "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\hoshino_ov2.onnx";
const dstDir = "E:\\大肥鱼\\site\\models\\characters\\hoshino2";

fs.mkdirSync(dstDir, { recursive: true });
const buf = fs.readFileSync(src);
const totalChunks = Math.ceil(buf.length / CHUNK_SIZE);

console.log(`Processing hoshino2.onnx: ${buf.length} bytes -> ${totalChunks} chunks...`);

const chunkList = [];
for (let i = 0; i < totalChunks; i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, buf.length);
  const chunkBuf = buf.subarray(start, end);
  const chunkFilename = `chunk_${i}.bin`;
  const chunkPath = path.join(dstDir, chunkFilename);
  fs.writeFileSync(chunkPath, chunkBuf);
  chunkList.push(`models/characters/hoshino2/${chunkFilename}`);
  console.log(`  wrote ${chunkPath} (${chunkBuf.length} bytes)`);
}

// verify round-trip
let ok = true;
for (let i = 0; i < totalChunks; i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, buf.length);
  const readBack = fs.readFileSync(path.join(dstDir, `chunk_${i}.bin`));
  if (!readBack.equals(buf.subarray(start, end))) {
    ok = false;
    console.error(`  MISMATCH in chunk_${i}`);
  }
}
console.log(ok ? "Round-trip verification OK" : "VERIFICATION FAILED");
console.log(JSON.stringify({ totalSize: buf.length, chunks: chunkList }, null, 2));
