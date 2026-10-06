"""Authenticated chorus analysis/conversion, sharing the existing GPU queue."""
from __future__ import annotations
import asyncio
import hashlib
import json
import math
import os
import shutil
import subprocess
from pathlib import Path
from fastapi import File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from app.chorus_runtime import chorus_status, separate_singers, validate_tracks, mix_tracks, encode_mobile_mp3


def install_chorus_routes(app, core):
    root = core.OUTPUT_ROOT / 'chorus'
    storage_lock = asyncio.Lock()

    def discard_temporary(work, path):
        # These are server-created paths, never a client path or an ancestor.
        resolved=path.resolve()
        if not core.re_full_uuid(work.name) or work.resolve() not in resolved.parents:
            raise ValueError('CHORUS_INVALID_WORKSPACE')
        if resolved.is_dir(): shutil.rmtree(resolved)
        else: resolved.unlink(missing_ok=True)

    async def enforce_storage(work):
        async with storage_lock:
            used=sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
            current=sum(p.stat().st_size for p in work.rglob('*') if p.is_file())
            if current > core.MAX_REMIX_STEM_JOB_BYTES or used > core.MAX_REMIX_STEM_TOTAL_BYTES:
                raise ValueError('CHORUS_STORAGE_LIMIT')

    def folder(job_id):
        if not core.re_full_uuid(job_id): raise core.RvcServiceError(404,'CHORUS_NOT_FOUND')
        return root / job_id

    def metadata(job_id):
        try: return json.loads((folder(job_id)/'session.json').read_text(encoding='utf-8'))
        except (OSError,ValueError): return {}

    def save(job_id, value):
        target = folder(job_id)/'session.json'
        target.parent.mkdir(parents=True,exist_ok=True)
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
        temporary.replace(target)

    def authorized_session(request, job_id, token):
        core.ensure_authorized(request)
        record = core.outputs.get(job_id)
        if not core.re_full_uuid(job_id) or not core.valid_training_token(token) or record is None or not core.secrets.compare_digest(token,record.token):
            raise core.RvcServiceError(404,'CHORUS_NOT_FOUND')
        if record.expires_at <= core.utcnow(): raise core.RvcServiceError(410,'CHORUS_EXPIRED')
        return record

    def response(job_id, record):
        result = core.output_payload(job_id,record)
        info = metadata(job_id)
        if record.error_code: result['code'] = record.error_code
        if record.state == 'completed':
            result.update({k:info[k] for k in ('tracks','requestedCount','estimatedCount','countNeedsReview',
                'experimentalRecursive','modelRevision','modelSha256','adaptedCodeSha256','parameters','reusedConversion','countPolicyRevision',
                'separationStatus','duplicateMerges','separationDiagnostics','contextRefinement','candidateSelection','finalPairDiagnostics','analysisOnly','automaticCountLimit','countConfirmation','backendBuildSha','pipelineRevision') if k in info})
        return result

    async def track_task(task):
        core.job_tasks.add(task)
        task.add_done_callback(core.job_tasks.discard)

    async def fail(job_id, error):
        record = core.outputs.get(job_id)
        if record:
            record.state = record.stage = 'failed'
            code=getattr(error,'code',str(error))
            record.error_code = code if code.startswith(('CHORUS_','RVC_SEPARATION_','RVC_SEPARATOR_')) else 'CHORUS_PROCESSING_FAILED'
            core.persist_output_records()
        core.logger.exception('chorus task failed job_id=%s',job_id)

    async def analyze_job(job_id, input_path, count, kind, analysis_only=False):
        record = core.outputs[job_id]
        work = folder(job_id)
        try:
            record.state='processing'; record.stage='separating'
            async with core.inference_lock:
                if kind == 'mix':
                    stems = await asyncio.to_thread(core.separate_song,input_path,work/'accompaniment-separation',core.release_cached_models)
                    source, accompaniment = stems.vocals, stems.instrumental
                else:
                    await asyncio.to_thread(core.release_cached_models)
                    source=input_path; accompaniment=work/'accompaniment.wav'
                decoded = work/'vocals-24k.wav'
                await asyncio.to_thread(subprocess.run,['ffmpeg','-nostdin','-v','error','-y','-i',str(source),
                    '-vn','-ac','1','-ar','24000','-c:a','pcm_f32le',str(decoded)],check=True,timeout=180)
                if kind != 'mix':
                    import soundfile as sf
                    import numpy as np
                    x,sr=await asyncio.to_thread(sf.read,decoded,dtype='float32',always_2d=True)
                    await asyncio.to_thread(sf.write,accompaniment,np.zeros_like(x),sr,subtype='FLOAT')
                record.stage='identifying-singers'
                if analysis_only:
                    # Parameter analysis uses the actual vocal source and never invokes
                    # multi-singer separation or infers how many singers the song has.
                    from app.chorus_worker import voice_range
                    import soundfile as sf
                    x,_=await asyncio.to_thread(sf.read,decoded,dtype='float32')
                    voice=await asyncio.to_thread(voice_range,x)
                    destination=work/'singers'/'singer-1.wav'; destination.parent.mkdir()
                    await asyncio.to_thread(shutil.copyfile,decoded,destination)
                    analysis={'requestedCount':'analysis','estimatedCount':1,'countNeedsReview':False,
                        'experimentalRecursive':False,'modelRevision':'source-voice-range-v1','modelSha256':'',
                        'adaptedCodeSha256':'','tracks':[str(destination)],'voiceRanges':[voice],'frames':len(x)}
                else:
                    analysis=await asyncio.to_thread(separate_singers,decoded,work/'singers',count)
            duration=core.probe_duration(decoded)
            await asyncio.to_thread(discard_temporary,work,decoded)
            if kind=='mix': await asyncio.to_thread(discard_temporary,work,source)
            info={k:analysis[k] for k in ('requestedCount','estimatedCount','countNeedsReview','experimentalRecursive','modelRevision','modelSha256','adaptedCodeSha256')}
            info.update({'duration':duration,'sampleRate':24000,'inputKind':kind,'analysisOnly':analysis_only,
                'backendBuildSha':core.BACKEND_BUILD_SHA,'pipelineRevision':core.PIPELINE_REVISION,
                'countPolicyRevision':analysis.get('countPolicyRevision','legacy'),
                'automaticCountLimit':analysis.get('automaticCountLimit',2),
                'accompaniment':str(accompaniment.relative_to(work)),
                'separationStatus':analysis.get('separationStatus','needs-review'),
                'duplicateMerges':analysis.get('duplicateMerges',[]),
                'separationDiagnostics':analysis.get('separationDiagnostics',[]),
                'contextRefinement':analysis.get('contextRefinement',{}),
                'candidateSelection':analysis.get('candidateSelection',{}),
                'countConfirmation':analysis.get('countConfirmation',{}),
                'finalPairDiagnostics':analysis.get('finalPairDiagnostics',[]),
                'tracks':[{'trackId':i+1,'label':f'声部 {i+1}','frames':analysis['frames'],
                    'sourceSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                    'voiceRange':analysis.get('voiceRanges',[{}]*len(analysis['tracks']))[i]} for i,path in enumerate(analysis['tracks'])]})
            save(job_id,info)
            # MP3 audition is streamed on demand on phones. Keep the floating
            # source stems for conversion; preview encoding never replaces them.
            for i in range(len(analysis['tracks'])):
                stem=work/'singers'/f'singer-{i+1}.wav'
                await asyncio.to_thread(encode_mobile_mp3,stem,stem.with_suffix('.mp3'),96,core.encoded_true_peak_dbfs)
            # Completed analysis retains a real source mix, not a pretend cover.
            await asyncio.to_thread(subprocess.run,['ffmpeg','-nostdin','-v','error','-y','-i',str(input_path),
                '-vn','-c:a','pcm_f32le',str(record.path)],check=True,timeout=180)
            input_path.unlink(missing_ok=True)
            await enforce_storage(work)
            record.state=record.stage='completed'; core.persist_output_records()
        except (Exception,asyncio.CancelledError) as error:
            await fail(job_id,error)

    @app.get('/v1/chorus/status')
    async def status(request: Request):
        core.ensure_authorized(request)
        return chorus_status()

    @app.post('/v1/chorus/analyze')
    async def analyze(request: Request, audio: UploadFile=File(...),
                      singer_count: str=Form('auto'), input_kind: str=Form('mix'), request_id: str=Form(''), analysis_only: bool=Form(False)):
        core.ensure_authorized(request)
        try:
            if not analysis_only and not chorus_status()['ready']: raise core.RvcServiceError(503,'CHORUS_ENGINE_UNAVAILABLE')
            if singer_count not in {'auto','2','3','4'} or input_kind not in {'mix','vocals'}:
                raise core.RvcServiceError(400,'CHORUS_INVALID_PARAMETER')
            if request_id and not core.valid_request_id(request_id): raise core.RvcServiceError(400,'RVC_INVALID_REQUEST_ID')
            # Reject an invalid upload before reserving a queue slot. Errors
            # outside the preparation try block previously left uploading jobs.
            extension=core.safe_extension(audio)
            if core.active_training_job_id: raise core.RvcServiceError(503,'RVC_TRAINING_ACTIVE')
            await core.cleanup_expired_outputs()
            fingerprint=hashlib.sha256(json.dumps([singer_count,input_kind,analysis_only,audio.filename,audio.content_type,core.PIPELINE_REVISION]).encode()).hexdigest()
            job_id,record,created=await core.reserve_conversion_job(request_id,fingerprint,'wav','chorus-analysis')
            if not created: return response(job_id,record)
            try:
                path=folder(job_id)/f'input.{extension}'
                path.parent.mkdir(parents=True,exist_ok=True)
                await core.write_upload(audio,path)
                seconds=await asyncio.to_thread(core.probe_duration,path)
                if not core.MIN_AUDIO_SECONDS <= seconds <= core.MAX_AUDIO_SECONDS:
                    raise core.RvcServiceError(400,'RVC_AUDIO_TOO_LONG' if seconds>core.MAX_AUDIO_SECONDS else 'RVC_AUDIO_TOO_SHORT')
                record.state=record.stage='queued'; core.persist_output_records()
                await track_task(asyncio.create_task(analyze_job(job_id,path,singer_count,input_kind,analysis_only)))
                return response(job_id,record)
            except BaseException:
                await core.release_preparing_job(job_id,request_id)
                shutil.rmtree(folder(job_id),ignore_errors=True)
                raise
        finally: await audio.close()

    @app.get('/v1/chorus/{job_id}')
    async def get_session(request: Request,job_id: str,token: str):
        record=authorized_session(request,job_id,token)
        return response(job_id,record)

    @app.get('/v1/chorus/{job_id}/stem/{track_id}')
    async def preview(request: Request,job_id: str,track_id: int,token: str):
        record=authorized_session(request,job_id,token)
        info=metadata(job_id)
        if record.state!='completed' or not 1<=track_id<=len(info.get('tracks',[])):
            raise core.RvcServiceError(404,'CHORUS_NOT_FOUND')
        extension='mp3'
        path=folder(job_id)/'singers'/f'singer-{track_id}.{extension}'
        if extension=='mp3' and not path.is_file():
            extension='wav';path=path.with_suffix('.wav')
        if not path.is_file(): raise core.RvcServiceError(410,'CHORUS_EXPIRED')
        return FileResponse(path,media_type='audio/mpeg' if extension=='mp3' else 'audio/wav',headers={'Cache-Control':'no-store'})

    async def convert_job(job_id,parent,params,accompaniment_db,accompaniment_mute):
        record=core.outputs[job_id]
        work=folder(job_id); work.mkdir(parents=True,exist_ok=True)
        info=metadata(parent); stems=[]
        try:
            record.state='processing'
            identity=[]
            for param in params:
                from app.official_runtime import model_profile_revision
                model_path=core.find_model_path(param['modelId'])
                index_text=core.find_index_path(model_path)
                identity.append({**{k:v for k,v in param.items() if k not in {'gainDb','mute'}},
                    'modelSha256':await asyncio.to_thread(core.verified_file_hash,model_path),
                    'profileRevision':model_profile_revision(model_path),
                    'indexSha256':await asyncio.to_thread(core.verified_file_hash,Path(index_text)) if index_text else None})
            conversion_key=hashlib.sha256(json.dumps([parent,identity,core.PIPELINE_REVISION],sort_keys=True).encode()).hexdigest()
            cached=None;cached_info={}
            for old_id,old_record in list(core.outputs.items()):
                if old_id==job_id or old_record.audio_mode!='chorus' or old_record.state!='completed' or old_record.expires_at<=core.utcnow():continue
                old_info=metadata(old_id)
                if old_info.get('conversionFingerprint')==conversion_key and old_info.get('parentSessionId')==parent and all(
                    (folder(old_id)/f'converted-{i+1}.wav').is_file() for i in range(len(params))):
                    cached=old_id;cached_info=old_info
                    old_record.expires_at=max(old_record.expires_at,record.expires_at)
                    break
            for i,param in enumerate(params):
                if cached:
                    converted=work/f'converted-{i+1}.wav'
                    shutil.copyfile(folder(cached)/converted.name,converted)
                    old_param=cached_info['parameters'][i]
                    param.update({k:old_param[k] for k in ('autoVocalGain','actualF0Method','modelSha256','indexSha256')})
                    stems.append(converted)
                    continue
                record.stage=f'converting-singer-{i+1}'
                raw=folder(parent)/'singers'/f'singer-{i+1}.wav'
                normalized=work/f'model-input-{i+1}.wav'; converted=work/f'converted-{i+1}.wav'
                profile=await asyncio.to_thread(core.normalize_audio,raw,normalized,singing=True)
                model_path=core.find_model_path(param['modelId'])
                diagnostics=work/f'evidence-{i+1}' if os.getenv('RVC_CHORUS_STAGE_EVIDENCE','0')=='1' else None
                actual_f0=await core.render_duration_safe_conversion_async(model_path,normalized,
                    converted,work/f'chunks-{i+1}',info['duration'],param['pitch'],param['indexRate'],param['protect'],
                    0,0,param['rmsMixRate'],param['f0Method'],profile,diagnostics,
                    param['registerAdaptation'],param['registerPitch'])
                await asyncio.to_thread(core.suppress_silent_synthesis,converted,normalized)
                await asyncio.to_thread(core.apply_dynamics,converted,normalized,1-param['rmsMixRate'])
                auto_gain=await asyncio.to_thread(core.calibrate_song_vocals,raw,converted)
                param['autoVocalGain']=auto_gain
                param['actualF0Method']=actual_f0
                param['modelSha256']=await asyncio.to_thread(core.verified_file_hash,model_path)
                index_text=core.find_index_path(model_path)
                index_path=Path(index_text) if index_text else None
                param['indexSha256']=await asyncio.to_thread(core.verified_file_hash,index_path) if index_path else None
                stems.append(converted)
                if diagnostics is None:
                    await asyncio.to_thread(discard_temporary,work,work/f'chunks-{i+1}')
                    await asyncio.to_thread(discard_temporary,work,normalized)
                    await enforce_storage(work)
            record.stage='mixing'
            mixed=work/'mix-float.wav'
            await asyncio.to_thread(mix_tracks,stems,params,folder(parent)/info['accompaniment'],mixed,
                accompaniment_db,accompaniment_mute)
            await asyncio.to_thread(core.finalize_true_peak_safe,mixed)
            encoding=await asyncio.to_thread(encode_mobile_mp3,mixed,record.path,128,core.encoded_true_peak_dbfs)
            await asyncio.to_thread(discard_temporary,work,mixed)
            for i,path in enumerate(stems):
                # Retain a separate audition file; export mix used the original
                # floating stem so preview protection cannot alter mix balance.
                preview=work/'singers'/f'singer-{i+1}.mp3'
                await asyncio.to_thread(encode_mobile_mp3,path,preview,96,core.encoded_true_peak_dbfs)
            await enforce_storage(work)
            save(job_id,{'tracks':info['tracks'],'parameters':params,'estimatedCount':len(params),
                'modelRevision':info['modelRevision'],'modelSha256':info['modelSha256'],
                'parentSessionId':parent,'conversionFingerprint':conversion_key,'reusedConversion':cached is not None,
                'encoding':encoding,'countPolicyRevision':info.get('countPolicyRevision','legacy'),
                'countNeedsReview':True,'experimentalRecursive':len(params)>2,
                **{k:info[k] for k in ('separationStatus','separationDiagnostics','contextRefinement','duplicateMerges','candidateSelection','finalPairDiagnostics') if k in info}})
            record.engine='rvc-chorus'; record.engine_revision=core.PIPELINE_REVISION
            record.state=record.stage='completed'; core.persist_output_records()
        except (Exception,asyncio.CancelledError) as error: await fail(job_id,error)

    @app.post('/v1/chorus/{job_id}/convert')
    async def convert(request: Request,job_id: str,token: str):
        parent=authorized_session(request,job_id,token)
        if parent.audio_mode!='chorus-analysis' or parent.state!='completed': raise core.RvcServiceError(409,'CHORUS_NOT_READY')
        if len(await request.body())>65536: raise core.RvcServiceError(413,'CHORUS_REQUEST_TOO_LARGE')
        try:
            value=await request.json()
            if not isinstance(value,dict) or set(value)-{'tracks','accompanimentGainDb','accompanimentMute','requestId'}: raise ValueError()
            params=validate_tracks(value.get('tracks'),len(metadata(job_id).get('tracks',[])))
            gain=value.get('accompanimentGainDb',0); mute=value.get('accompanimentMute',False)
            if isinstance(gain,bool) or not isinstance(gain,(int,float)) or not math.isfinite(gain) or not -24<=gain<=6 or type(mute)is not bool: raise ValueError()
            request_id=value.get('requestId','')
            if not isinstance(request_id,str) or request_id and not core.valid_request_id(request_id): raise ValueError()
        except (ValueError,TypeError): raise core.RvcServiceError(400,'CHORUS_INVALID_PARAMETER') from None
        if core.active_training_job_id: raise core.RvcServiceError(503,'RVC_TRAINING_ACTIVE')
        for param in params: core.find_model_path(param['modelId'])
        fingerprint=hashlib.sha256(json.dumps([job_id,params,gain,mute,core.PIPELINE_REVISION],sort_keys=True).encode()).hexdigest()
        out_id,record,created=await core.reserve_conversion_job(request_id,fingerprint,'mp3','chorus')
        if created:
            # Keep the source alive until the child conversion has finished.
            parent.expires_at=max(parent.expires_at,record.expires_at)
            record.state=record.stage='queued'; core.persist_output_records()
            await track_task(asyncio.create_task(convert_job(out_id,job_id,params,gain,mute)))
        return response(out_id,record)
