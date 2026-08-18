# This service is intentionally separate from GitHub Pages and Cloudflare Workers:
# voice inference needs an NVIDIA GPU and must never expose its gateway token to browsers.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ARG COSYVOICE_COMMIT=074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/opt/postprep-voice:/opt/CosyVoice:/opt/CosyVoice/third_party/Matcha-TTS

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.10 python3-pip git ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# The pinned CosyVoice requirements install their tested Torch 2.3.1 / CUDA
# 12.1 pair. The host's newer NVIDIA driver and CUDA 12.4 runtime image remain
# backward-compatible; keeping the upstream pair avoids a now-unavailable
# CUDA 12.4 cuDNN wheel dependency. The pinned Whisper release imports
# pkg_resources during its build, so a compatible setuptools stays available.
RUN git clone https://github.com/FunAudioLLM/CosyVoice.git /opt/CosyVoice \
    && cd /opt/CosyVoice \
    && git checkout --detach ${COSYVOICE_COMMIT} \
    && git submodule update --init --recursive \
    && python3 -m pip install --upgrade "pip<26" "setuptools<81" wheel \
    && python3 -m pip install --no-build-isolation -r requirements.txt

WORKDIR /opt/postprep-voice
COPY requirements-postprep.txt ./
RUN python3 -m pip install -r requirements-postprep.txt
COPY app ./app

EXPOSE 8080
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
