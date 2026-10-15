/* NPC voice lines. Audio files are not in the repo yet: when one exists at
 *   <voiceBase><lang>/<npc>_<line>.mp3?v=<version>
 * it is played, if the owner's config allows voice and the player's settings allow it.
 * A line that does not load within voiceTimeoutMs is remembered as missing and never tried again. */
(function () {
    'use strict';
    var G = window.G;
    var V = G.voice = { enabled: true, lang: 'en', volume: 1 };
    var missing = {}, current = null, timer = 0;

    V.url = function (npc, line) {
        var base = G.cfg.voiceBase; if (base && base.charAt(base.length - 1) !== '/') base += '/';
        return base + V.lang + '/' + npc + '_' + line + '.mp3?v=' + G.VERSION;
    };
    V.stop = function () {
        if (timer) { clearTimeout(timer); timer = 0; }
        if (current) { try { current.pause(); current.src = ''; } catch (e) {} current = null; }
    };
    /* Try to speak; falls back to the TV's Voice Guide reading the text. */
    V.speak = function (npc, line, text) {
        V.stop();
        if (!G.cfg.voice || !V.enabled || typeof Audio === 'undefined') { if (text) MyPC.announce(text); return; }
        var url = V.url(npc, line);
        if (missing[url]) { if (text) MyPC.announce(text); return; }
        var a = new Audio(); a.preload = 'auto'; a.volume = Math.max(0, Math.min(1, V.volume * G.audio.sfx));
        current = a;
        var done = false;
        function fail() { if (done) return; done = true; missing[url] = 1; if (current === a) current = null; if (text) MyPC.announce(text); }
        timer = setTimeout(fail, Math.max(200, G.cfg.voiceTimeoutMs));
        a.addEventListener('canplaythrough', function () {
            if (done) return; done = true; clearTimeout(timer); timer = 0;
            if (current !== a) return;
            var p = a.play(); if (p && p.catch) p.catch(function () {});
        });
        a.addEventListener('error', fail);
        a.src = url; a.load();
    };
})();
