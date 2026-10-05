import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.register_adaptation import register_controls


class RegisterAdaptationTests(unittest.TestCase):
    def setUp(self):
        self.f0=np.r_[np.full(200,90.),np.zeros(30),np.full(200,240.),np.full(200,800.)]

    def test_disabled_controls_preserve_existing_conditions_exactly(self):
        index,protect,pitch,_=register_controls(self.f0,.3,.25)
        np.testing.assert_array_equal(index,np.full(len(self.f0),.3))
        np.testing.assert_array_equal(protect,np.full(len(self.f0),.25))
        np.testing.assert_array_equal(pitch,np.zeros(len(self.f0)))

    def test_continuous_protection_keeps_original_pitch_and_unvoiced_frames(self):
        original=self.f0.copy()
        index,protect,pitch,info=register_controls(self.f0,.3,.25,1.)
        self.assertLess(index[100],index[330]);self.assertLess(index[-100],index[330])
        self.assertGreaterEqual(index[:180].min(),.21-1e-9)
        self.assertGreaterEqual(index.min(),.09-1e-9);self.assertLessEqual(protect.max(),.25)
        self.assertLess(np.max(abs(np.diff(index))),.01)
        np.testing.assert_array_equal(self.f0,original);np.testing.assert_array_equal(pitch,np.zeros(len(self.f0)))
        self.assertTrue(info['originalMelodyPreserved'])

    def test_high_register_is_stronger_while_low_register_keeps_its_original_ceiling(self):
        index,protect,pitch,info=register_controls(self.f0,.3,.25,1.)
        self.assertAlmostEqual(index[100],.21)
        self.assertAlmostEqual(index[-100],.09)
        self.assertAlmostEqual(protect[-100],.0875)
        self.assertLess(index[-100],index[100]);self.assertLess(protect[-100],protect[100])
        self.assertTrue(np.all(pitch==0));self.assertEqual(info['highRetrievalReductionLimit'],.70)

    def test_descending_high_to_low_controls_cannot_add_their_reductions(self):
        f0=np.r_[np.full(400,240.),np.full(100,1400.),np.full(100,70.)]
        index,protect,_,_=register_controls(f0,.3,.25,1.)
        self.assertGreaterEqual(index.min(),.09-1e-9)
        self.assertGreaterEqual(protect.min(),.0875-1e-9)

    def test_optional_compensation_is_bounded_continuous_and_does_not_fill_breaths(self):
        _,_,pitch,info=register_controls(self.f0,.3,.25,.6,1.)
        self.assertGreater(pitch[100],0);self.assertLess(pitch[-100],0)
        self.assertLessEqual(np.max(abs(pitch)),2);self.assertLessEqual(np.max(abs(np.diff(pitch))),.050000001)
        shifted=self.f0*2**(pitch/12)
        np.testing.assert_array_equal(shifted[self.f0==0],np.zeros(30))
        self.assertFalse(info['originalMelodyPreserved'])

    def test_silence_and_invalid_controls(self):
        for strength in [-.1,1.1,np.nan,np.inf]:
            with self.assertRaises(ValueError):register_controls(self.f0,.3,.25,strength)
        _,_,pitch,_=register_controls(np.zeros(100),.3,.25,1,1)
        np.testing.assert_array_equal(pitch,np.zeros(100))

    def test_overlapping_windows_share_the_same_adaptive_pitch_and_excitation_phase(self):
        from app.analysis_timeline import AnalysisTimeline
        from app.timeline_synthesis import source_excitation
        f0=np.r_[np.full(250,90.),np.full(200,240.),np.zeros(30),np.full(520,800.)]
        _,_,offsets,_=register_controls(f0,.3,.25,.6,1.)
        timeline=AnalysisTimeline(np.zeros(1000*160),np.zeros((500,256)),f0,
            [(0,250),(200,400)],400*160,Path('source.wav'),'rmvpe',{},pitch_offsets=offsets)
        full=timeline.shifted_f0(2).astype(np.float32).astype(np.float64)
        waves=[]
        for index in range(2):
            _,ctx=timeline.window(index,40000,2)
            left=timeline.spans[index][0]
            continuous=(ctx.f0*2**((2+ctx.pitch_offsets)/12)).astype(np.float32).astype(np.float64)
            np.testing.assert_array_equal(continuous,full[left:left+len(continuous)])
            self.assertAlmostEqual(ctx.phase_cycles,np.sum(full[:left])/100,places=10)
            waves.append(source_excitation(continuous,40000,ctx.first_frame,ctx.phase_cycles))
        np.testing.assert_allclose(waves[0][200*400:],waves[1][:(850-200)*400],atol=1e-7)


if __name__=='__main__':unittest.main()
