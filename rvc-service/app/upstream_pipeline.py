"""Observed adapter derived from pinned RVC 8f2fdbf.

The two inference methods are vendored to make float interception reproducible.
See UPSTREAM_LICENSE.txt for the upstream MIT notice. No global monkeypatches.
"""
import os
from time import time as ttime
import faiss
import librosa
import numpy as np
import torch
import torch.nn.functional as F
from scipy import signal
from infer.hubert import extract_hubert_features
from tools.cuda_graph import cuda_graph_enabled, run_cuda_graph, get_cuda_graph_stats
from infer.vc.pipeline import Pipeline as PinnedPipeline, bh, ah, change_rms
from app.stage_evidence import observe
from app.retrieval_safety import validate_index, stable_retrieval
from app.inference_errors import InferenceStageError

UPSTREAM_PIPELINE_SHA256 = '020038b9348d41133c8db82f5b972be2bef8a4e37c1a99e05b37826cff947cff'


def synthesize(pipeline, owner, namespace, function, *inputs):
    backend = getattr(pipeline, 'synthesis_backend', 'eager')
    seed = getattr(pipeline, 'synthesis_seed', 20260823)
    try:
        if backend == 'eager':
            # Graph capture runs a stochastic generator repeatedly to warm up
            # before returning its first sample. Cold/warm real-audio replays
            # differed despite the same infer() seed. Keep feature graphs but
            # use one ordinary generator call, preserving its trained noise.
            result = function(*inputs)
            actual = 'eager'
        else:
            before = get_cuda_graph_stats(owner)
            result = run_cuda_graph(owner, namespace, function, *inputs)
            after = get_cuda_graph_stats(owner)
            actual = 'cuda-graph' if after['replays'] > before['replays'] else 'eager-fallback'
        pipeline.stage_records.append(dict(stage='synthesis-execution', backend=actual, seed=seed))
        return result
    except RuntimeError as error:
        raise InferenceStageError('synthesis', str(error)) from error


class ServicePipeline(PinnedPipeline):
    def vc(
        self,
        model,
        net_g,
        sid,
        audio0,
        pitch,
        pitchf,
        times,
        index,
        index_vectors,
        index_rate,
        version,
        protect,
    ):
        context = getattr(self, 'analysis_context', None)
        observe(self, 'model-input', audio0, sample_rate=self.sr,
                timeOriginSeconds=(context.first_frame/100 if context is not None else
                    self.time_origin_seconds + self.inner_start/self.sr - self.x_pad),
                paddingSamples=self.t_pad)
        feats = torch.from_numpy(audio0)
        if self.is_half:
            feats = feats.half()
        else:
            feats = feats.float()
        if feats.dim() == 2:  # double channels
            feats = feats.mean(-1)
        assert feats.dim() == 1, feats.dim()
        feats = feats.view(1, -1)
        padding_mask = torch.BoolTensor(feats.shape).to(self.device).fill_(False)

        t0 = ttime()
        if context is not None and context.prior_mean is not None:
            if context.conditioning_features is None:
                raise InferenceStageError('shared-conditioning', 'Missing actual retrieved/protected timeline')
            feats = torch.as_tensor(context.conditioning_features[None],device=self.device,
                dtype=torch.float16 if self.is_half else torch.float32)
            observe(self, 'protected-features', feats, source='prepare_priors; actual synthesis conditioning')
            observe(self, 'shared-prior-mean', context.prior_mean, source='prepare_priors')
            observe(self, 'shared-prior-logs', context.prior_logs, source='prepare_priors')
            p_len = feats.shape[1]
            if p_len != context.prior_mean.shape[-1]:
                raise InferenceStageError('shared-conditioning', 'Prior/feature timeline mismatch')
            t1 = ttime()
        else:
            with torch.no_grad():
                feats = (torch.as_tensor(context.features[None], device=self.device,
                         dtype=torch.float16 if self.is_half else torch.float32)
                         if context is not None else extract_hubert_features(
                    model,
                    feats.to(self.device),
                    version,
                    padding_mask=padding_mask,
                ))
            observe(self, 'hubert', feats, tensorDtype=str(feats.dtype))
            if protect < 0.5 and pitch is not None and pitchf is not None:
                feats0 = feats.clone()
            if (
                not isinstance(index, type(None))
                and not isinstance(index_vectors, type(None))
                and index_rate != 0
            ):
                npy = feats[0].cpu().numpy()
                if self.is_half:
                    npy = npy.astype("float32")

                score, ix = index.search(npy, k=8)
                npy, retrieval_stats = stable_retrieval(score, ix, index_vectors, npy)
                self.stage_records.append(dict(stage='retrieval-search', **retrieval_stats))

                if self.is_half:
                    npy = npy.astype("float16")
                feats = (
                    torch.from_numpy(npy).unsqueeze(0).to(self.device) * index_rate
                    + (1 - index_rate) * feats
                )

            observe(self, 'retrieved-features', feats, tensorDtype=str(feats.dtype))
            feats = F.interpolate(feats.permute(0, 2, 1), scale_factor=2).permute(0, 2, 1)
            if protect < 0.5 and pitch is not None and pitchf is not None:
                feats0 = F.interpolate(feats0.permute(0, 2, 1), scale_factor=2).permute(
                    0, 2, 1
                )
            t1 = ttime()
            p_len = audio0.shape[0] // self.window
            if feats.shape[1] < p_len:
                p_len = feats.shape[1]
                if pitch is not None and pitchf is not None:
                    pitch = pitch[:, :p_len]
                    pitchf = pitchf[:, :p_len]

            if protect < 0.5 and pitch is not None and pitchf is not None:
                pitchff = pitchf.clone()
                pitchff[pitchf > 0] = 1
                pitchff[pitchf < 1] = protect
                pitchff = pitchff.unsqueeze(-1)
                feats = feats * pitchff + feats0 * (1 - pitchff)
                feats = feats.to(feats0.dtype)
            observe(self, 'protected-features', feats, tensorDtype=str(feats.dtype))
        p_len = torch.tensor([p_len], device=self.device).long()
        with torch.no_grad():
            hasp = pitch is not None and pitchf is not None
            if hasp and context is not None:
                from app.timeline_synthesis import infer_with_timeline
                synthesized = infer_with_timeline(net_g, feats, p_len, pitch, pitchf, sid, context)
                self.stage_records.append(dict(stage='synthesis-execution',backend='eager-timeline',
                    seed=context.seed,absoluteFrame=context.first_frame,
                    phaseCycles=context.phase_cycles,latentNoise='absolute-frame',sourceNoise='absolute-sample'))
            elif hasp:
                synthesized = synthesize(
                    self,
                    net_g,
                    "rvc-synth-f0",
                    lambda phone, lengths, coarse, continuous, speaker: net_g.infer(
                        phone, lengths, coarse, continuous, speaker
                    )[0],
                    feats,
                    p_len,
                    pitch,
                    pitchf,
                    sid,
                )
            else:
                synthesized = synthesize(
                    self,
                    net_g,
                    "rvc-synth-no-f0",
                    lambda phone, lengths, speaker: net_g.infer(
                        phone, lengths, speaker
                    )[0],
                    feats,
                    p_len,
                    sid,
                )
            audio1 = synthesized[0, 0].data.cpu().float().numpy()
            observe(self, 'generator-float', audio1, sample_rate=self.native_sample_rate,
                    timeOriginSeconds=(context.first_frame/100 if context is not None else
                        self.time_origin_seconds + self.inner_start/self.sr - self.x_pad),
                    cropLeftSamples=context.crop_left if context is not None else self.t_pad_tgt,
                    cropRightSamples=(len(audio1)-context.crop_left-context.output_samples
                        if context is not None else self.t_pad_tgt))
            del hasp, synthesized
        del feats, p_len, padding_mask
        if torch.cuda.is_available() and not cuda_graph_enabled(self.device):
            torch.cuda.empty_cache()
        t2 = ttime()
        times[0] += t1 - t0
        times[2] += t2 - t1
        return audio1

    def pipeline(
        self,
        model,
        net_g,
        sid,
        audio,
        times,
        f0_up_key,
        f0_method,
        file_index,
        index_rate,
        if_f0,
        tgt_sr,
        resample_sr,
        rms_mix_rate,
        version,
        protect,
    ):
        fallback_reason = ''
        context = getattr(self, 'analysis_context', None)
        uses_shared_prior = context is not None and context.prior_mean is not None
        if uses_shared_prior:
            # Retrieval already ran on the absolute timeline in prepare_priors.
            # Do not recompute a side branch and report it as decoder input.
            index = index_vectors = None
            fallback_reason = 'retrieval belongs to shared-prior preparation'
            self.stage_records.append(dict(stage='retrieval-search',
                conditioningSource='prepare_priors', **(context.retrieval or {})))
        else:
            if (
                file_index != ""
                and os.path.exists(file_index)
                and index_rate != 0
            ):
                try:
                    index = faiss.read_index(file_index)
                    if not index.ntotal:
                        raise RuntimeError('Empty index')
                    index_vectors = index.reconstruct_n(0, index.ntotal)
                except (RuntimeError, OSError) as error:
                    fallback_reason = f'Index unavailable: {type(error).__name__}'
                    index = index_vectors = None
            else:
                index = index_vectors = None
                if index_rate:
                    fallback_reason = 'Index path unavailable'
        if index is not None:
            validate_index(index, index_vectors, 256 if version == 'v1' else 768)
        self.native_sample_rate = tgt_sr
        self.inner_start = 0
        self.stage_records.append(dict(stage='index-load', requested=bool(index_rate),
            actual=bool(context.retrieval and context.retrieval.get('actual')) if uses_shared_prior else index is not None, rate=index_rate,
            dimension=int(index.d) if index else None,
            ntotal=int(index.ntotal) if index else 0,
            featureVersion=version, fallbackReason=fallback_reason))
        context = getattr(self, 'analysis_context', None)
        if context is not None:
            from app.pitch_safety import quantize_pitch
            if not if_f0:
                raise ValueError('Timeline synthesis requires an F0 checkpoint')
            offsets = getattr(context, 'pitch_offsets', None)
            shift = f0_up_key if offsets is None else f0_up_key + offsets
            continuous = np.asarray(context.f0, dtype=np.float64)*2**(shift/12)
            pitch = torch.as_tensor(quantize_pitch(continuous)[None],device=self.device).long()
            pitchf = torch.as_tensor(continuous[None],device=self.device,dtype=torch.float32)
            speaker = torch.as_tensor([sid],device=self.device).long()
            generated = self.vc(model,net_g,speaker,audio,pitch,pitchf,times,
                                index,index_vectors,index_rate,version,protect)
            end = context.crop_left+context.output_samples
            if end > len(generated):
                raise InferenceStageError('timeline-crop','Missing real synthesis context')
            audio_opt = np.asarray(generated[context.crop_left:end],dtype=np.float32)
            if resample_sr >= 16000 and resample_sr != tgt_sr:
                raise ValueError('Timeline output is resampled once after joining')
            observe(self,'upstream-float',audio_opt,sample_rate=tgt_sr,
                    timeOriginSeconds=(context.first_frame+300)/100)
            self.stage_records.append(dict(stage='upstream-output',gain=1.,dtype='float32',
                sampleRate=tgt_sr,absoluteFrameStart=context.first_frame+300,
                realContext=True,tailPaddingSamples=0))
            return audio_opt
        audio = signal.filtfilt(bh, ah, audio)
        audio_pad = np.pad(audio, (self.window // 2, self.window // 2), mode="reflect")
        opt_ts = []
        if audio_pad.shape[0] > self.t_max:
            audio_sum = np.zeros_like(audio)
            for i in range(self.window):
                audio_sum += np.abs(audio_pad[i : i - self.window])
            for t in range(self.t_center, audio.shape[0], self.t_center):
                opt_ts.append(
                    t
                    - self.t_query
                    + np.where(
                        audio_sum[t - self.t_query : t + self.t_query]
                        == audio_sum[t - self.t_query : t + self.t_query].min()
                    )[0][0]
                )
        s = 0
        audio_opt = []
        t = None
        t1 = ttime()
        audio_pad = np.pad(audio, (self.t_pad, self.t_pad), mode="reflect")
        p_len = audio_pad.shape[0] // self.window
        sid = torch.tensor(sid, device=self.device).unsqueeze(0).long()
        pitch, pitchf = None, None
        if if_f0 == 1:
            pitch, pitchf = self.get_f0(
                audio_pad,
                p_len,
                f0_up_key,
                f0_method,
            )
            pitch = pitch[:p_len]
            pitchf = pitchf[:p_len]
            pitchf = pitchf.astype(np.float32)
            pitch = torch.tensor(pitch, device=self.device).unsqueeze(0).long()
            pitchf = torch.tensor(pitchf, device=self.device).unsqueeze(0).float()
        t2 = ttime()
        times[1] += t2 - t1
        for t in opt_ts:
            t = t // self.window * self.window
            self.inner_start = s
            if if_f0 == 1:
                audio_opt.append(
                    self.vc(
                        model,
                        net_g,
                        sid,
                        audio_pad[s : t + self.t_pad2 + self.window],
                        pitch[:, s // self.window : (t + self.t_pad2) // self.window],
                        pitchf[:, s // self.window : (t + self.t_pad2) // self.window],
                        times,
                        index,
                        index_vectors,
                        index_rate,
                        version,
                        protect,
                    )[self.t_pad_tgt : -self.t_pad_tgt]
                )
            else:
                audio_opt.append(
                    self.vc(
                        model,
                        net_g,
                        sid,
                        audio_pad[s : t + self.t_pad2 + self.window],
                        None,
                        None,
                        times,
                        index,
                        index_vectors,
                        index_rate,
                        version,
                        protect,
                    )[self.t_pad_tgt : -self.t_pad_tgt]
                )
            s = t
        self.inner_start = t or 0
        if if_f0 == 1:
            audio_opt.append(
                self.vc(
                    model,
                    net_g,
                    sid,
                    audio_pad[t:],
                    pitch[:, t // self.window :] if t is not None else pitch,
                    pitchf[:, t // self.window :] if t is not None else pitchf,
                    times,
                    index,
                    index_vectors,
                    index_rate,
                    version,
                    protect,
                )[self.t_pad_tgt : -self.t_pad_tgt]
            )
        else:
            audio_opt.append(
                self.vc(
                    model,
                    net_g,
                    sid,
                    audio_pad[t:],
                    None,
                    None,
                    times,
                    index,
                    index_vectors,
                    index_rate,
                    version,
                    protect,
                )[self.t_pad_tgt : -self.t_pad_tgt]
            )
        audio_opt = np.concatenate(audio_opt)
        if rms_mix_rate != 1:
            audio_opt = change_rms(audio, 16000, audio_opt, tgt_sr, rms_mix_rate)
        if tgt_sr != resample_sr >= 16000:
            audio_opt = librosa.resample(
                audio_opt, orig_sr=tgt_sr, target_sr=resample_sr
            )
        output_rate = resample_sr if resample_sr >= 16000 else tgt_sr
        observe(self, 'upstream-float', audio_opt, sample_rate=output_rate,
                timeOriginSeconds=self.time_origin_seconds)
        # Intermediate peak normalization and int16 conversion destroy the
        # original float evidence and can hide NaN as zeros. The final joined
        # master owns output headroom; never normalize individual chunks.
        self.stage_records.append(dict(stage='upstream-output', gain=1.0,
            dtype='float32', sampleRate=output_rate))
        audio_opt = np.asarray(audio_opt, dtype=np.float32)
        del pitch, pitchf, sid
        if torch.cuda.is_available() and not cuda_graph_enabled(self.device):
            torch.cuda.empty_cache()
        return audio_opt
