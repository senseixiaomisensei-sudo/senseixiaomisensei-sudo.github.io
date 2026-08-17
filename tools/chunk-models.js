import fs from "node:fs";
import path from "node:path";

const CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB per chunk

const MODELS = [
  {
    name: "hubert.onnx",
    src: "E:\\大肥鱼\\site\\models\\base\\hubert.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\base\\hubert",
  },
  {
    name: "rmvpe.onnx",
    src: "E:\\大肥鱼\\rvc-local\\onnx-base\\rmvpe.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\base\\rmvpe",
  },
  {
    name: "tomori.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\tomori.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\tomori",
  },
  {
    name: "rana.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\rana.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\rana",
  },
  {
    name: "teio.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\teio.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\teio",
  },
  {
    name: "arisu.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\arisu.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\arisu",
  },
  {
    name: "shiroko.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\shiroko.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\shiroko",
  },
  {
    name: "yuuka.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\yuuka.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\yuuka",
  },
  {
    name: "hina.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\hina.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\hina",
  },
  {
    name: "noa.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\noa.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\noa",
  },
  {
    name: "koharu.onnx",
    src: "E:\\大肥鱼\\rvc-local\\convert\\onnx-models\\koharu.onnx",
    dstDir: "E:\\大肥鱼\\site\\models\\characters\\koharu",
  },
];

const manifest = {};

for (const m of MODELS) {
  if (!fs.existsSync(m.src)) {
    console.warn(`Source not found: ${m.src}`);
    continue;
  }
  fs.mkdirSync(m.dstDir, { recursive: true });
  const buf = fs.readFileSync(m.src);
  const totalChunks = Math.ceil(buf.length / CHUNK_SIZE);
  const chunkList = [];

  console.log(`Processing ${m.name}: ${buf.length} bytes -> ${totalChunks} chunks...`);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buf.length);
    const chunkBuf = buf.subarray(start, end);
    const chunkFilename = `chunk_${i}.bin`;
    const chunkPath = path.join(m.dstDir, chunkFilename);
    fs.writeFileSync(chunkPath, chunkBuf);

    const relDir = path.relative("E:\\大肥鱼\\site", m.dstDir).replace(/\\/g, "/");
    chunkList.push(`${relDir}/${chunkFilename}`);
  }

  manifest[m.name] = {
    totalSize: buf.length,
    chunks: chunkList,
  };
}

fs.writeFileSync("E:\\大肥鱼\\site\\models\\manifest.json", JSON.stringify(manifest, null, 2));
console.log("Chunking completed! Manifest written to E:\\大肥鱼\\site\\models\\manifest.json");
