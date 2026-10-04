import sys,unittest,tempfile,copy
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.chorus_runtime import validate_tracks,mix_tracks,encode_mobile_mp3

class ChorusContracts(unittest.TestCase):
 def tracks(self):return [{'trackId':i+1,'modelId':m} for i,m in enumerate(['hoshino','arona'])]
 def test_independent_defaults_and_four_track_limit(self):
  p=validate_tracks(self.tracks(),2)
  self.assertEqual([t['gainDb'] for t in p],[0,0])
  self.assertEqual([t['mute'] for t in p],[False,False])
  self.assertEqual(len(validate_tracks([{'trackId':1,'modelId':'hoshino'}],1)),1)
  self.assertEqual(len(validate_tracks([{'trackId':i+1,'modelId':'hoshino'} for i in range(4)],4)),4)
  with self.assertRaises(ValueError):validate_tracks([{'trackId':i+1,'modelId':'hoshino'} for i in range(5)],5)
 def test_invalid_parameters_and_identity_are_rejected(self):
  for key,value in [('trackId',True),('trackId',2),('gainDb',float('nan')),('gainDb',float('inf')),
                    ('gainDb',7),('pitch',.5),('pitch',25),('mute','false'),('indexRate',-1),
                    ('f0Method','unknown'),('modelId','../hoshino'),('unrecognized',1)]:
   p=self.tracks();p[0][key]=value
   with self.subTest(key=key,value=value),self.assertRaises(ValueError):validate_tracks(p,2)
 def test_user_gains_and_mute_change_actual_mix_without_clipping_stems(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);sr=24000;t=np.arange(sr)/sr
   a=.8*np.sin(2*np.pi*200*t);b=.8*np.sin(2*np.pi*700*t);music=np.column_stack([.2*np.sin(2*np.pi*1200*t)]*2)
   paths=[root/'a.wav',root/'b.wav'];sf.write(paths[0],a,sr,subtype='FLOAT');sf.write(paths[1],b,sr,subtype='FLOAT')
   acc=root/'music.wav';sf.write(acc,music,sr,subtype='FLOAT');out=root/'mix.wav'
   p=validate_tracks(self.tracks(),2);p[0]['gainDb']=-6;p[1]['mute']=True
   mix_tracks(paths,p,acc,out,accompaniment_mute=True)
   x,_=sf.read(out);np.testing.assert_allclose(x[:,0],a*10**(-6/20),atol=1e-7)
   np.testing.assert_allclose(x[:,0],x[:,1],atol=0)
   p[0]['gainDb']=6;p[1]['mute']=False;mix_tracks(paths,p,acc,out)
   x,_=sf.read(out);self.assertGreater(np.max(np.abs(x)),1)
   self.assertEqual(sf.info(out).subtype,'FLOAT')
   np.testing.assert_allclose(sf.read(paths[0])[0],a,atol=3e-8)
 def test_alignment_error_is_not_hidden_with_padding(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);paths=[root/'a.wav',root/'b.wav'];acc=root/'music.wav'
   for path in paths:sf.write(path,np.zeros(24000),24000,subtype='FLOAT')
   sf.write(acc,np.zeros((26000,2)),24000,subtype='FLOAT')
   with self.assertRaisesRegex(ValueError,'ALIGNMENT'):mix_tracks(paths,validate_tracks(self.tracks(),2),acc,root/'mix.wav')
 def test_mobile_encoding_verifies_actual_decoded_mp3_and_preserves_lossless_source(self):
  import re,subprocess,hashlib
  def peak(path):
   result=subprocess.run(['ffmpeg','-nostdin','-hide_banner','-i',str(path),'-af','ebur128=peak=true',
       '-f','null','NUL' if sys.platform=='win32' else '/dev/null'],capture_output=True,text=True,
       encoding='utf-8',errors='replace',check=True)
   return float(re.search(r'True peak:\s+Peak:\s+(-?[\d.]+)\s+dBFS',result.stderr)[1])
  with tempfile.TemporaryDirectory() as temp:
   source=Path(temp)/'float.wav';destination=Path(temp)/'mobile.mp3';sr=44100
   sf.write(source,1.08*np.sin(2*np.pi*440*np.arange(sr*2)/sr),sr,subtype='FLOAT')
   before=hashlib.sha256(source.read_bytes()).hexdigest()
   evidence=encode_mobile_mp3(source,destination,128,peak)
   self.assertLessEqual(evidence['truePeakDbtp'],-1)
   self.assertLess(evidence['encodingGainDb'],0)
   self.assertLess(destination.stat().st_size,40000)
   self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before)

if __name__=='__main__':unittest.main()
