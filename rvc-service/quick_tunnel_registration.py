"""Loopback-only registration bridge for cloudflared on proxied Windows hosts.

cloudflared's quick-registration transport does not use the system proxy.
Forward only its fixed registration request; never proxy arbitrary URLs or log
the returned tunnel credentials. The public tunnel still targets tunnel_proxy.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer

import socket

import requests

CLEAN_IPS = ['172.66.47.151', '172.66.47.152']
_orig_getaddrinfo = socket.getaddrinfo
active_clean_ip = CLEAN_IPS[0]


def patched_getaddrinfo(host, port, *args, **kwargs):
    if host == 'api.trycloudflare.com' and active_clean_ip:
        return _orig_getaddrinfo(active_clean_ip, port, *args, **kwargs)
    return _orig_getaddrinfo(host, port, *args, **kwargs)


socket.getaddrinfo = patched_getaddrinfo


def request_tunnel():
    global active_clean_ip
    for ip in CLEAN_IPS:
        active_clean_ip = ip
        try:
            s = requests.Session()
            s.trust_env = False
            res = s.post('https://api.trycloudflare.com/tunnel', timeout=10)
            if res.status_code == 200:
                return res
        except Exception:
            continue

    active_clean_ip = None
    try:
        s = requests.Session()
        s.trust_env = True
        res = s.post('https://api.trycloudflare.com/tunnel', timeout=15)
        if res.status_code == 200:
            return res
    except Exception:
        pass
    return None


class RegistrationHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        if self.path != '/tunnel' or self.headers.get('Origin'):
            self.send_error(403)
            return
        upstream = request_tunnel()
        if upstream is not None and upstream.status_code == 200:
            self.send_response(upstream.status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(upstream.content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(upstream.content)
        else:
            status = upstream.status_code if upstream else 502
            self.send_error(status, 'Registration unavailable')


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 8091), RegistrationHandler).serve_forever()

