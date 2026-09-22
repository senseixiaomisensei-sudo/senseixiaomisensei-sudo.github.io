"""Loopback-only registration bridge for cloudflared on proxied Windows hosts.

cloudflared's quick-registration transport does not use the system proxy.
Forward only its fixed registration request; never proxy arbitrary URLs or log
the returned tunnel credentials. The public tunnel still targets tunnel_proxy.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests


class RegistrationHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        if self.path != '/tunnel' or self.headers.get('Origin'):
            self.send_error(403)
            return
        try:
            upstream = requests.post('https://api.trycloudflare.com/tunnel', timeout=25)
            self.send_response(upstream.status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(upstream.content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(upstream.content)
        except requests.RequestException:
            self.send_error(502, 'Registration unavailable')


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 8091), RegistrationHandler).serve_forever()
