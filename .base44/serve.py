"""Static server for the single-file Memória Escola app.

Wraps Python's SimpleHTTPRequestHandler to keep the log clean: the preview proxy and
health probes routinely close the connection while the ~1.3 MB index.html is still being
written, which the stock handler reports as a full ConnectionResetError traceback.

Usage: python .base44/serve.py <port> <directory>
"""

import http.server
import socketserver
import sys
from functools import partial

IGNORED = (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)


class Handler(http.server.SimpleHTTPRequestHandler):
    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except IGNORED:
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except IGNORED:
            self.close_connection = True


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    directory = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = partial(Handler, directory=directory)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", port), handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
