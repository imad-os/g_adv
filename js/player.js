/* Kael, the hero: walking, sprinting, jumping, climbing anything, gliding, swimming, riding,
 * fighting with breakable weapons, stamina, hearts and hunger. Runs in the fixed 60 Hz step. */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var P = G.player = {};
    var W, S;
    var DT = 1 / 60;
    var WALK = 4.4, SPRINT = 7.6, BACK = 2.2, TIRED = 2.4, CLIMB = 1.9, SWIM = 2.3, SWIM_FAST = 4.2, GLIDE_F = 8.5, GLIDE_V = -2.2;
    var GRAV = -24, JUMP_V = 8;
    var mode = 'ground';                 // ground | air | climb | glide | swim | ride | tower
    var vy = 0, fallFrom = 0, airTime = 0, exhausted = false, staminaCd = 0, safeTimer = 0;
    var swingT = 0, swingHit = false, cooldown = 0, hurtT = 0, stepT = 0, phase = 0, okHeld = 0, upHeld = 0;
    var needRelease = false, tame = 0, mount = null, spurT = 0, spurs = 3, spurRegen = 0, rideSpeed = 0, tower = null;
    var mesh, weaponMesh = null, slope = { s: 0, nx: 0, nz: 0 }, push = { x: 0, z: 0 };
    P.pos = new T.Vector3(); P.ry = 0; P.speed = 0;

    P.init = function (scene) {
        W = G.world;
        mesh = G.chars.hero(); scene.add(mesh); P.mesh = mesh;
    };
    P.place = function () {
        S = G.state;
        P.pos.set(S.x, S.y, S.z); P.ry = S.ry;
        P.pos.y = groundAt(P.pos.x, P.pos.z, S.y + 0.5);
        mode = 'ground'; vy = 0; exhausted = false; mount = null; tower = null; swingT = 0; okHeld = 0;
        mesh.userData.cloak.visible = !!S.inv.windcloak;
        P.showWeapon(); P.sync();
    };
    P.showWeapon = function () {
        if (!mesh) return;
        if (weaponMesh) { mesh.userData.hand.remove(weaponMesh); weaponMesh = null; }
        var w = G.weapon(); if (!w) return;
        weaponMesh = G.chars.weapon(w.id); weaponMesh.rotation.x = Math.PI / 2; mesh.userData.hand.add(weaponMesh);
    };
    P.mode = function () { return mode; };
    P.swinging = function () { return swingT > 0 ? swingT : 0; };
    P.riding = function () { return mount; };
    P.exhausted = function () { return exhausted; };
    P.taming = function () { return tame; };

    /* highest walkable surface: terrain or the top of a beacon tower */
    function groundAt(x, z, y) {
        var h = W.heightAt(x, z), c = G.colliders;
        for (var i = 0; i < c.length; i++) {
            var k = c[i]; if (!k.top) continue;
            var dx = x - k.x, dz = z - k.z;
            var tr = k.topR || k.r;
            if (dx * dx + dz * dz < tr * tr && y >= k.top - 0.6 && k.top > h) h = k.top;
        }
        return h;
    }
    P.groundAt = groundAt;
    function collide(nx, nz) {                         // push out of buildings and trees
        var c = G.colliders;
        for (var i = 0; i < c.length; i++) {
            var k = c[i]; if (k.top && P.pos.y >= k.top - 0.6) continue;
            var dx = nx - k.x, dz = nz - k.z, rr = k.r + 0.35, d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && d2 > 1e-6) { var d = Math.sqrt(d2); nx = k.x + dx / d * rr; nz = k.z + dz / d * rr; if (k.top) tower = k; }
        }
        W.pushOutTrees(nx, nz, 0.35, push);
        var lim = G.WORLD / 2 - 10;
        P.pos.x = Math.max(-lim, Math.min(lim, push.x)); P.pos.z = Math.max(-lim, Math.min(lim, push.z));
    }
    function useStamina(units) {                       // returns false when out
        S.stamina -= units / 100; staminaCd = 0.7;
        if (S.stamina <= 0) { S.stamina = 0; exhausted = true; return false; }
        return true;
    }

    P.hurt = function (hearts, fromX, fromZ) {
        if (hurtT > 0 || G.dead) return;
        hearts *= G.diff().dmg;
        S.hearts = Math.max(0, S.hearts - hearts); hurtT = 0.8;
        G.audio.sfxHurt(); G.ui.flash();
        if (fromX !== undefined && !mount) { var dx = P.pos.x - fromX, dz = P.pos.z - fromZ, d = Math.sqrt(dx * dx + dz * dz) || 1; collide(P.pos.x + dx / d * 1.5, P.pos.z + dz / d * 1.5); }
        if (mode === 'climb' || mode === 'glide') mode = 'air';
        if (S.hearts <= 0) G.die();
    };

    /* ---------- the contextual OK button ---------- */
    /* Called for each game function bound to a pressed button, in priority order
     * (interact, attack, jump, ...). Returns true when the press was used. */
    P.onPress = function (fn) {
        if (G.dead) return true;
        if (mount) {
            if (fn === 'sprint') { if (spurs > 0 && !tame) { spurs--; spurT = 1.4; G.audio.sfxHorse(); } return true; }
            if (fn === 'attack') { if (G.agents.nearestEnemy(P.pos, 4.5, P.ry, 1.4) || G.binds.attack !== 'ok') { swing(); return true; } return false; }
            if (fn === 'interact' || fn === 'jump') { if (!tame && rideSpeed < 3) dismount(); return true; }
            return false;
        }
        if (fn === 'interact') { if (G.interactTarget && mode !== 'air' && mode !== 'glide') { G.interact(G.interactTarget); return true; } return false; }
        if (fn === 'attack') {
            if (mode !== 'ground') return false;
            if (G.binds.attack !== G.binds.jump || G.agents.nearestEnemy(P.pos, 3.4, P.ry, 1.2)) { swing(); return true; }
            return false;
        }
        if (fn === 'jump') {
            okHeld = 0;
            if (mode === 'ground' && !exhausted) { vy = JUMP_V; mode = 'air'; airTime = 0; fallFrom = P.pos.y; G.audio.sfxJump(); }
            else if (mode === 'swim' && !exhausted && useStamina(20)) { vy = 5; mode = 'air'; airTime = 0; fallFrom = P.pos.y; }
            else if (mode === 'tower' && !exhausted && useStamina(25)) { P.pos.y = Math.min(P.pos.y + 1.3, tower ? tower.top : P.pos.y); }
            else if (mode === 'climb' && !exhausted && useStamina(25)) {           // climb jump: 1.3 m up the wall
                var sl = W.slopeAt(P.pos.x, P.pos.z, slope), tn = sl > 0.99 ? 7 : sl / Math.sqrt(1 - sl * sl), run = 1.3 / Math.max(0.6, tn);
                collide(P.pos.x + slope.nx * run, P.pos.z + slope.nz * run); P.pos.y = W.heightAt(P.pos.x, P.pos.z);
            }
            return true;
        }
        return false;
    };
    function swing() {
        if (cooldown > 0 || swingT > 0) return;
        swingT = 0.36; swingHit = false; cooldown = 0.5;
    }
    function doHit() {
        var w = G.weapon(), dmg = (w ? G.ITEMS[w.id].dmg : 0.5) + G.attackBonus();
        var hit = G.agents.hitArc(P.pos, P.ry, mount ? 3.6 : 2.8, 1.25, dmg);
        if (hit) { G.audio.sfxHit(); if (w) G.wearWeapon(); }
    }
    function dismount() {
        if (!mount) return;
        var m = mount; mount = null; m.rider = false;
        collide(P.pos.x + Math.cos(P.ry) * 1.4, P.pos.z - Math.sin(P.ry) * 1.4);
        P.pos.y = groundAt(P.pos.x, P.pos.z, P.pos.y + 2); mode = 'ground';
        if (S.horse && m.owned) { S.horse.x = m.x; S.horse.z = m.z; }
    }
    P.dismount = dismount;
    P.mount = function (h) {
        mount = h; h.rider = true; mode = 'ride'; rideSpeed = 0; spurs = 3;
        P.ry = h.ry; tame = h.owned ? 0 : 3.2;
        if (tame) G.ui.toast(G.t('taming'));
    };

    /* ---------- fixed step ---------- */
    P.update = function () {
        if (G.dead) return;
        var inp = G.input, L = inp.dir('left'), R = inp.dir('right'), U = inp.dir('up'), D = inp.dir('down');
        var turn = (R - L) * (G.settings.invertTurn ? -1 : 1);
        if (needRelease) { if (U) U = 0; else needRelease = false; }
        var sprintHeld = inp.held('sprint');
        upHeld = U ? upHeld + DT : 0;
        if (G.settings.autoSprint && upHeld > 1.2) sprintHeld = true;          // remote: hold up to run
        if (inp.held('jump') || inp.held('interact')) okHeld += DT; else okHeld = 0;
        if (hurtT > 0) hurtT -= DT;
        if (cooldown > 0) cooldown -= DT;
        if (swingT > 0) { swingT -= DT; if (!swingHit && swingT < 0.2) { swingHit = true; doHit(); } }
        staminaCd -= DT;
        var maxSt = S.maxStamina;
        if (staminaCd <= 0 && mode !== 'climb' && mode !== 'glide' && mode !== 'tower' && !(mode === 'swim' && sprintHeld) && S.stamina < maxSt) {
            S.stamina = Math.min(maxSt, S.stamina + (S.hunger > 0 ? 0.42 : 0.2) * DT * (mode === 'ground' && P.speed < 0.1 ? 1.4 : 1));
            if (exhausted && S.stamina >= maxSt) exhausted = false;
        } else if (S.stamina > maxSt && staminaCd <= 0) { /* overfilled stamina stays until used */ }

        /* hunger: empty in about 1.5 in-game days; hearts come back slowly when well fed */
        var df = G.diff();
        S.hunger = Math.max(0, S.hunger - DT * 100 * df.hunger / (G.DAY_SECONDS * 1.5));
        if (S.hunger > 50 && S.hearts < S.maxHearts && hurtT <= 0) S.hearts = Math.min(S.maxHearts, S.hearts + DT * df.regen / 45);

        if (mount) return ride(turn, U, D);
        var fx = Math.cos(P.ry), fz = -Math.sin(P.ry);           // facing (ry = 0 faces +x)

        if (mode === 'ground' || mode === 'swim') {
            P.ry -= turn * (P.speed > 5 ? 2.2 : 2.8) * DT;
            fx = Math.cos(P.ry); fz = -Math.sin(P.ry);
            var swim = mode === 'swim';
            var sp = 0;
            if (U) sp = exhausted ? TIRED : swim ? (sprintHeld && useStamina(22 * DT) ? SWIM_FAST : SWIM) : (sprintHeld && !exhausted && useStamina(24 * DT) ? SPRINT : WALK);
            else if (D) sp = -BACK;
            if (swim && exhausted) { drown(); return; }
            var nx = P.pos.x + fx * sp * DT, nz = P.pos.z + fz * sp * DT;
            var hHere = W.heightAt(P.pos.x, P.pos.z), hAhead = W.heightAt(P.pos.x + fx * 0.8, P.pos.z + fz * 0.8);
            /* climbing starts when walking into a steep face */
            if (U && !swim && !exhausted && hAhead - hHere > 0.75 && sp > 0) { mode = 'climb'; return; }
            if (U && swim && !exhausted && hAhead - hHere > 0.9 && hAhead > G.SEA) { mode = 'climb'; P.pos.y = hHere; return; }
            if (!W.chunkReady(nx, nz)) { nx = P.pos.x; nz = P.pos.z; }
            collide(nx, nz);
            if (tower && U && !swim) { var dxT = P.pos.x - tower.x, dzT = P.pos.z - tower.z; if (dxT * dxT + dzT * dzT < (tower.r + 0.5) * (tower.r + 0.5) && P.pos.y < tower.top - 1 && !exhausted) { mode = 'tower'; return; } }
            tower = null;
            P.speed = Math.abs(sp);
            var g = groundAt(P.pos.x, P.pos.z, P.pos.y);
            if (g < G.SEA - 1.1) {                                  // deep water
                if (mode !== 'swim') { mode = 'swim'; }
                P.pos.y = G.SEA - 1.05;
            } else {
                if (mode === 'swim') mode = 'ground';
                /* walking off a ledge -> fall; steep slopes make you slide */
                if (g < P.pos.y - 0.6) { mode = 'air'; vy = 0; airTime = 0; fallFrom = P.pos.y; }
                else {
                    P.pos.y = g;
                    if (W.slopeAt(P.pos.x, P.pos.z, slope) > 0.8 && !U) collide(P.pos.x - slope.nx * 3 * DT, P.pos.z - slope.nz * 3 * DT);
                }
            }
            if (P.speed > 0.5) { phase += P.speed * DT * 2.2; stepT -= DT * P.speed; if (stepT < 0) { stepT = 2.2; if (!swim) G.audio.sfxStep(); } } else phase *= 0.9;
            if (mode === 'ground' && P.speed < 0.1 && okHeld > 0.9 && !G.interactTarget) { okHeld = -10; G.ui.openMenu(); }
            safeTimer -= DT;
            if (mode === 'ground' && safeTimer <= 0 && W.slopeAt(P.pos.x, P.pos.z, slope) < 0.5) { safeTimer = 2; S.safeX = P.pos.x; S.safeZ = P.pos.z; }
        } else if (mode === 'climb') {
            S.stats.climbed += U || L || R ? CLIMB * DT : 0;
            var drain = (G.weather.rain ? 2 : 1) * 11 * DT;
            if (exhausted) { mode = 'air'; vy = 0; airTime = 0; fallFrom = P.pos.y; return; }
            /* face the wall */
            W.slopeAt(P.pos.x, P.pos.z, slope);
            if (slope.s > 0.2) P.ry = Math.atan2(-slope.nz, slope.nx);
            fx = Math.cos(P.ry); fz = -Math.sin(P.ry);
            var mx = 0, mz = 0, moving = U || D || L || R;
            if (moving && !useStamina(drain * (U ? 1 : 0.7))) return;
            var tn = slope.s > 0.99 ? 7 : slope.s / Math.sqrt(1 - slope.s * slope.s);
            var adv = CLIMB / Math.max(0.6, tn);
            if (U) { mx += fx * adv; mz += fz * adv; }
            if (D) { mx -= fx * adv; mz -= fz * adv; }
            if (L) { mx += fz * CLIMB * 0.7; mz -= fx * CLIMB * 0.7; }
            if (R) { mx -= fz * CLIMB * 0.7; mz += fx * CLIMB * 0.7; }
            collide(P.pos.x + mx * DT, P.pos.z + mz * DT);
            P.pos.y = W.heightAt(P.pos.x, P.pos.z);
            phase += moving ? DT * 5 : 0;
            if (P.pos.y < G.SEA - 0.8) { mode = 'swim'; return; }
            if (W.slopeAt(P.pos.x, P.pos.z, slope) < 0.55) { mode = 'ground'; collide(P.pos.x + fx * 0.4, P.pos.z + fz * 0.4); P.pos.y = W.heightAt(P.pos.x, P.pos.z); }   // mantle over the top
            if (D && slope.s < 0.6) mode = 'ground';
        } else if (mode === 'tower') {
            if (!tower || exhausted) { mode = 'air'; vy = 0; airTime = 0; fallFrom = P.pos.y; tower = null; return; }
            var dx = P.pos.x - tower.x, dz = P.pos.z - tower.z, dd = Math.sqrt(dx * dx + dz * dz) || 1;
            P.pos.x = tower.x + dx / dd * (tower.r + 0.4); P.pos.z = tower.z + dz / dd * (tower.r + 0.4);
            P.ry = Math.atan2(dz, -dx);
            if (U) { if (!useStamina(7 * DT)) return; P.pos.y += CLIMB * DT; S.stats.climbed += CLIMB * DT; phase += DT * 5; }
            else if (D) { P.pos.y -= CLIMB * DT; if (P.pos.y <= W.heightAt(P.pos.x, P.pos.z)) { mode = 'ground'; tower = null; } }
            if (P.pos.y >= tower.top - 0.05) { P.pos.y = tower.top; P.pos.x = tower.x + dx / dd * (tower.r - 0.6); P.pos.z = tower.z + dz / dd * (tower.r - 0.6); mode = 'ground'; tower = null; upHeld = 0; needRelease = true; }   // stop at the top until ▲ is let go
        } else {                                                    // air or glide
            airTime += DT;
            var gliding = mode === 'glide';
            if (!gliding && airTime > 0.25 && S.inv.windcloak && !exhausted && (inp.held('jump')) && vy < 0) { mode = 'glide'; gliding = true; fallFrom = P.pos.y; }
            if (gliding && (!inp.held('jump') || exhausted || !useStamina(8 * DT))) { mode = 'air'; gliding = false; fallFrom = P.pos.y; }
            P.ry -= turn * (gliding ? 1.6 : 2.4) * DT;
            fx = Math.cos(P.ry); fz = -Math.sin(P.ry);
            var asp = gliding ? GLIDE_F : U ? (P.speed > WALK ? P.speed : WALK) : D ? -BACK : P.speed * 0.6;
            if (gliding) { vy = GLIDE_V; S.stats.glided += GLIDE_F * DT; }
            else vy = Math.max(-40, vy + GRAV * DT);
            collide(P.pos.x + fx * asp * DT, P.pos.z + fz * asp * DT);
            P.pos.y += vy * DT;
            var gr = groundAt(P.pos.x, P.pos.z, P.pos.y);
            if (gr < G.SEA - 1.1 && P.pos.y <= G.SEA - 1.05) { P.pos.y = G.SEA - 1.05; mode = 'swim'; vy = 0; }
            else if (P.pos.y <= gr) {
                P.pos.y = gr;
                var fell = fallFrom - gr;
                mode = 'ground';
                if (!gliding && fell > 9) P.hurt(fell > 30 ? 99 : (fell - 9) * 0.25);
                vy = 0;
            }
            /* grab a wall while falling */
            if (mode === 'air' && U && !exhausted && airTime > 0.15 && W.heightAt(P.pos.x + fx * 0.6, P.pos.z + fz * 0.6) > P.pos.y + 0.3 && W.heightAt(P.pos.x + fx * 0.6, P.pos.z + fz * 0.6) - gr > 1.5) { mode = 'climb'; vy = 0; }
        }
    };

    function ride(turn, U, D) {
        var h = mount, DTt = DT;
        if (tame > 0) {                                             // the wild horse bucks
            tame -= DTt;
            P.ry += Math.sin(tame * 9) * 0.06; h.ry = P.ry;
            if (!useStamina(28 * DTt)) { G.ui.toast(G.t('thrown')); dismount(); P.hurt(0.25); h.flee = 4; return; }
            if (tame <= 0) { tame = 0; h.owned = true; S.horse = { x: h.x, z: h.z }; G.ui.toast(G.t('tamed')); G.quests.onEvent('tame'); G.addXp(40); }
            return sync2(h);
        }
        var target = 0;
        if (U) target = spurT > 0 ? 17 : upHeld > 1.5 ? 13 : 8;
        else if (D) target = rideSpeed > 0.5 ? 0 : -2;
        if (spurT > 0) { spurT -= DTt; target = 17; }
        spurRegen += DTt; if (spurRegen > 4 && spurs < 3) { spurs++; spurRegen = 0; }
        rideSpeed += (target - rideSpeed) * Math.min(1, DTt * (target < rideSpeed ? 3 : 1.4));
        P.ry -= turn * (rideSpeed > 10 ? 1.4 : 2) * DTt;
        var fx = Math.cos(P.ry), fz = -Math.sin(P.ry);
        var nx = h.x + fx * rideSpeed * DTt, nz = h.z + fz * rideSpeed * DTt;
        var dirS = rideSpeed >= 0 ? 1 : -1, hh = W.heightAt(h.x, h.z), ha = W.heightAt(h.x + fx * 1.2 * dirS, h.z + fz * 1.2 * dirS);
        if (ha < G.SEA - 0.6 || ha - hh > 1.0 || !W.chunkReady(nx, nz)) { rideSpeed *= 0.3; nx = h.x; nz = h.z; }   // water or a cliff ahead
        P.pos.x = nx; P.pos.z = nz; collide(nx, nz);
        h.x = P.pos.x; h.z = P.pos.z; h.ry = P.ry;
        S.stats.rode += Math.abs(rideSpeed) * DTt;
        phase += Math.abs(rideSpeed) * DTt * 1.3;
        P.speed = Math.abs(rideSpeed);
        return sync2(h);
    }
    function sync2(h) { h.y = W.heightAt(h.x, h.z); P.pos.y = h.y + 1.25; h.gait = P.speed; }
    P.spurs = function () { return spurs; };

    function drown() {
        G.ui.toast(G.t('drowned'));
        S.hearts = Math.max(0, S.hearts - 1);
        if (S.hearts <= 0) { G.die(); return; }
        P.pos.x = S.safeX; P.pos.z = S.safeZ; P.pos.y = W.heightAt(S.safeX, S.safeZ); mode = 'ground'; exhausted = false; S.stamina = Math.max(S.stamina, 0.5);
    }
    P.teleport = function (x, z) {
        if (mount) dismount();
        P.pos.x = x; P.pos.z = z; P.pos.y = Math.max(W.heightAt(x, z), G.SEA - 1.05); mode = W.heightAt(x, z) < G.SEA - 1.1 ? 'swim' : 'ground'; vy = 0; tower = null;
        S.safeX = x; S.safeZ = z;
    };

    /* ---------- copy to the mesh (render rate) ---------- */
    P.sync = function () {
        if (!mesh) return;
        var ud = mesh.userData, swim = mode === 'swim';
        mesh.position.set(P.pos.x, P.pos.y - (swim ? 1.1 : 0) - (mount ? 0.45 : 0), P.pos.z);
        mesh.rotation.y = P.ry + Math.PI / 2;
        var sw = Math.sin(phase) * (P.speed > 6 ? 0.9 : 0.6);
        if (mount) { ud.legL.rotation.x = -1.2; ud.legR.rotation.x = -1.2; ud.legL.rotation.z = 0.5; ud.legR.rotation.z = -0.5; }
        else { ud.legL.rotation.z = 0; ud.legR.rotation.z = 0; ud.legL.rotation.x = mode === 'climb' || mode === 'tower' ? sw * 0.5 - 0.4 : sw; ud.legR.rotation.x = mode === 'climb' || mode === 'tower' ? -sw * 0.5 - 0.4 : -sw; }
        var up = mode === 'climb' || mode === 'tower' || mode === 'glide';
        ud.armL.rotation.x = up ? -2.8 + (mode === 'glide' ? 0 : sw * 0.4) : -sw * 0.8;
        ud.armR.rotation.x = swingT > 0 ? -2.6 + (0.36 - swingT) * 9 : up ? -2.8 - (mode === 'glide' ? 0 : sw * 0.4) : sw * 0.8;
        ud.glider.visible = mode === 'glide';
        ud.cloak.visible = !!G.state.inv.windcloak;
        mesh.visible = !(hurtT > 0 && Math.floor(hurtT * 20) % 2);
    };
})();
