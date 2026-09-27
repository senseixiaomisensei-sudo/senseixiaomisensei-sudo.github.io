"""Deterministic absolute-time excitation for overlapping RVC windows."""
import numpy as np


def counter_gaussian(seed, positions, stream=0):
    positions = np.asarray(positions).astype(np.uint32)
    stream = np.asarray(stream).astype(np.uint32)
    def uniform(channel):
        with np.errstate(over='ignore'):
            value = np.uint32(seed) ^ (positions*np.uint32(0x9e3779b1)) ^ (channel*np.uint32(0x85ebca6b))
            value = (value ^ (value >> 16))*np.uint32(0x21f0aaad)
            value = (value ^ (value >> 15))*np.uint32(0x735a2d97)
            return (value ^ (value >> 15)).astype(np.float64)/4294967296
    first, second = uniform(stream*2), uniform(stream*2+1)
    return (np.sqrt(-2*np.log(np.maximum(1e-7, first)))*np.cos(2*np.pi*second)).astype(np.float32)


def source_excitation(f0, rate, first_frame, phase_cycles, seed=20260823):
    """Compute the original one-harmonic NSF source on an absolute clock.

    Integer phase-wrap subtractions in upstream SineGen are immaterial to sin.
    Float64 accumulation avoids duration-dependent float32 rounding. Starting
    phase is taken from the same complete pitch track for every window.
    """
    upp = rate//100
    f0 = np.asarray(f0, dtype=np.float64)
    increments = np.repeat(f0/rate, upp)
    phase = np.cumsum(increments, dtype=np.float64) + phase_cycles
    sine = (.1*np.sin(2*np.pi*np.remainder(phase, 1))).astype(np.float32)
    voiced = np.repeat(f0 > 0, upp)
    noise = counter_gaussian(seed ^ 0x534f5552,
                             first_frame*upp + np.arange(len(sine), dtype=np.int64))
    return sine*voiced + np.where(voiced, .003, .1/3)*noise


def infer_with_timeline(net, phone, lengths, coarse, continuous, speaker, context):
    """Checkpoint equations with explicit latent noise and shared NSF phase."""
    import torch
    from torch.nn import functional as F
    decoder = net.dec
    if decoder.m_source.l_sin_gen.dim != 1:
        raise ValueError('Unverified multi-harmonic timeline generator')
    g = net.emb_g(speaker).unsqueeze(-1)
    if getattr(context,'prior_mean',None) is None:
        mean, logs, mask = net.enc_p(phone, coarse, lengths)
    else:
        mean=torch.as_tensor(context.prior_mean[None],device=phone.device,dtype=phone.dtype)
        logs=torch.as_tensor(context.prior_logs[None],device=phone.device,dtype=phone.dtype)
        mask=torch.ones((1,1,mean.shape[-1]),device=phone.device,dtype=phone.dtype)
    first = context.first_frame
    noise = counter_gaussian(context.seed,
        first+np.arange(mean.shape[-1], dtype=np.int64)[None,:],
        np.arange(mean.shape[1], dtype=np.uint32)[:,None])
    # official_runtime's model-scoped log-std hook already converts the
    # upstream .66666 multiplier to the profile noiseScale. Apply it once.
    rnd = torch.as_tensor(noise[None], device=mean.device, dtype=mean.dtype)
    prior = (mean + torch.exp(logs)*rnd*.66666)*mask
    latent = net.flow(prior, mask, g=g, reverse=True)*mask
    source = source_excitation(continuous[0].detach().cpu().numpy(),
        decoder.m_source.l_sin_gen.sampling_rate, first, context.phase_cycles, context.seed)
    source = torch.as_tensor(source[None,:,None], device=mean.device, dtype=mean.dtype)
    harmonic = decoder.m_source.l_tanh(decoder.m_source.l_linear(source)).transpose(1,2)
    x = decoder.conv_pre(latent) + decoder.cond(g)
    for stage in range(decoder.num_upsamples):
        x = decoder.ups[stage](F.leaky_relu(x, decoder.lrelu_slope))
        x = x + decoder.noise_convs[stage](harmonic)
        combined = decoder.resblocks[stage*decoder.num_kernels](x)
        for kernel in range(1,decoder.num_kernels):
            combined = combined + decoder.resblocks[stage*decoder.num_kernels+kernel](x)
        x = combined/decoder.num_kernels
    # The trained decoder uses PyTorch's default .01 slope at its final
    # activation; its upsampling blocks use .1. Keep those distinct.
    return torch.tanh(decoder.conv_post(F.leaky_relu(x)))
