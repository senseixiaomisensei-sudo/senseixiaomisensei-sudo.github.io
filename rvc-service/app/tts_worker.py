"""Isolated official TTS inference. Exits after synthesis to release GPU memory."""
from __future__ import annotations
import json, os, sys
from pathlib import Path
import numpy as np
import soundfile as sf

LANGUAGES = {'zh':'Chinese','en':'English','ja':'Japanese','ko':'Korean','de':'German','fr':'French','ru':'Russian','pt':'Portuguese','es':'Spanish','it':'Italian','yue':'Cantonese'}
STYLES = {'neutral':'请用自然平静的语气说话。','gentle':'请用温柔、轻松、克制的语气说话。','happy':'请用开心愉快的语气说话。','sad':'请用低落伤感的语气说话。','serious':'请用严肃认真的语气说话。'}

def main(request_path):
    request = json.loads(Path(request_path).read_text(encoding='utf-8'))
    model_id = request['modelId']; root = Path(request['modelPath']); text = request['text']
    language = request.get('language','zh'); voice = request.get('voice',''); style = request.get('style','neutral')
    import torch
    torch.set_num_threads(2); torch.manual_seed(1986)
    if model_id in {'qwen3-06b','qwen3-17b'}:
        from qwen_tts import Qwen3TTSModel
        model = Qwen3TTSModel.from_pretrained(str(root), device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa', local_files_only=True)
        speakers = model.get_supported_speakers()
        voice = voice or ('ryan' if language == 'en' else 'serena')
        if voice not in speakers: raise ValueError('RVC_TTS_INVALID_VOICE')
        waves, rate = model.generate_custom_voice(text=text, language=LANGUAGES[language], speaker=voice, instruct=STYLES[style] if model_id == 'qwen3-17b' and style != 'neutral' else '', non_streaming_mode=True, max_new_tokens=4096)
        samples = waves[0]
    elif model_id == 'indextts-25':
        sys.path.insert(0,request['indexSource'])
        from indextts.infer_v2_5 import IndexTTS2
        model = IndexTTS2(cfg_path=str(root/'config.yaml'),model_dir=str(root),use_bf16=True,device='cuda:0',use_cuda_kernel=False,use_deepspeed=False,use_qwen_emo=False)
        references={'female-soft':'voices/female-soft.wav','male-reference':'voices/neutral.wav'}
        speakers = list(references)
        voice = voice or 'female-soft'
        if voice not in speakers: raise ValueError('RVC_TTS_INVALID_VOICE')
        # Native trained emotion vectors; no pitch/EQ/reverb imitation.
        vectors = {'neutral':None,'calm':[0,0,0,0,0,0,0,.5],
                   'happy':[.45,0,0,0,0,0,0,0],'sad':[0,0,.6,0,0,0,0,0],
                   'surprised':[0,0,0,0,0,0,.5,0]}
        rate, wave = model.infer(spk_audio_prompt=str(root/references[voice]),text=text,
                                lang=language.upper(),output_path=None,emo_vector=vectors[style],
                                use_emo_text=False,use_random=False,text_normalization=True)
        samples = wave.astype(np.float32).flatten()/32768.
    else: raise ValueError('RVC_TTS_INVALID_MODEL')
    samples = np.asarray(samples, dtype=np.float32)
    if len(samples) < rate // 4 or not np.isfinite(samples).all(): raise ValueError('RVC_TTS_EMPTY_OUTPUT')
    peak = float(np.max(np.abs(samples)))
    if peak > .8: samples *= .8 / peak
    sf.write(request['output'], samples, rate, subtype='FLOAT')
    Path(request['proof']).write_text(json.dumps({'modelId':model_id,'sampleRate':rate,'frames':len(samples),'peak':float(np.max(np.abs(samples))),'voices':speakers,'language':language,'style':style,'voice':voice},ensure_ascii=False),encoding='utf-8')

if __name__ == '__main__': main(sys.argv[1])
