/* The AI engine: every living thing that is not the hero.
 *  - Perception: sight cone + range (shorter at night), hearing (sprinting, fighting), suspicion that builds up.
 *  - Behaviour: a small state machine per agent with utility checks (flee when hurt, call for help, give up).
 *  - Group tactics: attack tokens (at most 2 enemies strike at once, others circle), camps alert each other.
 *  - Level of detail: near agents think every step, far ones every 4th step, very far ones sleep.
 *  - Pools: meshes are reused, nothing is allocated while playing. */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var A = G.agents = { list: [] };
    var W, scene, P;
    var DT = 1 / 60, tick = 0, tokens = 0;
    var pools = {};                             // kind -> [mesh]
    var STATS = {
        grubber: { hp: 6,  speed: 4.2, dmg: 0.5, sight: 26, reach: 2.3, xp: 20 },
        brute:   { hp: 14, speed: 3.6, dmg: 1,   sight: 28, reach: 2.8, xp: 45 },
        warden:  { hp: 120, speed: 4.4, dmg: 1.5, sight: 40, reach: 3.6, xp: 0 },
        stag:    { hp: 3,  speed: 9,   sight: 20, xp: 8 },
        boar:    { hp: 4,  speed: 6.5, dmg: 0.5, sight: 14, reach: 1.8, xp: 10 },
        wolf:    { hp: 5,  speed: 7.5, dmg: 0.5, sight: 26, reach: 1.9, xp: 15 },
        horse:   { hp: 99, speed: 9,   sight: 12, xp: 0 },
        npc:     { hp: 99, speed: 2.2, sight: 8,  xp: 0 }
    };
    var ENEMY = { grubber: 1, brute: 1, warden: 1, wolf: 1, boar: 0 };
    var v = new T.Vector3(), push = { x: 0, z: 0 };

    function getMesh(kind, color) {
        var p = pools[kind] || (pools[kind] = []);
        var m = null;
        for (var i = 0; i < p.length; i++) if (!p[i].userData.used && (kind !== 'npc' || p[i].userData.color === color)) { m = p[i]; break; }
        if (!m) {
            if (kind === 'grubber') m = G.chars.grubber(false);
            else if (kind === 'brute') m = G.chars.grubber(true);
            else if (kind === 'warden') { m = G.chars.grubber(true); m.scale.set(3, 3, 3); }
            else if (kind === 'npc') m = G.chars.humanoid(color, 0xe0b48a, 0x2b1d14, 1);
            else m = G.chars.quadruped(kind);
            var bang = new T.Mesh(new T.ConeGeometry(0.18, 0.6, 4), new T.MeshBasicMaterial({ color: 0xff3020 }));
            bang.rotation.x = Math.PI; bang.position.y = kind === 'warden' ? 1.6 : kind === 'brute' ? 1.5 : 2.6; bang.visible = false;
            m.add(bang); m.userData.bang = bang; m.userData.color = color;
            p.push(m); scene.add(m);
        }
        m.userData.used = true; m.visible = true;
        return m;
    }
    function freeMesh(m) { m.userData.used = false; m.visible = false; }

    A.init = function (sc) { scene = sc; W = G.world; P = G.player; pools = {}; A.list.length = 0; tokens = 0; campLive = {}; npcLive = {}; horseLive = {}; ownedHorse = null; };
    A.clear = function () {
        for (var i = 0; i < A.list.length; i++) freeMesh(A.list[i].mesh);
        A.list.length = 0; tokens = 0;
    };

    function spawn(kind, x, z, opt) {
        var st = STATS[kind];
        var a = { kind: kind, x: x, y: W.heightAt(x, z), z: z, ry: Math.random() * 6.28, hp: st.hp, maxHp: st.hp, st: st,
                  state: 'idle', t: Math.random() * 3, tx: x, tz: z, homeX: x, homeZ: z, sus: 0, token: false, flee: 0,
                  phase: 0, gait: 0, hitT: 0, lod: 0, alive: true, camp: null, idx: 0, owned: false, rider: false, npc: null, enemy: !!ENEMY[kind], aggro: 0 };
        if (opt) for (var k in opt) a[k] = opt[k];
        a.mesh = getMesh(kind, a.npc ? a.npc.color : 0);
        A.list.push(a);
        return a;
    }
    function despawn(a) {
        if (a.token) { tokens--; a.token = false; }
        freeMesh(a.mesh); a.alive = false;
        var i = A.list.indexOf(a); if (i >= 0) { A.list[i] = A.list[A.list.length - 1]; A.list.pop(); }
    }

    /* ---------------- spawning around the player ---------------- */
    var campLive = {}, npcLive = {}, horseLive = {}, animalCount = 0, animalTimer = 0, ownedHorse = null;
    var WILD_HORSES = [[-150, 200], [-40, 280], [-230, 150], [180, 300]];
    function manageSpawns() {
        var px = P.pos.x, pz = P.pos.z, S = G.state, i, j, p, d2;
        /* camps */
        for (i = 0; i < G.POIS.length; i++) {
            p = G.POIS[i];
            if (p.type !== 'camp' && p.type !== 'ruin') continue;
            d2 = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
            if (d2 < 170 * 170 && !campLive[p.id]) {
                campLive[p.id] = 1;
                if (p.boss) { if (!S.killed[p.id + ':0'] && G.quests.bossReady()) spawn('warden', p.x, p.z - 10, { camp: p.id, idx: 0, homeX: p.x, homeZ: p.z }); }
                else for (j = 0; j < p.enemies; j++) {
                    if (S.killed[p.id + ':' + j]) continue;
                    var ang = j / p.enemies * 6.28, rr = 5 + (j % 2) * 4;
                    spawn(j === 0 && p.enemies > 4 ? 'brute' : 'grubber', p.x + Math.cos(ang) * rr, p.z + Math.sin(ang) * rr, { camp: p.id, idx: j, homeX: p.x, homeZ: p.z });
                }
            } else if (d2 > 230 * 230 && campLive[p.id]) {
                campLive[p.id] = 0;
                for (j = A.list.length - 1; j >= 0; j--) if (A.list[j].camp === p.id) despawn(A.list[j]);
            }
        }
        /* villagers */
        for (i = 0; i < G.NPCS.length; i++) {
            var n = G.NPCS[i], home = G.poi(n.home), hx = home.x + n.at.x, hz = home.z + n.at.z;
            d2 = (hx - px) * (hx - px) + (hz - pz) * (hz - pz);
            if (d2 < 150 * 150 && !npcLive[n.id]) npcLive[n.id] = spawn('npc', hx, hz, { npc: n, homeX: hx, homeZ: hz, enemy: false });
            else if (d2 > 200 * 200 && npcLive[n.id]) { despawn(npcLive[n.id]); npcLive[n.id] = null; }
        }
        /* wild horses (only until one is tamed) and the player's own horse */
        for (i = 0; i < WILD_HORSES.length; i++) {
            if (!WILD_HORSES[i].fixed) { W.findLand(WILD_HORSES[i][0], WILD_HORSES[i][1], push); WILD_HORSES[i][0] = push.x; WILD_HORSES[i][1] = push.z; WILD_HORSES[i].fixed = true; }
            var wx = WILD_HORSES[i][0], wz = WILD_HORSES[i][1];
            d2 = (wx - px) * (wx - px) + (wz - pz) * (wz - pz);
            var want = d2 < 160 * 160 && !S.horse;
            if (want && !horseLive[i]) horseLive[i] = spawn('horse', wx, wz, { enemy: false });
            else if (!want && horseLive[i] && !horseLive[i].rider) { despawn(horseLive[i]); horseLive[i] = null; }
        }
        if (S.horse && !ownedHorse) {
            d2 = (S.horse.x - px) * (S.horse.x - px) + (S.horse.z - pz) * (S.horse.z - pz);
            if (d2 < 160 * 160) { ownedHorse = spawn('horse', S.horse.x, S.horse.z, { owned: true, enemy: false }); ownedHorse.mesh.userData.saddle.visible = true; }
        } else if (ownedHorse && !ownedHorse.rider) {
            d2 = (ownedHorse.x - px) * (ownedHorse.x - px) + (ownedHorse.z - pz) * (ownedHorse.z - pz);
            S.horse.x = ownedHorse.x; S.horse.z = ownedHorse.z;
            if (d2 > 200 * 200) { despawn(ownedHorse); ownedHorse = null; }
        }
        /* wild animals: stags and boars by day, wolves at night */
        animalTimer -= DT * 15;
        if (animalTimer <= 0) {
            animalTimer = 2;
            var cap = G.Q.particles >= 200 ? 12 : G.Q.particles >= 100 ? 9 : 6;
            animalCount = 0;
            for (i = 0; i < A.list.length; i++) { var k = A.list[i].kind; if (k === 'stag' || k === 'boar' || k === 'wolf') animalCount++; }
            if (animalCount < cap) {
                var ang2 = Math.random() * 6.28, dist = 55 + Math.random() * 40, ax = px + Math.cos(ang2) * dist, az = pz + Math.sin(ang2) * dist;
                var h = W.heightAt(ax, az), b = W.biome(ax, az, h);
                if (h > 2 && !W.nearPoi(ax, az) && W.chunkReady(ax, az)) {
                    var night = G.isNight();
                    if (night && (b === 1 || b === 2 || b === 5)) { for (j = 0; j < 3; j++) spawn('wolf', ax + j * 2, az + j, { pack: tick }); }
                    else if (b === 0 || b === 1) spawn(Math.random() < 0.55 ? 'stag' : 'boar', ax, az);
                    else if (b === 3 && Math.random() < 0.5) spawn('boar', ax, az);
                }
            }
            for (i = A.list.length - 1; i >= 0; i--) {
                var a = A.list[i]; if (a.camp || a.npc || a.kind === 'horse') continue;
                d2 = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
                if (d2 > 140 * 140 || (a.kind === 'wolf' && !G.isNight() && d2 > 60 * 60)) despawn(a);
            }
        }
    }
    A.resetSpawns = function () { A.clear(); campLive = {}; npcLive = {}; horseLive = {}; ownedHorse = null; };
    A.ownedHorse = function () { return ownedHorse; };
    A.whistle = function () {
        var S = G.state; if (!S.horse) return false;
        if (!ownedHorse) { S.horse.x = P.pos.x - 12; S.horse.z = P.pos.z - 12; manageSpawns(); }
        if (!ownedHorse) return false;
        var d = Math.hypot(ownedHorse.x - P.pos.x, ownedHorse.z - P.pos.z);
        if (d > 60) { ownedHorse.x = P.pos.x - Math.cos(P.ry) * 25; ownedHorse.z = P.pos.z + Math.sin(P.ry) * 25; }
        ownedHorse.state = 'come'; ownedHorse.t = 20;
        G.audio.sfxHorse();
        return true;
    };

    /* ---------------- perception ---------------- */
    function canSee(a, range, cone) {
        var dx = P.pos.x - a.x, dz = P.pos.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 > range * range) return 0;
        var d = Math.sqrt(d2);
        var fx = Math.cos(a.ry), fz = -Math.sin(a.ry), dot = (dx * fx + dz * fz) / (d || 1);
        if (dot < cone && d > 4) return 0;
        return 1 - d / range;
    }
    function hear(a, range) {
        var loud = (P.speed > 6 ? 1 : 0) + (G.combatNoise > 0 ? 1 : 0);
        if (!loud) return 0;
        var dx = P.pos.x - a.x, dz = P.pos.z - a.z;
        return dx * dx + dz * dz < range * range * loud ? 0.6 : 0;
    }

    /* ---------------- movement helpers ---------------- */
    function face(a, tx, tz, rate) {
        var want = Math.atan2(-(tz - a.z), tx - a.x), d = want - a.ry;
        while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
        a.ry += Math.max(-rate, Math.min(rate, d));
    }
    function walk(a, speed, dt) {                       // forward with terrain checks; turns away from water and cliffs
        var fx = Math.cos(a.ry), fz = -Math.sin(a.ry), nx = a.x + fx * speed * dt, nz = a.z + fz * speed * dt;
        var h0 = W.heightAt(a.x, a.z), h1 = W.heightAt(nx + fx, nz + fz);
        if (h1 < G.SEA + 0.3 || h1 - h0 > 1.2 || !W.chunkReady(nx, nz)) { a.ry += 2.2; return false; }
        W.pushOutTrees(nx, nz, 0.4, push);
        var c = G.colliders;
        for (var i = 0; i < c.length; i++) {
            var k = c[i], dx = push.x - k.x, dz = push.z - k.z, rr = k.r + 0.5, d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && d2 > 1e-6) { var d = Math.sqrt(d2); push.x = k.x + dx / d * rr; push.z = k.z + dz / d * rr; }
        }
        a.x = push.x; a.z = push.z; a.y = W.heightAt(a.x, a.z);
        a.gait = speed;
        return true;
    }
    function separate(a) {
        for (var i = 0; i < A.list.length; i++) {
            var b = A.list[i]; if (b === a || b.rider) continue;
            var dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz, rr = a.kind === 'warden' || b.kind === 'warden' ? 3 : 1.2;
            if (d2 < rr * rr && d2 > 1e-4) { var d = Math.sqrt(d2), k = (rr - d) * 0.5; a.x += dx / d * k; a.z += dz / d * k; }
        }
        var px = a.x - P.pos.x, pz = a.z - P.pos.z, pd = px * px + pz * pz, pr = a.kind === 'warden' ? 2.6 : a.kind === 'horse' ? 1.3 : 0.9;
        if (pd < pr * pr && pd > 1e-4 && !a.rider) { var dd = Math.sqrt(pd); a.x = P.pos.x + px / dd * pr; a.z = P.pos.z + pz / dd * pr; }
    }

    /* ---------------- brains ---------------- */
    function think(a, dt) {
        var dx = P.pos.x - a.x, dz = P.pos.z - a.z, dist = Math.sqrt(dx * dx + dz * dz);
        a.t -= dt; if (a.hitT > 0) a.hitT -= dt;
        a.gait = 0;
        if (a.npc) return npcBrain(a, dt, dist);
        if (a.kind === 'horse') return horseBrain(a, dt, dist);
        if (a.kind === 'stag' || (a.kind === 'boar' && a.aggro <= 0)) return preyBrain(a, dt, dist);
        return hunterBrain(a, dt, dist, dx, dz);
    }

    function wander(a, dt, radius, speed) {
        if (a.t <= 0) { a.t = 2 + Math.random() * 4; var r = Math.random() * radius, an = Math.random() * 6.28; a.tx = a.homeX + Math.cos(an) * r; a.tz = a.homeZ + Math.sin(an) * r; a.idle = Math.random() < 0.4; }
        if (a.idle) return;
        if ((a.tx - a.x) * (a.tx - a.x) + (a.tz - a.z) * (a.tz - a.z) > 1) { face(a, a.tx, a.tz, dt * 3); walk(a, speed, dt); }
    }

    function preyBrain(a, dt, dist) {
        var alarm = canSee(a, a.st.sight * (P.speed > 6 ? 1.5 : 1), -0.3) + hear(a, 16);
        if (alarm > 0 && (P.speed > 3 || dist < 7)) { a.flee = 4; }
        if (a.hitT > 0 && a.kind === 'boar') { a.aggro = 6; a.state = 'chase'; return; }
        if (a.flee > 0) {
            a.flee -= dt;
            face(a, a.x - (P.pos.x - a.x), a.z - (P.pos.z - a.z), dt * 5);
            walk(a, a.st.speed, dt);
            a.homeX = a.x; a.homeZ = a.z;
        } else wander(a, dt, 10, 1.6);
    }

    function horseBrain(a, dt, dist) {
        if (a.rider) return;
        if (a.state === 'come' && a.owned) {
            if (dist > 4 && a.t > 0) { face(a, P.pos.x, P.pos.z, dt * 4); walk(a, dist > 20 ? 12 : 6, dt); return; }
            a.state = 'idle';
        }
        if (!a.owned && P.speed > 6 && dist < 14) a.flee = 3;                 // sneak up on a wild horse, don't run
        if (a.flee > 0) { a.flee -= dt; face(a, a.x * 2 - P.pos.x, a.z * 2 - P.pos.z, dt * 4); walk(a, a.st.speed, dt); a.homeX = a.x; a.homeZ = a.z; return; }
        wander(a, dt, a.owned ? 4 : 14, 1.4);
    }

    function npcBrain(a, dt, dist) {
        var h = G.state.hour, home = G.poi(a.npc.home), fireX = home.x, fireZ = home.z + 14;
        var danger = false;
        for (var i = 0; i < A.list.length; i++) { var e = A.list[i]; if (e.enemy && e.state !== 'idle' && Math.abs(e.x - a.x) + Math.abs(e.z - a.z) < 24) { danger = true; break; } }
        a.mesh.visible = !(h >= 22.5 || h < 5.5);                              // asleep indoors at night
        a.asleep = !a.mesh.visible;
        if (a.asleep) return;
        if (danger) { a.homeX = home.x; a.homeZ = home.z; face(a, home.x, home.z, dt * 5); walk(a, 4.5, dt); a.scared = true; return; }
        a.scared = false;
        if (dist < 5) { face(a, P.pos.x, P.pos.z, dt * 4); a.talkable = true; return; }      // turns to greet you
        a.talkable = dist < 4;
        if (h >= 18.5 && h < 22.5) { a.tx = fireX + Math.cos(a.npc.at.x) * 4; a.tz = fireZ + Math.sin(a.npc.at.z) * 4; if (Math.abs(a.tx - a.x) + Math.abs(a.tz - a.z) > 1.2) { face(a, a.tx, a.tz, dt * 3); walk(a, a.st.speed, dt); } else face(a, fireX, fireZ, dt * 2); }
        else { a.homeX = home.x + a.npc.at.x; a.homeZ = home.z + a.npc.at.z; wander(a, dt, 7, a.st.speed); }
    }

    function hunterBrain(a, dt, dist, dx, dz) {
        var night = G.isNight(), st = a.st, boss = a.kind === 'warden';
        var sight = st.sight * (night && !boss && a.kind !== 'wolf' ? 0.6 : 1);
        switch (a.state) {
            case 'idle':
                a.mesh.userData.bang.visible = false;
                a.sus += (canSee(a, sight, 0.25) * 1.8 + hear(a, 14)) * dt * (night && a.kind === 'grubber' ? 0.5 : 1);
                if (a.hitT > 0) a.sus = 1;
                if (a.kind === 'wolf' && night && dist < 30) a.sus = 1;              // wolves hunt at night
                if (a.sus >= 1) { alert(a); break; }
                a.sus = Math.max(0, a.sus - dt * 0.2);
                if (a.sus > 0.3) face(a, P.pos.x, P.pos.z, dt * 2);            // "what was that?"
                else wander(a, dt, a.camp ? 9 : 14, 1.5);
                break;
            case 'alert':                                                      // "!" then charge
                face(a, P.pos.x, P.pos.z, dt * 6);
                if (a.t <= 0) { a.state = 'chase'; a.mesh.userData.bang.visible = false; }
                break;
            case 'chase':
                if (a.hp < a.maxHp * 0.25 && !boss && a.kind !== 'wolf' && Math.random() < 0.004) { a.state = 'flee'; a.t = 4; dropToken(a); break; }
                var fromHome = Math.hypot(a.x - a.homeX, a.z - a.homeZ);
                if (dist > (boss ? 60 : 38) || (fromHome > 70 && !boss) || G.dead) { a.state = 'return'; dropToken(a); break; }
                if (P.riding() && dist > 10 && !boss) { face(a, P.pos.x, P.pos.z, dt * 6); walk(a, st.speed * 1.1, dt); break; }
                if (!a.token && tokens < 2 && dist < 8) { a.token = true; tokens++; }
                face(a, P.pos.x, P.pos.z, dt * 6);
                if (a.token || boss) {
                    if (dist > st.reach) walk(a, st.speed * (night ? 1.15 : 1), dt);
                    else { a.state = 'windup'; a.t = boss ? 0.9 : a.kind === 'wolf' ? 0.35 : 0.55; }
                    if (boss && a.t <= -3 && dist > 8 && dist < 25) { a.state = 'charge'; a.t = 1.1; }
                } else {                                                       // wait your turn: circle at a distance
                    if (dist > 6) walk(a, st.speed * 0.8, dt);
                    else { a.ry += 1.5708; walk(a, 2, dt); a.ry -= 1.5708; }
                }
                break;
            case 'windup':                                                     // telegraphed attack: arm up
                face(a, P.pos.x, P.pos.z, dt * 2);
                if (a.t <= 0) {
                    a.state = 'recover'; a.t = boss ? 0.8 : 0.6;
                    var r = boss ? 4.5 : st.reach + 0.4;
                    if (dist < r) P.hurt(st.dmg * (night && a.kind === 'grubber' ? 1.5 : 1), a.x, a.z);
                    if (boss) G.ui.shake(0.4);
                }
                break;
            case 'charge':
                walk(a, 15, dt);
                if (dist < 3) { P.hurt(st.dmg, a.x, a.z); a.state = 'recover'; a.t = 1; }
                if (a.t <= 0) { a.state = 'recover'; a.t = 0.8; }
                break;
            case 'recover':
                if (a.t <= 0) { a.state = 'chase'; if (boss) a.t = 0; }
                break;
            case 'flee':
                face(a, a.x - dx, a.z - dz, dt * 6); walk(a, st.speed, dt);
                if (a.t <= 0) a.state = 'chase';
                break;
            case 'return':
                a.mesh.userData.bang.visible = false;
                face(a, a.homeX, a.homeZ, dt * 4); walk(a, st.speed * 0.7, dt);
                a.hp = Math.min(a.maxHp, a.hp + dt * 0.5);
                if (Math.hypot(a.x - a.homeX, a.z - a.homeZ) < 4) { a.state = 'idle'; a.sus = 0; }
                if (dist < sight * 0.5) alert(a);
                break;
        }
        if (a.kind === 'boar' && a.aggro > 0) { a.aggro -= dt; if (a.aggro <= 0) { a.state = 'idle'; dropToken(a); } }
    }
    function alert(a) {
        if (a.state === 'alert' || a.state === 'chase') return;
        a.state = 'alert'; a.t = 0.7; a.sus = 1; a.mesh.userData.bang.visible = true;
        if (a.kind === 'warden') G.ui.banner(G.t('boss_name'), G.t('boss_sub'));
        for (var i = 0; i < A.list.length; i++) {                              // call for help
            var b = A.list[i];
            if (b !== a && b.enemy && b.state === 'idle' && ((a.camp && b.camp === a.camp) || (a.pack !== undefined && b.pack === a.pack) || Math.abs(b.x - a.x) + Math.abs(b.z - a.z) < 20)) { b.state = 'alert'; b.t = 0.5 + Math.random() * 0.5; b.mesh.userData.bang.visible = true; }
        }
    }
    function dropToken(a) { if (a.token) { a.token = false; tokens--; } }

    /* ---------------- combat ---------------- */
    A.nearestEnemy = function (pos, range, ry, cone) {
        var fx = Math.cos(ry), fz = -Math.sin(ry), best = null, bd = range;
        for (var i = 0; i < A.list.length; i++) {
            var a = A.list[i]; if (a.npc || a.kind === 'horse' || a.hp <= 0) continue;
            var dx = a.x - pos.x, dz = a.z - pos.z, d = Math.sqrt(dx * dx + dz * dz) - (a.kind === 'warden' ? 1.5 : 0);
            if (d < bd && (dx * fx + dz * fz) / (d || 1) > Math.cos(cone)) { bd = d; best = a; }
        }
        return best;
    };
    A.hitArc = function (pos, ry, range, cone, dmg) {
        var fx = Math.cos(ry), fz = -Math.sin(ry), hit = false;
        G.combatNoise = 2;
        for (var i = A.list.length - 1; i >= 0; i--) {
            var a = A.list[i]; if (a.npc || a.kind === 'horse' || a.hp <= 0) continue;
            var dx = a.x - pos.x, dz = a.z - pos.z, d = Math.sqrt(dx * dx + dz * dz) - (a.kind === 'warden' ? 1.8 : 0);
            if (d > range || (dx * fx + dz * fz) / (Math.sqrt(dx * dx + dz * dz) || 1) < Math.cos(cone)) continue;
            hit = true; a.hp -= dmg; a.hitT = 0.25;
            if (a.kind !== 'warden') { a.x += fx * 1.2; a.z += fz * 1.2; }
            if (a.state === 'idle' || a.state === 'return') alert(a);
            if (a.state === 'windup' && a.kind !== 'warden') { a.state = 'recover'; a.t = 0.5; }   // a hit interrupts
            if (a.kind === 'boar') { a.aggro = 6; a.state = 'chase'; }
            if (a.kind === 'stag') a.flee = 5;
            if (a.hp <= 0) kill(a);
        }
        return hit;
    };
    function kill(a) {
        var S = G.state, x = a.x, z = a.z;
        if (a.camp) S.killed[a.camp + ':' + a.idx] = 1;
        S.stats.kills++;
        if (a.kind === 'boar') S.stats.boars++;
        G.addXp(a.st.xp);
        /* loot */
        if (a.kind === 'grubber') { W.dropItem(Math.random() < 0.5 ? 'club' : 'apple', x, z); if (Math.random() < 0.3) W.dropItem('meat', x + 1, z); }
        else if (a.kind === 'brute') { W.dropItem(Math.random() < 0.5 ? 'rustsword' : 'ironsword', x, z); W.dropItem('meat', x + 1, z); }
        else if (a.kind === 'boar') { W.dropItem('meat', x, z); W.dropItem('meat', x + 0.8, z); }
        else if (a.kind === 'stag' || a.kind === 'wolf') W.dropItem('meat', x, z);
        G.quests.onEvent('kill', a.kind, a.camp);
        if (a.kind === 'warden') { S.killed[a.camp + ':0'] = 1; G.quests.onEvent('boss'); }
        despawn(a);
        G.checkAch();
    }
    A.campCleared = function (id) {
        var p = G.poi(id); if (!p || !p.enemies) return false;
        for (var j = 0; j < p.enemies; j++) if (!G.state.killed[id + ':' + j]) return false;
        return true;
    };

    /* ---------------- per step ---------------- */
    A.update = function () {
        tick++;
        if (tick % 15 === 0) manageSpawns();
        if (G.combatNoise > 0) G.combatNoise -= DT;
        var px = P.pos.x, pz = P.pos.z;
        for (var i = A.list.length - 1; i >= 0; i--) {
            var a = A.list[i];
            if (a.rider) continue;
            var d2 = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
            var every = d2 < 70 * 70 ? 1 : d2 < 130 * 130 ? 4 : 0;          // AI level of detail
            if (!every) continue;
            if ((tick + i) % every) continue;
            think(a, DT * every);
            if (every === 1) separate(a);
            if (!a.alive) continue;
        }
    };
    /* ---------------- render sync ---------------- */
    A.sync = function (fogFar) {
        var px = P.pos.x, pz = P.pos.z, ff = fogFar * fogFar;
        for (var i = 0; i < A.list.length; i++) {
            var a = A.list[i], m = a.mesh, ud = m.userData;
            var d2 = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
            if (a.npc && a.asleep) { m.visible = false; continue; }
            m.visible = d2 < ff;
            if (!m.visible) continue;
            m.position.set(a.x, a.y, a.z);
            m.rotation.y = a.ry + Math.PI / 2;
            if (a.gait > 0.2) a.phase += a.gait * 0.05; else a.phase *= 0.9;
            var sw = Math.sin(a.phase) * 0.7;
            if (ud.legs) { ud.legs[0].rotation.x = sw; ud.legs[3].rotation.x = sw; ud.legs[1].rotation.x = -sw; ud.legs[2].rotation.x = -sw; }
            else if (ud.legL) {
                ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
                ud.armL.rotation.x = -sw * 0.8;
                ud.armR.rotation.x = a.state === 'windup' ? -2.8 : a.state === 'recover' ? -0.6 : sw * 0.8;
                if (a.npc && a.talkable) ud.armL.rotation.x = -2.6 + Math.sin(a.phase * 4 + i) * 0.3;
            }
            var s = a.hitT > 0 ? 0.85 : 1, base = a.kind === 'warden' ? 3 : a.kind === 'brute' ? 1.9 : a.kind === 'grubber' ? 0.85 : 1;
            m.scale.set(base * s, base * (2 - s), base * s);
        }
    };
})();
