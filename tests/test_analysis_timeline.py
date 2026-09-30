import sys
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
import numpy as np
import soundfile as sf

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.analysis_timeline import frame_spans, AnalysisTimeline, join_timeline, condition_seam_metrics
from app.timeline_synthesis import source_excitation, counter_gaussian


class AnalysisTimelineTests(unittest.TestCase):
    def test_common_condition_seam_is_detected_even_with_identical_overlapping_arrays(self):
        values=np.zeros((4,200));values[:,100:]=1
        # Both decoders reuse this same array: overlap differences would be 0.
        metrics=condition_seam_metrics(values,100)
        self.assertEqual(metrics['cutStepRms'],1.)
        self.assertEqual(metrics['neighborMedianStepRms'],0.)
        self.assertGreater(metrics['stepToNeighborRatio'],1000)
        ordinary=condition_seam_metrics(np.tile(np.arange(200),(4,1)),100)
        self.assertEqual(ordinary['stepToNeighborRatio'],1.)
    def test_model_replacement_cannot_mix_cached_priors_with_new_weights(self):
        from app.timeline_rendering import render_window
        with self.assertRaisesRegex(ValueError,'resources changed'):
            render_window(SimpleNamespace(resource_revision='new'),
                SimpleNamespace(model_revision='old'),0,Path('unused'),0,.45,.33,0,None)

    def test_real_recording_lengths_have_complete_frame_aligned_coverage(self):
        for samples,count in [(round(59.582403628*16000),4),(round(327.169160998*16000),17),(16007,1)]:
            spans=frame_spans(samples)
            self.assertEqual(len(spans),count)
            self.assertEqual(spans[0][0],0)
            self.assertGreaterEqual(spans[-1][1]*160,samples)
            self.assertLess(spans[-1][1]*160-samples,320)
            self.assertTrue(all(start%2==0 and end%2==0 for start,end in spans))
            for previous,current in zip(spans,spans[1:]):
                self.assertEqual(previous[1]-current[0],50)

    def test_overlapping_glide_and_unvoiced_excitation_share_phase_and_noise(self):
        f0=np.linspace(180,1400,900).astype(np.float32)
        f0[440:460]=0
        whole=source_excitation(f0,40000,-300,0)
        for start,end in [(100,650),(400,899)]:
            phase=np.sum(f0[:start],dtype=np.float64)/100
            part=source_excitation(f0[start:end],40000,start-300,phase)
            np.testing.assert_allclose(part,whole[start*400:end*400],atol=2e-7,rtol=0)

    def test_absolute_latent_noise_is_independent_of_window_shape(self):
        whole=counter_gaussian(20260823,np.arange(-300,1000)[None,:],np.arange(192)[:,None])
        part=counter_gaussian(20260823,np.arange(77,341)[None,:],np.arange(192)[:,None])
        np.testing.assert_array_equal(part,whole[:,377:641])

    def test_shared_excitation_join_has_no_dip_or_lost_final_samples(self):
        samples=16000*22+97;spans=frame_spans(samples)
        n=spans[-1][1]+600
        f0=np.full(n,453.2,dtype=np.float32)
        timeline=AnalysisTimeline(np.zeros(n*160),np.zeros((n//2,256)),f0,spans,samples,
            Path('source.wav'),'rmvpe',{})
        reference=source_excitation(f0,40000,-300,0)[120000:120000+round(samples*2.5)]
        with tempfile.TemporaryDirectory() as d:
            paths=[]
            for index,(start,end) in enumerate(spans):
                _,ctx=timeline.window(index,40000,0)
                extended=source_excitation(ctx.f0,40000,ctx.first_frame,ctx.phase_cycles)
                path=Path(d)/f'{index}.wav'
                sf.write(path,extended[ctx.crop_left:ctx.crop_left+ctx.output_samples],40000,subtype='FLOAT')
                paths.append(path)
            output=Path(d)/'result.wav'
            rows=join_timeline(paths,timeline,output,40000)
            result,_=sf.read(output)
            self.assertEqual(len(result),round(samples*2.5))
            np.testing.assert_allclose(result,reference,atol=2e-7,rtol=0)
            self.assertGreater(rows[0]['correlation'],.99999)
            self.assertLess(abs(rows[0]['midEnergyChangeDb']),.001)
