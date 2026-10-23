"""FPS check: fresh page per config, 4 s warm-up, 8 s measurement, CPU throttled via CDP.
Note: headless Chromium here renders with SwiftShader (software GPU), so rAF fps is GPU-bound and far
below real hardware; 'cpu ms' is the main-thread JS cost per frame (simulation + draw submission)."""
import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://127.0.0.1:8796/')
ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
CONF = [('desktop 1280x720', dict(viewport={'width': 1280, 'height': 720})),
        ('mobile 390x844 dpr3', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True))]
out = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for name, kw in CONF:
        for gfx in ['high', 'low']:
            for rate in [1, 4]:
                ctx = b.new_context(**kw); pg = ctx.new_page()
                pg.add_init_script(f"localStorage.setItem('ps3d_settings_v1', JSON.stringify({{gfx:'{gfx}',cam:'third',sound:false,sens:1}}))")
                pg.goto(URL); pg.wait_for_function("()=>window.__ps3d && !document.getElementById('boot')", timeout=60000)
                pg.evaluate("()=>{__ps3d.start(true);__ps3d.setThrottle(0.7)}")
                cdp = ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
                pg.wait_for_timeout(4000)
                r = pg.evaluate("""()=>new Promise(res=>{let n=0,cpu=0;const t0=performance.now();const R=__ps3d.renderer,orig=R.render.bind(R);
                  R.render=(s,c)=>{const a=performance.now();orig(s,c);cpu+=performance.now()-a;};
                  const s0=__ps3d.step;let simMs=0;
                  function f(){n++; if(performance.now()-t0<8000) requestAnimationFrame(f); else {R.render=orig;
                    const a=performance.now(); for(let i=0;i<60;i++) s0(1/60); simMs=(performance.now()-a)/60;
                    res({fps:n*1000/(performance.now()-t0), renderCallMs:cpu/n, simMs, low:__ps3d.LOW, calls:R.info.render.calls, tris:R.info.render.triangles, px:R.domElement.width+'x'+R.domElement.height});}}
                  requestAnimationFrame(f);})""")
                row = dict(cfg=name, gfx=gfx, cpu=f'{rate}x', fps=round(r['fps'], 1), sim_ms=round(r['simMs'], 2), render_call_ms=round(r['renderCallMs'], 2), canvas=r['px'], calls=r['calls'], tris=r['tris'])
                print(json.dumps(row), flush=True); out.append(row); ctx.close()
    b.close()
