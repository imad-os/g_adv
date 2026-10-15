/* Game state, inventory, stats, achievements and saving.
 * Saves go through MyPC.save (per My PC profile, 64 KB per app). Three keys:
 *   'save'     the auto-save (every minute of play, on quest steps, when paused, when resting)
 *   'manual'   the player's own save (System > Save)
 *   'settings' the player's settings, shared by both
 * A save is versioned; a newer or broken save is never loaded over the current game. */
(function () {
    'use strict';
    var G = window.G;
    var SAVE_FORMAT = 1;
    var MAX_TAKEN = 1500;
    var FOG = 48;                                       // map fog grid (FOG x FOG cells)

    G.newState = function () {
        return {
            format: SAVE_FORMAT,
            x: -6, y: 14, z: 60, ry: Math.PI / 2,       // spawn at Elmbrook, facing north (-z)
            safeX: -6, safeZ: 60,
            hearts: G.cfg.startHearts, maxHearts: G.cfg.startHearts,
            stamina: 1, maxStamina: 1,                   // in wheels (1 wheel = 100 units)
            hunger: 80,
            xp: 0, level: 1,
            inv: {},                                     // item id -> count (non-weapons)
            weapons: [],                                 // [{ id, dur }]
            equip: -1,                                   // index into weapons
            hour: 7.5, day: 1,
            quests: {},                                  // id -> { s: 'active'|'done', step: n, prog: n }
            tracked: 'm1',
            found: {},                                   // poi id -> 1 (beacons/hollows/villages discovered; beacons activated)
            beacons: {}, hollows: {},
            fog: '',                                     // base64 of FOG*FOG bits
            taken: {},                                   // picked world items "cx,cz,i" -> 1 (cleared on red nights)
            killed: {},                                  // "camp:i" -> 1 (cleared on red nights)
            horse: null,                                 // { x, z, name } once tamed
            stats: { quests: 0, kills: 0, cooked: 0, picked: 0, climbed: 0, glided: 0, rode: 0, beacons: 0, hollows: 0, broken: 0, redNights: 0, level: 1, playSec: 0, boars: 0 },
            ach: {},
            gift: '',                                    // last daily gift date
            ended: false
        };
    };
    G.state = G.newState();

    /* ---------- fog of war ---------- */
    var fogBits = new Uint8Array(FOG * FOG);
    G.fogSize = FOG;
    G.fogBits = fogBits;
    G.revealAt = function (x, z, r) {                  // world metres
        var cell = G.WORLD / FOG, cx = (x + G.WORLD / 2) / cell, cz = (z + G.WORLD / 2) / cell, rc = r / cell, changed = false;
        for (var j = Math.floor(cz - rc); j <= Math.ceil(cz + rc); j++) for (var i = Math.floor(cx - rc); i <= Math.ceil(cx + rc); i++) {
            if (i < 0 || j < 0 || i >= FOG || j >= FOG) continue;
            var dx = i + 0.5 - cx, dz = j + 0.5 - cz;
            if (dx * dx + dz * dz <= rc * rc && !fogBits[j * FOG + i]) { fogBits[j * FOG + i] = 1; changed = true; }
        }
        return changed;
    };
    function packFog() {
        var bytes = new Uint8Array(Math.ceil(FOG * FOG / 8));
        for (var i = 0; i < FOG * FOG; i++) if (fogBits[i]) bytes[i >> 3] |= 1 << (i & 7);
        var s = ''; for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }
    function unpackFog(str) {
        fogBits.fill(0);
        if (!str) return;
        try { var s = atob(str); for (var i = 0; i < FOG * FOG; i++) if (s.charCodeAt(i >> 3) & (1 << (i & 7))) fogBits[i] = 1; } catch (e) { fogBits.fill(0); }
    }

    /* ---------- inventory ---------- */
    G.give = function (id, n) {
        var it = G.ITEMS[id]; if (!it) return false;
        n = n || 1;
        if (it.kind === 'weapon') {
            for (var k = 0; k < n; k++) {
                if (G.state.weapons.length >= G.MAX_WEAPONS) { G.ui && G.ui.toast(G.t('full')); return false; }
                G.state.weapons.push({ id: id, dur: it.dur });
                if (G.state.equip < 0) G.equip(G.state.weapons.length - 1);
            }
        } else G.state.inv[id] = (G.state.inv[id] || 0) + n;
        G.quests && G.quests.onEvent('collect', id);
        return true;
    };
    G.count = function (id) { return G.state.inv[id] || 0; };
    G.take = function (id, n) {
        n = n || 1; if ((G.state.inv[id] || 0) < n) return false;
        G.state.inv[id] -= n; if (!G.state.inv[id]) delete G.state.inv[id];
        return true;
    };
    G.equip = function (i) {
        G.state.equip = i;
        G.player && G.player.showWeapon();
    };
    G.weapon = function () { var s = G.state; return s.equip >= 0 && s.weapons[s.equip] ? s.weapons[s.equip] : null; };
    G.wearWeapon = function () {                       // one hit = one point of durability
        var w = G.weapon(); if (!w) return;
        w.dur--;
        if (w.dur <= 0) {
            G.state.weapons.splice(G.state.equip, 1);
            G.state.stats.broken++;
            G.audio.sfxBreak(); G.ui.toast(G.t('broke', G.t('item_' + w.id)));
            var best = -1, bd = -1;                     // auto-equip the strongest left
            for (var i = 0; i < G.state.weapons.length; i++) { var d = G.ITEMS[G.state.weapons[i].id].dmg; if (d > bd) { bd = d; best = i; } }
            G.equip(best);
            G.checkAch();
        }
    };
    G.eat = function (id) {
        var it = G.ITEMS[id], s = G.state;
        if (!it || (it.kind !== 'food' && it.kind !== 'raw') || !G.take(id, 1)) return false;
        s.hearts = Math.min(s.maxHearts, s.hearts + (it.hearts || 0));
        if (it.stamina) s.stamina = Math.min(s.maxStamina + 1, s.stamina + it.stamina);     // can overfill by one wheel (yellow)
        s.hunger = Math.min(100, s.hunger + (it.kind === 'food' ? 35 : 12));
        G.audio.sfxEat();
        return true;
    };
    G.cook = function (ingr) {                          // ingr: array of item ids (1-3)
        var sorted = ingr.slice().sort(), result = null, r, i;
        for (r = 0; r < G.RECIPES.length && !result; r++) {
            var need = G.RECIPES[r].needs.slice().sort();
            if (need.length === sorted.length) { var ok = true; for (i = 0; i < need.length; i++) if (need[i] !== sorted[i]) ok = false; if (ok) result = G.RECIPES[r].gives; }
        }
        if (!result) result = sorted.indexOf('meat') >= 0 || sorted.indexOf('mushroom') >= 0 ? 'stew' : sorted.indexOf('herb') >= 0 ? 'herbtea' : 'roastapple';
        for (i = 0; i < ingr.length; i++) if (!G.take(ingr[i], 1)) return null;
        G.state.inv[result] = (G.state.inv[result] || 0) + 1;
        G.state.stats.cooked++;
        G.quests.onEvent('cook');
        G.audio.sfxCook();
        G.checkAch();
        return result;
    };
    G.addXp = function (n) {
        var s = G.state; s.xp += n;
        while (s.level < G.LEVELS.length && s.xp >= G.LEVELS[s.level]) {
            s.level++; s.stats.level = s.level;
            s.hearts = s.maxHearts;
            G.ui.banner(G.t('levelup', s.level), G.t('levelup_sub'));
            G.audio.sfxQuest();
        }
        G.checkAch();
    };
    G.attackBonus = function () { return Math.floor((G.state.level - 1) / 3); };

    G.checkAch = function () {
        var s = G.state;
        for (var i = 0; i < G.ACHIEVEMENTS.length; i++) {
            var a = G.ACHIEVEMENTS[i];
            if (!s.ach[a.id] && (s.stats[a.stat] || 0) >= a.n) {
                s.ach[a.id] = 1;
                G.ui && G.ui.toast('★ ' + G.t('ach_' + a.id), true);
                G.addXp(25);
            }
        }
    };

    /* ---------- save / load ---------- */
    G.serialize = function () {
        var s = G.state;
        var keys = Object.keys(s.taken);
        if (keys.length > MAX_TAKEN) for (var i = 0; i < keys.length - MAX_TAKEN; i++) delete s.taken[keys[i]];
        s.fog = packFog();
        s.saved = Date.now();
        return JSON.parse(JSON.stringify(s));
    };
    G.saveGame = function (manual) {
        if (!G.playing) return;
        try { MyPC.save(manual ? 'manual' : 'save', G.serialize()); } catch (e) {}
        if (manual) G.ui.toast(G.t('saved'));
    };
    G.peekSave = function (key) {
        var d = MyPC.load(key, null);
        return d && d.format === SAVE_FORMAT && typeof d.x === 'number' ? d : null;
    };
    G.loadGame = function (key) {
        var d = G.peekSave(key); if (!d) return false;
        var s = G.newState();
        for (var k in s) if (d[k] !== undefined) s[k] = d[k];
        for (k in G.newState().stats) if (typeof s.stats[k] !== 'number') s.stats[k] = 0;
        if (!(s.hearts > 0)) s.hearts = Math.max(1, s.maxHearts);
        G.state = s; unpackFog(s.fog);
        return true;
    };
    G.resetState = function () { G.state = G.newState(); fogBits.fill(0); };

    /* ---------- settings ---------- */
    G.settings = { quality: '', music: true, sfx: true, voice: true, autoSprint: true, camDist: 1, invertTurn: false,
                   binds: { interact: 'ok', attack: 'ok', jump: 'ok', sprint: 'run', map: 'cancel', menu: 'menu' } };
    G.loadSettings = function () {
        var d = MyPC.load('settings', null);
        if (d && typeof d === 'object') for (var k in G.settings) if (d[k] !== undefined) {
            if (k === 'binds' && d.binds) { for (var b in G.settings.binds) if (typeof d.binds[b] === 'string') G.settings.binds[b] = d.binds[b]; }
            else G.settings[k] = d[k];
        }
    };
    G.saveSettings = function () { try { MyPC.save('settings', G.settings); } catch (e) {} };
})();
