"""Web preview of the pixel Android app: python3 preview/build.py [OUT] (default preview/out/index.html).
The same page the APK ships (pet/ -> build_html.py --pet -> native.js), with native-stub.js in place of the
Android bridge and the Handjet fonts inlined, so it opens as one HTML file in a browser or as a claude.ai Artifact."""
import base64, json, os, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "out", "index.html")
rd = lambda p: open(os.path.join(root, p), encoding="utf-8").read()
subprocess.run([sys.executable, os.path.join(root, "pet", "build.py")], check=True)
with tempfile.TemporaryDirectory() as t:
    subprocess.run([sys.executable, os.path.join(root, "build_html.py"), os.path.join(root, "pet", "index.html"), os.path.join(t, "index.html"), "--pet"], check=True)
    s = open(os.path.join(t, "index.html"), encoding="utf-8").read()
for f in ["handjet-cyrillic", "handjet-latin"]:
    b = base64.b64encode(open(os.path.join(root, "flavors", "pet", "assets", "fonts", f + ".woff2"), "rb").read()).decode()
    assert s.count(f"url(fonts/{f}.woff2)") == 1
    s = s.replace(f"url(fonts/{f}.woff2)", f"url(data:font/woff2;base64,{b})")
try: rev = subprocess.run(["git", "-C", root, "log", "-1", "--format=%h %cd", "--date=format:%d.%m %H:%M"], capture_output=True, text=True).stdout.strip()
except Exception: rev = ""
badge = ('<div id="pvBadge" style="position:fixed;left:50%;transform:translateX(-50%);top:env(safe-area-inset-top,0px);z-index:9999;'
         'font:11px/1.3 monospace;background:rgba(0,0,0,.6);color:#fff;padding:1px 6px;border-radius:0 0 4px 4px;opacity:.75;pointer-events:none;white-space:nowrap">'
         'превью ' + rev.split()[0] + '</div>')
tag = '<script src="native.js"></script>'
assert s.count(tag) == 1
s = s.replace(tag, "<script>\n" + rd("preview/native-stub.js") + "</script><script>\n" + rd("assets/native.js") + "</script>")
# the app's own runtime under its own name, so the claude.ai runtime (window.claude, used by the stub for AI) is never replaced
for old, n in [("window.claude = {use:", 1), ("if (!window.claude || !window.claude.use)", 1), ('[claude.use("db"), claude.use("sample")]', 1)]:
    assert s.count(old) == n, old
    s = s.replace(old, old.replace("window.claude", "window.__app").replace("claude.use", "__app.use"))
# the app runs inside a phone-sized frame: full screen on a phone, a 390×844 phone in the middle of a wider screen
app = json.dumps(s).replace("</", "<\\/")
s = ('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
     '<title>Пиксельный дневник</title><style>html,body{margin:0;height:100%;background:#2A2D33;overflow:hidden}'
     '#phone{position:fixed;inset:0;width:100%;height:100%;border:0;display:block;background:#fff}'
     '@media (min-width:560px) and (min-height:600px){#phone{inset:auto;left:50%;top:50%;width:390px;height:min(844px,calc(100% - 40px));transform:translate(-50%,-50%);'
     'border:10px solid #111;border-radius:28px;box-shadow:0 10px 40px rgba(0,0,0,.5)}}</style></head><body>'
     '<iframe id="phone" title="Пиксельный дневник"></iframe>' + badge +
     '<script>' + rd("preview/outer.js") + '\ndocument.getElementById("phone").srcdoc = ' + app + ';</script></body></html>')
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
open(out, "w", encoding="utf-8").write(s)
print("preview", out, len(s))
