"""Narrow reverse proxy used by the temporary Cloudflare RVC tunnel.

Only the server-to-server RVC routes are exposed.  The proxy keeps the GPU
service bound to loopback and requires the same bearer token as the service,
so a leaked trycloudflare URL cannot be used to enumerate models or submit
audio without the Pages Function's server-side token.
"""

from __future__ import annotations

import hmac
import http.client
import http.server
import os
import re
import sys
import threading
from urllib.parse import parse_qs, urlsplit


LISTEN_HOST = os.getenv("RVC_PROXY_HOST", "127.0.0.1")
LISTEN_PORT = int(os.getenv("RVC_PROXY_PORT", "8090"))
UPSTREAM_HOST = os.getenv("RVC_UPSTREAM_HOST", "127.0.0.1")
UPSTREAM_PORT = int(os.getenv("RVC_UPSTREAM_PORT", "8088"))
TOKEN = os.getenv("RVC_GATEWAY_TOKEN", "").strip()
MAX_BODY_BYTES = 26 * 1024 * 1024
MAX_TTS_BODY_BYTES = 8 * 1024
JOB_RE = re.compile(r"^/v1/output/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", re.I)
TRAIN_JOB_RE = re.compile(r"^/v1/training/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", re.I)
TRAIN_ACTION_RE = re.compile(
    r"^/v1/training/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(?:start|cancel)$",
    re.I,
)
TRAIN_UPLOAD_RE = re.compile(
    r"^/v1/training/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/audio/(?:[0-9]|1[0-9])$",
    re.I,
)
OUTPUT_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def _read_chunked(reader, max_bytes: int = MAX_BODY_BYTES) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        line = reader.readline(8192)
        if not line:
            raise ValueError("incomplete chunked body")
        try:
            size = int(line.split(b";", 1)[0].strip(), 16)
        except ValueError as exc:
            raise ValueError("invalid chunk size") from exc
        if size == 0:
            # Consume optional trailers and the terminating blank line.
            while True:
                trailer = reader.readline(8192)
                if not trailer or trailer in (b"\r\n", b"\n"):
                    return b"".join(chunks)
        total += size
        if total > max_bytes:
            raise OverflowError("request body too large")
        chunk = reader.read(size)
        if len(chunk) != size or reader.read(2) != b"\r\n":
            raise ValueError("incomplete chunked body")
        chunks.append(chunk)


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # pragma: no cover - operational logging
        # Never log query strings because output URLs contain one-time tokens.
        sys.stderr.write("rvc-proxy: " + (fmt % args) + "\n")

    def _json_error(self, status: int, code: str) -> None:
        body = (f'{{"code":"{code}","details":{{}}}}').encode("utf-8")
        self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=UTF-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if len(TOKEN) < 32:
            return False
        provided = self.headers.get("Authorization", "")
        return hmac.compare_digest(provided, f"Bearer {TOKEN}")

    def _target(self) -> str | None:
        parsed = urlsplit(self.path)
        if parsed.path in {"/healthz", "/v1/models", "/v1/tts-health"}:
            return parsed.path if not parsed.query else None
        if parsed.path == "/v1/tts":
            return parsed.path if self.command == "POST" and not parsed.query else None
        if parsed.path == "/v1/convert":
            return parsed.path if self.command == "POST" and not parsed.query else None
        if parsed.path == "/v1/training/init":
            return parsed.path if self.command == "POST" and not parsed.query else None
        if JOB_RE.fullmatch(parsed.path) and self.command == "GET":
            values = parse_qs(parsed.query, keep_blank_values=True)
            token_values = values.get("token", [])
            if len(token_values) == 1 and OUTPUT_TOKEN_RE.fullmatch(token_values[0]):
                return f"{parsed.path}?token={token_values[0]}"
        if (
            (TRAIN_JOB_RE.fullmatch(parsed.path) and self.command == "GET")
            or (TRAIN_ACTION_RE.fullmatch(parsed.path) and self.command == "POST")
            or (TRAIN_UPLOAD_RE.fullmatch(parsed.path) and self.command == "POST")
        ):
            values = parse_qs(parsed.query, keep_blank_values=True)
            token_values = values.get("token", [])
            if len(token_values) == 1 and OUTPUT_TOKEN_RE.fullmatch(token_values[0]):
                return f"{parsed.path}?token={token_values[0]}"
        return None

    def _body(self) -> bytes:
        max_bytes = MAX_TTS_BODY_BYTES if urlsplit(self.path).path == "/v1/tts" else MAX_BODY_BYTES
        transfer_encoding = self.headers.get("Transfer-Encoding", "").lower()
        if "chunked" in transfer_encoding:
            return _read_chunked(self.rfile, max_bytes)
        value = self.headers.get("Content-Length")
        if value is None:
            raise ValueError("missing content length")
        try:
            length = int(value)
        except ValueError as exc:
            raise ValueError("invalid content length") from exc
        if length < 0 or length > max_bytes:
            raise OverflowError("request body too large")
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError("incomplete request body")
        return body

    def _forward(self) -> None:
        if not self._authorized():
            self._json_error(401, "UNAUTHORIZED")
            return
        target = self._target()
        if target is None:
            self._json_error(404, "ROUTE_NOT_EXPOSED")
            return
        body = b""
        if self.command == "POST":
            try:
                body = self._body()
            except OverflowError:
                self._json_error(413, "RVC_AUDIO_TOO_LARGE")
                return
            except ValueError:
                self._json_error(400, "INVALID_REQUEST_BODY")
                return

        headers = {
            "Authorization": f"Bearer {TOKEN}",
            "Host": f"{UPSTREAM_HOST}:{UPSTREAM_PORT}",
            "Connection": "close",
        }
        if self.command == "POST":
            content_type = self.headers.get("Content-Type", "")
            expected_type = "application/json" if urlsplit(self.path).path == "/v1/tts" else "multipart/form-data"
            if not content_type.lower().startswith(expected_type):
                self._json_error(415, "UNSUPPORTED_MEDIA_TYPE")
                return
            headers["Content-Type"] = content_type
            headers["Content-Length"] = str(len(body))
        request_id = self.headers.get("X-PostPrep-Request-Id", "")
        if request_id and len(request_id) <= 96:
            headers["X-PostPrep-Request-Id"] = request_id

        connection = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=190)
        try:
            connection.request(self.command, target, body=body if self.command == "POST" else None, headers=headers)
            response = connection.getresponse()
            self.close_connection = True
            self.send_response(response.status, response.reason)
            content_length = response.getheader("Content-Length")
            for key in ("Content-Type", "Cache-Control", "Content-Disposition", "X-Content-Type-Options", "Retry-After"):
                value = response.getheader(key)
                if value:
                    self.send_header(key, value)
            if content_length:
                self.send_header("Content-Length", content_length)
            self.send_header("Connection", "close")
            self.end_headers()
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (OSError, http.client.HTTPException):
            if not self.wfile.closed:
                self._json_error(502, "UPSTREAM_UNAVAILABLE")
        finally:
            connection.close()

    do_GET = _forward
    do_POST = _forward


def main() -> None:
    if len(TOKEN) < 32:
        raise SystemExit("RVC_GATEWAY_TOKEN must contain at least 32 characters")
    server = http.server.ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    server.daemon_threads = True
    print(f"RVC proxy listening on {LISTEN_HOST}:{LISTEN_PORT}; upstream is loopback-only", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
