// Count MPEG Layer III frames instead of trusting a potentially stale Xing
// duration tag. Read bounded slices so a phone need not decode the entire song.
const BLOCK_BYTES = 256 * 1024;
const MAX_PREFIX_SCAN = 64 * 1024;
const MPEG1_BITRATES = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
const MPEG2_BITRATES = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];

function readFrameHeader(bytes, offset) {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[offset + 1] >> 3) & 3;
  const layer = (bytes[offset + 1] >> 1) & 3;
  const bitrateIndex = (bytes[offset + 2] >> 4) & 15;
  const rateIndex = (bytes[offset + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3) return null;
  const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const bitrate = (version === 3 ? MPEG1_BITRATES : MPEG2_BITRATES)[bitrateIndex];
  const length = Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((bytes[offset + 2] >> 1) & 1);
  return length >= 24 ? { version, rate, length, samples: version === 3 ? 1152 : 576 } : null;
}

export async function inspectMp3Duration(file) {
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 12) return null;
  const first = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  let cursor = 0;
  if (first[0] === 0x49 && first[1] === 0x44 && first[2] === 0x33) {
    if (first.length < 10 || first.slice(6, 10).some(byte => byte & 0x80)) return null;
    const size = (first[6] << 21) | (first[7] << 14) | (first[8] << 7) | first[9];
    cursor = 10 + size + (first[3] === 4 && (first[5] & 0x10) ? 10 : 0);
    if (cursor >= file.size) return null;
  }
  const start = cursor;
  let frames = 0, seconds = 0, firstFrame = null;
  while (cursor + 4 <= file.size) {
    const block = new Uint8Array(await file.slice(cursor, Math.min(file.size, cursor + BLOCK_BYTES)).arrayBuffer());
    if (block.length < 4) break;
    let offset = 0;
    while (offset + 4 <= block.length) {
      const header = readFrameHeader(block, offset);
      if (!header) {
        if (!frames && cursor + offset - start < MAX_PREFIX_SCAN) { offset += 1; continue; }
        const remaining = file.size - (cursor + offset);
        const tag = block[offset] === 0x54 && block[offset + 1] === 0x41 && block[offset + 2] === 0x47;
        const ape = remaining >= 8 && String.fromCharCode(...block.slice(offset, offset + 8)) === 'APETAGEX';
        if (frames >= 3 && ((tag && remaining === 128) || (ape && remaining <= 65536))) {
          return { duration: seconds, frames, sampleRate: firstFrame.rate };
        }
        return null;
      }
      if (firstFrame && (header.version !== firstFrame.version || header.rate !== firstFrame.rate)) return null;
      if (cursor + offset + header.length > file.size) return null;
      // Reload the partial final frame at the start of the next bounded slice.
      if (offset + header.length > block.length && cursor + block.length < file.size) break;
      firstFrame ||= header;
      frames += 1;
      seconds += header.samples / header.rate;
      offset += header.length;
    }
    if (!offset) return null;
    cursor += offset;
  }
  // A complete file must end on a frame boundary; incomplete bytes do not
  // count as proof that metadata was wrong.
  return frames >= 3 && cursor === file.size ? { duration: seconds, frames, sampleRate: firstFrame.rate } : null;
}
