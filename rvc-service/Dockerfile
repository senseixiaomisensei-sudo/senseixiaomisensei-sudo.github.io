# Pinned official RVC inference service. NVIDIA container runtime required.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ARG RVC_COMMIT=8f2fdbf483955f924b4c87ab34919170d0b704ed
ARG HF_REVISION=e6d0c1a17da07c33557852f9dfa2bd44cc75737d

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/opt/rvc-service \
    RVC_OFFICIAL_ROOT=/opt/rvc-official \
    RVC_SEPARATOR_MODELS_DIR=/opt/pymss-models \
    RVC_SEPARATOR_MODEL=model_bs_roformer_ep_368_sdr_12.9628.ckpt \
    RVC_SEPARATOR_DEVICE=cuda

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git curl ca-certificates ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

ENV PATH=/opt/venv/bin:${PATH}

RUN python -m pip install --upgrade pip \
    && python -m pip install torch==2.7.1+cu128 torchaudio==2.7.1+cu128 --index-url https://download.pytorch.org/whl/cu128

WORKDIR /opt/rvc-service
COPY requirements.txt ./
RUN python -m pip install -r requirements.txt
RUN python -m pymss.cli download model_bs_roformer_ep_368_sdr_12.9628.ckpt --model-dir ${RVC_SEPARATOR_MODELS_DIR} --source modelscope \
    && echo "f6c94864adfb73bbb0ca58ec14d58dd0b364549e9fb61433ae51916f3e2f8d0b  ${RVC_SEPARATOR_MODELS_DIR}/vocal/vocal_extraction/model_bs_roformer_ep_368_sdr_12.9628.ckpt" | sha256sum -c - \
    && echo "3dae086b481bc6adecccb6bdfd2386ffd78708e11c221876a146972cab5b2afe  ${RVC_SEPARATOR_MODELS_DIR}/vocal/vocal_extraction/model_bs_roformer_ep_368_sdr_12.9628.yaml" | sha256sum -c -

RUN git clone --filter=blob:none --no-checkout https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git ${RVC_OFFICIAL_ROOT} \
    && git -C ${RVC_OFFICIAL_ROOT} fetch --depth 1 origin ${RVC_COMMIT} \
    && git -C ${RVC_OFFICIAL_ROOT} checkout --detach ${RVC_COMMIT} \
    && test "$(git -C ${RVC_OFFICIAL_ROOT} rev-parse HEAD)" = "${RVC_COMMIT}" \
    && printf '%s\n' "${RVC_COMMIT}" > ${RVC_OFFICIAL_ROOT}/.postprep-rvc-commit \
    && mkdir -p ${RVC_OFFICIAL_ROOT}/assets/hubert_base ${RVC_OFFICIAL_ROOT}/assets/rmvpe ${RVC_OFFICIAL_ROOT}/assets/pretrained_v2 \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/hubert_base/config.json?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/hubert_base/config.json \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/hubert_base/preprocessor_config.json?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/hubert_base/preprocessor_config.json \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/hubert_base/pytorch_model.bin?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/hubert_base/pytorch_model.bin \
    && echo "cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5  ${RVC_OFFICIAL_ROOT}/assets/hubert_base/pytorch_model.bin" | sha256sum -c - \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/rmvpe.pt?download=true" -o ${RVC_OFFICIAL_ROOT}/rmvpe.pt \
    && echo "6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193  ${RVC_OFFICIAL_ROOT}/rmvpe.pt" | sha256sum -c - \
    && cp ${RVC_OFFICIAL_ROOT}/rmvpe.pt ${RVC_OFFICIAL_ROOT}/assets/rmvpe/rmvpe.pt \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/pretrained_v2/f0G40k.pth?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/pretrained_v2/f0G40k.pth \
    && echo "3b2c44035e782c4b14ddc0bede9e2f4a724d025cd073f736d4f43708453adfcb  ${RVC_OFFICIAL_ROOT}/assets/pretrained_v2/f0G40k.pth" | sha256sum -c - \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/pretrained_v2/f0D40k.pth?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/pretrained_v2/f0D40k.pth \
    && echo "6b6ab091e70801b28e3f41f335f2fc5f3f35c75b39ae2628d419644ec2b0fa09  ${RVC_OFFICIAL_ROOT}/assets/pretrained_v2/f0D40k.pth" | sha256sum -c -
COPY app ./app

EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
