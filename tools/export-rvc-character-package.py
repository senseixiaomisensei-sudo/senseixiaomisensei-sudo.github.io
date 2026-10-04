"""Validate a new RVC voice and export explicit excitation using real conditions.

Writes candidates only. Does not mount, update the catalog or publish a model.
"""
import argparse,hashlib,importlib.util,json,os,sys
from pathlib import Path
import faiss,numpy as np,onnx,onnxruntime as ort,soundfile as sf,torch
from torch import nn
from torch.nn import functional as F

SITE=Path(__file__).resolve().parents[1]
os.environ.setdefault('RVC_OFFICIAL_ROOT',r'D:\数据\rvc-runtime\official-rvc')
sys.path.insert(0,str(SITE/'rvc-service'))
def module(name,filename):
 spec=importlib.util.spec_from_file_location(name,SITE/'tools'/filename)
 result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
exporter=module('safe_rvc_export','export-rvc-explicit-noise.py')
dynamic=module('dynamic_rvc_prior','export-rvc-shared-prior.py')
retrieval=module('rvc_codebook','build-rvc-retrieval-codebook.py')
from app.content_encoder import checkpoint_encoder_contract
from app.pitch_safety import quantize_pitch
from app.timeline_synthesis import source_excitation,counter_gaussian
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

class SourceRvc(nn.Module):
 def __init__(self,net,rate):super().__init__();self.net=net;self.rate=rate
 def forward(self,phone,phone_lengths,pitch,sid,rnd,source_excitation):
  net=self.net;g=net.emb_g(sid).unsqueeze(-1)
  mean,logs,mask=net.enc_p(phone,pitch,phone_lengths)
  latent=net.flow((mean+torch.exp(logs)*rnd)*mask,mask,g=g,reverse=True)*mask
  decoder=net.dec
  harmonic=decoder.m_source.l_tanh(decoder.m_source.l_linear(source_excitation)).transpose(1,2)
  x=decoder.conv_pre(latent)+decoder.cond(g)
  for stage in range(decoder.num_upsamples):
   x=decoder.ups[stage](F.leaky_relu(x,decoder.lrelu_slope))+decoder.noise_convs[stage](harmonic)
   combined=decoder.resblocks[stage*decoder.num_kernels](x)
   for kernel in range(1,decoder.num_kernels):combined+=decoder.resblocks[stage*decoder.num_kernels+kernel](x)
   x=combined/decoder.num_kernels
  return torch.tanh(decoder.conv_post(F.leaky_relu(x))),torch.tensor([self.rate],dtype=torch.int64)

def export(weight,index,analysis,output):
 output.mkdir(parents=True,exist_ok=True);torch.set_num_threads(4);torch.manual_seed(20260823)
 checkpoint=exporter.read_checkpoint(weight);contract=checkpoint_encoder_contract(checkpoint)
 if checkpoint.get('f0',1)!=1 or contract.name!='hubert_base':raise ValueError('Unverified non-F0 or non-HuBERT candidate')
 config=list(checkpoint['config']);version=checkpoint.get('version','v1')
 if version=='v2' and len(config)==19 and config[-2]==768:config=[*config[:-2],config[-1]]
 config[-3]=int(checkpoint['weight']['emb_g.weight'].shape[0])
 if int(checkpoint['weight']['enc_p.emb_phone.weight'].shape[1])!=contract.feature_dimension:raise ValueError('Feature contract mismatch')
 idx=retrieval.load_index(index)
 if idx.d!=contract.feature_dimension or idx.ntotal<1:raise ValueError('Weight/index dimension mismatch')
 vectors=idx.reconstruct_n(0,min(idx.ntotal,32));assert np.isfinite(vectors).all()
 centroids,sizes=retrieval.extract_ivf_centroids(idx)
 if not np.isfinite(centroids).all() or len(centroids)>4096:raise ValueError('Unverified browser codebook')
 source_count=len(centroids)
 if source_count>1024:
  from threadpoolctl import threadpool_limits
  with threadpool_limits(4):centroids=retrieval.compress(centroids,sizes,1024,20260821)
 retrieval.write_codebook(output/'retrieval.bin',centroids)
 cls=exporter.SynthesizerTrnMs256NSFsid if version=='v1' else exporter.SynthesizerTrnMs768NSFsid
 net=cls(*config,is_half=False);del net.enc_q
 loaded=net.load_state_dict(checkpoint['weight'],strict=False)
 assert not loaded.missing_keys and all(key.startswith('enc_q.') for key in loaded.unexpected_keys)
 net=net.float().eval();rate=exporter.parse_sample_rate(checkpoint.get('sr'),config)
 if net.dec.m_source.l_sin_gen.dim!=1:raise ValueError('Unverified source generator')
 features=np.load(analysis/'features.npy');f0=np.load(analysis/'f0.npz')['corrected']
 assert features.shape[-1]==contract.feature_dimension
 inputs={};references={};left=330
 for count in (64,100,137):
  phone=torch.from_numpy(np.repeat(features[left//2:(left+count+1)//2],2,axis=0)[:count][None])
  coarse=torch.from_numpy(quantize_pitch(f0[left:left+count])[None]).long();length=torch.tensor([count]);sid=torch.tensor([0])
  hz=torch.from_numpy(f0[left:left+count].astype(np.float32)[None])
  rnd=torch.from_numpy(counter_gaussian(20260823,left+np.arange(count)[None,:],np.arange(config[2])[:,None])[None])*.35
  source=torch.from_numpy(source_excitation(hz.numpy()[0],rate,left,0.).astype(np.float32)[None,:,None])
  inputs[count]=(phone,length,coarse,sid,rnd,source)
  with torch.no_grad():
   mean,logs,mask=net.enc_p(phone,coarse,length)
   prior=mean+logs.exp()*rnd;harmonic=net.dec.m_source.l_tanh(net.dec.m_source.l_linear(source))
   h1=net.enc_p.register_forward_hook(lambda m,x,r:(prior,torch.full_like(logs,-float('inf')),mask))
   h2=net.dec.m_source.register_forward_hook(lambda m,x,r:(harmonic,None,None))
   references[count]=net.infer(phone,length,coarse,hz,sid)[0].numpy();h1.remove();h2.remove()
 dynamic.make_dynamic(net.enc_p);wrapper=SourceRvc(net,rate).eval()
 for count,args in inputs.items():
  with torch.no_grad():actual=wrapper(*args)[0].numpy()
  np.testing.assert_allclose(actual,references[count],atol=3e-5,rtol=2e-4)
 onnx_path=output/'model.onnx'
 with torch.inference_mode():
  torch.onnx.export(wrapper,inputs[100],str(onnx_path),input_names=['phone','phone_lengths','pitch','sid','rnd','source_excitation'],output_names=['audio','sr'],
   dynamic_axes={'phone':{1:'frames'},'pitch':{1:'frames'},'rnd':{2:'frames'},'source_excitation':{1:'samples'},'audio':{2:'samples'}},opset_version=17,dynamo=False)
 graph=onnx.load(onnx_path);onnx.checker.check_model(graph)
 assert not any(node.op_type.startswith('Random') for node in graph.graph.node)
 opts=ort.SessionOptions();opts.intra_op_num_threads=4;opts.inter_op_num_threads=1
 session=ort.InferenceSession(str(onnx_path),sess_options=opts,providers=['CPUExecutionProvider']);comparisons=[]
 for count,args in inputs.items():
  actual=session.run(None,dict(zip(['phone','phone_lengths','pitch','sid','rnd','source_excitation'],[value.numpy() for value in args])))[0]
  assert actual.shape==references[count].shape and np.isfinite(actual).all()
  difference=actual-references[count];error=float(np.max(abs(difference)));rms=float(np.sqrt(np.mean(difference**2)))
  # FP32 convolution accumulation can differ at sparse peaks. Bound both
  # peak error and whole-waveform RMS; this is numerical parity, not hearing
  # acceptance. Neither threshold changes or attenuates the generated audio.
  if error>=3e-4 or rms>=1e-5:raise ValueError(f'ONNX parity failed: {count} maximum={error} rms={rms}')
  comparisons.append(dict(frames=count,maxAbsoluteError=error,differenceRms=rms,samples=actual.shape[-1]))
 sf.write(output/'原始合成-真实讲话条件.wav',references[137][0,0],rate,subtype='FLOAT')
 report=dict(checkpointSha256=sha(weight),indexSha256=sha(index),resourceRevision=sha(onnx_path),retrievalSha256=sha(output/'retrieval.bin'),
  sampleRate=rate,rvcVersion=version,speakerCount=config[-3],f0Enabled=True,featureDimension=contract.feature_dimension,
  contentEncoder=dict(name=contract.name,outputLayer=contract.output_layer,featureDimension=contract.feature_dimension),indexVectors=idx.ntotal,
  sourceCentroids=source_count,browserCentroids=len(centroids),noiseScale=.35,excitationContract='explicit-source-v1',conditionsSha256=sha(analysis/'features.npy'),f0Sha256=sha(analysis/'f0.npz'),
  nativeOnnxComparisons=comparisons,listening='未听评',qualityValidation='New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified')
 (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(report),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('weight',type=Path);p.add_argument('index',type=Path);p.add_argument('analysis',type=Path);p.add_argument('output',type=Path)
 a=p.parse_args();export(a.weight,a.index,a.analysis,a.output)
