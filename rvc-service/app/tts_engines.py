"""Selectable TTS engines with real readiness and validated official bundles."""
from __future__ import annotations
import json, os, subprocess, tempfile, threading
from pathlib import Path
from app import tts_runtime as legacy
from app.tts_models import CATALOG, MODELS, acquire, verify_install, write_manifest

ROOT = legacy.ROOT
PYTHON = Path(os.getenv('RVC_TTS_PYTHON', r'D:\rvc-cache\postprep-tts-runtime\Scripts\python.exe'))
INDEX_PYTHON = Path(os.getenv('RVC_TTS_INDEX_PYTHON', r'D:\rvc-cache\postprep-indextts-runtime\Scripts\python.exe'))
INDEX_SOURCE = Path(os.getenv('RVC_TTS_INDEX_SOURCE', str(PYTHON.parent.parent / 'IndexTTS')))
INDEX_COMMIT = 'd9e41aac89fd00b3d71497fddb287b7f24613712'
DEFAULT = CATALOG['defaultModel']
_lock = threading.RLock(); _synthesis = threading.Lock()
_states = {key: {'state':'not-installed','ready':False,'downloadedBytes':0} for key in MODELS}
_validation_runner = lambda callback: callback()

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

def _run(model_id,path,text,language='zh',style='neutral',voice=''):
    python = INDEX_PYTHON if model_id == 'indextts-25' else PYTHON
    if not python.is_file(): raise ValueError('RVC_TTS_RUNTIME_UNAVAILABLE')
    if model_id == 'indextts-25':
        actual=subprocess.check_output(['git','-C',str(INDEX_SOURCE),'rev-parse','HEAD'],text=True,timeout=5).strip()
        if actual != INDEX_COMMIT: raise ValueError('RVC_TTS_RUNTIME_UNAVAILABLE')
    with tempfile.TemporaryDirectory(prefix='synthesis-',dir=ROOT) as temporary:
        work=Path(temporary); output=work/'speech.wav';proof=work/'proof.json'
        req={'modelId':model_id,'modelPath':str(path),'text':text,'language':language,'style':style,'voice':voice,'output':str(output),'proof':str(proof),'indexSource':str(INDEX_SOURCE)}
        (work/'request.json').write_text(json.dumps(req,ensure_ascii=False),encoding='utf-8')
        env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','PYTHONUTF8':'1','HF_HUB_DISABLE_TELEMETRY':'1'}
        log=ROOT/f'{model_id}-last-runtime.log'
        with log.open('w',encoding='utf-8') as stderr:
            process=subprocess.Popen([str(python),str(Path(__file__).with_name('tts_worker.py')),str(work/'request.json')],stdout=stderr,stderr=stderr,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            try: code=process.wait(timeout=900)
            except subprocess.TimeoutExpired:
                # The Windows venv launcher has a child Python process. Killing
                # only the launcher leaves the CUDA worker alive indefinitely.
                if os.name == 'nt':
                    subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,timeout=15)
                else: process.kill()
                process.wait(timeout=15);raise ValueError('RVC_TTS_SYNTH_TIMEOUT') from None
        if code or not output.is_file(): raise ValueError('RVC_TTS_SYNTH_FAILED')
        return output.read_bytes(),json.loads(proof.read_text(encoding='utf-8'))

def _probe(model_id,path):
    def run():
        with _synthesis: return _run(model_id,path,'你好，今天是平静的一天。')[1]
    return _validation_runner(run)

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
            if key == selected and state['state']=='not-installed' and (path/'installed.json').is_file():
                state.update(state='validating');threading.Thread(target=_verify,args=(key,path),daemon=True,name=f'tts-check-{key}').start()
            supported=INDEX_PYTHON.is_file() and (INDEX_SOURCE/'.git').exists() if key=='indextts-25' else PYTHON.is_file()
            snapshot={**state}
            if state['state']=='not-installed' and (path/'installed.json').is_file(): snapshot['state']='installed'
            models.append({**{k:v for k,v in model.items() if k not in {'files','url'}},**snapshot,'modelId':key,'installAvailable':supported})
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
