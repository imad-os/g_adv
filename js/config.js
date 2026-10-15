/* Constants, quality presets and the owner's app config (MyPC.app_config, read-only). */
(function () {
    'use strict';
    var G = window.G;
    G.VERSION = '1.0.0';                       // keep equal to mypc-app.json "version" (used for ?v= on code-loaded files)
    G.CHUNK = 64;                              // metres per terrain chunk
    G.WORLD = 1536;                            // world is WORLD x WORLD metres, centred on 0,0
    G.SEA = 0;                                 // water level
    G.DAY_SECONDS = 24 * 60;                   // one in-game day lasts 24 real minutes (owner can change it)
    G.DAYS_PER_SEASON = 3;
    G.RED_NIGHT_EVERY = 7;                     // every 7th night enemies and plants come back

    /* Quality presets. 'low' is what a 1 GB TV gets by default (MyPC tells us its tier). */
    G.QUALITY = {
        low:    { view: 3, seg: 10, pixel: 0.5,  shadows: false, grass: 0,   trees: 0.55, fog: 230, maxLights: 1, particles: 40 },
        medium: { view: 4, seg: 16, pixel: 0.75, shadows: false, grass: 60,  trees: 0.85, fog: 340, maxLights: 2, particles: 100 },
        high:   { view: 6, seg: 24, pixel: 1.0,  shadows: true,  grass: 140, trees: 1.0,  fog: 520, maxLights: 4, particles: 200 }
    };

    /* Defaults for everything the owner may change in the App Store Manager (Config button). */
    G.cfg = {
        dayMinutes: 24,          // real minutes per in-game day
        voice: true,             // allow NPC voice audio at all
        voiceBase: 'voices/',    // where <lang>/<npc>_<line>.mp3 live; may be an absolute https URL
        voiceTimeoutMs: 1000,
        difficulty: 1,           // enemy damage multiplier
        quality: '',             // '' = pick from the TV tier; or low | medium | high
        lang: '',                // '' = My PC's language; or en | fr | ar | ary
        startHearts: 3
    };
    G.readConfig = function () {
        var c = window.MyPC ? MyPC.app_config : {};
        for (var k in G.cfg) if (c[k] !== undefined && c[k] !== null && c[k] !== '') {
            if (typeof G.cfg[k] === 'number') { if (+c[k] === +c[k]) G.cfg[k] = +c[k]; }
            else if (typeof G.cfg[k] === 'boolean') G.cfg[k] = !(c[k] === false || c[k] === 'false' || c[k] === 0);
            else G.cfg[k] = String(c[k]);
        }
        G.DAY_SECONDS = Math.max(2, G.cfg.dayMinutes) * 60;
    };

    /* Game actions that the player can bind to SDK actions (Settings > Controls).
     * The TV remote only has arrows + OK, so OK is tap = act, hold = jump, long hold still = menu. */
    G.GAME_ACTIONS = ['act', 'jump', 'sprint', 'menu', 'map', 'crouch'];
    G.DEFAULT_BINDS = { confirm: 'act', jump: 'jump', run: 'sprint', cancel: 'map', menu: 'menu', pause: 'menu' };
})();
