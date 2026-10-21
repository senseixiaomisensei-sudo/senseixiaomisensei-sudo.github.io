"""Loopback-only, proxy-independent registration bridge for cloudflared.

cloudflared's quick-registration transport does not use the system proxy.
Forward only its fixed registration request; never proxy arbitrary URLs or log
the returned tunnel credentials. The public tunnel still targets tunnel_proxy.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests


def request_tunnel():
    # Windows registry proxies are also ignored when trust_env is false.
    for _ in range(2):
        try:
            with requests.Session() as session:
                session.trust_env = False
                response = session.post('https://api.trycloudflare.com/tunnel', timeout=(5, 15))
                if response.status_code == 200:
                    return response
        except requests.RequestException:
            continue
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

