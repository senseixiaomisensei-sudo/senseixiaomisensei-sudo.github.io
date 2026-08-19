import fs from 'node:fs';
import path from 'node:path';

// Let's load the worker functions by evaluating the relevant section
const workerCode = fs.readFileSync('E:/大肥鱼/site/assets/rvc-engine/inference.worker.js', 'utf-8');

// Extract RMVPE_PARAMS, computeMelSpectrogram, createMelFilterbank, hzToMel, melToHz, applyHannWindow, computeMagnitudesFFT
const fnNames = [
  'const RMVPE_PARAMS',
  'function hzToMel',
  'function melToHz',
  'function createMelFilterbank',
  'function applyHannWindow',
  'function computeMagnitudesFFT',
  'function computeMelSpectrogram',
  'function decodeSalienceToF0',
  'function medianFilterF0',
  'function stabilizeShoutingPitchF0'
];

let extracted = 'const ErrorCodes = {};\n';
for (const fn of fnNames) {
  const idx = workerCode.indexOf(fn);
  if (idx !== -1) {
    let endIdx = workerCode.indexOf('\nfunction ', idx + 10);
    if (endIdx === -1) endIdx = workerCode.indexOf('\nconst ', idx + 10);
    if (endIdx === -1) endIdx = idx + 2000;
    extracted += workerCode.slice(idx, endIdx) + '\n';
  }
}

fs.writeFileSync('E:/大肥鱼/rvc-local/convert/extracted_dsp.js', extracted);
console.log("Extracted DSP functions to extracted_dsp.js");
