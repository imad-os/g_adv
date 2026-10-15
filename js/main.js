/* Main: renderer, the one requestAnimationFrame loop with a fixed 60 Hz step, the My PC lifecycle,
 * input routing, time of day, seasons, weather, red nights, death, travel, saving. */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var STEP = 1000 / 60, DT = 1 / 60;
    var renderer, scene, camera, raf = 0, last = 0, acc = 0, info = null;
    var camPos = new T.Vector3(), camLook = new T.Vector3(), tmp = new T.Vector3();
    var poiGroups = {}, rain = null, rainPos = null, rainN = 0;
    var autosaveT = 60, revealT = 0, scanT = 0, checkT = 0, weatherT = 0, fpsN = 0, fpsT = 0, fpsEl = null;
    G.playing = false; G.dead = false; G.redNight = false; G.combatNoise = 0;
    G.weather = { rain: false, snow: false };
    G.colliders = []; G.fires = [];
    G.binds = null;

    /* ---------------- texts ---------------- */
    var TXT = null, EN = null;
    G.t = function (key, a) {
        var s = (TXT && TXT[key]) || (EN && EN[key]) || key;
        return a === undefined ? s : s.replace('{0}', a);
    };

    /* ---------------- quality ---------------- */
    G.autoQuality = function () {                                             // the owner's choice, else My PC's speed tier for this TV
        if (G.QUALITY[G.cfg.quality]) return G.cfg.quality;
        var tier = info && info.quality ? info.quality.tier : 'mid';
        return tier === 'low' ? 'low' : tier === 'high' ? 'high' : 'medium';
    };
    G.qualityName = function () { return G.QUALITY[G.settings.quality] ? G.settings.quality : G.autoQuality(); };

    /* ---------------- building the 3D world ---------------- */
    function build3D() {
        if (scene) scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
        G.Q = G.makeQuality(G.qualityName(), G.settings.gfx);
        G.Q.key = qualityKey();
        scene = new T.Scene();
        camera = new T.PerspectiveCamera(G.settings.fov, 16 / 9, 0.3, G.Q.fog + 20);
        renderer.shadowMap.enabled = G.Q.shadows;
        G.world.init(scene, G.Q);
        G.player.init(scene);
        G.agents.init(scene);
        G.quests.init(scene);
        G.coop.init(scene);
        G.colliders = []; G.fires = []; poiGroups = {};
        for (var i = 0; i < G.POIS.length; i++) {
            var p = G.POIS[i], g = G.chars.buildPoi(p);
            scene.add(g); poiGroups[p.id] = g;
            if (p.type === 'beacon') G.colliders.push({ x: p.x, z: p.z, r: 2.4, top: p.y + 30, topR: 4 });
            if (p.type === 'village') {
                var n = p.id === 'elmbrook' ? 7 : 5;
                for (var k = 0; k < n; k++) { var a = k / n * 6.28 + 0.4, r = p.r * 0.62; G.colliders.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, r: 2.9 }); }
                G.colliders.push({ x: p.x, z: p.z - 12, r: 1.2 });
                G.fires.push({ x: p.x, z: p.z + 14, village: true });
            }
            if (p.type === 'camp') G.fires.push({ x: p.x, z: p.z, village: false });
            if (p.type === 'stable') G.fires.push({ x: p.x - 12, z: p.z, village: true });
        }
        /* rain / snow: one Points object, positions moved in place */
        rainN = G.Q.particles * 6;
        var geo = new T.BufferGeometry(); rainPos = new Float32Array(rainN * 3);
        for (i = 0; i < rainN; i++) { rainPos[i * 3] = (Math.random() - 0.5) * 60; rainPos[i * 3 + 1] = Math.random() * 30; rainPos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
        geo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
        rain = new T.Points(geo, new T.PointsMaterial({ color: 0xaac8ff, size: 0.18, transparent: true, opacity: 0.7 }));
        rain.frustumCulled = false; rain.visible = false; scene.add(rain);
        G.world.setSeason(G.season());
        resize();
    }
    function qualityKey() { return G.qualityName() + JSON.stringify(G.settings.gfx); }
    function refreshPois() {
        var S = G.state;
        for (var id in poiGroups) {
            var g = poiGroups[id], p = g.userData.poi;
            g.traverse(function (o) {
                if (o.name === 'core' && o.material) {
                    var on = (p.type === 'beacon' && S.beacons[id]) || (p.type === 'hollow' && S.hollows[id]);
                    o.material.color.setHex(on ? 0x7fe3ff : p.type === 'hollow' ? 0xffd23f : 0x3a4a5a);
                    o.material.emissive.setHex(on ? 0x2a7090 : p.type === 'hollow' ? 0x805a00 : 0x000000);
                }
                if (o.name === 'chest') o.visible = !S.found['chest:' + id];
            });
        }
    }
    G.lightBeacon = refreshPois; G.lightHollow = refreshPois; G.hideChest = refreshPois;

    function resize() {
        var stage = document.getElementById('stage');
        var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        stage.style.transform = 'translate(' + ((window.innerWidth - 1920 * s) / 2) + 'px,' + ((window.innerHeight - 1080 * s) / 2) + 'px) scale(' + s + ')';
        if (!renderer) return;
        var px = G.Q ? G.Q.pixel : 0.5;
        var w = Math.max(320, Math.round(window.innerWidth * px * Math.min(1.5, window.devicePixelRatio || 1)));
        var h = Math.max(180, Math.round(window.innerHeight * px * Math.min(1.5, window.devicePixelRatio || 1)));
        renderer.setSize(w, h, false);
        if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
    }

    /* ---------------- time, seasons, weather ---------------- */
    G.season = function () { return Math.floor((G.state.day - 1) / G.DAYS_PER_SEASON) % 4; };
    G.isNight = function () { var h = G.state.hour; return h >= 20 || h < 5; };
    function updateTime(dt) {
        var S = G.state, before = S.hour;
        S.hour += dt * 24 / G.DAY_SECONDS;
        if (S.hour >= 24) { S.hour -= 24; S.day++; G.world.setSeason(G.season()); }
        var redDay = S.day % G.RED_NIGHT_EVERY === 0;
        if (redDay && before < 23 && S.hour >= 23) { G.redNight = true; G.ui.banner(G.t('rednight'), G.t('rednight_sub')); }
        if (G.redNight && S.hour >= 0.5 && S.hour < 23) G.redMoon();
        weatherT -= dt;
        if (weatherT <= 0) {
            weatherT = G.DAY_SECONDS / 4;
            var se = G.season(), chance = [0.35, 0.1, 0.35, 0.3][se];
            G.weather.rain = Math.random() < chance; G.weather.snow = G.weather.rain && se === 3;
        }
    }
    G.redMoon = function () {                                                // the moment of the red moon: everything returns
        var S = G.state;
        G.redNight = false;
        S.killed = {}; S.stats.redNights++;
        G.world.respawnAll();
        if (G.coop.role !== 'guest') G.agents.resetSpawns();
        for (var k in S.found) if (k.indexOf('chest:') === 0) delete S.found[k];
        refreshPois();
        G.quests.onEvent('red'); G.checkAch();
    };
    function updateRain(dt) {
        var on = G.weather.rain && G.player.mode() !== 'swim';
        rain.visible = on; if (!on) return;
        var snow = G.weather.snow, sp = snow ? 3 : 26, P = G.player.pos;
        rain.material.color.setHex(snow ? 0xffffff : 0xaac8ff); rain.material.size = snow ? 0.3 : 0.15;
        rain.position.set(P.x, P.y - 5, P.z);
        for (var i = 0; i < rainN; i++) {
            var y = rainPos[i * 3 + 1] - sp * dt;
            if (y < 0) { y += 30; rainPos[i * 3] = (Math.random() - 0.5) * 60; rainPos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
            rainPos[i * 3 + 1] = y;
        }
        rain.geometry.attributes.position.needsUpdate = true;
    }

    /* ---------------- input ---------------- */
    var SDK = { ok: 'confirm', run: 'run', cancel: 'cancel', menu: 'menu' };
    var ORDER = ['interact', 'attack', 'jump', 'sprint', 'map', 'menu'];
    G.input = {
        dir: function (d) { return MyPC.isDown(d) ? 1 : 0; },
        held: function (fn) { var b = G.binds[fn]; return !!(SDK[b] && MyPC.isDown(SDK[b])); }
    };
    function button(action) {
        if (action === 'confirm') return 'ok';
        if (action === 'run') return 'run';
        if (action === 'cancel') return 'cancel';
        if (action === 'menu' || action === 'pause') return 'menu';
        return null;
    }
    function onInput(action, pressed, repeat, dev) {
        if (G.ui.input(action, pressed, repeat, dev)) return;
        if (!pressed || repeat || !G.playing) return;
        var b = button(action); if (!b) return;
        for (var i = 0; i < ORDER.length; i++) {
            var fn = ORDER[i]; if (G.binds[fn] !== b) continue;
            if (fn === 'menu') { G.ui.openMenu(); return; }
            if (fn === 'map') { G.ui.openMenu('map'); return; }
            if (G.player.onPress(fn)) return;
        }
    }

    /* ---------------- game flow ---------------- */
    G.startGame = function (key, coopGuest, difficulty) {
        G.ui.close();
        if (key && G.loadGame(key)) G.ui.toast(G.t('loaded'));
        else { G.resetState(); G.quests.begin(); if (G.DIFFS[difficulty]) G.state.difficulty = difficulty; }
        G.world.reload();
        G.world.setSeason(G.season());
        G.agents.resetSpawns();
        G.player.place();
        G.world.update(G.player.pos.x, G.player.pos.z);
        refreshPois();
        G.playing = true; G.dead = false; G.redNight = false;
        G.ui.showHud(true);
        weatherT = key ? 0 : G.DAY_SECONDS / 4; G.weather.rain = false; G.weather.snow = false; autosaveT = 60;
        dailyGift();
        if (!key && !coopGuest) setTimeout(function () { G.ui.dialog(G.t('npc_mira'), G.t('intro')); MyPC.announce(G.t('intro')); }, 600);
        G.revealAt(G.player.pos.x, G.player.pos.z, 90);
    };
    function dailyGift() {
        var today = new Date().toISOString().slice(0, 10), S = G.state;
        if (S.gift === today) return;
        var first = !S.gift; S.gift = today;
        if (first) return;
        var gifts = ['apple', 'mushroom', 'herb', 'meat', 'roastapple', 'shard'];
        var a = gifts[Math.floor(Math.random() * gifts.length)], b = gifts[Math.floor(Math.random() * gifts.length)];
        G.give(a, 2); G.give(b, 1);
        G.ui.toast(G.t('gift') + ': 2 × ' + G.t('item_' + a) + ', ' + G.t('item_' + b), true);
    }
    G.toTitle = function () { var r = G.coop.role; G.playing = false; G.ui.showHud(false); G.ui.openTitle(); if (r) G.coop.leave(); };
    G.die = function () {
        if (G.dead) return;
        G.dead = true; G.audio.sfxDie();
        if (G.player.riding()) G.player.dismount();
        G.ui.choice(G.t('youfell'), [G.t('getup')], function () { respawn(); });
    };
    function respawn() {
        var S = G.state, best = G.poi('elmbrook'), bd = 1e12, P = G.player.pos;
        for (var i = 0; i < G.POIS.length; i++) {
            var p = G.POIS[i]; if (!(p.type === 'village' || p.type === 'stable') || !S.found[p.id]) continue;
            var d = (p.x - P.x) * (p.x - P.x) + (p.z - P.z) * (p.z - P.z); if (d < bd) { bd = d; best = p; }
        }
        S.hearts = S.maxHearts; S.stamina = S.maxStamina; S.hunger = Math.max(S.hunger, 50);
        G.trial = null; G.ui.trial(-1, 0);
        G.player.teleport(best.x + 6, best.z + 22);
        G.dead = false;
        G.saveGame(false);
    }
    G.fastTravel = function (p) {
        var off = p.type === 'beacon' ? 6 : p.type === 'hollow' ? 11 : p.type === 'village' ? 22 : 8;
        G.player.teleport(p.x + off * 0.3, p.z + off);
        G.ui.toast(G.t('arrived'));
        G.saveGame(false);
    };
    G.rest = function () {
        var S = G.state, night = S.hour >= 18 || S.hour < 5;
        if (S.hour >= 18) S.day++;
        S.hour = night ? 6 : 19;
        S.hearts = S.maxHearts; S.stamina = Math.max(S.stamina, S.maxStamina);
        G.world.setSeason(G.season());
        G.ui.toast(G.t('rested'));
        G.saveGame(false);
    };
    G.applySettings = function (qualityMaybe) {
        var st = G.settings;
        G.binds = st.binds;
        document.getElementById('hud').style.transform = st.hudScale !== 1 ? 'scale(' + st.hudScale + ')' : '';
        fpsEl.style.display = st.fps ? '' : 'none';
        if (camera && camera.fov !== st.fov) { camera.fov = st.fov; camera.updateProjectionMatrix(); }
        G.audio.on = st.sfx; G.audio.musicOn = st.music;
        G.audio.setVolume(info ? info.volume.music : 0.7, info ? info.volume.sfx : 0.8);
        G.voice.enabled = st.voice;
        G.saveSettings();
        if (qualityMaybe && qualityKey() !== G.Q.key) {
            build3D();
            if (G.playing) { G.agents.resetSpawns(); G.player.place(); refreshPois(); }
        }
    };

    /* ---------------- loop ---------------- */
    function update() {
        if (!G.playing) return;
        /* alone, a menu pauses the world; in co-op the world goes on (the friend is still playing) */
        var menu = G.ui.isOpen();
        if (menu && !G.coop.active()) return;
        var S = G.state;
        S.stats.playSec += DT;
        G.coop.update();
        if (G.coop.role !== 'guest') updateTime(DT);                           // the guest gets the host's clock
        if (!menu) G.player.update();
        G.agents.update();
        if (menu) return;
        G.quests.updateTrial(DT);
        scanT -= DT; if (scanT <= 0) { scanT = 0.15; G.quests.scan(); }
        checkT -= DT; if (checkT <= 0) { checkT = 0.5; G.quests.check(); discover(); }
        revealT -= DT; if (revealT <= 0) { revealT = 1; G.revealAt(G.player.pos.x, G.player.pos.z, 70); }
        autosaveT -= DT; if (autosaveT <= 0) { autosaveT = 60; G.saveGame(false); }
        S.x = G.player.pos.x; S.y = G.player.pos.y; S.z = G.player.pos.z; S.ry = G.player.ry;
        if (S.hunger <= 0 && Math.floor(S.stats.playSec) % 30 === 0 && Math.floor(S.stats.playSec - DT) % 30 !== 0) G.ui.toast(G.t('hungry'));
    }
    function discover() {
        var S = G.state, P = G.player.pos;
        for (var i = 0; i < G.POIS.length; i++) {
            var p = G.POIS[i]; if (S.found[p.id] || p.type === 'beacon' || p.type === 'hollow') continue;
            if ((p.x - P.x) * (p.x - P.x) + (p.z - P.z) * (p.z - P.z) < p.r * p.r * 1.5) {
                S.found[p.id] = 1; G.revealAt(p.x, p.z, 120);
                G.ui.banner(p.type === 'village' ? G.t('place_' + p.id) : G.t('poi_' + p.type), G.t('discovered'));
                G.addXp(15);
            }
        }
    }
    function draw(dt) {
        var P = G.player, S = G.state;
        G.world.update(P.pos.x, P.pos.z);
        G.player.sync(); G.agents.sync(G.Q.fog); G.coop.sync(dt);
        if (G.playing) G.world.setTime(S.hour, P.pos.x, P.pos.z, G.redNight);
        else G.world.setTime(9.5, P.pos.x, P.pos.z, false);
        updateRain(dt);
        /* camera behind the hero, never inside the ground */
        var dist = (P.riding() ? 11 : 8.5) * G.settings.camDist, hgt = (P.riding() ? 4.5 : 3.6) * G.settings.camHeight;
        if (!G.playing) { dist = 16; hgt = 6; P.ry += dt * 0.08; }
        var fx = Math.cos(P.ry), fz = -Math.sin(P.ry);
        tmp.set(P.pos.x - fx * dist, P.pos.y + hgt, P.pos.z - fz * dist);
        var gh = G.world.heightAt(tmp.x, tmp.z) + 1.2; if (tmp.y < gh) tmp.y = gh;
        if (tmp.y < G.SEA + 0.6) tmp.y = G.SEA + 0.6;
        var k = Math.min(1, dt * 5);
        camPos.lerp(tmp, k);
        if (camPos.distanceToSquared(tmp) > 400) camPos.copy(tmp);
        camera.position.copy(camPos);
        var sh = G.settings.shake ? G.ui.shakeAmount() : 0; if (sh) { camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh; }
        camLook.set(P.pos.x + fx * 2, P.pos.y + 1.6, P.pos.z + fz * 2);
        camera.lookAt(camLook);
        renderer.render(scene, camera);
        G.audio.music_update(dt, G.playing ? S.hour : 17, G.redNight);
        if (G.playing) G.ui.updateHud(dt);
        G.ui.frame(dt);
    }
    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        var el = Math.min(250, ts - last); last = ts;
        acc += el;
        var n = 0;
        while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; }
        if (n === 5) acc = 0;                                    // too slow: drop time rather than spiral
        draw(el / 1000);
        fpsN++; fpsT += el;
        if (fpsT >= 500) { if (G.settings.fps) fpsEl.textContent = Math.round(fpsN * 1000 / fpsT) + ' FPS · ' + G.t('q_' + G.Q.name); fpsN = 0; fpsT = 0; }
    }
    function startLoop() { if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); } }
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    G._renderInfo = function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }; };
    G._tick = function (n) { for (var i = 0; i < n; i++) update(); draw(DT); };   // used by automated tests

    /* ---------------- My PC lifecycle ---------------- */
    MyPC.init({
        ownMenu: true,
        onInit: function (i) {
            info = i;
            G.profileName = i.profile && typeof i.profile.name === 'string' ? i.profile.name.slice(0, 24) : '';
            fpsEl = document.getElementById('fps');
            G.readConfig();
            var lang = window.TEXT[G.cfg.lang] ? G.cfg.lang : i.lang;
            TXT = window.TEXT[lang] || window.TEXT.en; EN = window.TEXT.en;
            if (window.TEXT[lang]) { document.documentElement.setAttribute('lang', lang); document.documentElement.setAttribute('dir', window.RTL[lang] ? 'rtl' : 'ltr'); }
            G.voice.lang = window.TEXT[lang] ? lang : 'en';
            document.title = G.t('title');
            MyPC.progress(0.2);
            var first = !MyPC.load('settings', null);
            G.loadSettings(); G.binds = G.settings.binds;
            if (first && i.quality && i.quality.tier === 'low') G.settings.shake = false;   // the guide: no screen shake on low-tier TVs
            try {
                renderer = new T.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false, powerPreference: 'high-performance', alpha: false });
            } catch (e) { MyPC.fail('WebGL'); return; }
            renderer.setPixelRatio(1);
            G.ui.init();
            MyPC.progress(0.5);
            build3D();
            window.addEventListener('resize', resize);
            G.audio.setVolume(i.volume.music, i.volume.sfx);
            G.applySettings();
            MyPC.setMenu([{ id: 'save', label: G.t('savegame') }, { id: 'menu', label: G.t('tab_system') }]);
            /* warm up the title scene around Elmbrook */
            G.state = G.newState(); G.player.place();
            for (var k = 0; k < 20; k++) G.world.update(G.player.pos.x, G.player.pos.z);
            MyPC.progress(1);
            MyPC.ready();
        },
        onStart: function () {
            G.audio.start(); G.applySettings();
            G.ui.showHud(false); G.ui.openTitle();
            MyPC.announce(G.t('title'));
            startLoop();
        },
        onPause: function () { stopLoop(); G.audio.suspend(); G.voice.stop(); if (G.playing) G.saveGame(false); },
        onResume: function () { G.audio.resume(); startLoop(); },
        onDestroy: function () {
            stopLoop(); G.voice.stop(); G.audio.stop(); G.coop.leave();
            window.removeEventListener('resize', resize);
            if (renderer) { renderer.dispose(); renderer = null; }
        },
        onVolume: function (v) { if (info) info.volume = v; G.audio.setVolume(v.music, v.sfx); },
        onMenu: function (id) { if (id === 'save') G.saveGame(true); else if (id === 'menu' && G.playing) G.ui.openMenu('system'); },
        onInput: onInput
    });
})();
