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
    if model_id == 'qwen3-06b':
        from qwen_tts import Qwen3TTSModel
        model = Qwen3TTSModel.from_pretrained(str(root), device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa', local_files_only=True)
        speakers = model.get_supported_speakers()
        voice = voice or ('ryan' if language == 'en' else 'serena')
        if voice not in speakers: raise ValueError('RVC_TTS_INVALID_VOICE')
        waves, rate = model.generate_custom_voice(text=text, language=LANGUAGES[language], speaker=voice, instruct='', non_streaming_mode=True, max_new_tokens=4096)
        samples = waves[0]
    elif model_id == 'cosyvoice-instruct':
        source = Path(request['cosySource'])
        sys.path.insert(0, str(source)); sys.path.insert(0, str(source / 'third_party' / 'Matcha-TTS'))
        from cosyvoice.cli.cosyvoice import CosyVoice
        model = CosyVoice(str(root), load_jit=False, load_trt=False, fp16=False)
        speakers = model.list_available_spks()
        defaults = {'zh':'中文女','en':'英文女','ja':'日语男','ko':'韩语女','yue':'粤语女'}
        voice = voice or defaults[language]
        if voice not in speakers: raise ValueError('RVC_TTS_INVALID_VOICE')
        outputs = list(model.inference_instruct(text, voice, STYLES[style], stream=False, speed=1., text_frontend=False))
        samples = torch.cat([item['tts_speech'].cpu() for item in outputs], dim=1).flatten().numpy(); rate = model.sample_rate
    else: raise ValueError('RVC_TTS_INVALID_MODEL')
    samples = np.asarray(samples, dtype=np.float32)
    if len(samples) < rate // 4 or not np.isfinite(samples).all(): raise ValueError('RVC_TTS_EMPTY_OUTPUT')
    peak = float(np.max(np.abs(samples)))
    if peak > .8: samples *= .8 / peak
    sf.write(request['output'], samples, rate, subtype='FLOAT')
    Path(request['proof']).write_text(json.dumps({'modelId':model_id,'sampleRate':rate,'frames':len(samples),'peak':float(np.max(np.abs(samples))),'voices':speakers,'language':language,'style':style,'voice':voice},ensure_ascii=False),encoding='utf-8')

if __name__ == '__main__': main(sys.argv[1])
