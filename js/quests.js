/* Quests, dialogue and everything the OK button can interact with:
 * villagers, items, horses, campfires (cook / rest), beacons, Hollow trials, camp chests. */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var Q = G.quests = {};
    var byId = {};
    for (var i = 0; i < G.QUESTS.length; i++) byId[G.QUESTS[i].id] = G.QUESTS[i];
    Q.byId = byId;
    G.poi = function (id) { for (var i = 0; i < G.POIS.length; i++) if (G.POIS[i].id === id) return G.POIS[i]; return null; };
    G.npcDef = function (id) { for (var i = 0; i < G.NPCS.length; i++) if (G.NPCS[i].id === id) return G.NPCS[i]; return null; };

    function qs(id) { return G.state.quests[id]; }
    Q.active = function (id) { var q = qs(id); return q && q.s === 'active'; };
    Q.done = function (id) { var q = qs(id); return q && q.s === 'done'; };
    Q.step = function (id) { var q = qs(id), d = byId[id]; return q && q.s === 'active' ? d.obj[q.step] : null; };
    Q.bossReady = function () { return Q.active('m8') || Q.done('m8'); };

    /* start the game: first main quest */
    Q.begin = function () {
        if (!qs('m1')) { G.state.quests.m1 = { s: 'active', step: 0, prog: 0 }; G.state.tracked = 'm1'; }
    };
    function start(id, silent) {
        if (qs(id) && qs(id).s !== 'offer') return;
        G.state.quests[id] = { s: 'active', step: 0, prog: 0 };
        if (!silent) { G.ui.banner(G.t('newquest'), G.t('q_' + id)); G.audio.sfxQuest(); }
        if (!G.state.tracked || Q.done(G.state.tracked)) G.state.tracked = id;
    }
    function unlock() {                                   // side quests whose condition is met
        for (var i = 0; i < G.QUESTS.length; i++) {
            var d = G.QUESTS[i];
            if (d.main || qs(d.id) || !Q.done(d.after)) continue;
            if (d.giver) G.state.quests[d.id] = { s: 'offer', step: 0, prog: 0 };
            else start(d.id);
        }
    }
    function complete(id) {
        var d = byId[id], q = qs(id), S = G.state, r = d.reward || {};
        q.s = 'done';
        S.stats.quests++;
        var already = S.coopGot[id];                    // got this reward already while helping a friend: no second heart
        if (r.hearts && !already) { S.maxHearts += r.hearts; }
        if (r.stamina && !already) { S.maxStamina += r.stamina * 0.2; }
        S.hearts = S.maxHearts;
        for (var k in r.items || {}) G.give(k, r.items[k]);
        if (r.items && r.items.windcloak) G.player.sync();
        G.ui.banner(G.t('questdone'), G.t('q_' + id));
        G.audio.sfxQuest();
        if (r.xp) G.addXp(r.xp);
        if (d.main) {
            var n = +id.slice(1) + 1;
            if (byId['m' + n]) start('m' + n);
            else { S.ended = true; G.ui.ending(); }
        }
        unlock();
        if (S.tracked === id) S.tracked = nextTrack();
        G.checkAch();
        if (G.coop) G.coop.onQuestDone(id);
        G.saveGame(false);
    }
    /* co-op guest: the host finished a quest, the friend gets the same reward once */
    Q.coopReward = function (id) {
        var d = byId[id], S = G.state; if (!d || S.coopGot[id] || Q.done(id)) return false;
        var r = d.reward || {};
        S.coopGot[id] = 1;
        if (r.hearts) S.maxHearts += r.hearts;
        if (r.stamina) S.maxStamina += r.stamina * 0.2;
        S.hearts = S.maxHearts;
        for (var k in r.items || {}) G.give(k, r.items[k]);
        if (r.items && r.items.windcloak) G.player.sync();
        if (r.xp) G.addXp(r.xp);
        G.ui.banner(G.t('coop_reward'), G.t('q_' + id)); G.audio.sfxQuest();
        G.saveGame(false);
        return true;
    };
    function nextTrack() {
        for (var i = 0; i < G.QUESTS.length; i++) if (Q.active(G.QUESTS[i].id)) return G.QUESTS[i].id;
        return '';
    }
    function advance(id) {
        var q = qs(id), d = byId[id];
        q.step++; q.prog = 0;
        if (q.step >= d.obj.length) complete(id);
        else { G.ui.toast(G.t('questupd') + ': ' + G.t('q_' + id)); G.audio.sfxSelect(); G.saveGame(false); }
    }

    /* does the current step of a quest already hold? (checked twice a second) */
    function holds(o, q) {
        var S = G.state, p;
        switch (o.k) {
            case 'reach': p = G.poi(o.poi); return Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z) < p.r;
            case 'beacon': return !!S.beacons[o.poi];
            case 'hollow': return !!S.hollows[o.poi];
            case 'kill': if (o.camp) { var n = 0; for (var j = 0; j < 9; j++) if (S.killed[o.camp + ':' + j]) n++; return n >= o.n; } return q.prog >= o.n;
            case 'collect': return G.count(o.item) >= o.n;
            case 'cook': return q.prog >= o.n;
            case 'tame': return !!S.horse;
            case 'boss': return !!S.killed['crown:0'];
            case 'survive_red': return q.prog >= 1;
        }
        return false;
    }
    Q.check = function () {
        for (var i = 0; i < G.QUESTS.length; i++) {
            var d = G.QUESTS[i], q = qs(d.id);
            if (!q || q.s !== 'active') continue;
            var o = d.obj[q.step];
            if (o && holds(o, q)) advance(d.id);
        }
    };
    Q.onEvent = function (kind, a, b) {
        for (var i = 0; i < G.QUESTS.length; i++) {
            var d = G.QUESTS[i], q = qs(d.id);
            if (!q || q.s !== 'active') continue;
            var o = d.obj[q.step]; if (!o) continue;
            if (kind === 'kill' && o.k === 'kill' && o.type === a) q.prog++;
            if (kind === 'cook' && o.k === 'cook') q.prog++;
            if (kind === 'red' && o.k === 'survive_red') q.prog++;
        }
    };

    /* where the compass points for a quest (null when anywhere works) */
    var tgt = { x: 0, z: 0 };
    Q.target = function (id) {
        var o = Q.step(id); if (!o) return null;
        var p = null;
        if (o.poi) p = G.poi(o.poi);
        else if (o.camp) p = G.poi(o.camp);
        else if (o.npc) { var n = G.npcDef(o.npc), h = G.poi(n.home); tgt.x = h.x + n.at.x; tgt.z = h.z + n.at.z; return tgt; }
        else if (o.k === 'tame') p = G.poi('stable');
        else if (o.k === 'boss') p = G.poi('crown');
        else if (o.k === 'cook') p = nearestFire();
        if (!p) return null;
        tgt.x = p.x; tgt.z = p.z; return tgt;
    };
    function nearestFire() {
        var best = null, bd = 1e12, px = G.player.pos.x, pz = G.player.pos.z;
        for (var i = 0; i < G.fires.length; i++) { var f = G.fires[i], d = (f.x - px) * (f.x - px) + (f.z - pz) * (f.z - pz); if (d < bd) { bd = d; best = f; } }
        return best;
    }

    /* ---------------- dialogue ---------------- */
    function say(npc, key, choices, cb) {
        var text = G.t(key);
        G.ui.dialog(G.t('npc_' + npc.id), text, choices, cb);
        G.voice.speak(npc.id, key, G.t('npc_' + npc.id) + '. ' + text);
    }
    Q.talk = function (a) {
        var npc = a.npc, S = G.state, i, d, q, o;
        if (a.scared) { say(npc, 'scared'); return; }
        /* 1. an active step that needs this person */
        for (i = 0; i < G.QUESTS.length; i++) {
            d = G.QUESTS[i]; q = qs(d.id); if (!q || q.s !== 'active') continue;
            o = d.obj[q.step];
            if (o && o.k === 'talk' && o.npc === npc.id) { say(npc, d.id + '_talk'); advance(d.id); return; }
            if (o && o.k === 'give' && o.npc === npc.id) {
                if (G.count(o.item) >= o.n) { G.take(o.item, o.n); say(npc, d.id + '_give'); advance(d.id); }
                else say(npc, d.id + '_need');
                return;
            }
        }
        /* 2. a side quest this person offers */
        for (i = 0; i < G.QUESTS.length; i++) {
            d = G.QUESTS[i]; q = qs(d.id);
            if (d.giver === npc.id && q && q.s === 'offer') {
                say(npc, d.id + '_offer', [G.t('accept'), G.t('later')], function (c) {
                    if (c === 0) { start(d.id); if (d.id === 's6') G.give('letter', 1); }
                });
                return;
            }
        }
        /* 3. Mira's shrine: trade Hollow orbs for a heart or stamina */
        if (npc.id === 'mira' && G.count('orb') >= 4) {
            say(npc, 'mira_orbs', [G.t('heart'), G.t('stamina'), G.t('later')], function (c) {
                if (c === 2 || !G.take('orb', 4)) return;
                if (c === 0) S.maxHearts += 1; else S.maxStamina += 0.2;
                S.hearts = S.maxHearts; S.stamina = S.maxStamina;
                G.ui.banner(G.t(c === 0 ? 'gotheart' : 'gotstamina'), ''); G.audio.sfxQuest();
            });
            return;
        }
        /* 4. small talk that hints at the tracked quest, then their own lines */
        var tr = S.tracked && Q.step(S.tracked);
        if (tr && npc.id === 'mira') { say(npc, 'hint_' + S.tracked); return; }
        a.line = ((a.line || 0) + 1) % npc.lines.length;
        say(npc, npc.lines[a.line]);
    };

    /* ---------------- interactions ---------------- */
    var near = { kind: '', ref: null, label: '' };
    G.interactTarget = null;
    /* find the best thing to interact with (called every few steps) */
    Q.scan = function () {
        var P = G.player, px = P.pos.x, py = P.pos.y, pz = P.pos.z, best = null, bd = 1e9, i, d, label = '';
        if (P.riding() || G.trial) { G.interactTarget = null; return; }
        var A = G.agents.list;
        for (i = 0; i < A.length; i++) {
            var a = A[i];
            if (a.npc && !a.asleep) { d = Math.hypot(a.x - px, a.z - pz); if (d < 3.2 && d < bd) { bd = d; best = a; label = 'talk'; near.kind = 'npc'; } }
            else if (a.kind === 'horse' && !a.rider) { d = Math.hypot(a.x - px, a.z - pz); if (d < 2.8 && d < bd) { bd = d; best = a; label = 'mount'; near.kind = 'horse'; } }
        }
        var items = G.world.items;
        for (i = 0; i < items.length; i++) {
            var it = items[i]; d = Math.hypot(it.x - px, it.z - pz);
            if (d < 2 && Math.abs(it.y - py) < 2.5 && d < bd) { bd = d; best = it; label = 'pick'; near.kind = 'item'; }
        }
        for (i = 0; i < G.fires.length; i++) {
            var f = G.fires[i]; d = Math.hypot(f.x - px, f.z - pz);
            if (d < 3.5 && d < bd) { bd = d; best = f; label = 'cook'; near.kind = 'fire'; }
        }
        for (i = 0; i < G.POIS.length; i++) {
            var p = G.POIS[i];
            if (p.type === 'beacon' && !G.state.beacons[p.id]) {
                d = Math.hypot(p.x - px, p.z - pz);
                if (d < 4.2 && py > p.y + 29 && d < bd + 2) { bd = d; best = p; label = 'activate'; near.kind = 'beacon'; }
            } else if (p.type === 'hollow' && !G.state.hollows[p.id]) {
                d = Math.hypot(p.x - px, p.z - pz);
                if (d < 3 && d < bd) { bd = d; best = p; label = 'trial'; near.kind = 'hollow'; }
            } else if (p.type === 'camp' && !G.state.found['chest:' + p.id]) {
                d = Math.hypot(p.x - px, p.z + 5 - pz);
                if (d < 2.5 && d < bd) { bd = d; best = p; label = G.agents.campCleared(p.id) ? 'open' : 'locked'; near.kind = 'chest'; }
            }
        }
        G.interactTarget = best; near.ref = best; near.label = label;
        G.ui.prompt(best ? G.t('do_' + label, best.type && near.kind === 'item' ? G.t('item_' + best.type) : '') : '');
    };
    G.interact = function (target) {
        var S = G.state;
        switch (near.kind) {
            case 'npc': Q.talk(target); break;
            case 'horse':
                if (G.coop && G.coop.role === 'guest') { G.ui.toast(G.t('coop_nohorse')); break; }   // horses live in the host's world
                G.player.mount(target); break;
            case 'item':
                if (G.give(target.type, 1)) {
                    G.world.takeItem(target); S.stats.picked++; G.audio.sfxPick();
                    G.ui.toast('+1 ' + G.t('item_' + target.type));
                    G.checkAch();
                }
                break;
            case 'fire':
                var village = target.village;
                G.ui.choice(G.t('fire'), village ? [G.t('cookit'), G.t('rest'), G.t('cancel')] : [G.t('cookit'), G.t('cancel')], function (c) {
                    if (c === 0) G.ui.openCook();
                    else if (c === 1 && village) { if (G.coop && G.coop.role === 'guest') G.ui.toast(G.t('coop_norest')); else G.rest(); }
                });
                break;
            case 'beacon':
                S.beacons[target.id] = 1; S.found[target.id] = 1; S.stats.beacons++;
                G.revealAt(target.x, target.z, 380);
                G.lightBeacon(target.id);
                G.audio.sfxBeacon(); G.ui.banner(G.t('beacon_on'), G.t('beacon_sub'));
                G.addXp(60); G.checkAch(); G.saveGame(false);
                break;
            case 'hollow': startTrial(target); break;
            case 'chest':
                if (!G.agents.campCleared(target.id)) { G.ui.toast(G.t('chest_locked')); break; }
                S.found['chest:' + target.id] = 1;
                G.give(Math.random() < 0.5 ? 'ironsword' : 'rustsword', 1); G.give('shard', 2); G.give('orb', 1);
                G.ui.toast(G.t('chest_open')); G.audio.sfxQuest(); G.addXp(40); G.saveGame(false);
                G.hideChest(target.id);
                break;
        }
        G.interactTarget = null;
    };

    /* ---------------- Hollow trials: catch the light orbs before time runs out ---------------- */
    var orbMeshes = [], orbs = [];
    Q.init = function (scene) {
        orbMeshes = []; orbs = []; G.trial = null;
        var geo = new T.IcosahedronGeometry(0.45, 0), mat = new T.MeshBasicMaterial({ color: 0xfff27a });
        for (var i = 0; i < 9; i++) { var m = new T.Mesh(geo, mat); m.visible = false; scene.add(m); orbMeshes.push(m); orbs.push({ x: 0, y: 0, z: 0, on: false }); }
    };
    function startTrial(p) {
        var n = 5 + (G.POIS.indexOf(p) % 3), y = p.y;
        G.trial = { id: p.id, time: 30 + n * 4, left: n, p: p };
        for (var i = 0; i < orbs.length; i++) {
            var o = orbs[i]; o.on = i < n;
            if (!o.on) { orbMeshes[i].visible = false; continue; }
            var a = i / n * 6.28, r = 7 + (i % 2) * 9;
            o.x = p.x + Math.cos(a) * r; o.z = p.z + Math.sin(a) * r;
            o.y = Math.max(y, G.world.heightAt(o.x, o.z)) + (i % 3 === 2 ? 3.4 : 1.2);   // some need a jump or a climb
            if (i % 2 === 0) o.y = y + 4.3;                                            // on top of the pillars
            orbMeshes[i].position.set(o.x, o.y, o.z); orbMeshes[i].visible = true;
        }
        G.ui.banner(G.t('trial'), G.t('trial_sub', n)); G.audio.sfxSelect();
    }
    Q.updateTrial = function (dt) {
        var tr = G.trial; if (!tr) return;
        tr.time -= dt;
        var P = G.player.pos;
        for (var i = 0; i < orbs.length; i++) {
            var o = orbs[i]; if (!o.on) continue;
            orbMeshes[i].rotation.y += dt * 2;
            var dx = o.x - P.x, dy = o.y - (P.y + 1), dz = o.z - P.z;
            if (dx * dx + dy * dy + dz * dz < 2.2 * 2.2) { o.on = false; orbMeshes[i].visible = false; tr.left--; G.audio.sfxPick(); }
        }
        G.ui.trial(tr.left, tr.time);
        if (tr.left <= 0) {
            G.state.hollows[tr.id] = 1; G.state.found[tr.id] = 1; G.state.stats.hollows++;
            G.give('orb', 1); G.addXp(80);
            G.ui.banner(G.t('trial_win'), G.t('trial_win_sub')); G.audio.sfxQuest();
            G.lightHollow(tr.id);
            G.trial = null; G.ui.trial(-1, 0); G.checkAch(); G.saveGame(false);
        } else if (tr.time <= 0) {
            for (i = 0; i < orbs.length; i++) { orbs[i].on = false; orbMeshes[i].visible = false; }
            G.ui.banner(G.t('trial_fail'), G.t('trial_fail_sub')); G.trial = null; G.ui.trial(-1, 0);
        }
    };
})();
