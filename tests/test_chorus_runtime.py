import sys,unittest,tempfile,copy,os,time
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.chorus_runtime import validate_tracks,mix_tracks,encode_mobile_mp3,prune_orphan_sessions,sample_analysis_mix,voice_range

class ChorusContracts(unittest.TestCase):
 def test_expiry_removes_only_old_unindexed_job_folders(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   expired, retained, recent = [root/f'{i:08x}-0000-0000-0000-000000000001' for i in range(3)]
   foreign=root/'unrelated'
   for folder in (expired, retained, recent, foreign):
    folder.mkdir()
   old=time.time()-9000
   for folder in (expired, retained, foreign):
    os.utime(folder,(old,old))
   prune_orphan_sessions(root,{retained.name},7200)
   self.assertFalse(expired.exists())
   self.assertTrue(all(folder.is_dir() for folder in (retained,recent,foreign)))
 def test_sampled_song_covers_three_registers_without_resampling_away_channels(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);sr=24000
   song=np.concatenate([.2*np.sin(2*np.pi*f*np.arange(8*sr)/sr) for f in (130,190,310)])
   source=root/'source.wav'
   sf.write(source,np.column_stack([song,song*.8]),sr,subtype='FLOAT')
   sample=sample_analysis_mix(source,root/'analysis.wav',24)
   pcm,rate=sf.read(sample,dtype='float32')
   self.assertEqual(pcm.shape,(12*rate,2))
   for i,expected in enumerate((130,190,310)):
    x=pcm[i*4*rate:(i+1)*4*rate,0]
    frequency=np.argmax(np.abs(np.fft.rfft(x)))*rate/len(x)
    self.assertAlmostEqual(frequency,expected,delta=1)
 def test_fast_range_keeps_voiced_pitch_and_leaves_silence_uncertain(self):
  t=np.arange(2*24000)/24000
  self.assertAlmostEqual(voice_range(.2*np.sin(2*np.pi*190*t))['medianHz'],190,delta=3)
  self.assertEqual(voice_range(np.zeros_like(t))['confidence'],0)
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
                    ('f0Method','unknown'),('modelId','../hoshino'),('unrecognized',1),
                    ('registerAdaptation',float('nan')),('registerPitch',1.1),('registerAdaptation',True)]:
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
