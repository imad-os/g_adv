/* Constants, quality presets and the owner's app config (MyPC.app_config, read-only). */
(function () {
    'use strict';
    var G = window.G;
    G.VERSION = '1.3.0';                       // keep equal to mypc-app.json "version" (used for ?v= on code-loaded files)
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
        difficulty: 'adventurer',// default difficulty of a new game: wanderer | adventurer | champion | legend (or 0-3)
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
        var d = G.cfg.difficulty;
        if (!G.DIFFS[d]) G.cfg.difficulty = G.DIFF_IDS[Math.max(0, Math.min(3, Math.round(+d) || 1))];
    };

    /* Four difficulties. Every number multiplies the normal game ('adventurer' = all 1). */
    G.DIFF_IDS = ['wanderer', 'adventurer', 'champion', 'legend'];
    G.DIFFS = {
        wanderer:   { dmg: 0.5,  hp: 0.75, speed: 0.9,  sight: 0.85, hunger: 0.7, wear: 0.6,  regen: 1.6, xp: 1 },
        adventurer: { dmg: 1,    hp: 1,    speed: 1,    sight: 1,    hunger: 1,   wear: 1,    regen: 1,   xp: 1 },
        champion:   { dmg: 1.5,  hp: 1.35, speed: 1.1,  sight: 1.15, hunger: 1.2, wear: 1.25, regen: 0.6, xp: 1.25 },
        legend:     { dmg: 2.5,  hp: 1.7,  speed: 1.2,  sight: 1.3,  hunger: 1.5, wear: 1.5,  regen: 0,   xp: 1.5 }   // hearts only come back from food
    };
    G.diffId = function () {
        if (G.coop && G.coop.role === 'guest' && G.DIFFS[G.coop.hostDiff]) return G.coop.hostDiff;   // in co-op the host's world sets it
        var d = G.state && G.state.difficulty; return G.DIFFS[d] ? d : G.cfg.difficulty;
    };
    G.diff = function () { return G.DIFFS[G.diffId()]; };

    /* The quality preset, with the player's own overrides from Settings > Graphics (null = the preset's value). */
    G.makeQuality = function (name, o) {
        var b = G.QUALITY[name], q = {};
        for (var k in b) q[k] = b[k];
        if (o) {
            if (o.view) { q.view = o.view; q.fog = [0, 0, 0, 230, 340, 430, 520][o.view] || q.fog; }
            if (o.grass !== null && o.grass !== undefined) q.grass = o.grass ? Math.max(60, b.grass) : 0;
            if (o.shadows !== null && o.shadows !== undefined) q.shadows = !!o.shadows;
            if (o.pixel) q.pixel = o.pixel;
        }
        q.name = name;
        return q;
    };

})();
