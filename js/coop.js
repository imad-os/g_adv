/* Co-op for two: a friend joins from another My PC device (TV, phone, PC) on the same Wi-Fi.
 * My PC owns the whole lobby (MyPC.multiplayer: "Open a room", "Join a friend", Accept / Decline);
 * this file only talks to the one connected peer.
 *  - The HOST's world is the real one: enemies, animals, villagers, time of day, weather, difficulty.
 *    Enemies attack whichever player is nearer.
 *  - The GUEST plays their OWN hero from their OWN save (hearts, weapons, food, level, quests) and
 *    draws the host's creatures from small snapshots (10 a second). Their swings are sent to the host.
 *  - Rewards are shared: every kill gives both players the xp and the loot, and when the host finishes
 *    a quest the friend gets the same reward once.
 *  - Names are the My PC profile names of each device.
 * Everything that arrives from the other device is checked before use (numbers, ranges, ids). */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var C = G.coop = { role: null, partner: null, hostDiff: '' };
    var peer = null, session = null, scene = null, tick = 0, lastHitTick = -99, hudT = 0;
    var mesh = null, tag = null, weaponMesh = null, weaponId = '', phase = 0;
    var MODES = ['ground', 'air', 'climb', 'glide', 'swim', 'ride', 'tower'];

    function num(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
    function cleanName(n) { n = typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : ''; return n || G.t('friend'); }
    C.supported = function () { return !!(window.MyPC && MyPC.apiLevel >= 3 && MyPC.multiplayer && MyPC.multiplayer.supported); };
    C.myName = function () { return G.profileName || G.t('player'); };
    C.active = function () { return !!(peer && C.partner && C.partner.ready); };

    /* ---------------- the friend's hero and name tag (rebuilt with the scene) ---------------- */
    C.init = function (sc) {
        scene = sc; weaponMesh = null; weaponId = '';
        mesh = G.chars.hero(0xc0392b, 0xffb347); mesh.visible = false; scene.add(mesh);
        tag = new T.Sprite(new T.SpriteMaterial({ map: nameTexture(C.partner ? C.partner.name : ''), depthTest: false, transparent: true }));
        tag.scale.set(3.6, 0.68, 1); tag.visible = false; tag.renderOrder = 10; scene.add(tag);
    };
    function nameTexture(name) {
        var c = document.createElement('canvas'); c.width = 512; c.height = 96;
        var x = c.getContext('2d');
        x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(name, 256, 50);
        x.fillStyle = '#ffd38a'; x.fillText(name, 256, 50);
        var t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; return t;
    }
    function setTag(name) { if (!tag) return; if (tag.material.map) tag.material.map.dispose(); tag.material.map = nameTexture(name); tag.material.needsUpdate = true; }

    function newPartner(name) {
        return { name: cleanName(name), ready: false, x: 0, y: 0, z: 0, ry: 0, nx: 0, ny: 0, nz: 0, nry: 0, mode: 'ground', speed: 0,
                 swing: false, dead: false, hearts: 3, maxHearts: 3, weapon: '', cloak: false };
    }

    /* ---------------- starting and ending a session ---------------- */
    C.host = function () {                                                     // from the in-game menu: open a room
        if (!C.supported() || C.role) return;
        MyPC.multiplayer.host({ max: 1 }).then(function (s) {
            session = s; C.role = 'host';
            G.ui.toast(G.t('coop_open'), true); G.ui.refresh();
            s.onPeer(function (p) { if (peer) { try { p.close(); } catch (e) {} return; } attach(p); });
        }, function (e) { if (e && e.code !== 'cancelled') G.ui.toast(G.t('coop_fail')); });
    };
    C.join = function () {                                                     // from the title: find a friend's room
        if (!C.supported() || C.role) return;
        MyPC.multiplayer.join().then(function (h) {
            C.role = 'guest'; attach(h);
            peer.send({ t: 'hello', v: G.VERSION });
            G.ui.toast(G.t('coop_connecting'));
        }, function () { /* My PC already told the player why (or they pressed Back) */ });
    };
    function attach(p) {
        peer = p; C.partner = newPartner(p.name); setTag(C.partner.name);
        p.onMessage(onMessage);
        p.onClose(function () { if (peer === p) ended(true); });
    }
    C.leave = function () {
        if (peer) { try { peer.send({ t: 'bye' }); } catch (e) {} }
        ended(false);
    };
    function ended(byOther) {
        var wasGuest = C.role === 'guest', name = C.partner ? C.partner.name : '', p = peer;
        peer = null; C.partner = null; C.role = null; C.hostDiff = '';
        if (p) { try { p.close(); } catch (e) {} }
        if (session) { try { session.close(); } catch (e) {} session = null; }
        if (mesh) mesh.visible = false; if (tag) tag.visible = false;
        G.ui.partnerHud('');
        if (wasGuest) {                                                        // the guest's world was the host's: back to the title
            G.saveGame(false); G.agents.resetSpawns();
            if (G.playing) { G.toTitle(); G.ui.choice(G.t('coop_ended', name), [G.t('ok')], null); }
        } else if (byOther && name) G.ui.toast(G.t('coop_left', name));
        G.ui.refresh();
    }
    C.send = function (m) { if (peer) peer.send(m); };

    /* ---------------- messages ---------------- */
    function onMessage(m) {
        if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !C.partner) return;
        var S = G.state, p = C.partner;
        switch (m.t) {
            case 'hello':                                                      // host: the friend is here
                if (C.role !== 'host') return;
                if (m.v !== G.VERSION) { peer.send({ t: 'bye', why: 'version' }); G.ui.toast(G.t('coop_version')); C.leave(); return; }
                peer.send({ t: 'welcome', x: Math.round(G.player.pos.x), z: Math.round(G.player.pos.z), w: world() });
                break;
            case 'welcome':                                                    // guest: start playing in the host's world
                if (C.role !== 'guest' || !m.w || !num(m.x, -2000, 2000) || !num(m.z, -2000, 2000)) return;
                G.startGame(G.peekSave('save') ? 'save' : null, true);
                applyWorld(m.w);
                G.player.teleport(m.x + 2.5, m.z + 2.5);
                G.ui.banner(G.t('coop_with', p.name), G.t('diff_' + C.hostDiff));
                break;
            case 'p':                                                          // the other hero
                if (!num(m.x, -1000, 1000) || !num(m.y, -50, 400) || !num(m.z, -1000, 1000) || !num(m.ry, -1e4, 1e4)) return;
                p.nx = m.x; p.ny = m.y; p.nz = m.z; p.nry = m.ry;
                if (!p.ready) { p.x = m.x; p.y = m.y; p.z = m.z; p.ry = m.ry; p.ready = true; G.ui.toast(G.t('coop_joined', p.name), true); G.audio.sfxQuest(); G.ui.refresh(); }
                p.mode = MODES[m.m] || 'ground'; p.speed = num(m.sp, 0, 40) ? m.sp : 0; p.swing = !!m.sw; p.dead = !!m.dd;
                if (num(m.h, 0, 60)) p.hearts = m.h; if (num(m.mh, 1, 60)) p.maxHearts = m.mh;
                p.weapon = typeof m.w === 'string' && G.ITEMS[m.w] && G.ITEMS[m.w].kind === 'weapon' ? m.w : '';
                p.cloak = !!m.cl;
                break;
            case 'a': if (C.role === 'guest') G.agents.netApply(m.l); break;
            case 'w': if (C.role === 'guest') applyWorld(m); break;
            case 'dmg':
                if (C.role === 'guest' && num(m.n, 0, 30) && num(m.x, -1000, 1000) && num(m.z, -1000, 1000) && G.playing) G.player.hurt(m.n, m.x, m.z);
                break;
            case 'hit':                                                        // host: the friend swung a weapon
                if (C.role !== 'host' || !p.ready || p.dead) return;
                if (!num(m.x, -1000, 1000) || !num(m.z, -1000, 1000) || !num(m.ry, -1e4, 1e4) || !num(m.r, 0, 4) || !num(m.c, 0, 1.6) || !num(m.d, 0, 30)) return;
                if (Math.abs(m.x - p.nx) + Math.abs(m.z - p.nz) > 10 || tick - lastHitTick < 15) return;   // near where they are, at most 4 a second
                lastHitTick = tick;
                G.agents.hitArc({ x: m.x, z: m.z }, m.ry, m.r, m.c, m.d);
                break;
            case 'kill': if (C.role === 'guest') sharedKill(m); break;
            case 'quest': if (C.role === 'guest' && typeof m.id === 'string') G.quests.coopReward(m.id); break;
            case 'bye': ended(true); break;
        }
    }
    function world() {
        var S = G.state;
        return { t: 'w', h: Math.round(S.hour * 100) / 100, d: S.day, rn: G.redNight, r: G.weather.rain, s: G.weather.snow, df: G.diffId() };
    }
    function applyWorld(w) {
        var S = G.state;
        if (num(w.h, 0, 24)) S.hour = w.h;
        if (num(w.d, 1, 1e6) && w.d !== S.day) { S.day = Math.floor(w.d); G.world.setSeason(G.season()); }
        if (!w.rn && G.redNight) G.redMoon();                                  // the red moon passed in the host's world
        if (w.rn && !G.redNight) G.ui.banner(G.t('rednight'), G.t('rednight_sub'));
        G.redNight = !!w.rn; G.weather.rain = !!w.r; G.weather.snow = !!w.s;
        if (G.DIFFS[w.df]) C.hostDiff = w.df;
    }

    /* ---------------- shared rewards and damage ---------------- */
    C.onKill = function (a, loot) {                                            // host: called for every kill, by either player
        if (C.role !== 'host' || !C.active()) return;
        peer.send({ t: 'kill', k: a.kind, c: a.camp, i: a.idx, xp: a.st.xp, loot: loot });
    };
    function sharedKill(m) {
        var S = G.state, kinds = { grubber: 1, brute: 1, warden: 1, stag: 1, boar: 1, wolf: 1 };
        if (!kinds[m.k] || !num(m.xp, 0, 500)) return;
        var camp = typeof m.c === 'string' && G.poi(m.c) ? m.c : null;
        if (camp && num(m.i, 0, 20)) S.killed[camp + ':' + Math.floor(m.i)] = 1;
        S.stats.kills++; if (m.k === 'boar') S.stats.boars++;
        G.addXp(m.xp);
        var got = [];
        if (Array.isArray(m.loot)) for (var i = 0; i < m.loot.length && i < 4; i++) {
            var id = m.loot[i]; if (typeof id === 'string' && G.ITEMS[id] && G.give(id, 1)) got.push(G.t('item_' + id));
        }
        if (got.length) G.ui.toast(G.t('coop_loot') + ': ' + got.join(', '));
        G.quests.onEvent('kill', m.k, camp);
        if (m.k === 'warden' && camp) { S.killed[camp + ':0'] = 1; G.quests.onEvent('boss'); }
        G.checkAch();
    }
    C.onQuestDone = function (id) { if (C.role === 'host' && C.active()) peer.send({ t: 'quest', id: id }); };
    C.hurtPartner = function (n, x, z) {                                       // host: an enemy hit the friend
        if (C.active()) peer.send({ t: 'dmg', n: Math.round(n * 100) / 100, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
    };
    C.sendHit = function (pos, ry, r, c, d) {
        if (C.active()) peer.send({ t: 'hit', x: Math.round(pos.x * 10) / 10, z: Math.round(pos.z * 10) / 10, ry: Math.round(ry * 100) / 100, r: r, c: c, d: d });
    };

    /* ---------------- per step (60 a second; ~25 messages a second in total) ---------------- */
    C.update = function () {
        if (!peer || !C.partner) return;
        tick++;
        var P = G.player, S = G.state, p = C.partner;
        if (tick % 4 === 0 && G.playing) {
            var w = G.weapon();
            peer.send({ t: 'p', x: Math.round(P.pos.x * 100) / 100, y: Math.round(P.pos.y * 100) / 100, z: Math.round(P.pos.z * 100) / 100,
                        ry: Math.round(P.ry * 100) / 100, m: MODES.indexOf(P.mode()), sp: Math.round(P.speed * 10) / 10, sw: P.swinging() > 0 ? 1 : 0,
                        dd: G.dead ? 1 : 0, h: Math.round(S.hearts * 4) / 4, mh: S.maxHearts, w: w ? w.id : '', cl: S.inv.windcloak ? 1 : 0 });
        }
        if (C.role === 'host' && p.ready) {
            if (tick % 6 === 3) peer.send({ t: 'a', l: G.agents.snapshot(p.nx, p.nz) });
            if (tick % 60 === 30) peer.send(world());
        }
        if (p.ready) {
            var k = 0.25;
            p.x += (p.nx - p.x) * k; p.y += (p.ny - p.y) * k; p.z += (p.nz - p.z) * k;
            if (Math.abs(p.nx - p.x) + Math.abs(p.nz - p.z) > 40) { p.x = p.nx; p.y = p.ny; p.z = p.nz; }
            var d = p.nry - p.ry; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; p.ry += d * k;
        }
        hudT--;
        if (hudT <= 0) {
            hudT = 15;
            G.ui.partnerHud(p.ready ? p.name + '   ♥ ' + p.hearts + ' / ' + p.maxHearts + (p.dead ? '   ✝' : '') : G.t('coop_connecting'));
        }
    };

    /* ---------------- draw the friend (render rate) ---------------- */
    C.sync = function (dt) {
        var p = C.partner, on = !!(p && p.ready && G.playing && mesh);
        if (mesh) mesh.visible = on; if (tag) tag.visible = on;
        if (!on) return;
        var ud = mesh.userData, swim = p.mode === 'swim', up = p.mode === 'climb' || p.mode === 'tower' || p.mode === 'glide';
        mesh.position.set(p.x, p.y - (swim ? 1.1 : 0) - (p.mode === 'ride' ? 0.45 : 0), p.z);
        mesh.rotation.y = p.ry + Math.PI / 2;
        mesh.rotation.z = p.dead ? 1.4 : 0;
        if (p.speed > 0.2) phase += p.speed * dt * 1.6; else phase *= 0.9;
        var sw = Math.sin(phase) * (p.speed > 6 ? 0.9 : 0.6);
        if (p.mode === 'ride') { ud.legL.rotation.x = -1.2; ud.legR.rotation.x = -1.2; }
        else { ud.legL.rotation.x = up ? sw * 0.5 - 0.4 : sw; ud.legR.rotation.x = up ? -sw * 0.5 - 0.4 : -sw; }
        ud.armL.rotation.x = up ? -2.8 : -sw * 0.8;
        ud.armR.rotation.x = p.swing ? -2.2 : up ? -2.8 : sw * 0.8;
        ud.glider.visible = p.mode === 'glide';
        ud.cloak.visible = p.cloak;
        if (p.weapon !== weaponId) {
            if (weaponMesh) { ud.hand.remove(weaponMesh); weaponMesh = null; }
            weaponId = p.weapon;
            if (weaponId) { weaponMesh = G.chars.weapon(weaponId); weaponMesh.rotation.x = Math.PI / 2; ud.hand.add(weaponMesh); }
        }
        tag.position.set(p.x, p.y + 2.75, p.z);
    };
})();
