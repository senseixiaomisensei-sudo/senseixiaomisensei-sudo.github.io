# Pinned official RVC inference service. NVIDIA container runtime required.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ARG RVC_COMMIT=8f2fdbf483955f924b4c87ab34919170d0b704ed
ARG HF_REVISION=e6d0c1a17da07c33557852f9dfa2bd44cc75737d

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/opt/rvc-service \
    RVC_OFFICIAL_ROOT=/opt/rvc-official

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

RUN git clone --filter=blob:none --no-checkout https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git ${RVC_OFFICIAL_ROOT} \
    && git -C ${RVC_OFFICIAL_ROOT} fetch --depth 1 origin ${RVC_COMMIT} \
    && git -C ${RVC_OFFICIAL_ROOT} checkout --detach ${RVC_COMMIT} \
    && test "$(git -C ${RVC_OFFICIAL_ROOT} rev-parse HEAD)" = "${RVC_COMMIT}" \
    && printf '%s\n' "${RVC_COMMIT}" > ${RVC_OFFICIAL_ROOT}/.postprep-rvc-commit \
    && mkdir -p ${RVC_OFFICIAL_ROOT}/assets/hubert_base \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/hubert_base/config.json?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/hubert_base/config.json \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/hubert_base/preprocessor_config.json?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/hubert_base/preprocessor_config.json \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/hubert_base/pytorch_model.bin?download=true" -o ${RVC_OFFICIAL_ROOT}/assets/hubert_base/pytorch_model.bin \
    && echo "cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5  ${RVC_OFFICIAL_ROOT}/assets/hubert_base/pytorch_model.bin" | sha256sum -c - \
    && curl -fL "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HF_REVISION}/rmvpe.pt?download=true" -o ${RVC_OFFICIAL_ROOT}/rmvpe.pt \
    && echo "6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193  ${RVC_OFFICIAL_ROOT}/rmvpe.pt" | sha256sum -c -
COPY app ./app

EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
