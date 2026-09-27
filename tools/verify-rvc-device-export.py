"""Check shipped ONNX against real checkpoint inference with actual A features."""
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import sys
import numpy as np
import onnx
import onnxruntime as ort
import soundfile as sf
import torch
import torch.nn.functional as F

p=argparse.ArgumentParser();p.add_argument('analysis',type=Path);p.add_argument('output',type=Path)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
site=Path(__file__).resolve().parents[1]
os.environ['RVC_OFFICIAL_ROOT']=r'D:\数据\rvc-runtime\official-rvc'
sys.path.insert(0,str(site/'rvc-service'))
from app.pitch_safety import quantize_pitch
from app.timeline_synthesis import source_excitation,counter_gaussian
spec=importlib.util.spec_from_file_location('exporter',site/'tools/export-rvc-explicit-noise.py')
exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
torch.set_num_threads(4);torch.manual_seed(20260823)
entry=next(x for x in json.loads((site/'assets/rvc-models.json').read_text(encoding='utf8'))['models'] if x['id']=='hoshino')
pth=Path(r'E:\大肥鱼\rvc-local\models\hoshino\model.pth')
assert hashlib.sha256(pth.read_bytes()).hexdigest()==entry['checkpointSha256']
checkpoint=exporter.read_checkpoint(pth)
net=exporter.SynthesizerTrnMs256NSFsid(*checkpoint['config'],is_half=False)
del net.enc_q
loaded=net.load_state_dict(checkpoint['weight'],strict=False)
assert not loaded.missing_keys
net=net.float().eval();wrapper=exporter.ExplicitNoiseRvc(net,40000).eval()
# Match the artifact's export shape for this component comparison. Browser
# fixed-window browser orchestration is a separate integration check.
left=3600;count=100
features=np.load(a.analysis/'features.npy')[left//2:(left+count)//2]
phones=F.interpolate(torch.from_numpy(features[None]).permute(0,2,1),scale_factor=2).permute(0,2,1)
hz=np.load(a.analysis/'f0.npz')['corrected'][left:left+count].astype(np.float32)
f0=torch.from_numpy(hz[None]);pitch=torch.from_numpy(quantize_pitch(hz)[None]).long()
lengths=torch.tensor([count]);speaker=torch.tensor([0])
with torch.no_grad():
    mean,logs,mask=net.enc_p(phones,pitch,lengths)
    rnd=torch.randn_like(mean)*.35
    sine,uv,noise=net.dec.m_source.l_sin_gen(f0,400)
    source_noise=noise/(uv*.003+(1-uv)*(.1/3))
    harmonic=net.dec.m_source.l_tanh(net.dec.m_source.l_linear(sine))
    prior=mean+logs.exp()*rnd
    h1=net.enc_p.register_forward_hook(lambda m,x,r:(prior,torch.full_like(logs,-float('inf')),mask))
    h2=net.dec.m_source.register_forward_hook(lambda m,x,r:(harmonic,None,None))
    reference=net.infer(phones,lengths,pitch,f0,speaker)[0][0,0].numpy()
    h1.remove();h2.remove()
    fixed_wrapper=wrapper(phones,lengths,pitch,f0,speaker,rnd,source_noise)[0][0,0].numpy()
feeds={name:value.numpy() for name,value in dict(phone=phones,phone_lengths=lengths,pitch=pitch,
    nsff0=f0,sid=speaker,rnd=rnd,source_noise=source_noise).items()}
serialized=b''.join((site/path).read_bytes() for path in entry['chunks'])
graph=onnx.load_from_string(serialized)
parents={output:node for node in graph.graph.node for output in node.output}
targets=[parents[node.input[0]] for node in graph.graph.node if node.op_type=='Conv'
         and any('conv_post' in name for name in node.input)]
assert len(targets)==1 and targets[0].op_type=='LeakyRelu'
alpha=next(x for x in targets[0].attribute if x.name=='alpha')
before=alpha.f;alpha.f=.01
fixed=graph.SerializeToString();onnx.checker.check_model(graph)
(a.output/'hoshino-decoder-candidate.onnx').write_bytes(fixed)
source_node=next(node for node in graph.graph.node if node.name=='/l_linear/MatMul')
source_node.input[0]='source_excitation'
graph.graph.input.append(onnx.helper.make_tensor_value_info('source_excitation',onnx.TensorProto.FLOAT,[1,'audio_len',1]))
explicit=graph.SerializeToString();onnx.checker.check_model(graph)
(a.output/'hoshino-excitation-candidate.onnx').write_bytes(explicit)
feeds['source_excitation']=sine.numpy()
all_pitch=np.load(a.analysis/'f0.npz')['corrected'].astype(np.float32)
js_input=a.output/'browser-source-input.json';js_output=a.output/'browser-source.f32'
js_input.write_text(json.dumps(dict(f0=all_pitch.tolist(),start=left,count=count,upp=400,
    noise=source_noise.numpy().reshape(-1).tolist())),encoding='utf8')
subprocess.run(['node',str(site/'tools/export-device-excitation-evidence.mjs'),str(js_input),str(js_output)],check=True)
browser_source=np.fromfile(js_output,dtype=np.float32).reshape(1,-1,1)
phase=float(np.sum(all_pitch[:left],dtype=np.float64)/100)
stable=source_excitation(hz,40000,left-300,phase,20260823)
cloud_noise=counter_gaussian(20260823 ^ 0x534f5552,(left-300)*400+np.arange(len(stable)))
amplitude=np.repeat(np.where(hz>0,.003,.1/3),400)
stable=(stable-amplitude*cloud_noise+amplitude*source_noise.numpy().reshape(-1)).astype(np.float32).reshape(1,-1,1)
source_error=float(np.max(abs(stable-browser_source)))
assert source_error<2e-6,'Browser/cloud excitation disagreement'
with torch.no_grad():
    stable_harmonic=net.dec.m_source.l_tanh(net.dec.m_source.l_linear(torch.from_numpy(stable)))
    h1=net.enc_p.register_forward_hook(lambda m,x,r:(prior,torch.full_like(logs,-float('inf')),mask))
    h2=net.dec.m_source.register_forward_hook(lambda m,x,r:(stable_harmonic,None,None))
    stable_reference=net.infer(phones,lengths,pitch,f0,speaker)[0][0,0].numpy()
    h1.remove();h2.remove()
results={}
component_results={}
config=ort.SessionOptions();config.intra_op_num_threads=4;config.inter_op_num_threads=1
waves={'native':reference,'exporter-fixed':fixed_wrapper}
for name,data in [('published-onnx',serialized),('candidate-onnx',fixed),('native-source-onnx',explicit),('browser-source-onnx',explicit)]:
    inspection=onnx.load_from_string(data)
    component_names=['/enc_p/Split_output_0','/enc_p/Split_output_1',
        'source_excitation' if name in {'native-source-onnx','browser-source-onnx'} else '/Add_5_output_0','/Mul_2_output_0']
    for name_out in component_names:
        inspection.graph.output.append(onnx.helper.make_tensor_value_info(name_out,onnx.TensorProto.FLOAT,None))
    data=inspection.SerializeToString()
    session=ort.InferenceSession(data,sess_options=config,providers=['CPUExecutionProvider'])
    provided={value.name:feeds[value.name] for value in session.get_inputs()}
    if name=='browser-source-onnx':provided['source_excitation']=browser_source
    actual=session.run(None,provided)
    waves[name]=actual[0][0,0]
    with torch.no_grad():
        latent=net.flow(prior,mask,g=net.emb_g(speaker).unsqueeze(-1),reverse=True)*mask
    references=[mean.numpy(),logs.numpy(),stable if name=='browser-source-onnx' else sine.numpy(),latent.numpy()]
    component_results[name]={}
    for key,value,ref in zip(component_names,actual[-4:],references):
        difference=value-ref
        component_results[name][key]=dict(maxDifference=float(abs(difference).max()),
            differenceRms=float(np.sqrt(np.mean(difference**2))))
    del session
for name,wave in waves.items():
    sf.write(a.output/(name+'.wav'),wave,40000,subtype='FLOAT')
    expected=stable_reference if name=='browser-source-onnx' else reference
    diff=wave-expected
    results[name]=dict(maxDifference=float(abs(diff).max()),differenceRms=float(np.sqrt(np.mean(diff**2))),
        errorRelativeDb=float(10*np.log10((np.mean(diff**2)+1e-30)/np.mean(expected**2))),
        correlation=float(np.corrcoef(wave,expected)[0,1]))
report=dict(characterId='hoshino',modelSha256=entry['checkpointSha256'],
    publishedSha256=hashlib.sha256(serialized).hexdigest(),candidateSha256=hashlib.sha256(fixed).hexdigest(),
    explicitExcitationSha256=hashlib.sha256(explicit).hexdigest(),
    oldFinalAlpha=before,newFinalAlpha=.01,actualAFrames=[left-300,left-300+count],
    shapeScope='fixed 100-frame export contract; complete browser orchestration not covered',
    results=results,components=component_results,browserCloudExcitationMaxDifference=source_error,
    qualityListening='unverified',candidatePublished=False)
(a.output/'comparison.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report),flush=True)
assert results['exporter-fixed']['maxDifference']<1e-4,'Native/exporter parity failed'
assert results['browser-source-onnx']['maxDifference']<1e-4,'Browser-source ONNX/native parity failed'
