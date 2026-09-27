"""Render a complete supplied song through real service functions, offline.

Changes no mounted model, production process, catalog, or user account. The
report identifies its exact model/index/source and remains listening-unverified.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('model', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--character-id', required=True)
    parser.add_argument('--f0', choices=['rmvpe', 'fcpe', 'pm'], default='rmvpe')
    parser.add_argument('--index-rate', type=float, default=.45)
    parser.add_argument('--reuse-stems', type=Path)
    parser.add_argument('--device', choices=['auto','cpu'], default='auto')
    parser.add_argument('--timeline', action='store_true')
    parser.add_argument('--no-consensus', action='store_true')
    args = parser.parse_args()
    args.source = args.source.resolve(strict=True)
    args.model = args.model.resolve(strict=True)
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    site = Path(__file__).resolve().parents[1]
    os.environ.setdefault('RVC_OFFICIAL_ROOT', r'D:\数据\rvc-runtime\official-rvc')
    os.environ.setdefault('RVC_RUNTIME_CACHE', r'D:\rvc-cache')
    os.environ.setdefault('RVC_SEPARATOR_MODELS_DIR', r'D:\数据\rvc-runtime\pymss-models')
    os.environ.setdefault('RVC_SEPARATOR_DEVICE', 'cuda')
    os.environ.setdefault('RVC_MODELS_DIR', r'E:\大肥鱼\rvc-local\models')
    os.environ.setdefault('RVC_WORK_ROOT', str(args.output / 'runtime-work'))
    os.environ.setdefault('RVC_OUTPUT_ROOT', str(args.output / 'runtime-output'))
    os.environ.setdefault('RVC_DIAGNOSTIC_ROOT', str(args.output / 'runtime-diagnostics'))
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG', ':4096:8')
    os.environ.setdefault('PYTHONUTF8', '1')
    if args.timeline:
        os.environ['RVC_TIMELINE_INFERENCE']='1'
        os.environ['RVC_TIMELINE_CONSENSUS']='0' if args.no_consensus else '1'
    sys.path.insert(0, str(site / 'rvc-service'))
    from app import main as service
    if args.device == 'cpu':
        import torch
        from app import official_runtime
        torch.set_num_threads(4)
        official_runtime._select_device=lambda: ('cpu',False)
    from app.separation_runtime import SongStems
    import soundfile as sf
    source_hash = file_hash(args.source)
    stages = args.output / 'diagnostic-stages'
    stages.mkdir(exist_ok=True)
    times = {}
    started = time.monotonic()
    def mark(name):
        times[name] = round(time.monotonic() - started, 3)
        print(json.dumps(dict(stage=name, elapsedSeconds=times[name])), flush=True)
    container_duration = service.probe_duration(args.source)
    decoded = args.output / 'decoded-source.wav'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(args.source),
                    '-vn', '-c:a', 'pcm_f32le', str(decoded)], check=True)
    source_info = sf.info(decoded)
    # MP3 container padding is not part of the effective decoded performance.
    duration = source_info.frames / source_info.samplerate
    if args.reuse_stems:
        stamp = json.loads((args.reuse_stems / 'source.json').read_text(encoding='utf8'))
        if stamp['sha256'] != source_hash:
            raise ValueError('Cached stems belong to another source')
        for name, field in [('vocals.wav', 'vocalsSha256'), ('instrumental.wav', 'instrumentalSha256')]:
            if file_hash(args.reuse_stems / name) != stamp[field]:
                raise ValueError(f'Cached stem integrity failure: {name}')
        stems = SongStems(args.reuse_stems / 'vocals.wav', args.reuse_stems / 'instrumental.wav',
                          sf.info(args.reuse_stems / 'vocals.wav').samplerate)
    else:
        stems = service.separate_song(decoded, args.output / 'stems')
        (args.output / 'stems/source.json').write_text(json.dumps(dict(sha256=source_hash,
            source=str(args.source), durationSeconds=duration,
            vocalsSha256=file_hash(stems.vocals), instrumentalSha256=file_hash(stems.instrumental))), encoding='utf8')
    for stem in (stems.vocals, stems.instrumental):
        info = sf.info(stem)
        if abs(info.duration - duration) > 1 / info.samplerate:
            raise ValueError(f'Separation timeline differs from decoded input: {stem}')
    mark('separated')
    prepared = args.output / 'model-input-16k.wav'
    profile = service.normalize_audio(stems.vocals, prepared, singing=True)
    vocals = args.output / 'converted-vocals.wav'
    actual_f0 = service.render_duration_safe_conversion(
        args.model, prepared, vocals, args.output / 'long-vocals', duration,
        0, args.index_rate, .33, 0, 0, .5, args.f0, profile, stages)
    mark('converted-complete-song')
    service.snapshot_diagnostic_audio(vocals, stages, 'vocals-joined.wav')
    activity = service.suppress_silent_synthesis(vocals, prepared)
    service.snapshot_diagnostic_audio(vocals, stages, 'vocals-activity.wav')
    service.apply_dynamics(vocals, prepared, .5, stages / 'dynamics.npz')
    service.snapshot_diagnostic_audio(vocals, stages, 'vocals-dynamics.wav')
    gain = service.calibrate_song_vocals(stems.vocals, vocals)
    service.snapshot_diagnostic_audio(vocals, stages, 'vocals-balanced.wav')
    mix = args.output / '完整翻唱.wav'
    service.remix_song(stems.instrumental, vocals, mix, duration, stems.sample_rate)
    service.snapshot_diagnostic_audio(mix, stages, 'remixed.wav')
    service.finalize_true_peak_safe(mix)
    solo = args.output / '完整角色人声.wav'
    shutil.copyfile(vocals, solo)
    service.finalize_true_peak_safe(solo)
    encoded_peak = service.transcode_mp3_true_peak_safe(mix, mix.with_suffix('.mp3'))
    solo_peak = service.transcode_mp3_true_peak_safe(solo, solo.with_suffix('.mp3'))
    mark('encoded-complete-song')
    report = dict(characterId=args.character_id, source=str(args.source), sourceSha256=source_hash,
        sourceDurationSeconds=duration, sourceContainerDurationSeconds=container_duration,
        sourceDecodedFrames=source_info.frames, sourceSampleRate=source_info.samplerate,
        outputFrames=sf.info(mix).frames, outputSampleRate=sf.info(mix).samplerate,
        checkpointSha256=file_hash(args.model), indexSha256=file_hash(service.find_index_path(args.model)),
        backendBuildSha=service.BACKEND_BUILD_SHA, pipelineRevision=service.PIPELINE_REVISION,
        workingDiffSha256=hashlib.sha256(subprocess.check_output(['git','diff','HEAD'],cwd=site)).hexdigest(),
        runnerSha256=file_hash(__file__),
        actualF0Method=actual_f0, pitch=0, indexRate=args.index_rate, protect=.33, rmsMixRate=.5,
        timeline=args.timeline, consensus=args.timeline and not args.no_consensus,
        automaticVocalGain=gain, userVocalGainDb=0, userAccompanimentGainDb=0,
        activity=activity, mp3TruePeakDbtp=encoded_peak, soloMp3TruePeakDbtp=solo_peak,
        elapsedStages=times, completeSourceConverted=True, trimmedDifficultSections=False,
        execution='real service functions, offline; no production resource switch', qualityListening='unverified')
    (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(dict(output=str(mix.with_suffix('.mp3')),durationSeconds=duration)), flush=True)


if __name__ == '__main__':
    main()
