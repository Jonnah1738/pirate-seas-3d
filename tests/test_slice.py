"""Playwright tests for the Pirate Seas 3D slice.
Run: python3 -m http.server 8796 (in repo root), then  URL=http://127.0.0.1:8796/ python3 tests/test_slice.py
Screenshots go to $OUT (default /workspace/pirate-seas-3d-shots/)."""
import os, json, math, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://127.0.0.1:8796/'); OUT = os.environ.get('OUT', '/workspace/pirate-seas-3d-shots/')
os.makedirs(OUT, exist_ok=True)
ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
results = []; fails = 0; JSMS = []
def check(name, ok, info=''):
    global fails
    results.append((name, bool(ok), info)); fails += 0 if ok else 1
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(info) if info else ''), flush=True)
ADV = "(sec)=>{const n=Math.round(sec/0.05);for(let i=0;i<n;i++)__ps3d.step(0.05);}"
def adv(pg, sec): pg.evaluate(ADV, sec)
def P(pg): return pg.evaluate("()=>{const p=__ps3d.player;return {x:p.x,z:p.z,h:p.h,hp:p.hp,sp:p.speed,th:p.throttle,gold:__ps3d.save&&__ps3d.save.gold,cargo:__ps3d.save&&JSON.stringify(__ps3d.save.cargo),state:__ps3d.state,cam:__ps3d.cam,LOW:__ps3d.LOW}}")
def watch(pg):
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
    pg.on('console', lambda m: errs.append(m.type + ' ' + m.text) if m.type == 'error' else None)
    return errs
def fps_measure(pg, cdp, rate, secs=6):
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
    pg.wait_for_timeout(2500)
    v = pg.evaluate("(ms)=>new Promise(r=>{let n=0;const t0=performance.now();function f(){n++;if(performance.now()-t0<ms)requestAnimationFrame(f);else r(n*1000/(performance.now()-t0));}requestAnimationFrame(f);})", secs * 1000)
    js = pg.evaluate("()=>{const R=__ps3d.renderer,S=__ps3d.scene,C=__ps3d.camera;const t0=performance.now();for(let i=0;i<30;i++){__ps3d.step(1/60);R.render(S,C);}R.getContext().finish();return (performance.now()-t0)/30}")
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    JSMS.append((rate, round(js, 1)))
    return round(v, 1)

def clear_enemies(pg):
    pg.evaluate("()=>{for(const s of __ps3d.ships) if(s!==__ps3d.player) s.remove();}")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ---------------- desktop ----------------
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    pg = ctx.new_page(); errs = watch(pg)
    pg.goto(URL); pg.wait_for_function("()=>window.__ps3d && !document.getElementById('boot')", timeout=60000); pg.wait_for_timeout(2000)
    check('title visible', pg.is_visible('#title') and 'Pirate Seas' in pg.inner_text('#title h1, #title'))
    pg.evaluate("()=>localStorage.removeItem('ps3d_save_v1')")
    pg.screenshot(path=OUT + 'title.png')
    pg.click('#playBtn'); pg.wait_for_timeout(500)
    s = P(pg); check('play starts', s['state'] == 'play' and pg.is_visible('#hud'), s)
    # 0% holds position
    pg.evaluate("()=>__ps3d.setThrottle(0)"); a = P(pg); adv(pg, 8); bb = P(pg)
    d = math.hypot(bb['x'] - a['x'], bb['z'] - a['z']); check('0% throttle holds position', d < 2.0, f'drift {d:.2f} m in 8 s')
    pg.screenshot(path=OUT + 'third_person.png')
    # throttle keys
    for _ in range(10): pg.keyboard.press('KeyW')
    s = P(pg); check('W raises throttle to 100%', abs(s['th'] - 1) < 1e-6, s['th'])
    pg.keyboard.press('KeyS'); pg.wait_for_timeout(450); pg.keyboard.press('KeyS'); s = P(pg); check('S lowers in 10% steps', abs(s['th'] - 0.8) < 1e-6, s['th'])
    pg.keyboard.press('Equal'); s = P(pg); check('+ raises', abs(s['th'] - 0.9) < 1e-6, s['th'])
    pg.keyboard.press('Minus'); s = P(pg); check('- lowers', abs(s['th'] - 0.8) < 1e-6, s['th'])
    pg.click('#thFull'); s = P(pg); check('FULL button', s['th'] == 1, s['th'])
    adv(pg, 12); s = P(pg); check('ship gains speed', s['sp'] > 8, f"{s['sp']:.1f} m/s")
    pg.keyboard.press('KeyX'); s = P(pg); check('X stops', s['th'] == 0, s['th'])
    pg.click('#thFull'); pg.keyboard.press('KeyS'); pg.keyboard.press('KeyS'); s = P(pg); check('double-tap S stops', s['th'] == 0, s['th'])
    pg.click('#thFull'); pg.click('#thStop'); s = P(pg); check('STOP button', s['th'] == 0, s['th'])
    adv(pg, 25); s = P(pg); check('ship coasts to a stop', s['sp'] < 0.6, f"{s['sp']:.2f}")
    # steering
    pg.evaluate("()=>{const p=__ps3d.player;p.x=0;p.z=900;p.h=0;p.throttle=0.7;p.speed=8;}")
    h0 = P(pg)['h']; pg.keyboard.down('KeyD'); adv(pg, 3); pg.keyboard.up('KeyD'); h1 = P(pg)['h']
    check('D turns to starboard (heading decreases)', h1 < h0 - 0.2, f'{h0:.2f} -> {h1:.2f}')
    pg.keyboard.down('KeyA'); adv(pg, 3); pg.keyboard.up('KeyA'); h2 = P(pg)['h']; check('A turns to port', h2 > h1 + 0.2, f'{h1:.2f} -> {h2:.2f}')
    # camera
    pg.keyboard.press('KeyV'); s = P(pg); check('V -> first person', s['cam'] == 'first', s['cam'])
    pg.evaluate("()=>{const p=__ps3d.player;p.x=-300;p.z=700;p.h=-0.6;p.throttle=0.5;}"); adv(pg, 2)
    pg.evaluate("()=>__ps3d.setLook(0.25,-0.05)"); pg.wait_for_timeout(700); pg.screenshot(path=OUT + 'first_person.png')
    cp = pg.evaluate("()=>{const c=__ps3d.camera.position,p=__ps3d.player;return Math.hypot(c.x-p.x,c.z-p.z)}"); check('first-person camera on deck', cp < 12, f'{cp:.1f} m from centre')
    pg.click('#camBtn'); s = P(pg); check('camera button -> third person', s['cam'] == 'third', s['cam'])
    cp = pg.evaluate("()=>{const c=__ps3d.camera.position,p=__ps3d.player;return Math.hypot(c.x-p.x,c.z-p.z)}"); adv(pg, 1)
    cp = pg.evaluate("()=>{const c=__ps3d.camera.position,p=__ps3d.player;return Math.hypot(c.x-p.x,c.z-p.z)}"); check('chase cam behind ship', cp > 18, f'{cp:.1f} m')
    # combat
    clear_enemies(pg)
    pg.evaluate("""()=>{const p=__ps3d.player;p.x=0;p.z=1200;p.h=0;p.throttle=0;p.speed=0;p.hp=160;
      const m=__ps3d.spawnEnemy('merchant');m.x=150;m.z=1200;m.h=0;m.throttle=0;m.speed=0;m.place();window.__m=m;}""")
    adv(pg, 0.5)
    hp0 = pg.evaluate("()=>__m.hp")
    ok = pg.evaluate("()=>__ps3d.fire('star')"); check('starboard broadside fires', ok)
    rl = pg.evaluate("()=>__ps3d.player.reload.star"); check('reload timer starts', rl > 2.5, f'{rl:.2f}s')
    check('cannot refire while reloading', not pg.evaluate("()=>__ps3d.fire('star')"))
    adv(pg, 1.0); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'combat.png')
    hp1 = hp0
    for _ in range(10):
        adv(pg, 0.25); hp1 = pg.evaluate("()=>__m.hp")
        if hp1 < hp0: break; check('broadside hits merchant', hp1 < hp0, f'{hp0:.0f} -> {hp1:.0f}')
    sunk = False
    for i in range(40):
        pg.evaluate("()=>{const m=__m,p=__ps3d.player; if(!m.sinking){ const a=p.h; m.x=p.x+150*Math.cos(a); m.z=p.z-150*Math.sin(a); m.h=p.h; m.speed=0; m.place(); } __ps3d.fire('star');}")
        adv(pg, 3.4)
        if pg.evaluate("()=>!!__m.sinking"): sunk = True; break
    check('merchant sinks', sunk, f'after {i+1} volleys')
    nl = pg.evaluate("()=>__ps3d.loot.length"); check('sinking drops loot', nl >= 3, nl)
    adv(pg, 3); pg.screenshot(path=OUT + 'combat_sinking.png')
    g0 = P(pg)['gold']
    for _ in range(8):
        if not pg.evaluate("()=>__ps3d.loot.length"): break
        pg.evaluate("()=>{const l=__ps3d.loot[0],p=__ps3d.player;p.x=l.x;p.z=l.z;p.speed=0;}"); adv(pg, 0.2)
    s = P(pg); car = json.loads(s['cargo']); check('loot picked up', sum(car.values()) > 0, car)
    check('bounty paid', s['gold'] > 150, s['gold'])
    # enemy fires back
    clear_enemies(pg)
    pg.evaluate("""()=>{const p=__ps3d.player;p.x=600;p.z=1500;p.h=0;p.throttle=0;p.speed=0;p.hp=160;
      const h=__ps3d.spawnEnemy('hunter');h.x=p.x+200;h.z=p.z;h.h=0;h.throttle=0;h.speed=0;h.place();window.__h=h;}""")
    adv(pg, 25); hpP = P(pg)['hp']; check('hunter sails and fires back', hpP < 160, f'player hp {hpP:.0f}')
    # port
    clear_enemies(pg)
    pg.evaluate("()=>{const p=__ps3d.player;p.hp=90;p.x=10.5;p.z=0;}")
    pg.evaluate("()=>{const p=__ps3d.player;p.x=__ps3d.player.x;}")
    pg.evaluate("()=>__ps3d.dock()"); adv(pg, 3); pg.wait_for_timeout(800)
    s = P(pg); check('docking opens port', s['state'] == 'port' and pg.is_visible('#port'), s['state'])
    pg.screenshot(path=OUT + 'port.png')
    g0 = s['gold']; pg.click('#sellAll'); s = P(pg); check('sell loot', s['gold'] > g0 and json.loads(s['cargo']) == {}, f"{g0} -> {s['gold']}")
    hp0 = s['hp']; pg.click('#repBtn'); s = P(pg); check('repair hull', s['hp'] > hp0, f"{hp0:.0f} -> {s['hp']:.0f}")
    pg.evaluate("()=>__ps3d.player.hp=160")
    pg.click('#castOff'); s = P(pg); check('cast off', s['state'] == 'play', s['state'])
    pg.evaluate("()=>{__ps3d.setCam('third');__ps3d.setThrottle(0.5)}"); adv(pg, 6); pg.wait_for_timeout(500); pg.screenshot(path=OUT + 'harbour_third.png')
    # graphics
    pg.click('#setBtn'); pg.wait_for_timeout(200); check('settings open', pg.is_visible('#settings'))
    pg.click('#gfxSeg button[data-v="low"]'); check('Graphics Low', P(pg)['LOW'])
    pg.click('#gfxSeg button[data-v="high"]'); check('Graphics High', not P(pg)['LOW'])
    pg.click('#gfxSeg button[data-v="auto"]'); check('Graphics Auto', pg.evaluate("()=>__ps3d.settings.gfx")=='auto')
    pg.click('#setClose')
    # save key separate from 2D
    keys = pg.evaluate("()=>Object.keys(localStorage)"); check('own save keys only', 'ps3d_save_v1' in keys and not any(k.startswith('pirateSeas') for k in keys), keys)
    # fps under 4x CPU throttle (desktop, High then Low)
    cdp = ctx.new_cdp_session(pg)
    pg.click('#setBtn'); pg.click('#gfxSeg button[data-v="high"]'); pg.click('#setClose')
    fh1 = fps_measure(pg, cdp, 1); fh4 = fps_measure(pg, cdp, 4)
    pg.click('#setBtn'); pg.click('#gfxSeg button[data-v="low"]'); pg.click('#setClose')
    fl1 = fps_measure(pg, cdp, 1); fl4 = fps_measure(pg, cdp, 4)
    print('JS+GL ms/frame (rate, ms):', JSMS); JSMS.clear()
    info = pg.evaluate("()=>{const i=__ps3d.renderer.info.render;return {calls:i.calls,tris:i.triangles}}"); print('draw calls/tris (Low, desktop):', info)
    print(f'FPS desktop 1280x720: High {fh1} (1x) / {fh4} (4x)   Low {fl1} (1x) / {fl4} (4x)')
    check('desktop: no console errors', not errs, errs[:5])
    ctx.close()

    # ---------------- mobile ----------------
    mctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                         user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    mp = mctx.new_page(); merrs = watch(mp)
    mp.goto(URL); mp.wait_for_function("()=>window.__ps3d && !document.getElementById('boot')", timeout=60000); mp.wait_for_timeout(1500)
    mp.screenshot(path=OUT + 'mobile_title.png')
    mp.tap('#playBtn'); mp.wait_for_timeout(500)
    check('mobile: play', P(mp)['state'] == 'play')
    boxes = {k: mp.locator(k).bounding_box() for k in ['#stick', '#fireP', '#fireS', '#lever', '#camBtn', '#map', '#stats']}
    def ov(a, c): return not (a['x'] + a['width'] <= c['x'] or c['x'] + c['width'] <= a['x'] or a['y'] + a['height'] <= c['y'] or c['y'] + c['height'] <= a['y'])
    names = list(boxes); bad = [(x, y) for i, x in enumerate(names) for y in names[i+1:] if boxes[x] and boxes[y] and ov(boxes[x], boxes[y])]
    check('mobile: controls visible', all(boxes.values()), {k: bool(v) for k, v in boxes.items()})
    check('mobile: no overlapping controls', not bad, bad)
    inside = all(v['x'] >= 0 and v['y'] >= 0 and v['x'] + v['width'] <= 390 and v['y'] + v['height'] <= 844 for v in boxes.values())
    check('mobile: controls on screen', inside)
    # lever drag via touch-like pointer events (dispatch pointer events)
    tr = mp.locator('#track').bounding_box()
    mp.evaluate("""(b)=>{const el=document.getElementById('track');const o={pointerId:7,pointerType:'touch',bubbles:true,clientX:b.x+b.width/2};
      el.dispatchEvent(new PointerEvent('pointerdown',{...o,clientY:b.y+b.height*0.9}));
      el.dispatchEvent(new PointerEvent('pointermove',{...o,clientY:b.y+b.height*0.3}));
      el.dispatchEvent(new PointerEvent('pointerup',{...o,clientY:b.y+b.height*0.3}));}""", tr)
    th = P(mp)['th']; check('mobile: lever drag sets throttle', th >= 0.5, th)
    st = mp.locator('#stick').bounding_box()
    mp.evaluate("""(b)=>{const el=document.getElementById('stick');const o={pointerId:8,pointerType:'touch',bubbles:true,clientY:b.y+b.height/2};
      el.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:b.x+b.width/2}));
      el.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:b.x+b.width}));}""", st)
    h0 = P(mp)['h']; mp.evaluate("()=>{__ps3d.player.speed=8}"); mp.evaluate("()=>{for(let i=0;i<5;i++)__ps3d.step(0.05)}")
    mp.evaluate("()=>{for(let i=0;i<40;i++)__ps3d.step(0.05)}"); h1 = P(mp)['h']
    mp.evaluate("(b)=>document.getElementById('stick').dispatchEvent(new PointerEvent('pointerup',{pointerId:8,pointerType:'touch',bubbles:true,clientX:b.x,clientY:b.y}))", st)
    check('mobile: steer stick turns ship', h1 < h0 - 0.1, f'{h0:.2f}->{h1:.2f}')
    mp.tap('#camBtn'); check('mobile: camera toggle', P(mp)['cam'] == 'first')
    c0 = mp.evaluate("()=>{const d=new THREE_DIR();return 0}") if False else None
    # drag to look on the canvas
    yaw0 = mp.evaluate("()=>{const v=__ps3d.camera.getWorldDirection(new __ps3d.camera.position.constructor());return Math.atan2(v.x,v.z)}")
    mp.evaluate("""()=>{const el=document.getElementById('c');const o={pointerId:9,pointerType:'touch',bubbles:true,clientY:400};
      el.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:150}));for(let i=1;i<=8;i++)el.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:150+i*15}));
      el.dispatchEvent(new PointerEvent('pointerup',{...o,clientX:270}));}""")
    mp.evaluate("()=>{for(let i=0;i<3;i++)__ps3d.step(0.016)}")
    yaw1 = mp.evaluate("()=>{const v=__ps3d.camera.getWorldDirection(new __ps3d.camera.position.constructor());return Math.atan2(v.x,v.z)}")
    check('mobile: drag to look', abs(yaw1 - yaw0) > 0.05, f'{yaw0:.2f}->{yaw1:.2f}')
    mp.wait_for_timeout(400); mp.screenshot(path=OUT + 'mobile_first_person.png')
    mp.tap('#camBtn'); mp.evaluate("()=>{for(let i=0;i<40;i++)__ps3d.step(0.05)}"); mp.wait_for_timeout(400); mp.screenshot(path=OUT + 'mobile_third_person.png')
    mp.evaluate("()=>{__ps3d.player.reload.port=0}"); mp.tap('#fireP'); rl = mp.evaluate("()=>__ps3d.player.reload.port"); check('mobile: fire button', rl > 0, rl)
    mcdp = mctx.new_cdp_session(mp)
    mp.evaluate("()=>{__ps3d.settings.gfx='high';__ps3d.setLow(false,true)}"); mh4 = fps_measure(mp, mcdp, 4)
    mp.evaluate("()=>{__ps3d.settings.gfx='low';__ps3d.setLow(true,true)}"); ml4 = fps_measure(mp, mcdp, 4)
    print('JS+GL ms/frame (rate, ms):', JSMS)
    print(f'FPS mobile 390x844@3x: High {mh4} (4x)   Low {ml4} (4x)')
    check('mobile: no console errors', not merrs, merrs[:5])
    mctx.close(); b.close()
print(f'\n{len(results)-fails}/{len(results)} passed')
sys.exit(1 if fails else 0)
