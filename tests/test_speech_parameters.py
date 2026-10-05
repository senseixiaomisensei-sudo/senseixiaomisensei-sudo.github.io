import sys,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.speech_parameters import validate_speech_steps
from app import speech_runtime

class SpeechParametersTests(unittest.TestCase):
    def test_native_integer_range_and_unchanged_default(self):
        self.assertEqual(validate_speech_steps(),100)
        for n in [1,30,60,100,137,200]:
            self.assertEqual(validate_speech_steps(n),n)
            self.assertEqual(validate_speech_steps(str(n)),n)
        for n in [0,201,-1,True,None,100.5,'100.0','NaN','Infinity','200garbage','01']:
            with self.subTest(n=n),self.assertRaises(ValueError):validate_speech_steps(n)

    def test_bridge_passes_exact_steps_and_rejects_a_worker_ignoring_them(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'引擎配置.json').write_text(json.dumps({'revision':'test'}),encoding='utf8')
            profile={'sha256':'a'*64,'engineRevision':'test','path':str(root/'reference.wav')}
            output=root/'output.wav';diag=root/'evidence';commands=[]
            actual=[200]
            def worker(command,**kwargs):
                commands.append(command);output.write_bytes(b'contract-test')
                (diag/'inference.json').write_text(json.dumps({'parameters':{'diffusionSteps':actual[0]}}))
                return type('Result',(),{'returncode':0})()
            with patch.object(speech_runtime,'config_root',return_value=root),patch.object(speech_runtime,'speech_profile',return_value=profile),patch.object(speech_runtime.subprocess,'run',side_effect=worker):
                report=speech_runtime.render_speech(root/'input.wav',output,'hoshino',profile,diag,200)
                self.assertEqual(report['parameters']['diffusionSteps'],200)
                self.assertEqual(commands[0][-2:],['--steps','200'])
                actual[0]=100
                with self.assertRaisesRegex(RuntimeError,'did not apply'):speech_runtime.render_speech(root/'input.wav',output,'hoshino',profile,diag,200)

if __name__=='__main__':unittest.main()
