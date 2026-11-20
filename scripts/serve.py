#!/usr/bin/env python3
"""Local preview server that behaves like Cloudflare Pages:
  /            -> index.html
  /about       -> about.html
  /about.html  -> redirects to /about
  unknown      -> 404.html with status 404

Usage: python3 scripts/serve.py [port]   (default 8417)
"""
import http.server, os, sys
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8417


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        parts = urlsplit(self.path)
        path = parts.path
        query = ('?' + parts.query) if parts.query else ''
        # Old .html addresses redirect to the clean one, like Cloudflare Pages does
        if path.endswith('.html'):
            clean = path[:-5]
            clean = '/' if clean in ('/index', '') else clean
            self.send_response(308)
            self.send_header('Location', clean + query)
            self.end_headers()
            return
        local = os.path.join(ROOT, path.lstrip('/'))
        if path != '/' and not os.path.splitext(path)[1] and os.path.isfile(local + '.html'):
            self.path = path + '.html' + query
        elif path != '/' and not os.path.exists(local):
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            with open(os.path.join(ROOT, '404.html'), 'rb') as f:
                self.wfile.write(f.read())
            return
        super().do_GET()


if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()
