"""Extra checks: player sinking + respawn at port, save persistence, Auto graphics fallback, landscape phone layout."""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://127.0.0.1:8796/'); OUT = os.environ.get('OUT', '/workspace/pirate-seas-3d-shots/')
ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
fails = 0; n = 0
def check(name, ok, info=''):
    global fails, n; n += 1; fails += 0 if ok else 1; print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info != '' else ''), flush=True)
def ready(pg): pg.wait_for_function("()=>window.__ps3d && !document.getElementById('boot')", timeout=60000)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL); ready(pg)
    pg.evaluate("()=>__ps3d.start(true)")
    pg.evaluate("()=>{const p=__ps3d.player;p.x=0;p.z=1400;__ps3d.save.cargo={rum:5};__ps3d.save.gold=500;}")
    # Auto graphics: SwiftShader is slow, so Auto should fall back to Low within a few seconds of play
    pg.wait_for_timeout(6000); check('Auto drops to Low when fps stays low', pg.evaluate("()=>__ps3d.LOW"), pg.evaluate("()=>__ps3d.fps|0"))
    # sink the player
    pg.evaluate("()=>{const p=__ps3d.player;p.throttle=0;__ps3d.damage(p, 999);}")
    pg.evaluate("()=>{for(let i=0;i<20;i++)__ps3d.step(0.05)}")
    check('player can be sunk', pg.evaluate("()=>!!__ps3d.player.sinking"))
    pg.wait_for_timeout(4200); check('sunk screen', pg.is_visible('#sunk'))
    pg.screenshot(path=OUT + 'sunk.png')
    pg.click('#reBtn'); pg.wait_for_timeout(600)
    s = pg.evaluate("()=>({st:__ps3d.state,hp:__ps3d.player.hp,gold:__ps3d.save.gold,cargo:Object.keys(__ps3d.save.cargo).length})")
    check('respawn docked at port, cargo lost, 10% gold fine', s['st'] == 'port' and s['hp'] == 160 and s['cargo'] == 0 and s['gold'] == 450, s)
    pg.click('#castOff')
    # persistence
    pg.evaluate("()=>{__ps3d.save.gold=777;__ps3d.save.kills=4;}"); pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    pg.evaluate("()=>window.dispatchEvent(new Event('pagehide'))"); pg.wait_for_timeout(300)
    raw = pg.evaluate("()=>localStorage.getItem('ps3d_save_v1')")
    pg.reload(); ready(pg)
    t = pg.inner_text('#playBtn'); check('save persists (Continue shows gold)', '777' in t, f'{t} | saved={raw[:80] if raw else raw}')
    check('no console errors', not errs, errs[:4]); ctx.close()
    # landscape phone
    lc = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
    lp = lc.new_page(); lp.goto(URL); ready(lp); lp.tap('#playBtn'); lp.wait_for_timeout(1500)
    boxes = {k: lp.locator(k).bounding_box() for k in ['#stick', '#fireP', '#fireS', '#lever', '#camBtn', '#map', '#stats', '#speedo']}
    def ov(a, c): return not (a['x'] + a['width'] <= c['x'] or c['x'] + c['width'] <= a['x'] or a['y'] + a['height'] <= c['y'] or c['y'] + c['height'] <= a['y'])
    ks = list(boxes); bad = [(x, y) for i, x in enumerate(ks) for y in ks[i+1:] if boxes[x] and boxes[y] and ov(boxes[x], boxes[y])]
    inside = [k for k, v in boxes.items() if v and not (v['x'] >= 0 and v['y'] >= 0 and v['x'] + v['width'] <= 844 and v['y'] + v['height'] <= 390)]
    check('landscape phone: no overlaps, all on screen', not bad and not inside, {'overlap': bad, 'offscreen': inside})
    lp.screenshot(path=OUT + 'mobile_landscape.png'); lc.close(); b.close()
print(f'{n - fails}/{n} passed'); sys.exit(1 if fails else 0)
