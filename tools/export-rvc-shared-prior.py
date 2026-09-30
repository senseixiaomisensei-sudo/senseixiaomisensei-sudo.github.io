"""Offline candidate: dynamic enc_p and decoder with explicit shared priors.

Never edits a catalog or mounted checkpoint. Validate against the original
checkpoint at multiple real feature lengths before considering publication.
"""
import argparse, hashlib, importlib.util, json, os, sys, types
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn


def relative_embeddings(self, embeddings, length):
    offsets=torch.arange(1-length,length,device=embeddings.device)
    positions=(offsets+self.window_size).clamp(0,2*self.window_size)
    return embeddings[:,positions,:]*(offsets.abs()<=self.window_size)[None,:,None]


def relative_to_absolute(self,x):
    length=x.shape[2]
    row=torch.arange(length,device=x.device)
    indices=row[None,:]-row[:,None]+length-1
    return torch.gather(x,-1,indices[None,None].expand(x.shape[0],x.shape[1],-1,-1))


def absolute_to_relative(self,x):
    length=x.shape[2]
    row=torch.arange(length,device=x.device)
    indices=torch.arange(2*length-1,device=x.device)[None,:]+row[:,None]-length+1
    valid=(indices>=0)&(indices<length)
    indices=indices.clamp(0,length-1)
    return torch.gather(x,-1,indices[None,None].expand(x.shape[0],x.shape[1],-1,-1))*valid[None,None]


def make_dynamic(prior):
    for module in prior.modules():
        if hasattr(module,'_relative_position_to_absolute_position'):
            module._get_relative_embeddings=types.MethodType(relative_embeddings,module)
            module._relative_position_to_absolute_position=types.MethodType(relative_to_absolute,module)
            module._absolute_position_to_relative_position=types.MethodType(absolute_to_relative,module)


class Prior(nn.Module):
    def __init__(self,encoder):
        super().__init__();self.enc_p=encoder
    def forward(self,phone,pitch,phone_lengths):
        return self.enc_p(phone,pitch,phone_lengths)


def main():
    p=argparse.ArgumentParser();p.add_argument('character');p.add_argument('analysis',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    site=Path(__file__).resolve().parents[1]
    os.environ.setdefault('RVC_OFFICIAL_ROOT',r'D:\数据\rvc-runtime\official-rvc')
    sys.path.insert(0,str(site/'rvc-service'))
    from app.pitch_safety import quantize_pitch
    spec=importlib.util.spec_from_file_location('exporter',site/'tools/export-rvc-explicit-noise.py')
    exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
    torch.set_num_threads(4);torch.manual_seed(20260823)
    entry=next(x for x in json.loads((site/'assets/rvc-models.json').read_text(encoding='utf8'))['models'] if x['id']==a.character)
    path=Path(r'E:\大肥鱼\rvc-local\models')/a.character/'model.pth'
    checkpoint=exporter.read_checkpoint(path);config=list(checkpoint['config'])
    if checkpoint.get('version','v1')=='v2' and len(config)==19:config=[*config[:-2],config[-1]]
    cls=exporter.SynthesizerTrnMs256NSFsid if checkpoint.get('version','v1')=='v1' else exporter.SynthesizerTrnMs768NSFsid
    net=cls(*config,is_half=False);del net.enc_q
    loaded=net.load_state_dict(checkpoint['weight'],strict=False)
    assert not loaded.missing_keys
    assert all(key.startswith('enc_q.') for key in loaded.unexpected_keys), loaded.unexpected_keys
    net=net.float().eval()
    features=np.load(a.analysis/'features.npy');f0=np.load(a.analysis/'f0.npz')['corrected']
    samples={};native={}
    for count in (64,100,137,300,600):
        left=3300
        phone=torch.from_numpy(np.repeat(features[left//2:(left+count+1)//2],2,axis=0)[:count][None])
        coarse=torch.from_numpy(quantize_pitch(f0[left:left+count])[None]).long()
        length=torch.tensor([count])
        samples[count]=(phone,coarse,length)
        with torch.no_grad():native[count]=tuple(t.numpy() for t in net.enc_p(*samples[count]))
    make_dynamic(net.enc_p);wrapper=Prior(net.enc_p).eval()
    for count in samples:
        with torch.no_grad():dynamic=wrapper(*samples[count])
        for value,reference in zip(dynamic,native[count]):
            np.testing.assert_allclose(value.numpy(),reference,atol=2e-5,rtol=1e-5)
    prior_path=a.output/'prior.onnx'
    torch.onnx.export(wrapper,samples[100],str(prior_path),input_names=['phone','pitch','phone_lengths'],
        output_names=['prior_mean','prior_logs','x_mask'],dynamic_axes={'phone':{1:'frames'},'pitch':{1:'frames'},
            'prior_mean':{2:'frames'},'prior_logs':{2:'frames'},'x_mask':{2:'frames'}},opset_version=17,dynamo=False)
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(prior_path),sess_options=options,providers=['CPUExecutionProvider'])
    comparisons=[]
    for count,inputs in samples.items():
        actual=session.run(None,dict(zip(['phone','pitch','phone_lengths'],[t.numpy() for t in inputs])))
        errors=[float(np.max(abs(x-y))) for x,y in zip(actual,native[count])]
        assert max(errors)<5e-5, (count,errors)
        comparisons.append(dict(frames=count,maximumDifferences=errors))
    graph=onnx.load_from_string(b''.join((site/c).read_bytes() for c in entry['chunks']))
    mapping={'/enc_p/Split_output_0':'prior_mean','/enc_p/Split_output_1':'prior_logs','/enc_p/Cast_1_output_0':'x_mask'}
    for name in mapping:
        channels=1 if name.endswith('Cast_1_output_0') else int(config[2])
        graph.graph.value_info.append(onnx.helper.make_tensor_value_info(name,onnx.TensorProto.FLOAT,[1,channels,'frames']))
    inputs=[*mapping,'sid','rnd','source_excitation']
    decoder=onnx.utils.Extractor(graph).extract_model(inputs,['audio','sr'])
    for node in decoder.graph.node:
        for i,name in enumerate(node.input):node.input[i]=mapping.get(name,name)
        for i,name in enumerate(node.output):node.output[i]=mapping.get(name,name)
    for info in [*decoder.graph.input,*decoder.graph.value_info,*decoder.graph.output]:info.name=mapping.get(info.name,info.name)
    onnx.checker.check_model(decoder)
    decoder_path=a.output/'decoder.onnx';onnx.save(decoder,decoder_path)
    decoder_session=ort.InferenceSession(str(decoder_path),sess_options=options,providers=['CPUExecutionProvider'])
    from app.timeline_synthesis import source_excitation
    decoder_comparisons=[]
    for count,inputs in samples.items():
        phone,coarse,length=inputs
        hz=torch.from_numpy(f0[3300:3300+count].astype(np.float32)[None])
        mean,logs,mask=[torch.from_numpy(value) for value in native[count]]
        rnd=torch.randn_like(mean)*.35
        source=source_excitation(hz.numpy()[0],net.dec.m_source.l_sin_gen.sampling_rate,3000,0.)
        source=torch.from_numpy(source.astype(np.float32)[None,:,None]);speaker=torch.tensor([0])
        with torch.no_grad():
            prior=mean+logs.exp()*rnd
            harmonic=net.dec.m_source.l_tanh(net.dec.m_source.l_linear(source))
            h1=net.enc_p.register_forward_hook(lambda m,x,r:(prior,torch.full_like(logs,-float('inf')),mask))
            h2=net.dec.m_source.register_forward_hook(lambda m,x,r:(harmonic,None,None))
            reference=net.infer(phone,length,coarse,hz,speaker)[0].numpy()
            h1.remove();h2.remove()
        feed=dict(prior_mean=mean.numpy(),prior_logs=logs.numpy(),x_mask=mask.numpy(),
                  rnd=rnd.numpy(),sid=speaker.numpy(),source_excitation=source.numpy())
        actual=decoder_session.run(None,feed)[0]
        error=float(abs(reference-actual).max())
        assert error<1e-4,(count,error)
        decoder_comparisons.append(dict(frames=count,maximumDifference=error,outputSamples=actual.shape[-1]))
    report=dict(characterId=a.character,checkpointSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        sourceGeneratorSha256=entry['sha256'],priorSha256=hashlib.sha256(prior_path.read_bytes()).hexdigest(),
        decoderSha256=hashlib.sha256(decoder_path.read_bytes()).hexdigest(),
        nativeDynamicOnnxComparisons=comparisons,decoderComparisons=decoder_comparisons,
        activeResourceChanged=False,listening='unverified')
    (a.output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report),flush=True)


if __name__=='__main__':main()
