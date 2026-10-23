/* Pirate Seas 2D/3D preference vote (shared by both games; same file in both repos).
   One localStorage key for the whole jonnah1738.github.io origin, so a device votes once across both games.
   Anonymous: no IDs, it only adds +1 to public Abacus counters (vote-*, unvote-* when a vote is changed).
   Results are never shown in either game. */
(function () {
  'use strict';
  if (window.PSEASVote) return;
  var KEY = 'pseas_pref_vote_v1', HIT = 'https://abacus.jasoncameron.dev/hit/jonnah1738-pirate-seas/';
  var FIRST = 300, LATER = 600, MAX_SNOOZE = 3;
  var OPTS = [['2d', '2D — the classic'], ['3d', '3D — the new one'], ['not-tried', 'Haven\u2019t tried 3D yet']];
  var NAMES = { '2d': '2D', '3d': '3D', 'not-tried': 'Haven\u2019t tried 3D yet' };
  var cfg = null, el = null, mode = null, pend = 0, api;
  function rd() { var d = rd0(); if (pend) { d.play += pend; pend = 0; wr(d); } return d; }
  function rd0() { var d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { } d = d && typeof d === 'object' ? d : {};
    if (typeof d.play !== 'number') d.play = 0; if (typeof d.next !== 'number') d.next = FIRST; if (!Array.isArray(d.q)) d.q = []; d.sn = d.sn | 0; return d; }
  function wr(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { } }
  function flush() {
    var d = rd(); if (!d.q.length) return;
    if (!cfg.countOn || !window.fetch) { api.log.push.apply(api.log, d.q); d.q = []; wr(d); return; }
    var k = d.q[0];
    try {
      fetch(HIT + k, { method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true })
        .then(function (r) { if (!r.ok) return; var e = rd(); if (e.q[0] === k) { e.q.shift(); wr(e); api.log.push(k); if (e.q.length) setTimeout(flush, 250); } }, function () { });
    } catch (e) { }
  }
  function vote(v) {
    var d = rd(), old = d.v; if (old === v) return;
    if (old) d.q.push('unvote-' + old); d.q.push('vote-' + v);
    d.v = v; d.g = cfg.game; d.t = Date.now(); if (cfg.game === '3d' && v !== 'not-tried') d.re = 1; wr(d); flush();
    if (cfg.onVote) cfg.onVote(v);
  }
  function css() {
    if (document.getElementById('psvCss')) return;
    var s = document.createElement('style'); s.id = 'psvCss';
    s.textContent = '.psv-wrap{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:none}' +
      '.psv-card{pointer-events:auto;position:relative;width:min(360px,100%);max-height:calc(100% - 8px);overflow:auto;box-sizing:border-box;padding:16px 16px 12px;font-family:Georgia,"Times New Roman",serif;color:#2b1b0b;' +
      'background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.35),transparent 60%),linear-gradient(#efdcb0,#d8bd84);border:3px solid #2a241e;border-radius:10px;' +
      'box-shadow:0 0 0 2px #8a6c3c inset,0 0 0 5px #3a322a,0 12px 34px rgba(0,0,0,.65);animation:psvIn .25s ease-out}' +
      '@keyframes psvIn{from{transform:translateY(12px) scale(.97);opacity:0}to{transform:none;opacity:1}}' +
      '.psv-card:before,.psv-card:after{content:"";position:absolute;top:6px;width:7px;height:7px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#c9a866,#5a4422)}.psv-card:before{left:6px}.psv-card:after{right:6px}' +
      '.psv-card h3{margin:2px 18px 6px;text-align:center;font-size:19px;letter-spacing:.3px}' +
      '.psv-card p{margin:0 0 10px;text-align:center;font-size:13.5px;line-height:1.35;opacity:.85}' +
      '.psv-x{position:absolute;right:8px;top:6px;width:32px;height:32px;border:none;background:none;font-size:18px;color:#5a3c1c;cursor:pointer}' +
      '.psv-b{display:block;width:100%;min-height:44px;margin:0 0 8px;padding:9px 12px;border-radius:7px;border:1.5px solid #2a1d0c;cursor:pointer;font:bold 15px Georgia,serif;color:#f6e7c1;' +
      'background:linear-gradient(#5a4632,#2e241a);box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);touch-action:manipulation}' +
      '.psv-b:hover{filter:brightness(1.12)}.psv-b.on{background:linear-gradient(#e7c977,#a77d33);color:#2b1b0b}' +
      '.psv-b.go{background:linear-gradient(#8a2f22,#561a12)}' +
      '.psv-l{display:block;margin:2px auto 0;padding:8px 12px;border:none;background:none;font:italic 13.5px Georgia,serif;color:#5a3c1c;text-decoration:underline;cursor:pointer}' +
      '.psv-row-b{white-space:nowrap}';
    document.head.appendChild(s);
  }
  function close() { if (!el) return; el.remove(); el = null; var m = mode; mode = null; if (cfg.onClose) cfg.onClose(m); }
  function open(change) {
    if (el) return; css(); var d = rd(); mode = change ? 'change' : 'ask';
    el = document.createElement('div'); el.className = 'psv-wrap'; el.id = 'psvPrompt';
    var reask = !change && d.v === 'not-tried' && cfg.game === '3d';
    var h = '<div class="psv-card" role="dialog" aria-label="Which do you prefer">' +
      '<button class="psv-x" data-psv="later" aria-label="Close">\u2715</button>' +
      '<h3>Which do you prefer?</h3><p>' + (change ? 'Change your answer any time. ' : reask ? 'Now that you\u2019ve sailed in 3D \u2014 ' : 'Pirate Seas now comes in 2D and 3D. ') +
      'Your anonymous vote helps decide what gets built next.</p>';
    for (var i = 0; i < OPTS.length; i++) h += '<button class="psv-b' + (d.v === OPTS[i][0] ? ' on' : '') + '" data-psv="' + OPTS[i][0] + '">' + OPTS[i][1] + '</button>';
    h += '<button class="psv-l" data-psv="later">' + (change ? 'Cancel' : 'Ask me later') + '</button></div>';
    el.innerHTML = h; document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-psv]'); if (!b) return; e.preventDefault(); e.stopPropagation();
      var a = b.getAttribute('data-psv');
      if (a === 'later') { if (mode === 'ask') { var d2 = rd(); d2.sn++; d2.next = d2.play + LATER; if (reask) d2.re = 1; wr(d2); } close(); return; }
      if (a === 'try') { window.open(cfg.otherUrl, '_blank', 'noopener'); close(); return; }
      if (a === 'ok') { close(); return; }
      vote(a); thanks(a);
    });
    ['keydown', 'keyup', 'pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach(function (t) { el.addEventListener(t, function (e) { e.stopPropagation(); }); });
    if (cfg.onOpen) cfg.onOpen(mode);
  }
  function thanks(v) {
    if (!el) return; var c = el.querySelector('.psv-card');
    var tryIt = v === 'not-tried' && cfg.game === '2d';
    c.innerHTML = '<h3>Thanks, Captain!</h3><p>Vote recorded' + (tryIt ? '. Give the 3D seas a try when you have a moment.' : '. You can change it later in ' + cfg.settingsName + '.') + '</p>' +
      (tryIt ? '<button class="psv-b go" data-psv="try">Try Pirate Seas 3D \u2197</button>' : '') + '<button class="psv-b" data-psv="ok">Back to the seas</button>';
    setTimeout(function () { if (el && el.querySelector('[data-psv="ok"]')) close(); }, tryIt ? 9000 : 2600);
  }
  function tick() {
    if (!cfg) return;
    var playing = !document.hidden && cfg.isPlaying();
    if (playing) pend++;
    var d = pend >= 10 ? rd() : rd0(); d.play += pend;
    var want = (!d.v && d.sn < MAX_SNOOZE) || (cfg.game === '3d' && d.v === 'not-tried' && !d.re);
    if (want && !el && d.play >= d.next && playing && cfg.isCalm()) { rd(); open(false); }
  }
  function settingsRow() {
    var d = rd();
    return { label: '2D or 3D?', text: d.v ? 'Your vote: ' + NAMES[d.v] + ' (anonymous)' : 'Tell us which version you prefer (anonymous)', button: d.v ? 'Change' : 'Vote' };
  }
  api = {
    log: [], KEY: KEY,
    init: function (c) { if (cfg) return; cfg = c; flush(); setInterval(tick, 1000); addEventListener('pagehide', function () { rd(); }); document.addEventListener('visibilitychange', function () { if (document.hidden) rd(); }); },
    open: open, close: close, vote: vote, read: rd, settingsRow: settingsRow, isOpen: function () { return !!el; },
    _tick: tick, _setPlay: function (s) { pend = 0; var d = rd0(); d.play = s; wr(d); }
  };
  window.PSEASVote = api;
})();
