// Download existing ONNX bytes. This never converts/renames PyTorch weights.
export function canExportOnnx(model) {
  return Boolean(model && (String(model.id).startsWith('own:') ||
    (model.supportsDevice !== false && Array.isArray(model.chunks) && model.chunks.length && /^[a-f0-9]{64}$/i.test(model.sha256 || ''))));
}

export function onnxFilename(model) {
  const id = String(model.id).replace(/^own:/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'voice';
  const revision = /^[a-f0-9]{64}$/i.test(model.sha256 || '') ? `-${model.sha256.slice(0, 12)}` : '';
  return `${id}${revision}.onnx`;
}

export async function prepareOnnxExport({model, loadModel, readOwnModel, cacheKey, verifyBytes, onProgress}) {
  if (!canExportOnnx(model)) throw new Error('ONNX_EXPORT_UNAVAILABLE');
  const own = String(model.id).startsWith('own:');
  const file = own ? await readOwnModel(cacheKey(model)) : await loadModel(model, onProgress);
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('ONNX_LOCAL_MODEL_MISSING');
  const bytes = await file.arrayBuffer();
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength ||
      (!own && Number.isSafeInteger(model.totalSize) && bytes.byteLength !== model.totalSize)) {
    throw new Error('ONNX_EXPORT_SIZE_MISMATCH');
  }
  // Recheck the complete assembled graph, including cache hits, before saving.
  await verifyBytes(bytes, own ? undefined : model.sha256);
  return {blob: new Blob([bytes], {type:'application/octet-stream'}), filename:onnxFilename(model)};
}

export function initModelExport({state, getModel, name, loadModel, readOwnModel, cacheKey, verifyBytes,
  doc = globalThis.document, urls = globalThis.URL}) {
  const panel = doc.getElementById('rvc-onnx-export');
  if (!panel) return {refresh(){}};
  const button = panel.querySelector('[data-onnx-action]');
  const download = panel.querySelector('[data-onnx-download]');
  const status = panel.querySelector('[data-onnx-status]');
  let busy = false, objectUrl = '', record = null;
  const l = (zh, en) => state.lang === 'en' ? en : zh;
  const release = () => {
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = ''; download.hidden = true; download.removeAttribute('href');
  };
  function refresh() {
    panel.querySelector('[data-onnx-title]').textContent = l('导出角色 ONNX 模型','Export character ONNX');
    panel.querySelector('[data-onnx-hint]').textContent = l(
      '保存当前角色的设备端模型，不含语义模型、音高模型和检索索引。',
      'Save the selected on-device character model. Semantic/pitch models and retrieval indexes are separate.');
    button.textContent = busy ? l('正在准备…','Preparing…') : l('导出 .onnx','Export .onnx');
    button.disabled = busy || state.busy || !canExportOnnx(getModel());
    panel.setAttribute('aria-busy', String(busy));
    status.hidden = false;
    if (record?.stage === 'preparing') {
      const progress = record.total ? ` ${Math.min(100,Math.round(record.loaded/record.total*100))}%` : '';
      status.textContent = l(`正在准备「${name(record.model)}」${progress}，已缓存的资源会复用。`,
        `Preparing ${name(record.model)}${progress}. Reusing cached resources.`);
    } else if (record?.stage === 'ready') {
      const mb = (record.size/1024/1024).toFixed(1);
      status.textContent = l(`「${name(record.model)}」已就绪（${mb} MB），点击保存。`,
        `${name(record.model)} is ready (${mb} MB). Select Save to download.`);
      download.textContent = l(`保存 ${record.filename}`,`Save ${record.filename}`);
    } else if (record?.stage === 'error') {
      status.textContent = record.code === 'ONNX_LOCAL_MODEL_MISSING'
        ? l('本机模型缓存不可用，请重新导入 .onnx 文件。','Local model unavailable. Import the .onnx file again.')
        : l('导出未完成，网络或模型校验失败，请重试。','Export incomplete. Network or model verification failed; retry.');
    } else {
      status.textContent = canExportOnnx(getModel())
        ? l(`当前角色：${name(getModel())}`,`Selected: ${name(getModel())}`)
        : l('此声线尚无可用 ONNX；云端参考音色不能直接导出为 ONNX。',
          'No ONNX available for this voice. Cloud reference voices cannot be exported as ONNX.');
    }
  }
  button.addEventListener('click', async () => {
    const model = getModel();
    if (busy || state.busy || !canExportOnnx(model)) return;
    busy = true; release(); record = {stage:'preparing',model}; refresh();
    try {
      const output = await prepareOnnxExport({model,loadModel,readOwnModel,cacheKey,verifyBytes,
        onProgress(loaded,total) { record.loaded=loaded; record.total=total; refresh(); }});
      objectUrl = urls.createObjectURL(output.blob);
      download.href = objectUrl; download.download = output.filename; download.hidden = false;
      // An explicit Save link retains the user gesture on Safari after an async
      // download. Do not open a huge model in a popup or revoke its URL early.
      record = {stage:'ready',model,filename:output.filename,size:output.blob.size};
    } catch (error) {
      release(); record = {stage:'error',model,code:String(error?.message || '')};
    } finally {busy = false; refresh();}
  });
  doc.defaultView?.addEventListener('pagehide', event => {
    if (!event.persisted) release();
  });
  refresh();
  return {refresh};
}
