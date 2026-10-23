"""Before/after benchmark + screenshots. Same seeded scenes for any build.
Usage: URL=http://127.0.0.1:8796/ TAG=after python3 tests/bench.py
Per-frame draw calls / triangles are summed over every renderer.render() call in a frame (post passes included).
fps here is SwiftShader (software GPU) — only relative numbers mean anything; 'js ms' = main-thread cost per frame."""
import os, json, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://127.0.0.1:8796/'); TAG = os.environ.get('TAG', 'after')
OUT = os.environ.get('OUT', '/workspace/pirate-seas-3d-shots/overhaul/'); os.makedirs(OUT, exist_ok=True)
SHOTS = os.environ.get('SHOTS', '1') == '1'; GFX = os.environ.get('GFX', 'high,low').split(',')
ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
SEED = """(()=>{let s=12345;Math.random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();"""
CONF = [('desktop', dict(viewport={'width': 1280, 'height': 720})),
        ('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True))]
HOOK = """()=>{const R=__ps3d.renderer;if(R.__b)return;R.__b=1;
  if(__ps3d.setDyn) __ps3d.setDyn(1,true); // pin dynamic resolution at 100% so shots/metrics compare like for like
  if('frame' in __ps3d){window.__fs={};const lf=()=>{const f=__ps3d.frame;window.__fs.calls=f.calls;window.__fs.tris=f.tris;requestAnimationFrame(lf)};requestAnimationFrame(lf);return;}const o=R.render.bind(R);window.__fs={calls:0,tris:0,js:0,n:0};let cur={c:0,t:0};
  R.render=(s,c)=>{o(s,c);cur.c+=R.info.render.calls;cur.t+=R.info.render.triangles;};
  const loopF=()=>{window.__fs.calls=cur.c;window.__fs.tris=cur.t;cur={c:0,t:0};requestAnimationFrame(loopF)};requestAnimationFrame(loopF);}"""
SEA = """()=>{const g=__ps3d,p=g.player;g.start(true);p.x=300;p.z=1300;p.h=0.6;p.speed=6;g.setThrottle(0.6);
  const sh=g.ships.filter(s=>s!==p);const pl=[[-70,-60,1.2],[60,-150,2.4],[160,40,-0.4]];
  sh.forEach((s,i)=>{const q=pl[i%3];const[x,z]=p.toWorld(q[0],q[1]);s.x=x;s.z=z;s.h=q[2];s.throttle=0.4;s.ai.wp=[x+Math.cos(q[2])*-3000,z-Math.sin(q[2])*3000];});
  g.setLook(-0.55,0.05);}"""
def measure(pg, ms=5000):
    return pg.evaluate("""(ms)=>new Promise(res=>{let n=0;const t0=performance.now();const s0=__ps3d.step;
      function f(){n++; if(performance.now()-t0<ms) requestAnimationFrame(f); else { const a=performance.now(); for(let i=0;i<30;i++) s0(1/60); const sim=(performance.now()-a)/30;
        res({fps:n*1000/(performance.now()-t0), sim_ms:sim, calls:__fs.calls, tris:__fs.tris, low:__ps3d.LOW, canvas:__ps3d.renderer.domElement.width+'x'+__ps3d.renderer.domElement.height});}}
      requestAnimationFrame(f);})""", ms)
rows = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for name, kw in CONF:
        for gfx in GFX:
            ctx = b.new_context(**kw); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.add_init_script(SEED + f"localStorage.setItem('ps3d_settings_v1', JSON.stringify({{gfx:'{gfx}',cam:'third',sound:false,sens:1}}))")
            pg.goto(URL); pg.wait_for_function("()=>window.__ps3d && !document.getElementById('boot')", timeout=90000)
            pg.evaluate(HOOK); pg.wait_for_timeout(2500)
            if SHOTS: pg.screenshot(path=f'{OUT}{TAG}_{name}_{gfx}_title.png')
            pg.evaluate(SEA); pg.wait_for_timeout(3000)
            r = measure(pg); r.update(cfg=name, gfx=gfx, scene='sea'); rows.append(r); print(json.dumps(r), flush=True)
            if SHOTS:
                pg.screenshot(path=f'{OUT}{TAG}_{name}_{gfx}_sea.png')
                pg.evaluate("()=>{const g=__ps3d;g.setLook(0.25,0.35);}"); pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}{TAG}_{name}_{gfx}_sea2.png')
                pg.evaluate("()=>{const g=__ps3d,p=g.player,e=g.ships.find(s=>s!==p);const[x,z]=p.toWorld(45,-10);e.x=x;e.z=z;e.h=p.h;e.speed=p.speed;g.setLook(-1.25,0.1);g.fire('star');}"); pg.wait_for_timeout(900); pg.screenshot(path=f'{OUT}{TAG}_{name}_{gfx}_combat.png')
                pg.evaluate("()=>__ps3d.setCam('first')"); pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}{TAG}_{name}_{gfx}_first.png'); pg.evaluate("()=>__ps3d.setCam('third')")
                pg.evaluate("()=>__ps3d.dock()"); pg.wait_for_timeout(2500)
                r = measure(pg, 3000); r.update(cfg=name, gfx=gfx, scene='port'); rows.append(r); print(json.dumps(r), flush=True)
                pg.screenshot(path=f'{OUT}{TAG}_{name}_{gfx}_port.png')
            if errs: print('ERRORS', errs[:3])
            ctx.close()
    b.close()
json.dump(rows, open(f'{OUT}{TAG}_bench.json', 'w'), indent=1)
