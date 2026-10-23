"""2D/3D vote + 'classic 2D' link in the 3D game; shared vote key across both games (same origin). Desktop + phone."""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://127.0.0.1:8796/'); OUT = os.environ.get('OUT', '/workspace/pirate-seas-3d-shots/vote_')
BOTH = os.environ.get('BOTH', 'http://127.0.0.1:8772/')  # serves /pirate-game/ and /pirate-seas-3d/ from one origin
ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
U2 = 'https://jonnah1738.github.io/pirate-game/'
fails = 0; n = 0; errs = []
def check(name, ok, info=''):
    global fails, n; n += 1; fails += 0 if ok else 1; print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info != '' else ''), flush=True)
def ready(pg): pg.wait_for_function("()=>window.__ps3d && !document.getElementById('boot')", timeout=60000)
VIS = "()=>{const e=document.getElementById('psvPrompt');return !!e&&e.getBoundingClientRect().width>0}"
RD = "()=>JSON.parse(localStorage.getItem('pseas_pref_vote_v1')||'{}')"
CALM = "()=>{const p=__ps3d.player;p.x=0;p.z=1400;for(const s of __ps3d.ships)if(s!==p){s.x=p.x+5000;s.z=p.z+5000;}}"
def mk(b, tag, w, h, mob, url=URL):
    ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=mob)
    ctx.route('https://jonnah1738.github.io/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<title>stub</title>'))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(f'[{tag}] {e}')); pg.on('console', lambda m: errs.append(f'[{tag}] {m.text}') if m.type == 'error' else None)
    pg.goto(url); return ctx, pg
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for tag, w, h, mob in [('desk', 1280, 720, False), ('phone', 390, 844, True)]:
        ctx, pg = mk(b, tag, w, h, mob); ready(pg); E = pg.evaluate
        a = E("()=>{const a=document.getElementById('t2d');const r=a.getBoundingClientRect();return [a.href,a.target,a.rel,r.width,r.bottom,innerHeight]}")
        check(f'{tag}: title has classic-2D link', a[0] == U2 and a[1] == '_blank' and 'noopener' in a[2] and a[3] > 0 and a[4] <= a[5], a)
        pg.screenshot(path=OUT + f'{tag}_title.png')
        with ctx.expect_page() as pi: pg.click('#t2d')
        np = pi.value; np.wait_for_load_state(); check(f'{tag}: 2D link opens new tab', np.url == U2, np.url); np.close()
        check(f'{tag}: still on title', E("()=>__ps3d.state") == 'title')
        E("()=>__ps3d.start(true)"); E(CALM); E("()=>PSEASVote._setPlay(10)"); pg.wait_for_timeout(2500)
        check(f'{tag}: no prompt before 5 min', not E(VIS))
        p0 = E("()=>__ps3d.save.play")
        E("()=>PSEASVote._setPlay(297)"); pg.wait_for_timeout(5000)
        check(f'{tag}: prompt after ~5 min of play', E(VIS))
        check(f'{tag}: game paused while prompt is up', E("()=>__ps3d.state") == 'paused')
        txt = E("()=>document.getElementById('psvPrompt').innerText")
        check(f'{tag}: prompt text, no tallies', 'Which do you prefer' in txt and 'tried' in txt and not any(c.isdigit() for c in txt.replace('2D', '').replace('3D', '')), txt.replace('\n', ' | '))
        r = E("()=>{const r=document.querySelector('.psv-card').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]}")
        check(f'{tag}: card fits viewport', r[0] >= 0 and r[1] >= 0 and r[2] <= w and r[3] <= h, r)
        pg.screenshot(path=OUT + f'{tag}_prompt.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(f'{tag}: Esc does not open settings under the prompt', E("()=>document.getElementById('settings').classList.contains('hidden')"))
        pg.click('.psv-l'); pg.wait_for_timeout(300); d = E(RD)
        check(f'{tag}: ask later resumes play and snoozes', not E(VIS) and E("()=>__ps3d.state") == 'play' and d['next'] >= d['play'] + 590 and d.get('sn') == 1, d)
        E("()=>PSEASVote._setPlay(PSEASVote.read().next)"); pg.wait_for_timeout(3000); check(f'{tag}: asks again after snooze', E(VIS))
        pg.click('[data-psv="3d"]'); pg.wait_for_timeout(300); d = E(RD)
        check(f'{tag}: vote stored', d.get('v') == '3d' and d.get('g') == '3d' and E("()=>PSEASVote.log.join()") == 'vote-3d', [d, E("()=>PSEASVote.log")])
        pg.wait_for_timeout(3000); check(f'{tag}: thanks closes, play resumes', not E(VIS) and E("()=>__ps3d.state") == 'play')
        check(f'{tag}: 3D save.play unaffected by vote timer', E("()=>__ps3d.save.play") < 60, E("()=>__ps3d.save.play"))
        check(f'{tag}: vote not in 3D save/settings', not any(k in E("()=>__ps3d.save") for k in ('vote', 'pref', 'sn', 'q')) and not any('vote' in k for k in E("()=>Object.keys(JSON.parse(localStorage.getItem('ps3d_save_v1')||'{}'))")))
        # settings: change vote
        pg.click('#setBtn'); pg.wait_for_timeout(300)
        check(f'{tag}: settings row shows own vote only', E("()=>document.getElementById('voteNote').textContent").startswith('Your vote: 3D') and E("()=>document.getElementById('voteBtn').textContent") == 'Change')
        check(f'{tag}: settings 2D link', E("()=>document.getElementById('s2d').href") == U2)
        pg.screenshot(path=OUT + f'{tag}_settings.png')
        pg.click('#voteBtn'); pg.wait_for_timeout(300); check(f'{tag}: change dialog over settings', E(VIS) and 'Cancel' in E("()=>document.getElementById('psvPrompt').innerText"))
        pg.click('#psvPrompt [data-psv="2d"]'); pg.wait_for_timeout(300)
        check(f'{tag}: change hits unvote-3d + vote-2d', E("()=>PSEASVote.log.join()") == 'vote-3d,unvote-3d,vote-2d' and E(RD)['v'] == '2d', E("()=>PSEASVote.log"))
        pg.click('#psvPrompt [data-psv="ok"]'); pg.wait_for_timeout(200)
        check(f'{tag}: still paused in settings, row updated', E("()=>__ps3d.state") == 'paused' and 'Your vote: 2D' in E("()=>document.getElementById('voteNote').textContent"))
        pg.click('#setClose'); pg.wait_for_timeout(200); check(f'{tag}: resume', E("()=>__ps3d.state") == 'play')
        ctx.close()
    # ---- shared across games (same origin, like jonnah1738.github.io)
    ctx, pg = mk(b, 'both', 390, 844, True, BOTH + 'pirate-game/index.html'); pg.wait_for_timeout(800)
    pg.click('#startBtn'); pg.wait_for_timeout(400)
    pg.evaluate("(()=>{const g=__game;if(g.T.on){g.T.on=false;document.getElementById('tut').classList.add('hidden');}g.S.tutDone=true;setInterval(()=>{g.enemies.length=0},100);})()")
    pg.wait_for_timeout(4000); pg.evaluate("window.dispatchEvent(new Event('pagehide'))"); t2 = pg.evaluate("PSEASVote.read().play")
    pg.goto(BOTH + 'pirate-seas-3d/'); ready(pg); E = pg.evaluate
    check('shared: play time from 2D carried into 3D', E("()=>PSEASVote.read().play") == t2 and t2 >= 3, t2)
    E("()=>__ps3d.start(true)"); E(CALM); E("()=>PSEASVote._setPlay(298)"); pg.wait_for_timeout(4000)
    check('shared: 3D prompts once threshold reached (combined play)', E(VIS)); pg.click('[data-psv="not-tried"]'); pg.wait_for_timeout(3000)
    pg.goto(BOTH + 'pirate-game/index.html'); pg.wait_for_timeout(800); pg.click('#startBtn'); pg.wait_for_timeout(400)
    pg.evaluate("(()=>{const g=__game;if(g.T.on){g.T.on=false;document.getElementById('tut').classList.add('hidden');}g.S.tutDone=true;setInterval(()=>{g.enemies.length=0},100);PSEASVote._setPlay(5000);})()"); pg.wait_for_timeout(3000)
    check('shared: 2D does not re-prompt after voting in 3D', not pg.evaluate(VIS.replace('()=>', '(()=>') + ')()'))
    pg.goto(BOTH + 'pirate-seas-3d/'); ready(pg); E = pg.evaluate; E("()=>__ps3d.start(false)"); E(CALM); pg.wait_for_timeout(2500)
    check('shared: "not tried" voter asked once more after sailing in 3D', E(VIS)); pg.click('[data-psv="3d"]'); pg.wait_for_timeout(300)
    d = E(RD); check('shared: re-ask converts not-tried -> 3d', d['v'] == '3d' and d.get('re') == 1 and E("()=>PSEASVote.log.join()") == 'unvote-not-tried,vote-3d', [d, E("()=>PSEASVote.log")])
    pg.wait_for_timeout(3000); E("()=>PSEASVote._setPlay(9000)"); pg.wait_for_timeout(2500); check('shared: never asks again', not E(VIS))
    check('no reach counters hit off the live host', E("()=>!localStorage.getItem('ps3d_counted_v1')"))
    ctx.close(); b.close()
bad = [e for e in errs if 'favicon' not in e]
check('no console errors', not bad, bad[:5])
print(f'{n - fails}/{n} passed'); sys.exit(1 if fails else 0)
