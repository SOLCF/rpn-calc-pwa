"""Dev server for the PWA: serves this folder on 127.0.0.1:8765 with caching
disabled, so phones and browsers always get the latest edit.

    py tools/devserver.py          (or double-click serve.cmd)

The Tailscale preview (https://cold-f.tailf72775.ts.net/) proxies to it.
"""
import functools
import http.server
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{PORT}/ (Ctrl+C to stop)")
        httpd.serve_forever()
