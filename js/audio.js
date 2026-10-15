/* Synthesised sound: one AudioContext made in onStart and closed in onDestroy. No audio files. */
(function () {
    'use strict';
    var G = window.G;
    var A = G.audio = { ctx: null, music: 0.7, sfx: 0.8, on: true, musicOn: true };
    var master, musicGain, musicTimer = 0, musicStep = 0, musicHour = 12, musicRed = false;

    A.start = function () {
        if (A.ctx) return;
        try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { A.ctx = null; return; }
        master = A.ctx.createGain(); master.connect(A.ctx.destination);
        musicGain = A.ctx.createGain(); musicGain.connect(master);
        A.setVolume(A.music, A.sfx);
    };
    A.setVolume = function (m, s) { A.music = m; A.sfx = s; if (musicGain) musicGain.gain.value = A.musicOn ? m * 0.25 : 0; };
    A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
    A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };
    A.stop = function () { if (A.ctx) { try { A.ctx.close(); } catch (e) {} A.ctx = null; } };

    function tone(freq, type, dur, vol, slide) {
        if (!A.ctx || A.ctx.state !== 'running' || !A.on) return;
        var c = A.ctx, o = c.createOscillator(), g = c.createGain(), now = c.currentTime;
        o.type = type; o.frequency.setValueAtTime(freq, now);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + dur);
        g.gain.setValueAtTime(vol * A.sfx, now); g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
        o.connect(g); g.connect(master); o.start(now); o.stop(now + dur + 0.02);
    }
    A.sfxStep = function () { tone(90 + Math.random() * 30, 'triangle', 0.08, 0.08, 0.6); };
    A.sfxJump = function () { tone(300, 'square', 0.15, 0.1, 2); };
    A.sfxHit = function () { tone(180, 'sawtooth', 0.18, 0.25, 0.4); };
    A.sfxHurt = function () { tone(120, 'square', 0.3, 0.3, 0.5); };
    A.sfxPick = function () { tone(700, 'sine', 0.12, 0.2, 1.6); };
    A.sfxBreak = function () { tone(500, 'sawtooth', 0.25, 0.3, 0.2); };
    A.sfxCook = function () { tone(440, 'sine', 0.2, 0.2, 1.25); setTimeout(function () { tone(660, 'sine', 0.3, 0.2, 1.1); }, 180); };
    A.sfxQuest = function () { tone(523, 'triangle', 0.2, 0.25); setTimeout(function () { tone(659, 'triangle', 0.2, 0.25); }, 150); setTimeout(function () { tone(784, 'triangle', 0.4, 0.3); }, 300); };
    A.sfxMenu = function () { tone(900, 'sine', 0.05, 0.1); };
    A.sfxSelect = function () { tone(1100, 'sine', 0.1, 0.15, 1.3); };
    A.sfxBeacon = function () { for (var i = 0; i < 5; i++) (function (i) { setTimeout(function () { tone(330 * Math.pow(1.26, i), 'triangle', 0.5, 0.25); }, i * 160); })(i); };
    A.sfxEat = function () { tone(250, 'triangle', 0.12, 0.2, 1.5); };
    A.sfxHorse = function () { tone(200, 'sawtooth', 0.4, 0.15, 1.8); };
    A.sfxDie = function () { tone(400, 'sawtooth', 1.2, 0.3, 0.15); };

    /* Ambient music: a slow arpeggio whose scale follows the time of day. Called every frame. */
    var SCALES = { day: [0, 4, 7, 11, 14], dusk: [0, 3, 7, 10, 14], night: [0, 2, 7, 9, 12], red: [0, 1, 6, 7, 13] };
    A.music_update = function (dt, hour, red) {
        if (!A.ctx || A.ctx.state !== 'running' || !A.musicOn) return;
        musicHour = hour; musicRed = red;
        musicTimer -= dt;
        if (musicTimer > 0) return;
        musicTimer = red ? 0.5 : hour > 21 || hour < 5 ? 1.4 : 0.9;
        var sc = red ? SCALES.red : hour > 21 || hour < 5 ? SCALES.night : hour > 17 ? SCALES.dusk : SCALES.day;
        var n = sc[musicStep % sc.length] + (musicStep % 7 === 3 ? 12 : 0); musicStep++;
        var c = A.ctx, o = c.createOscillator(), g = c.createGain(), now = c.currentTime;
        o.type = red ? 'sawtooth' : 'sine'; o.frequency.value = 220 * Math.pow(2, n / 12);
        g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5, now + 0.08); g.gain.exponentialRampToValueAtTime(0.0005, now + musicTimer * 1.8);
        o.connect(g); g.connect(musicGain); o.start(now); o.stop(now + musicTimer * 1.9);
    };
})();
