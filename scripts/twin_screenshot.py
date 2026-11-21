"""Screenshot the app headlessly, 3D scenes included (a dev tool for the Signal Chain twin).

Headless Firefox's --screenshot fires at the load event, never runs requestAnimationFrame
and doesn't composite WebGL. This proxy fixes all three. It serves the app (running on
APP_PORT) on PROXY_PORT and injects a script into index.html that:
  - drives requestAnimationFrame with a timer
  - forces preserveDrawingBuffer on WebGL contexts, and after CAPTURE_S seconds copies each
    WebGL canvas into a 2D canvas overlay (and prints how many pixels it drew)
  - prints JS errors, rejections and console.error in a red box at the bottom
  - points the app's WebSocket at the real server
/__wrap is a page that embeds the app and holds its load event for DELAY seconds, so the
screenshot waits.

    # 1. a server on a COPY of the database
    cp data/adventure.db /tmp/copy.db
    ADVENTURE_DB_PATH=/tmp/copy.db python -m uvicorn server:app --port 8766 &
    # 2. show the panel you want (the layout lives in server memory)
    curl -XPUT localhost:8766/api/workspace/layout -H 'Content-Type: application/json' \\
         -d '{"tree":{"id":"root","type":"leaf","tabs":["signal_chain"],"activeTab":"signal_chain"}}'
    # 3. this proxy, then the screenshot (a profile with WebGL forced on; see below)
    python3 scripts/twin_screenshot.py &          # DELAY=7 W=1500 H=900 by default
    firefox --headless --profile /tmp/ffprof --no-remote --window-size=1500,900 \\
            --screenshot /tmp/shot.png http://localhost:8799/__wrap

/tmp/ffprof/user.js:
    user_pref("webgl.force-enabled", true);
    user_pref("webgl.disabled", false);
    user_pref("gfx.webrender.software", true);
    user_pref("layers.acceleration.force-enabled", true);

To catch packets in flight, make moves through the API about 5 s after starting Firefox.
Stop background servers by PID: `pkill -f` matches the shell running it and kills that too.
"""
import http.server
import os
import time
import urllib.request

APP_PORT = int(os.environ.get("APP_PORT", 8766))
PROXY_PORT = int(os.environ.get("PROXY_PORT", 8799))
DELAY = float(os.environ.get("DELAY", 7))
CAPTURE_S = float(os.environ.get("CAPTURE_S", 5.5))
W, H = os.environ.get("W", "1500"), os.environ.get("H", "900")

WRAP = f"""<!doctype html><html><body style="margin:0;background:#000">
<iframe src="/" style="border:0;width:{W}px;height:{H}px"></iframe>
<img src="/__slow" style="position:absolute;width:1px;height:1px"></body></html>""".encode()

HOOK = ("""<script>(function(){var box;function show(m){if(!box){box=document.createElement('pre');
box.style.cssText='position:fixed;left:0;bottom:0;right:0;max-height:45%;overflow:auto;z-index:99999;background:#300;color:#fbb;font:11px monospace;margin:0;padding:4px;white-space:pre-wrap';
(document.body||document.documentElement).appendChild(box);}box.textContent+=m+'\\n';}
window.addEventListener('error',function(e){show('ERR '+e.message+' @'+(e.filename||'')+':'+e.lineno+'\\n'+(e.error&&e.error.stack||''))});
window.addEventListener('unhandledrejection',function(e){show('REJ '+(e.reason&&e.reason.stack||e.reason))});
var gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){if(/webgl/.test(t)){o=Object.assign({},o,{preserveDrawingBuffer:true})}
var c=gc.call(this,t,o);if(/webgl/.test(t)&&!c)console.error('no '+t+' context');return c};
window.requestAnimationFrame=function(cb){return setTimeout(function(){cb(performance.now())},16)};window.cancelAnimationFrame=function(id){clearTimeout(id)};
setTimeout(function(){document.querySelectorAll('canvas').forEach(function(c){var gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return;
var r=c.getBoundingClientRect(),px=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,px);var n=0;for(var i=3;i<px.length;i+=4)if(px[i]>0)n++;
var o=document.createElement('canvas');o.width=c.width;o.height=c.height;o.style.cssText='position:fixed;pointer-events:none;z-index:5;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px';
o.getContext('2d').drawImage(c,0,0);document.body.appendChild(o);show('canvas '+c.width+'x'+c.height+' drawn px: '+n);});},CAPTURE_MS);
var WS=window.WebSocket;window.WebSocket=function(u,p){return new WS(String(u).replace(':PROXY',':APP'),p)};window.WebSocket.prototype=WS.prototype;
['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){window.WebSocket[k]=WS[k]});
var ce=console.error;console.error=function(){show('CE '+Array.prototype.map.call(arguments,function(a){return a&&a.stack||String(a)}).join(' '));ce.apply(console,arguments)};})();</script>"""
        .replace("CAPTURE_MS", str(int(CAPTURE_S * 1000)))
        .replace(":PROXY", f":{PROXY_PORT}").replace(":APP", f":{APP_PORT}")).encode()


class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, body, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/__slow":
            time.sleep(DELAY)
            return self._send(b"GIF89a", "image/gif")
        if self.path == "/__wrap":
            return self._send(WRAP, "text/html")
        with urllib.request.urlopen(f"http://127.0.0.1:{APP_PORT}{self.path}") as r:
            body, ctype = r.read(), r.headers.get("Content-Type", "")
        if self.path == "/":
            body = body.replace(b"<head>", b"<head>" + HOOK, 1)
        self._send(body, ctype)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PROXY_PORT), Handler).serve_forever()
