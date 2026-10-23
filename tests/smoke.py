import sys,os,json
from playwright.sync_api import sync_playwright
URL=os.environ.get('URL','http://127.0.0.1:8796/');OUT=os.environ.get('OUT','/workspace/pirate-seas-3d-shots/')
os.makedirs(OUT,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':1280,'height':720})
    errs=[];pg.on('pageerror',lambda e:errs.append('PE '+str(e)));pg.on('console',lambda m:errs.append(m.type+' '+m.text) if m.type in('error','warning') else None)
    pg.goto(URL);pg.wait_for_timeout(2500)
    pg.screenshot(path=OUT+'00_title.png')
    pg.click('#playBtn');pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+'01_third.png')
    print('errs',errs[:10])
    b.close()
