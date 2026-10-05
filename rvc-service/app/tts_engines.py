"""Selectable TTS engines with real readiness and validated official bundles."""
from __future__ import annotations
import importlib.util, io, json, os, subprocess, tempfile, threading
from pathlib import Path
import numpy as np
import soundfile as sf
from app import tts_runtime as legacy
from app.tts_models import CATALOG, MODELS, acquire, verify_install, write_manifest

ROOT = legacy.ROOT
PYTHON = Path(os.getenv('RVC_TTS_PYTHON', r'D:\rvc-cache\postprep-tts-runtime\Scripts\python.exe'))
COSY_SOURCE = Path(os.getenv('RVC_TTS_COSY_SOURCE', str(PYTHON.parent.parent / 'CosyVoice')))
COSY_COMMIT = '074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc'
DEFAULT = CATALOG['defaultModel']
_lock = threading.RLock(); _synthesis = threading.Lock()
_states = {key: {'state':'not-installed','ready':False,'downloadedBytes':0} for key in MODELS}
_engines = {}; _validation_runner = lambda callback: callback()

def set_validation_runner(runner):
    global _validation_runner
    _validation_runner = runner

def spec(model_id=None):
    model_id = model_id or DEFAULT
    if model_id == 'aishell-legacy': return {'id':model_id,'languages':['zh'],'styles':['neutral']}
    if model_id not in MODELS: raise ValueError('RVC_TTS_INVALID_MODEL')
    return MODELS[model_id]

def validate_options(model_id, language='zh', style='neutral', voice=''):
    model = spec(model_id)
    if not isinstance(language,str) or language not in model['languages']: raise ValueError('RVC_TTS_INVALID_LANGUAGE')
    if not isinstance(style,str) or style not in model['styles']: raise ValueError('RVC_TTS_STYLE_UNSUPPORTED')
    if not isinstance(voice,str) or len(voice)>64: raise ValueError('RVC_TTS_INVALID_VOICE')
    available = _states.get(model['id'],{}).get('voices',[])
    if voice and voice not in available: raise ValueError('RVC_TTS_INVALID_VOICE')
    return model

def _build_kokoro(path):
    import sherpa_onnx
    config = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=str(path/'model.onnx'),voices=str(path/'voices.bin'),tokens=str(path/'tokens.txt'),data_dir=str(path/'espeak-ng-data'),lexicon=','.join(str(path/n) for n in ['lexicon-us-en.txt','lexicon-zh.txt'])),
        num_threads=2,provider='cpu'),max_num_sentences=1)
    if not config.validate(): raise ValueError('RVC_TTS_MODEL_INVALID')
    return sherpa_onnx.OfflineTts(config)

def _run(model_id,path,text,language='zh',style='neutral',voice=''):
    if model_id == 'kokoro':
        engine = _engines.get(model_id) or _build_kokoro(path)
        sid = int(voice or ('0' if language=='en' else '3'))
        result = engine.generate(text,sid=sid,speed=1.)
        samples = np.asarray(result.samples,dtype=np.float32)
        if len(samples)<result.sample_rate//4 or not np.isfinite(samples).all(): raise ValueError('RVC_TTS_EMPTY_OUTPUT')
        peak=float(np.max(np.abs(samples)))
        if peak>.8: samples *= .8/peak
        output=io.BytesIO();sf.write(output,samples,result.sample_rate,format='WAV',subtype='FLOAT')
        _engines[model_id]=engine
        return output.getvalue(),{'sampleRate':result.sample_rate,'frames':len(samples),'voices':['0','2','3','58'],'language':language,'style':style,'voice':str(sid)}
    if not PYTHON.is_file(): raise ValueError('RVC_TTS_RUNTIME_UNAVAILABLE')
    if model_id == 'cosyvoice-instruct':
        actual=subprocess.check_output(['git','-C',str(COSY_SOURCE),'rev-parse','HEAD'],text=True,timeout=5).strip()
        if actual != COSY_COMMIT: raise ValueError('RVC_TTS_RUNTIME_UNAVAILABLE')
    with tempfile.TemporaryDirectory(prefix='synthesis-',dir=ROOT) as temporary:
        work=Path(temporary); output=work/'speech.wav';proof=work/'proof.json'
        req={'modelId':model_id,'modelPath':str(path),'text':text,'language':language,'style':style,'voice':voice,'output':str(output),'proof':str(proof),'cosySource':str(COSY_SOURCE)}
        (work/'request.json').write_text(json.dumps(req,ensure_ascii=False),encoding='utf-8')
        env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','PYTHONUTF8':'1','HF_HUB_DISABLE_TELEMETRY':'1'}
        log=ROOT/f'{model_id}-last-runtime.log'
        with log.open('w',encoding='utf-8') as stderr:
            process=subprocess.Popen([str(PYTHON),str(Path(__file__).with_name('tts_worker.py')),str(work/'request.json')],stdout=stderr,stderr=stderr,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            try: code=process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                process.kill();process.wait();raise ValueError('RVC_TTS_SYNTH_TIMEOUT') from None
        if code or not output.is_file(): raise ValueError('RVC_TTS_SYNTH_FAILED')
        return output.read_bytes(),json.loads(proof.read_text(encoding='utf-8'))

def _probe(model_id,path):
    def run():
        with _synthesis: return _run(model_id,path,'你好，今天是平静的一天。')[1]
    return run() if model_id=='kokoro' else _validation_runner(run)

def _verify(model_id,path):
    try:
        verify_install(model_id,path);proof=_probe(model_id,path)
        with _lock: _states[model_id].update(state='ready',ready=True,code=None,voices=proof['voices'])
    except Exception as error:
        with _lock: _states[model_id].update(state='failed',ready=False,code=str(error) if isinstance(error,ValueError) and str(error).startswith('RVC_TTS_') else 'RVC_TTS_MODEL_INVALID')

def status(model_id=None):
    selected=spec(model_id)['id']; models=[]
    with _lock:
        for key, model in MODELS.items():
            state=_states[key];path=ROOT/key
            if state['state']=='not-installed' and (path/'installed.json').is_file():
                state.update(state='validating');threading.Thread(target=_verify,args=(key,path),daemon=True,name=f'tts-check-{key}').start()
            supported=importlib.util.find_spec('sherpa_onnx') is not None if key=='kokoro' else PYTHON.is_file() and (key!='cosyvoice-instruct' or (COSY_SOURCE/'.git').exists())
            models.append({**{k:v for k,v in model.items() if k not in {'files','url'}},**state,'modelId':key,'installAvailable':supported})
    models.append({**legacy.status(),'id':'aishell-legacy','modelId':'aishell-legacy','label':'旧版 AIShell · 兼容备用','styles':['neutral'],'voices':[],'legacy':True})
    current=next(item for item in models if item['modelId']==selected)
    return {**current,'defaultModel':DEFAULT,'models':models,'maxModelBytes':CATALOG['maxModelBytes']}

def _install(model_id):
    try:
        ROOT.mkdir(parents=True,exist_ok=True);candidate=ROOT/f'candidate-{model_id}'
        def progress(n):
            with _lock: _states[model_id]['downloadedBytes']=n
        acquire(model_id,candidate,progress)
        with _lock: _states[model_id]['state']='validating'
        proof=_probe(model_id,candidate);write_manifest(model_id,candidate,proof)
        target=ROOT/model_id
        if target.exists(): target.rename(ROOT/f'{model_id}-previous-{os.urandom(4).hex()}')
        candidate.rename(target)
        if model_id=='kokoro': _engines.pop(model_id,None)
        with _lock: _states[model_id].update(state='ready',ready=True,code=None,voices=proof['voices'])
    except Exception as error:
        with _lock: _states[model_id].update(state='failed',ready=False,code=str(error) if isinstance(error,ValueError) and str(error).startswith('RVC_TTS_') else 'RVC_TTS_INSTALL_FAILED')

def install(model_id=None):
    model_id=spec(model_id)['id']
    if model_id=='aishell-legacy': return legacy.install()
    with _lock:
        current=status(model_id)
        if not current['installAvailable']: raise ValueError('RVC_TTS_RUNTIME_UNAVAILABLE')
        if current['ready'] or current['state'] in {'downloading','validating'}: return current
        _states[model_id].update(state='downloading',ready=False,downloadedBytes=0,code=None)
        threading.Thread(target=_install,args=(model_id,),name=f'tts-install-{model_id}',daemon=True).start()
        return status(model_id)

def synthesize(text,model_id=None,language='zh',style='neutral',voice=''):
    model=validate_options(model_id,language,style,voice);model_id=model['id']
    if model_id=='aishell-legacy': return legacy.synthesize(text)
    if not status(model_id)['ready']: raise ValueError('RVC_TTS_UNAVAILABLE')
    if not _synthesis.acquire(blocking=False): raise ValueError('RVC_TTS_BUSY')
    try: return _run(model_id,ROOT/model_id,text,language,style,voice)[0]
    finally: _synthesis.release()
