"""HTTP contracts only; the upstream here is an echo server, not audio inference."""
import http.client,http.server,sys,threading,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
import tunnel_proxy as proxy

class Echo(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        payload=self.rfile.read(int(self.headers['Content-Length']))
        self.send_response(200);self.send_header('Content-Length',str(len(payload)))
        self.end_headers();self.wfile.write(payload)
    def do_GET(self):
        payload=self.headers.get('Range','').encode()
        self.send_response(206 if payload else 200)
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Content-Range','bytes 0-1023/4096')
        self.send_header('Accept-Ranges','bytes')
        self.end_headers();self.wfile.write(payload)

class ProxyContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old=(proxy.TOKEN,proxy.UPSTREAM_PORT)
        proxy.TOKEN='test-only-token-'+'x'*40
        cls.upstream=http.server.ThreadingHTTPServer(('127.0.0.1',0),Echo)
        proxy.UPSTREAM_PORT=cls.upstream.server_port
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),proxy.ProxyHandler)
        for server in (cls.upstream,cls.server):
            threading.Thread(target=server.serve_forever,daemon=True).start()
        cls.job='11111111-2222-3333-4444-555555555555'
        cls.query='?token='+'x'*40
    @classmethod
    def tearDownClass(cls):
        for server in (cls.server,cls.upstream):server.shutdown();server.server_close()
        proxy.TOKEN,proxy.UPSTREAM_PORT=cls.old
    def request(self,method,path,body=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        c.request(method,path,body=body,headers={'Authorization':'Bearer '+proxy.TOKEN,**(headers or {})})
        r=c.getresponse();result=(r.status,dict(r.getheaders()),r.read());c.close();return result
    def test_json_conversion_and_remix_reach_upstream_unchanged(self):
        for path in (f'/v1/chorus/{self.job}/convert',f'/v1/output/{self.job}/remix'):
            with self.subTest(path=path):
                status,_,payload=self.request('POST',path+self.query,b'{"gainDb":-6}',{'Content-Type':'application/json'})
                self.assertEqual(status,200);self.assertEqual(payload,b'{"gainDb":-6}')
        self.assertEqual(self.request('POST',f'/v1/chorus/{self.job}/convert'+self.query,b'{}',{'Content-Type':'multipart/form-data'})[0],415)
    def test_source_upload_preserves_multipart_body(self):
        status,_,body=self.request('POST','/v1/chorus/analyze',b'--boundary\r\nsource\r\n',{'Content-Type':'multipart/form-data; boundary=boundary'})
        self.assertEqual(status,200);self.assertEqual(body,b'--boundary\r\nsource\r\n')
    def test_preview_and_download_preserve_range_contract(self):
        for path in (f'/v1/chorus/{self.job}/stem/1',f'/v1/output/{self.job}'):
            status,headers,body=self.request('GET',path+self.query,headers={'Range':'bytes=0-1023'})
            self.assertEqual(status,206);self.assertEqual(body,b'bytes=0-1023')
            self.assertEqual(headers['Content-Range'],'bytes 0-1023/4096')
            self.assertEqual(headers['Accept-Ranges'],'bytes')
    def test_json_body_limit_remains_enforced(self):
        status,_,_=self.request('POST',f'/v1/chorus/{self.job}/convert'+self.query,b'x'*65537,{'Content-Type':'application/json'})
        self.assertEqual(status,413)

if __name__=='__main__':unittest.main()
