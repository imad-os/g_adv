/* Low-poly characters and buildings, all built from boxes and cones (no downloads, tiny memory).
 * Every model is a THREE.Group with named parts so the animator can swing legs and arms. */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var C = G.chars = {};
    var mats = {};
    function mat(color) { return mats[color] || (mats[color] = new T.MeshLambertMaterial({ color: color })); }
    function box(w, h, d, color, x, y, z) {
        var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color)); m.position.set(x || 0, y || 0, z || 0); return m;
    }
    function cone(r, h, color, x, y, z, n) { var m = new T.Mesh(new T.ConeGeometry(r, h, n || 4), mat(color)); m.position.set(x, y, z); return m; }
    function cyl(r1, r2, h, color, x, y, z, n) { var m = new T.Mesh(new T.CylinderGeometry(r1, r2, h, n || 6), mat(color)); m.position.set(x, y, z); return m; }
    function shadow(o, on) { o.traverse(function (c) { if (c.isMesh) { c.castShadow = on; } }); return o; }

    /* humanoid: tunic colour, skin, hair. Size 1.8 m. */
    C.humanoid = function (tunic, skin, hair, scale) {
        var g = new T.Group(), s = scale || 1;
        var legL = box(0.22, 0.8, 0.22, 0x3b2e2a, -0.14, 0.4, 0), legR = box(0.22, 0.8, 0.22, 0x3b2e2a, 0.14, 0.4, 0);
        legL.geometry.translate(0, -0.4, 0); legL.position.y = 0.8; legR.geometry.translate(0, -0.4, 0); legR.position.y = 0.8;
        var body = box(0.56, 0.7, 0.32, tunic, 0, 1.15, 0);
        var head = box(0.4, 0.4, 0.4, skin, 0, 1.75, 0);
        var hairM = box(0.44, 0.16, 0.44, hair, 0, 1.95, 0);
        var armL = box(0.16, 0.7, 0.16, skin, -0.38, 1.45, 0), armR = box(0.16, 0.7, 0.16, skin, 0.38, 1.45, 0);
        armL.geometry.translate(0, -0.3, 0); armR.geometry.translate(0, -0.3, 0);
        var hand = new T.Group(); hand.position.set(0, -0.65, 0); armR.add(hand);
        g.add(legL, legR, body, head, hairM, armL, armR);
        g.scale.set(s, s, s);
        g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, hand: hand, body: body, head: head };
        return shadow(g, true);
    };
    C.hero = function () {
        var g = C.humanoid(0x2e86c1, 0xf1c9a5, 0x8b5a2b, 1);
        var cloak = box(0.6, 0.75, 0.08, 0x7fd4ff, 0, 1.2, -0.2); cloak.visible = false; g.add(cloak); g.userData.cloak = cloak;
        var glider = new T.Group(); glider.visible = false;
        glider.add(cone(1.6, 0.5, 0x7fd4ff, 0, 2.5, 0, 6)); g.add(glider); g.userData.glider = glider;
        return g;
    };
    C.weapon = function (type) {
        var it = G.ITEMS[type], g = new T.Group();
        var blade = box(0.08, type === 'stick' ? 0.8 : 1.0, 0.08, it.color, 0, 0.45, 0);
        var guard = box(0.3, 0.06, 0.1, 0x55402a, 0, 0, 0);
        g.add(blade, guard); return shadow(g, true);
    };
    /* four-legged animals: horse, stag, boar, wolf */
    C.quadruped = function (kind) {
        var g = new T.Group(), c, L, H, legH, headY;
        if (kind === 'horse') { c = 0x7b4a2d; L = 1.8; H = 0.9; legH = 1.0; headY = 1.6; }
        else if (kind === 'stag') { c = 0xa0703f; L = 1.3; H = 0.6; legH = 0.8; headY = 1.3; }
        else if (kind === 'boar') { c = 0x4a3a30; L = 1.2; H = 0.6; legH = 0.5; headY = 0.7; }
        else { c = 0x55585e; L = 1.3; H = 0.5; legH = 0.6; headY = 0.9; }              // wolf
        var body = box(0.7, H, L, c, 0, legH + H / 2, 0);
        var head = box(0.45, 0.45, 0.6, c, 0, headY, L / 2 + 0.25);
        var legs = [];
        for (var i = 0; i < 4; i++) {
            var leg = box(0.18, legH, 0.18, c, i % 2 ? 0.25 : -0.25, legH, i < 2 ? L / 2 - 0.2 : -L / 2 + 0.2);
            leg.geometry.translate(0, -legH / 2, 0); legs.push(leg); g.add(leg);
        }
        g.add(body, head);
        if (kind === 'horse') { g.add(box(0.1, 0.5, 0.6, 0x2a1a10, 0, legH + H + 0.2, L / 2 - 0.1)); var saddle = box(0.74, 0.12, 0.6, 0x8b2d2d, 0, legH + H + 0.04, -0.1); saddle.visible = false; g.add(saddle); g.userData.saddle = saddle; }
        if (kind === 'stag') { g.add(box(0.06, 0.5, 0.06, 0xd8c6a0, -0.15, headY + 0.4, L / 2 + 0.2), box(0.06, 0.5, 0.06, 0xd8c6a0, 0.15, headY + 0.4, L / 2 + 0.2)); }
        if (kind === 'boar') { g.add(box(0.05, 0.05, 0.25, 0xf0e6d0, -0.15, headY - 0.1, L / 2 + 0.55), box(0.05, 0.05, 0.25, 0xf0e6d0, 0.15, headY - 0.1, L / 2 + 0.55)); }
        if (kind === 'wolf') { g.add(box(0.1, 0.1, 0.6, c, 0, legH + H + 0.1, -L / 2 - 0.2)); }
        g.userData = { legs: legs, body: body, head: head, saddle: g.userData && g.userData.saddle };
        return shadow(g, true);
    };
    /* the Grubbers: squat green raiders */
    C.grubber = function (big) {
        var g = C.humanoid(big ? 0x6b1f1f : 0x4f6b1f, 0x7ea04a, 0x2f3d14, big ? 1.9 : 0.85);
        g.userData.head.add(box(0.1, 0.1, 0.1, 0xff2020, -0.1, 0.05, 0.21), box(0.1, 0.1, 0.1, 0xff2020, 0.1, 0.05, 0.21));
        var w = C.weapon(big ? 'wardenaxe' : 'club'); g.userData.hand.add(w);
        return g;
    };

    /* ---------------- places ---------------- */
    function house(x, z, y, rot, c) {
        var g = new T.Group();
        g.add(box(5, 3, 4, c, 0, 1.5, 0), cone(3.9, 2.2, 0x7a3b2e, 0, 4.1, 0, 4), box(0.9, 1.6, 0.1, 0x3b2e2a, 0, 0.8, 2.01));
        g.position.set(x, y, z); g.rotation.y = rot; return g;
    }
    function campfire(x, y, z) {
        var g = new T.Group(); g.name = 'fire';
        for (var i = 0; i < 5; i++) { var a = i / 5 * 6.28; g.add(box(0.4, 0.3, 0.4, 0x666666, Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8)); }
        g.add(box(0.9, 0.2, 0.2, 0x5a3a1a, 0, 0.2, 0), box(0.2, 0.2, 0.9, 0x5a3a1a, 0, 0.3, 0));
        var flame = new T.Mesh(new T.ConeGeometry(0.35, 0.9, 5), new T.MeshBasicMaterial({ color: 0xff8c1a })); flame.position.set(0, 0.8, 0); flame.name = 'flame'; g.add(flame);
        g.position.set(x, y, z); return g;
    }
    C.buildPoi = function (p) {
        var g = new T.Group(), y = p.y, i;
        g.position.set(p.x, 0, p.z);
        if (p.type === 'village') {
            var n = p.id === 'elmbrook' ? 7 : 5;
            for (i = 0; i < n; i++) { var a = i / n * 6.28 + 0.4, r = p.r * 0.62; g.add(house(Math.cos(a) * r, Math.sin(a) * r, y, -a + Math.PI / 2, i % 2 ? 0xd9c7a0 : 0xc8b08a)); }
            g.add(campfire(0, y, 14));
            g.add(cyl(0.9, 1.1, 2.4, 0x777777, 0, y + 1.2, -12, 8));                        // well
        } else if (p.type === 'beacon') {
            var tower = new T.Group();
            tower.add(cyl(3.2, 4, 3, 0x4f5660, 0, y + 1.5, 0, 8), cyl(1.6, 2.2, 26, 0x5b6470, 0, y + 16, 0, 6));
            var top = new T.Mesh(new T.OctahedronGeometry(1.1, 0), new T.MeshLambertMaterial({ color: 0x3a4a5a, emissive: 0x000000 }));
            top.position.set(0, y + 31.6, 0); top.name = 'core'; tower.add(top);
            tower.add(cyl(4.2, 3.6, 0.6, 0x4f5660, 0, y + 29.7, 0, 8));                  // the platform you stand on
            g.add(tower);
        } else if (p.type === 'hollow') {
            for (i = 0; i < 8; i++) { var b = i / 8 * 6.28; g.add(cyl(0.6, 0.8, 3 + (i % 3), 0x6b6f78, Math.cos(b) * 7, y + 1.5, Math.sin(b) * 7, 5)); }
            var core = new T.Mesh(new T.OctahedronGeometry(1.1, 0), new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x805a00 }));
            core.position.set(0, y + 1.6, 0); core.name = 'core'; g.add(core);
            g.add(cyl(8, 8.5, 0.4, 0x50545c, 0, y + 0.2, 0, 8));
        } else if (p.type === 'camp') {
            for (i = 0; i < 3; i++) { var c = i / 3 * 6.28; g.add(cone(2.4, 2.6, 0x5a4a3a, Math.cos(c) * 9, y + 1.3, Math.sin(c) * 9, 4)); }
            g.add(campfire(0, y, 0));
            var chest = new T.Group(); chest.name = 'chest';
            chest.add(box(1.4, 0.8, 0.9, 0x8b5a2b, 0, 0.4, 0), box(1.5, 0.3, 1, 0xc9a227, 0, 0.9, 0));
            chest.position.set(0, y, 5); g.add(chest);
            for (i = 0; i < 10; i++) { var d = i / 10 * 6.28; g.add(box(0.3, 2, 0.3, 0x6b4a2a, Math.cos(d) * 16, y + 1, Math.sin(d) * 16)); }
        } else if (p.type === 'ruin') {
            for (i = 0; i < 12; i++) { var e = i / 12 * 6.28; g.add(cyl(1, 1.2, 6 + (i % 4) * 2, 0x55585e, Math.cos(e) * 22, y + 4, Math.sin(e) * 22, 6)); }
            g.add(cyl(26, 28, 1, 0x45484e, 0, y + 0.5, 0, 12));
            var throne = box(4, 5, 2, 0x3a3d44, 0, y + 3.5, -18); g.add(throne);
        } else if (p.type === 'stable') {
            g.add(box(14, 0.4, 10, 0x7a5a3a, 0, y + 4, 0), cone(10, 3, 0x7a3b2e, 0, y + 5.5, 0, 4));
            for (i = 0; i < 4; i++) g.add(box(0.5, 4, 0.5, 0x5a3a1a, i < 2 ? -6 : 6, y + 2, i % 2 ? -4 : 4));
            for (i = 0; i < 6; i++) g.add(box(0.2, 1.2, 3, 0x8a6a4a, 9, y + 0.6, -7 + i * 3));
            g.add(campfire(-12, y, 0));
        }
        g.userData.poi = p;
        return g;
    };
})();
