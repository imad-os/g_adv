/* Every gamepad button, for the button mapping.
 * My PC turns a gamepad into a few actions (A = OK, B / X / Y = run, Start / Select = menu) and never
 * forwards L, R, ZL, ZR or the stick presses, so a game cannot tell them apart through the SDK alone.
 * My PC allows the Gamepad API in its game frame (allow="gamepad"), so this file reads the pad
 * directly, once per frame, only to know which button is pressed. Movement, menus and the remote
 * still come from the SDK. If the frame cannot see the pad (no data while My PC reports pad presses)
 * it switches itself off and the game falls back to the SDK actions. */
(function () {
    'use strict';
    var G = window.G;
    var N = 18;
    var now = new Uint8Array(N), prev = new Uint8Array(N);
    var connected = false, broken = false, ever = false, lastRaw = -1e9, sdkAt = 0;
    var guardBtn = -1, guardUntil = 0;
    var P = G.pad = { live: false };
    /* W3C standard mapping: names for Nintendo / Xbox / PlayStation */
    P.NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'L / LB', 'R / RB', 'ZL / LT', 'ZR / RT', 'Select / −', 'Start / +',
               'L3 (stick)', 'R3 (stick)', '▲', '▼', '◀', '▶', 'Home', 'Capture'];
    P.DEFAULT = { interact: 0, attack: 2, jump: 3, sprint: 1, map: 8, menu: 9 };

    function pads() { try { return navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { return null; } }

    P.poll = function () {                                  // once per animation frame
        var list = pads(), pad = null, i, t = performance.now();
        if (list) for (i = 0; i < list.length; i++) if (list[i] && list[i].connected) { pad = list[i]; break; }
        prev.set(now);
        connected = !!pad;
        if (pad) {
            var b = pad.buttons;
            for (i = 0; i < N; i++) { var x = b[i]; now[i] = x && (x.pressed || x.value > 0.5) ? 1 : 0; if (now[i]) { lastRaw = t; ever = true; } }
        } else now.fill(0);
        /* My PC said a pad button was pressed but the frame saw nothing: the Gamepad API is not available here */
        if (sdkAt && t - sdkAt > 300) { if (lastRaw < sdkAt - 300) broken = true; sdkAt = 0; }
        if (guardBtn >= 0 && !now[guardBtn]) { guardUntil = t + 350; guardBtn = -1; }
        P.live = connected && ever && !broken;
    };
    P.sdkPress = function () { if (!sdkAt) sdkAt = performance.now(); };   // a pad action came through My PC
    P.pressed = function (k) { return k >= 0 && k < N && now[k] === 1 && prev[k] === 0; };
    P.held = function (k) { return k >= 0 && k < N && now[k] === 1; };
    P.anyNew = function () { for (var k = 0; k < N; k++) if (now[k] && !prev[k]) return k; return -1; };
    P.size = N;
    /* a raw press opened a screen: ignore the same button's My PC action that follows */
    P.guard = function (k) { guardBtn = k; };
    P.guarded = function () { return guardBtn >= 0 || performance.now() < guardUntil; };
    P.name = function (k) { return k >= 0 && k < N ? P.NAMES[k] : '—'; };
})();
