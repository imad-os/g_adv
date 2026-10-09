/* My PC scaffold: lifecycle, remote input, own menu, saves, scores, texts and a 1920x1080 stage.
 * The play scene is a placeholder (move the orb with the arrows, collect the stars) until the real game lands. */
(function () {
    'use strict';
    var W = 960, H = 540;                       // logical game size, drawn on a 1920x1080 stage
    var STEP = 1000 / 60;
    var t, stage, canvas, ctx, raf = 0, last = 0, acc = 0;
    var state = 'menu';                         // 'menu' | 'play'
    var inGame = false, items = [], focus = 0;
    var score = 0, best = 0, speedMul = 1, tier = 'mid';
    var px = W / 2, py = H / 2, sx = 0, sy = 0, seed = 1;
    var audio = null, sfxVol = 0.8;

    function $(id) { return document.getElementById(id); }
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    function resize() {
        var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        stage.style.transform = 'translate(' + ((window.innerWidth - 1920 * s) / 2) + 'px,' +
            ((window.innerHeight - 1080 * s) / 2) + 'px) scale(' + s + ')';
        // Low-tier TVs draw at half resolution; the stage still fills the screen.
        var r = tier === 'low' ? 1 : Math.min(2, s * 2 * (window.devicePixelRatio || 1));
        canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    }

    /* ---------- own menu ---------- */
    function buildMenu() {
        items = inGame ? ['resume', 'restart', 'quit'] : ['play', 'quit'];
        var ul = $('items'); ul.textContent = '';
        for (var i = 0; i < items.length; i++) {
            var li = document.createElement('li');
            li.textContent = t[items[i]];
            ul.appendChild(li);
        }
        focus = 0; showFocus();
    }
    function showFocus() {
        var lis = $('items').children;
        for (var i = 0; i < lis.length; i++) lis[i].className = i === focus ? 'focus' : '';
        MyPC.announce(t[items[focus]]);
    }
    function openMenu() {
        state = 'menu'; buildMenu();
        $('menu').className = 'screen';
    }
    function closeMenu() {
        state = 'play'; $('menu').className = 'screen hidden';
    }
    function choose(id) {
        if (id === 'play' || id === 'restart') newGame();
        else if (id === 'resume') closeMenu();
        else if (id === 'quit') MyPC.exit();
    }

    /* ---------- game (placeholder) ---------- */
    function newGame() {
        inGame = true; score = 0; px = W / 2; py = H / 2;
        seed = Date.now() % 100000 + 1; placeStar();
        $('score').textContent = t.score + ' 0';
        closeMenu();
    }
    function placeStar() { sx = 60 + rnd() * (W - 120); sy = 60 + rnd() * (H - 120); }

    function update() {                         // fixed 60 Hz, no allocation
        if (state !== 'play') return;
        var v = 5 * speedMul;
        px += ((MyPC.isDown('right') ? 1 : 0) - (MyPC.isDown('left') ? 1 : 0)) * v;
        py += ((MyPC.isDown('down') ? 1 : 0) - (MyPC.isDown('up') ? 1 : 0)) * v;
        if (px < 24) px = 24; else if (px > W - 24) px = W - 24;
        if (py < 24) py = 24; else if (py > H - 24) py = H - 24;
        var dx = px - sx, dy = py - sy;
        if (dx * dx + dy * dy < 40 * 40) {
            score++; $('score').textContent = t.score + ' ' + score;
            if (score > best) { best = score; MyPC.save('best', best); $('best').textContent = t.best + ' ' + best; }
            beep(880); placeStar();
        }
    }

    function draw() {
        ctx.fillStyle = '#0a0f2c'; ctx.fillRect(0, 0, W, H);
        if (!inGame) return;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#4cc2ff';
        ctx.beginPath(); ctx.arc(px, py, 22, 0, 6.283); ctx.fill();
    }

    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        acc += Math.min(250, ts - last); last = ts;
        while (acc >= STEP) { update(); acc -= STEP; }
        draw();
    }
    function startLoop() { if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); } }
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    /* ---------- sound: one AudioContext, made in onStart, closed in onDestroy ---------- */
    function beep(freq) {
        if (!audio || audio.state !== 'running' || sfxVol <= 0) return;
        var o = audio.createOscillator(), g = audio.createGain(), now = audio.currentTime;
        o.frequency.value = freq; g.gain.setValueAtTime(0.2 * sfxVol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + 0.16);
    }

    MyPC.init({
        ownMenu: true,
        onInit: function (info) {
            // The owner can force a language in the app config, e.g. { "lang": "ary" } for Moroccan Darija.
            var lang = window.TEXT[MyPC.app_config.lang] ? MyPC.app_config.lang : info.lang;
            t = window.TEXT[lang] || window.TEXT.en;
            if (window.TEXT[lang]) {
                document.documentElement.setAttribute('lang', lang);
                document.documentElement.setAttribute('dir', window.RTL[lang] ? 'rtl' : 'ltr');
            }
            tier = (info.quality && info.quality.tier) || 'mid';
            sfxVol = info.volume ? info.volume.sfx : 0.8;
            speedMul = +MyPC.app_config.speed > 0 ? +MyPC.app_config.speed : 1;
            stage = $('stage'); canvas = $('c'); ctx = canvas.getContext('2d');
            document.title = t.title; $('title').textContent = t.title; $('hint').textContent = t.hint;
            best = MyPC.load('best', 0);
            if (best) $('best').textContent = t.best + ' ' + best;
            resize(); window.addEventListener('resize', resize);
            MyPC.setMenu([{ id: 'restart', label: t.restart }]);
            MyPC.progress(1);
            MyPC.ready();
        },
        onStart: function () {
            try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
            openMenu(); startLoop();
            MyPC.announce(t.title + '. ' + t[items[focus]]);
        },
        onPause: function () { stopLoop(); if (audio) audio.suspend(); },
        onResume: function () { if (audio) audio.resume(); startLoop(); },
        onDestroy: function () {
            stopLoop(); window.removeEventListener('resize', resize);
            if (audio) { audio.close(); audio = null; }
        },
        onVolume: function (v) { sfxVol = v.sfx; },
        onMenu: function (id) { if (id === 'restart') newGame(); },
        onInput: function (action, pressed) {
            if (!pressed) return;
            if (action === 'menu') { if (state === 'menu') { if (inGame) closeMenu(); } else openMenu(); return; }
            if (state === 'menu') {
                if (action === 'up') { focus = (focus + items.length - 1) % items.length; showFocus(); }
                else if (action === 'down') { focus = (focus + 1) % items.length; showFocus(); }
                else if (action === 'confirm') choose(items[focus]);
                else if (action === 'cancel' && inGame) closeMenu();
            } else if (action === 'confirm') {
                openMenu();                     // TV remote has no Start: OK opens the own menu in play
            }
        }
    });
})();
