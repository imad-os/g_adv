/* Everything on top of the 3D view: HUD (hearts, stamina wheel, hunger, clock, compass, weapon),
 * toasts, banners, dialogue, and the menus (title, the game menu with Map / Quests / Items /
 * Journal / Settings / System tabs, cooking, controls mapping). All of it works with arrows + OK. */
(function () {
    'use strict';
    var G = window.G;
    var U = G.ui = {};
    var $ = function (id) { return document.getElementById(id); };
    var el = {}, toasts = [], bannerT = 0, flashT = 0, shakeT = 0;
    var screen = null;                  // open full-screen menu: { kind, items, focus, tab, ... }
    var dlg = null;                     // open dialogue: { choices, focus, cb }
    var last = { hearts: -1, max: -1, st: -1, maxSt: -1, hunger: -1, clock: '', weapon: '', prompt: null };

    U.init = function () {
        ['hud', 'hearts', 'stwheel', 'hunger', 'hungerfill', 'clock', 'compass', 'compassStrip', 'qmark', 'weapon', 'prompt', 'toasts',
         'banner', 'bannerTitle', 'bannerSub', 'dialog', 'dlgName', 'dlgText', 'dlgChoices', 'screen', 'tabs', 'panel', 'hint',
         'flash', 'trial', 'level', 'spurs'].forEach(function (id) { el[id] = $(id); });
        var strip = el.compassStrip, dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        for (var r = 0; r < 3; r++) for (var i = 0; i < 8; i++) { var s = document.createElement('span'); s.textContent = dirs[i]; s.className = i % 2 ? 'minor' : ''; strip.appendChild(s); }
    };
    U.isOpen = function () { return !!screen || !!dlg; };
    U.showHud = function (on) { el.hud.style.display = on ? '' : 'none'; };

    /* ---------------- small messages ---------------- */
    U.toast = function (text, gold) {
        var d = document.createElement('div'); d.className = 'toast' + (gold ? ' gold' : ''); d.textContent = text;
        el.toasts.appendChild(d); toasts.push({ el: d, t: 3.5 });
        if (toasts.length > 5) { var o = toasts.shift(); o.el.remove(); }
        MyPC.announce(text);
    };
    U.banner = function (title, sub) {
        el.bannerTitle.textContent = title; el.bannerSub.textContent = sub || '';
        el.banner.className = 'show'; bannerT = 3;
        MyPC.announce(title + (sub ? '. ' + sub : ''));
    };
    U.flash = function () { flashT = 0.25; el.flash.style.opacity = '0.45'; };
    U.shake = function (t) { shakeT = Math.max(shakeT, t); };
    U.shakeAmount = function () { return shakeT > 0 ? shakeT * 0.6 : 0; };
    U.prompt = function (text) {
        if (text === last.prompt) return; last.prompt = text;
        el.prompt.textContent = text ? 'OK  ·  ' + text : ''; el.prompt.style.display = text ? '' : 'none';
    };
    U.trial = function (left, time) {
        if (left < 0) { el.trial.style.display = 'none'; return; }
        el.trial.style.display = ''; el.trial.textContent = '✦ ' + left + '   ⏱ ' + Math.ceil(time);
    };

    /* ---------------- HUD (only touches the DOM when something changed) ---------------- */
    U.updateHud = function (dt) {
        var S = G.state, P = G.player, i;
        var hq = Math.floor(S.hearts * 4) / 4;
        if (hq !== last.hearts || S.maxHearts !== last.max) {
            if (S.maxHearts !== last.max) {
                el.hearts.textContent = '';
                for (i = 0; i < S.maxHearts; i++) { var h = document.createElement('span'); h.className = 'heart'; h.appendChild(document.createElement('i')); el.hearts.appendChild(h); }
            }
            var hs = el.hearts.children;
            for (i = 0; i < hs.length; i++) hs[i].firstChild.style.width = Math.max(0, Math.min(1, hq - i)) * 100 + '%';
            el.hearts.className = hq <= 1 ? 'low' : '';
            last.hearts = hq; last.max = S.maxHearts;
        }
        var st = Math.round(S.stamina * 100) / 100;
        if (st !== last.st || S.maxStamina !== last.maxSt) {
            var full = st >= S.maxStamina - 0.001 && !P.exhausted();
            el.stwheel.style.opacity = full ? '0' : '1';
            var deg = Math.min(360, st / Math.max(0.2, S.maxStamina) * 360), extra = Math.max(0, st - S.maxStamina);
            var c = P.exhausted() ? '#ff5a3c' : extra > 0 ? '#ffe14d' : '#5ee36a';
            el.stwheel.style.background = 'conic-gradient(' + c + ' ' + deg + 'deg, rgba(0,0,0,0.45) ' + deg + 'deg)';
            last.st = st; last.maxSt = S.maxStamina;
        }
        textT -= dt;
        if (textT <= 0) { textT = 0.25; slowText(S, P); }
        compass(P, S);
        timers(dt);
    };
    var textT = 0;
    function slowText(S, P) {                               // strings are built 4 times a second, not every frame
        var hu = Math.round(S.hunger);
        if (hu !== last.hunger) { el.hungerfill.style.width = hu + '%'; el.hunger.className = hu < 20 ? 'low' : ''; last.hunger = hu; }
        var hh = Math.floor(S.hour), mm = Math.floor((S.hour - hh) * 6) * 10;
        var clock = G.t('day') + ' ' + S.day + '  ·  ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + '  ·  ' + G.t('season' + G.season()) + (G.redNight ? '  ·  ' + G.t('rednight') : G.weather.rain ? '  ·  ☂' : '');
        if (clock !== last.clock) { el.clock.textContent = (G.isNight() ? '☾ ' : '☀ ') + clock; last.clock = clock; }
        var w = G.weapon(), wt = w ? G.t('item_' + w.id) + '  ' + Math.round(w.dur / G.ITEMS[w.id].dur * 100) + '%' : G.t('fists');
        wt += '   Lv ' + S.level;
        if (wt !== last.weapon) { el.weapon.textContent = wt; last.weapon = wt; }
        var sp = P.riding() ? '➤'.repeat(P.spurs()) : '';
        if (el.spurs.textContent !== sp) el.spurs.textContent = sp;
    }
    function compass(P, S) {                                /* 2 px per degree */
        var heading = (P.ry * 180 / Math.PI) % 360; if (heading < 0) heading += 360;   // 0 = +x (east)
        var yaw = Math.round((90 - heading + 360) % 360);                          // degrees from north, clockwise
        if (yaw === last.yaw && P.pos.x === last.px && P.pos.z === last.pz) return;
        last.yaw = yaw; last.px = P.pos.x; last.pz = P.pos.z;
        el.compassStrip.style.transform = 'translateX(' + (-(yaw / 45) * 90 - 765 + 350) + 'px)';
        var tq = S.tracked ? G.quests.target(S.tracked) : null;
        if (tq) {
            var ang = Math.atan2(tq.x - P.pos.x, -(tq.z - P.pos.z)) * 180 / Math.PI;   // from north, clockwise
            var diff = ((ang - yaw + 540) % 360) - 180;
            el.qmark.style.display = Math.abs(diff) < 85 ? '' : 'none';
            el.qmark.style.transform = 'translateX(' + (diff * 2 + 350 - 16) + 'px)';
        } else el.qmark.style.display = 'none';
    }
    function timers(dt) {
        var i;
        for (i = toasts.length - 1; i >= 0; i--) { toasts[i].t -= dt; if (toasts[i].t <= 0) { toasts[i].el.remove(); toasts.splice(i, 1); } }
        if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.className = ''; }
        if (flashT > 0) { flashT -= dt; if (flashT <= 0) el.flash.style.opacity = '0'; }
        if (shakeT > 0) shakeT -= dt;
    }

    /* ---------------- dialogue and choices ---------------- */
    U.dialog = function (name, text, choices, cb) {
        dlg = { choices: choices || null, focus: 0, cb: cb || null };
        U.prompt('');
        el.dlgName.textContent = name || ''; el.dlgText.textContent = text;
        el.dlgChoices.textContent = '';
        if (choices) for (var i = 0; i < choices.length; i++) { var li = document.createElement('li'); li.textContent = choices[i]; el.dlgChoices.appendChild(li); }
        el.dialog.style.display = '';
        dlgFocus();
    };
    U.choice = function (title, choices, cb) { U.dialog('', title, choices, cb); MyPC.announce(title); };
    function dlgFocus() {
        var lis = el.dlgChoices.children;
        for (var i = 0; i < lis.length; i++) lis[i].className = i === dlg.focus ? 'focus' : '';
        if (dlg.choices) MyPC.announce(dlg.choices[dlg.focus]);
    }
    function closeDialog(choice) {
        var cb = dlg.cb; dlg = null; el.dialog.style.display = 'none'; G.voice.stop();
        if (cb) cb(choice);
    }

    /* ---------------- menus ---------------- */
    var TABS = ['map', 'quests', 'items', 'journal', 'settings', 'system'];
    U.openMenu = function (tab) {
        if (screen || G.dead) return;
        G.audio.sfxMenu();
        screen = { kind: 'game', tab: tab || 'quests', items: [], focus: -1, sub: '' };
        build();
    };
    U.openTitle = function () { screen = { kind: 'title', items: [], focus: 0, sub: '' }; build(); };
    U.openCook = function () { screen = { kind: 'cook', items: [], focus: 0, sel: [] }; build(); };
    U.close = function () { screen = null; el.screen.style.display = 'none'; G.audio.sfxMenu(); };
    U.ending = function () { U.dialog(G.t('npc_mira'), G.t('ending')); };

    function item(label, on, extra) { var o = extra || {}; o.label = label; o.on = on; return o; }
    function build() {
        var s = screen; s.items = [];
        el.screen.style.display = '';
        el.tabs.textContent = ''; el.panel.textContent = ''; el.panel.className = '';
        if (s.kind === 'title') buildTitle(s);
        else if (s.kind === 'cook') buildCook(s);
        else {
            for (var i = 0; i < TABS.length; i++) { var t = document.createElement('span'); t.textContent = G.t('tab_' + TABS[i]); t.className = TABS[i] === s.tab ? 'on' : ''; el.tabs.appendChild(t); }
            el.tabs.className = s.focus < 0 ? 'focus' : '';
            if (s.tab === 'map') buildMap(s);
            else if (s.tab === 'quests') buildQuests(s);
            else if (s.tab === 'items') buildItems(s);
            else if (s.tab === 'journal') buildJournal(s);
            else if (s.tab === 'settings') buildSettings(s);
            else buildSystem(s);
        }
        render();
    }
    function render() {
        var s = screen;
        if (s.tab === 'map' && s.kind === 'game') { drawMap(); }
        else {
            var ul = document.createElement('ul'); ul.className = 'list';
            for (var i = 0; i < s.items.length; i++) {
                var it = s.items[i], li = document.createElement('li');
                if (it.head) li.className = 'head';
                var a = document.createElement('span'); a.textContent = it.label; li.appendChild(a);
                if (it.value !== undefined) { var b = document.createElement('b'); b.textContent = (it.left ? '◀ ' : '') + it.value + (it.right ? ' ▶' : ''); li.appendChild(b); }
                if (it.sub) { var sm = document.createElement('small'); sm.textContent = it.sub; li.appendChild(sm); }
                if (it.bar !== undefined) { var bar = document.createElement('em'); var f = document.createElement('i'); f.style.width = Math.round(it.bar * 100) + '%'; bar.appendChild(f); li.appendChild(bar); }
                if (it.dim) li.className += ' dim';
                if (i === s.focus) li.className += ' focus';
                ul.appendChild(li);
            }
            el.panel.textContent = ''; el.panel.appendChild(ul);
            var f2 = ul.children[s.focus]; if (f2) { var top = f2.offsetTop - 300; ul.scrollTop = top > 0 ? top : 0; }
        }
        if (s.kind === 'game') el.tabs.className = s.focus < 0 ? 'focus' : '';
        el.hint.textContent = s.kind === 'game' && s.focus < 0 ? G.t('hint_tabs') : s.tab === 'map' && s.focus >= 0 ? G.t('hint_map') : G.t('hint_list');
        var f = s.items[s.focus]; if (f) MyPC.announce(f.label + (f.value !== undefined ? ' ' + f.value : ''));
    }
    function firstFocus(s) { for (var i = 0; i < s.items.length; i++) if (!s.items[i].head) return i; return -1; }

    function buildTitle(s) {
        var auto = G.peekSave('save'), man = G.peekSave('manual');
        el.tabs.innerHTML = ''; var h = document.createElement('span'); h.className = 'title'; h.textContent = G.t('title'); el.tabs.appendChild(h);
        if (auto) s.items.push(item(G.t('continue'), function () { G.startGame('save'); }, { sub: summary(auto) }));
        if (man) s.items.push(item(G.t('loadmanual'), function () { G.startGame('manual'); }, { sub: summary(man) }));
        s.items.push(item(G.t('newgame'), function () {
            if (!auto) { G.startGame(null); return; }
            U.choice(G.t('newgame_sure'), [G.t('yes'), G.t('no')], function (c) { if (c === 0) G.startGame(null); });
        }));
        s.items.push(item(G.t('tab_settings'), function () { screen = { kind: 'game', tab: 'settings', items: [], focus: 0, fromTitle: true }; build(); }));
        s.items.push(item(G.t('quit'), function () { MyPC.exit(); }));
        if (s.focus >= s.items.length) s.focus = 0;
    }
    function summary(d) {
        var done = 0; for (var k in d.quests) if (d.quests[k].s === 'done') done++;
        var mins = Math.floor((d.stats && d.stats.playSec || 0) / 60);
        return G.t('day') + ' ' + d.day + '  ·  Lv ' + d.level + '  ·  ' + done + '/' + G.QUESTS.length + ' ' + G.t('tab_quests') + '  ·  ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    }
    function buildQuests(s) {
        var S = G.state, any = false, d, q, i;
        s.items.push({ label: G.t('mainquests'), head: true });
        for (i = 0; i < G.QUESTS.length; i++) {
            d = G.QUESTS[i]; q = S.quests[d.id]; if (!d.main || !q) continue;
            questRow(s, d, q); any = true;
        }
        s.items.push({ label: G.t('sidequests'), head: true });
        for (i = 0; i < G.QUESTS.length; i++) {
            d = G.QUESTS[i]; q = S.quests[d.id]; if (d.main || !q) continue;
            questRow(s, d, q); any = true;
        }
        if (!any) s.items.push({ label: '—', head: true });
    }
    function questRow(s, d, q) {
        var S = G.state, o = d.obj[q.step], sub;
        if (q.s === 'done') sub = '✓ ' + G.t('completed');
        else if (q.s === 'offer') sub = G.t('offer_from', G.t('npc_' + d.giver));
        else { sub = G.t('obj_' + o.k, objArg(o)); if (o.n && o.n > 1) sub += '  (' + objProgress(o, q) + '/' + o.n + ')'; }
        s.items.push(item((S.tracked === d.id ? '◆ ' : '') + G.t('q_' + d.id), function () {
            if (q.s === 'active') { S.tracked = d.id; G.audio.sfxSelect(); build(); }
        }, { sub: sub, dim: q.s !== 'active' }));
    }
    function objArg(o) {
        if (o.npc) return G.t('npc_' + o.npc) + (o.item ? ' · ' + o.n + ' × ' + G.t('item_' + o.item) : '');
        if (o.poi) return G.t('poi_' + G.poi(o.poi).type) + (G.poi(o.poi).type === 'village' ? ' ' + G.t('place_' + o.poi) : '');
        if (o.camp) return G.t('poi_camp');
        if (o.item) return G.t('item_' + o.item);
        if (o.type) return G.t('animal_' + o.type);
        return '';
    }
    function objProgress(o, q) {
        if (o.k === 'collect') return Math.min(o.n, G.count(o.item));
        if (o.k === 'kill' && o.camp) { var n = 0; for (var j = 0; j < 9; j++) if (G.state.killed[o.camp + ':' + j]) n++; return Math.min(o.n, n); }
        if (o.k === 'give') return Math.min(o.n, G.count(o.item));
        return Math.min(o.n, q.prog);
    }
    function buildItems(s) {
        var S = G.state, i, k, it;
        s.items.push({ label: G.t('weapons') + '  (' + S.weapons.length + '/' + G.MAX_WEAPONS + ')', head: true });
        S.weapons.forEach(function (w, idx) {
            var d = G.ITEMS[w.id];
            s.items.push(item((S.equip === idx ? '⚔ ' : '') + G.t('item_' + w.id), function () { G.equip(idx); G.audio.sfxSelect(); build(); },
                { value: G.t('power') + ' ' + d.dmg, bar: w.dur / d.dur, sub: S.equip === idx ? G.t('equipped') : G.t('equip') }));
        });
        if (!S.weapons.length) s.items.push({ label: G.t('noweapons'), head: true });
        s.items.push({ label: G.t('food'), head: true });
        var anyFood = false;
        for (k in S.inv) {
            it = G.ITEMS[k]; if (!it || (it.kind !== 'food' && it.kind !== 'raw')) continue;
            anyFood = true;
            (function (id, it2) {
                s.items.push(item(G.t('item_' + id) + '  ×' + S.inv[id], function () {
                    if (G.eat(id)) { G.ui.toast(G.t('ate', G.t('item_' + id))); build(); }
                }, { sub: (it2.hearts ? '♥ +' + it2.hearts + '  ' : '') + (it2.stamina ? '◔ +' + it2.stamina + '  ' : '') + G.t('eat') }));
            })(k, it);
        }
        if (!anyFood) s.items.push({ label: '—', head: true });
        s.items.push({ label: G.t('keyitems'), head: true });
        for (k in S.inv) { it = G.ITEMS[k]; if (it && (it.kind === 'key' || it.kind === 'material')) s.items.push({ label: G.t('item_' + k) + '  ×' + S.inv[k], dim: true, on: null, sub: G.t('desc_' + k) }); }
        i = 0;
    }
    function buildJournal(s) {
        var S = G.state, next = G.LEVELS[S.level] || 0;
        s.items.push({ label: G.t('level') + ' ' + S.level, head: true });
        s.items.push({ label: G.t('xp'), value: next ? S.xp + ' / ' + next : S.xp + ' (max)', bar: next ? Math.min(1, (S.xp - (G.LEVELS[S.level - 1] || 0)) / (next - (G.LEVELS[S.level - 1] || 0))) : 1 });
        var st = S.stats;
        s.items.push({ label: G.t('stat_play'), value: Math.floor(st.playSec / 3600) + 'h ' + Math.floor(st.playSec / 60) % 60 + 'm' });
        s.items.push({ label: G.t('stat_kills'), value: String(st.kills) });
        s.items.push({ label: G.t('stat_beacons'), value: st.beacons + ' / 6' });
        s.items.push({ label: G.t('stat_hollows'), value: st.hollows + ' / 6' });
        var done = 0; for (var k in S.quests) if (S.quests[k].s === 'done') done++;
        s.items.push({ label: G.t('stat_quests'), value: done + ' / ' + G.QUESTS.length, bar: done / G.QUESTS.length });
        s.items.push({ label: G.t('achievements'), head: true });
        for (var i = 0; i < G.ACHIEVEMENTS.length; i++) {
            var a = G.ACHIEVEMENTS[i], got = !!S.ach[a.id];
            s.items.push({ label: (got ? '★ ' : '☆ ') + G.t('ach_' + a.id), value: got ? '' : Math.min(a.n, Math.floor(st[a.stat] || 0)) + ' / ' + a.n, dim: !got });
        }
    }
    var QUAL = ['low', 'medium', 'high'];
    var BUTTONS = ['ok', 'run', 'cancel', 'menu', 'none'];
    function cycle(list, cur, d) { var i = list.indexOf(cur); i = (i + d + list.length) % list.length; return list[i]; }
    function buildSettings(s) {
        var st = G.settings;
        if (s.sub === 'controls') return buildControls(s);
        function onoff(key, label) {
            var f = function () { st[key] = !st[key]; G.applySettings(); build(); };
            s.items.push(item(G.t(label), f, { value: G.t(st[key] ? 'on' : 'off'), left: f, right: f }));
        }
        var q = G.qualityName();
        var fq = function (d) { return function () { st.quality = cycle(QUAL, q, d); G.applySettings(true); build(); }; };
        s.items.push(item(G.t('set_quality'), fq(1), { value: G.t('q_' + q), left: fq(-1), right: fq(1), sub: G.t('set_quality_sub') }));
        onoff('music', 'set_music'); onoff('sfx', 'set_sfx'); onoff('voice', 'set_voice'); onoff('autoSprint', 'set_autosprint'); onoff('invertTurn', 'set_invert');
        var cams = [0.75, 1, 1.35], camN = ['near', 'normal', 'far'];
        var fc = function (d) { return function () { var i = cams.indexOf(st.camDist); st.camDist = cams[(Math.max(0, i) + d + 3) % 3]; G.applySettings(); build(); }; };
        s.items.push(item(G.t('set_camera'), fc(1), { value: G.t('cam_' + camN[Math.max(0, cams.indexOf(st.camDist))]), left: fc(-1), right: fc(1) }));
        s.items.push(item(G.t('set_controls') + '  ▸', function () { s.sub = 'controls'; s.focus = 0; build(); }));
        if (s.fromTitle) s.items.push(item(G.t('back'), function () { U.openTitle(); }));
    }
    function buildControls(s) {
        var b = G.settings.binds;
        s.items.push({ label: G.t('set_controls'), head: true, sub: G.t('controls_sub') });
        ['interact', 'attack', 'jump', 'sprint', 'map', 'menu'].forEach(function (fn) {
            var f = function (d) { return function () {
                var v = cycle(BUTTONS, b[fn], d);
                if (fn === 'interact' && v === 'none') v = cycle(BUTTONS, v, d);   // the remote must always be able to interact
                b[fn] = v; G.applySettings(); build();
            }; };
            s.items.push(item(G.t('fn_' + fn), f(1), { value: G.t('btn_' + b[fn]), left: f(-1), right: f(1) }));
        });
        s.items.push(item(G.t('reset_controls'), function () { G.settings.binds = { interact: 'ok', attack: 'ok', jump: 'ok', sprint: 'run', map: 'cancel', menu: 'menu' }; G.applySettings(); build(); }));
        s.items.push(item(G.t('back'), function () { s.sub = ''; s.focus = 0; build(); }));
    }
    function buildSystem(s) {
        s.items.push(item(G.t('resume'), function () { U.close(); }));
        s.items.push(item(G.t('savegame'), function () { G.saveGame(true); U.close(); }));
        if (G.peekSave('manual')) s.items.push(item(G.t('loadmanual'), function () { U.choice(G.t('load_sure'), [G.t('yes'), G.t('no')], function (c) { if (c === 0) { U.close(); G.startGame('manual'); } }); }));
        if (G.state.horse) s.items.push(item(G.t('whistle'), function () { U.close(); if (!G.agents.whistle()) U.toast(G.t('nohorse')); }));
        s.items.push(item(G.t('totitle'), function () { G.saveGame(false); U.close(); G.toTitle(); }));
        s.items.push(item(G.t('quit'), function () { G.saveGame(false); MyPC.exit(); }));
    }
    function buildCook(s) {
        el.tabs.innerHTML = ''; var h = document.createElement('span'); h.className = 'title'; h.textContent = G.t('cooking'); el.tabs.appendChild(h);
        var S = G.state;
        for (var k in S.inv) {
            var it = G.ITEMS[k]; if (!it || it.kind !== 'raw') continue;
            (function (id) {
                var n = 0; for (var j = 0; j < s.sel.length; j++) if (s.sel[j] === id) n++;
                s.items.push(item(G.t('item_' + id) + '  ×' + S.inv[id], function () {
                    if (n < S.inv[id] && s.sel.length < 3) s.sel.push(id); else { var p = s.sel.indexOf(id); if (p >= 0) s.sel.splice(p, 1); }
                    G.audio.sfxMenu(); build();
                }, { value: n ? '● '.repeat(n) : '', sub: G.t('cook_pick') }));
            })(k);
        }
        if (!s.items.length) s.items.push({ label: G.t('cook_none'), head: true });
        var names = s.sel.map(function (x) { return G.t('item_' + x); }).join(' + ');
        s.items.push(item(G.t('cookit') + (names ? ': ' + names : ''), function () {
            if (!s.sel.length) return;
            var r = G.cook(s.sel); s.sel = [];
            if (r) U.toast(G.t('cooked', G.t('item_' + r)), true);
            build();
        }, { dim: !s.sel.length }));
        s.items.push(item(G.t('back'), function () { U.close(); }));
        if (s.focus >= s.items.length) s.focus = s.items.length - 1;
        if (s.items[s.focus] && s.items[s.focus].head) s.focus = firstFocus(s);
    }

    /* ---------------- map ---------------- */
    var mapCanvas = null, mapBase = null, cur = { x: 0, z: 0 };
    var MAPPX = 820;
    function baseMap() {
        if (mapBase) return mapBase;
        var N = 160, c = document.createElement('canvas'); c.width = N; c.height = N;
        var ctx = c.getContext('2d'), img = ctx.createImageData(N, N), W = G.world, cell = G.WORLD / N;
        for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
            var x = -G.WORLD / 2 + (i + 0.5) * cell, z = -G.WORLD / 2 + (j + 0.5) * cell, h = W.heightAt(x, z), b = W.biome(x, z, h), o = (j * N + i) * 4, r, g, bl;
            if (h < G.SEA) { var dpt = Math.min(1, -h / 40); r = 40 - dpt * 20; g = 100 - dpt * 40; bl = 170 - dpt * 40; }
            else if (b === 5 || h > 105) { r = 230; g = 235; bl = 240; }
            else if (b === 2) { r = 130; g = 118; bl = 98; }
            else if (b === 3) { r = 215; g = 190; bl = 120; }
            else if (b === 4) { r = 210; g = 196; bl = 150; }
            else if (b === 1) { r = 52; g = 110; bl = 50; }
            else { r = 100; g = 160; bl = 70; }
            var sh = 0.75 + Math.min(1, Math.max(0, h / 120)) * 0.35;
            img.data[o] = r * sh; img.data[o + 1] = g * sh; img.data[o + 2] = bl * sh; img.data[o + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        mapBase = c; return c;
    }
    U.dropMapCache = function () { mapBase = null; };
    function buildMap(s) {
        if (!mapCanvas) { mapCanvas = document.createElement('canvas'); mapCanvas.width = MAPPX; mapCanvas.height = MAPPX; mapCanvas.className = 'map'; }
        el.panel.className = 'mappanel';
        el.panel.appendChild(mapCanvas);
        var info = document.createElement('div'); info.className = 'mapinfo'; info.id = 'mapinfo'; el.panel.appendChild(info);
        if (s.focus < 0) { cur.x = G.player.pos.x; cur.z = G.player.pos.z; }
    }
    function toPx(v) { return (v + G.WORLD / 2) / G.WORLD * MAPPX; }
    function travelPoint(p) {
        var S = G.state;
        return (p.type === 'beacon' && S.beacons[p.id]) || (p.type === 'hollow' && S.hollows[p.id]) || ((p.type === 'village' || p.type === 'stable') && S.found[p.id]);
    }
    function visible(p) {
        var N = G.fogSize, i = Math.floor((p.x + G.WORLD / 2) / G.WORLD * N), j = Math.floor((p.z + G.WORLD / 2) / G.WORLD * N);
        return G.state.found[p.id] || G.fogBits[j * N + i];
    }
    function underCursor() {
        var best = null, bd = 40;
        for (var i = 0; i < G.POIS.length; i++) { var p = G.POIS[i], d = Math.hypot(p.x - cur.x, p.z - cur.z); if (d < bd && visible(p)) { bd = d; best = p; } }
        return best;
    }
    function drawMap() {
        var ctx = mapCanvas.getContext('2d'), N = G.fogSize, cs = MAPPX / N, i, p;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(baseMap(), 0, 0, MAPPX, MAPPX);
        ctx.fillStyle = 'rgba(18,22,40,0.92)';
        for (var j = 0; j < N; j++) for (i = 0; i < N; i++) if (!G.fogBits[j * N + i]) ctx.fillRect(i * cs - 0.5, j * cs - 0.5, cs + 1, cs + 1);
        ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var ICON = { village: '⌂', beacon: '♜', hollow: '◈', camp: '☠', ruin: '♛', stable: '♞' };
        for (i = 0; i < G.POIS.length; i++) {
            p = G.POIS[i]; if (!visible(p)) continue;
            var lit = travelPoint(p) || (p.type === 'camp' && G.agents.campCleared(p.id));
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(toPx(p.x), toPx(p.z), 17, 0, 6.283); ctx.fill();
            ctx.fillStyle = p.type === 'camp' || p.type === 'ruin' ? (lit ? '#8a8a8a' : '#ff6b5a') : lit ? '#7fe3ff' : '#ffffff';
            ctx.fillText(ICON[p.type], toPx(p.x), toPx(p.z) + 1);
        }
        var S = G.state, tq = S.tracked ? G.quests.target(S.tracked) : null;
        if (tq) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 34px Arial'; ctx.fillText('★', toPx(tq.x), toPx(tq.z) - 26); }
        var oh = G.agents.ownedHorse(); if (S.horse) { ctx.fillStyle = '#e8c39e'; ctx.font = 'bold 24px Arial'; ctx.fillText('♘', toPx(oh ? oh.x : S.horse.x), toPx(oh ? oh.z : S.horse.z)); }
        /* player arrow */
        var P = G.player, x = toPx(P.pos.x), y = toPx(P.pos.z);
        ctx.save(); ctx.translate(x, y); ctx.rotate(-P.ry + Math.PI / 2);
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 12); ctx.lineTo(0, 6); ctx.lineTo(-11, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        var s = screen, info = document.getElementById('mapinfo');
        if (s.focus >= 0) {
            var cx = toPx(cur.x), cy = toPx(cur.z);
            ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.283); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 14, cy); ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 34, cy); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy - 14); ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy + 34); ctx.stroke();
            p = underCursor();
            if (info) info.textContent = p ? G.t('poi_' + p.type) + (p.type === 'village' ? ' · ' + G.t('place_' + p.id) : '') + (travelPoint(p) ? '  ·  OK: ' + G.t('travel') : '') : G.t('hint_map');
        } else if (info) {
            var pct = 0; for (i = 0; i < G.fogBits.length; i++) pct += G.fogBits[i];
            info.textContent = G.t('explored') + ' ' + Math.round(pct / G.fogBits.length * 100) + '%';
        }
    }

    /* ---------------- input routing (returns true when the UI used the action) ---------------- */
    U.input = function (action, pressed, repeat) {
        if (!pressed) return U.isOpen();
        if (dlg) {
            if (action === 'up' && dlg.choices) { dlg.focus = (dlg.focus + dlg.choices.length - 1) % dlg.choices.length; dlgFocus(); G.audio.sfxMenu(); }
            else if (action === 'down' && dlg.choices) { dlg.focus = (dlg.focus + 1) % dlg.choices.length; dlgFocus(); G.audio.sfxMenu(); }
            else if (action === 'confirm') { G.audio.sfxSelect(); closeDialog(dlg.choices ? dlg.focus : 0); }
            else if (action === 'cancel' && dlg.choices) closeDialog(dlg.choices.length - 1);
            return true;
        }
        if (!screen) return false;
        var s = screen;
        if (action === 'menu' || action === 'cancel') {
            if (s.kind === 'title') return true;
            if (s.sub) { s.sub = ''; s.focus = 0; build(); return true; }
            if (s.fromTitle) { U.openTitle(); return true; }
            U.close(); return true;
        }
        if (action === 'jump') return true;                        // OK sends confirm and jump: use confirm only
        /* the tab row */
        if (s.kind === 'game' && s.focus < 0) {
            if (action === 'left' || action === 'right') {
                var i = TABS.indexOf(s.tab) + ((action === 'right') !== document.documentElement.dir.startsWith('rtl') ? 1 : -1);
                s.tab = TABS[(i + TABS.length) % TABS.length]; s.sub = ''; G.audio.sfxMenu(); build();
            } else if (action === 'down' || action === 'confirm') {
                s.focus = s.tab === 'map' ? 0 : firstFocus(s); if (s.tab !== 'map' && s.focus < 0) s.focus = -1;
                G.audio.sfxMenu(); render();
            }
            return true;
        }
        /* the map cursor */
        if (s.kind === 'game' && s.tab === 'map') {
            var step = repeat ? 28 : 20, lim = G.WORLD / 2;
            if (action === 'left') cur.x = Math.max(-lim, cur.x - step);
            else if (action === 'right') cur.x = Math.min(lim, cur.x + step);
            else if (action === 'up') { if (cur.z <= -lim + 1) { s.focus = -1; } else cur.z = Math.max(-lim, cur.z - step); }
            else if (action === 'down') cur.z = Math.min(lim, cur.z + step);
            else if (action === 'confirm') {
                var p = underCursor();
                if (p && travelPoint(p)) {
                    U.choice(G.t('travel_to', G.t('poi_' + p.type)), [G.t('yes'), G.t('no')], function (c) {
                        if (c === 0) { U.close(); G.fastTravel(p); }
                    });
                } else { s.focus = -1; }
            }
            render();
            return true;
        }
        /* lists */
        var it = s.items[s.focus];
        if (action === 'up' || action === 'down') {
            var d = action === 'up' ? -1 : 1, n = s.focus;
            for (var k = 0; k < s.items.length; k++) {
                n += d;
                if (n < 0) { if (s.kind === 'game') { s.focus = -1; render(); G.audio.sfxMenu(); return true; } n = s.items.length - 1; }
                if (n >= s.items.length) n = 0;
                if (!s.items[n].head) break;
            }
            s.focus = n; G.audio.sfxMenu(); render();
        } else if (action === 'left' && it && it.left) it.left();
        else if (action === 'right' && it && it.right) it.right();
        else if (action === 'left' || action === 'right') { if (s.kind === 'game') { s.focus = -1; U.input(action, true, false); } }
        else if (action === 'confirm' && it && it.on) { G.audio.sfxSelect(); it.on(); }
        return true;
    };
    U.refresh = function () { if (screen) build(); };
})();
