/* The open world: procedural terrain in pooled chunks, biomes and seasons, instanced trees, rocks,
 * grass and pick-up items, water, sky and sun. Nothing here allocates per frame once loaded. */
(function () {
    'use strict';
    var G = window.G, T = window.THREE;
    var CH = G.CHUNK, HALF = G.WORLD / 2;
    var W = G.world = {};

    /* ---------------- height field ---------------- */
    function rawHeight(x, z) {
        var c = G.fbm(x * 0.0017 + 100, z * 0.0017 + 100, 3);
        var base = (c - 0.42) * 90;
        var m = G.fbm(x * 0.0025 + 50, z * 0.0025, 2);
        var mm = Math.max(0, (m - 0.5) / 0.5);
        var r = G.ridge(x * 0.006, z * 0.006, 4);
        var h = base + mm * mm * r * 170 + G.fbm(x * 0.03, z * 0.03, 3) * 6 - 2;
        var d = Math.max(Math.abs(x), Math.abs(z)) / HALF;
        if (d > 0.82) h -= (d - 0.82) / 0.18 * 90;        // the land sinks into the sea at the edge
        return h;
    }
    function heightAt(x, z) {
        var h = rawHeight(x, z), pois = G.POIS;
        for (var i = 0; i < pois.length; i++) {
            var p = pois[i], dx = x - p.x, dz = z - p.z, rr = p.r * 1.8, d2 = dx * dx + dz * dz;
            if (d2 < rr * rr) {
                var d = Math.sqrt(d2), t = d < p.r ? 1 : 1 - (d - p.r) / (rr - p.r);
                t = t * t * (3 - 2 * t);
                h = h + (p.y - h) * t;
            }
        }
        return h;
    }
    W.heightAt = heightAt;
    /* every place sits at the natural height of its ground (at least a little above the sea) */
    (function () {
        for (var i = 0; i < G.POIS.length; i++) {
            var p = G.POIS[i], sum = rawHeight(p.x, p.z), n = 1;
            for (var a = 0; a < 6.28; a += 0.785) { sum += rawHeight(p.x + Math.cos(a) * p.r * 0.6, p.z + Math.sin(a) * p.r * 0.6); n++; }
            p.y = Math.max(3, Math.round(sum / n));
        }
    })();
    /* slope 0..1 (sin of the angle) and the uphill direction, written into out {s, nx, nz} */
    W.slopeAt = function (x, z, out) {
        var e = 0.6, hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
        var gx = hx / (2 * e), gz = hz / (2 * e), g = Math.sqrt(gx * gx + gz * gz);
        out.s = g / Math.sqrt(1 + g * g); out.nx = g > 1e-6 ? gx / g : 0; out.nz = g > 1e-6 ? gz / g : 0;
        return out.s;
    };
    W.temp = function (x, z) { return G.fbm(x * 0.0012 + 300, z * 0.0012, 2); };
    W.moist = function (x, z) { return G.fbm(x * 0.0014 + 77, z * 0.0014 + 77, 2); };
    /* biome id: 0 plains, 1 forest, 2 mountain, 3 desert, 4 beach, 5 snow */
    W.biome = function (x, z, h) {
        if (h < 1.2) return 4;
        var t = W.temp(x, z), m = W.moist(x, z);
        if (h > 105) return 5;
        if (h > 70) return 2;
        if (t > 0.64 && m < 0.42) return 3;
        if (m > 0.52 && h > 3) return 1;
        return 0;
    };

    /* ---------------- seasons: 0 spring 1 summer 2 autumn 3 winter ---------------- */
    var SEASON_GRASS = [[0.33, 0.62, 0.22], [0.55, 0.62, 0.18], [0.72, 0.48, 0.16], [0.62, 0.66, 0.58]];
    var SEASON_LEAF  = [[0.16, 0.5, 0.18], [0.2, 0.46, 0.14], [0.8, 0.35, 0.08], [0.35, 0.42, 0.3]];
    W.season = 0;
    var col = { r: 0, g: 0, b: 0 };
    function groundColor(x, z, h, slope, out) {
        var b = W.biome(x, z, h), s = W.season, g = SEASON_GRASS[s];
        var snowLine = s === 3 ? 55 : 105;
        if (h > snowLine || b === 5) { out.r = 0.9; out.g = 0.92; out.b = 0.95; }
        else if (slope > 0.62) { out.r = 0.42; out.g = 0.4; out.b = 0.4; }
        else if (b === 4) { out.r = 0.82; out.g = 0.76; out.b = 0.55; }
        else if (b === 3) { out.r = 0.86; out.g = 0.74; out.b = 0.42; }
        else if (b === 2) { out.r = 0.5; out.g = 0.46; out.b = 0.38; }
        else {
            var v = 0.85 + G.noise(x * 0.2, z * 0.2) * 0.3, f = b === 1 ? 0.8 : 1;
            out.r = g[0] * v * f; out.g = g[1] * v; out.b = g[2] * v * f;
            if (slope > 0.45) { var t = (slope - 0.45) / 0.17; out.r += (0.42 - out.r) * t; out.g += (0.4 - out.g) * t; out.b += (0.4 - out.b) * t; }
        }
        var sh = 0.75 + Math.min(1, Math.max(0, (h + 5) / 60)) * 0.25;   // valleys a little darker
        out.r *= sh; out.g *= sh; out.b *= sh;
        return out;
    }

    /* ---------------- scene, chunks and props ---------------- */
    var scene, Q, seg, chunkPool = [], live = {}, pendingRecolor = [];
    var index, uvs, sun, hemi, water, skyMat;
    var props = {};                                    // name -> { mesh, free:[], cap }
    var items = W.items = [];                          // active pick-ups: {x,y,z,type,key,inst,on}
    var itemPool = [];
    var m4 = new T.Matrix4(), q0 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(), eul = new T.Euler();
    var ZERO = new T.Matrix4().makeScale(0, 0, 0);
    var tmpC = new T.Color();
    var slopeOut = { s: 0, nx: 0, nz: 0 };

    function makePool(name, geom, mat, cap) {
        var mesh = new T.InstancedMesh(geom, mat, cap);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        for (var i = 0; i < cap; i++) mesh.setMatrixAt(i, ZERO);
        if (name === 'tree' || name === 'rock' || name === 'item') {
            mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
            mesh.instanceColor.setUsage(T.DynamicDrawUsage);
        }
        var free = []; for (var j = cap - 1; j >= 0; j--) free.push(j);
        scene.add(mesh);
        props[name] = { mesh: mesh, free: free, cap: cap };
    }
    function place(name, x, y, z, ry, sc, r, g, b) {
        var p = props[name]; if (!p.free.length) return -1;
        var i = p.free.pop();
        eul.set(0, ry, 0); q0.setFromEuler(eul); v3.set(x, y, z); s3.set(sc, sc, sc);
        m4.compose(v3, q0, s3); p.mesh.setMatrixAt(i, m4);
        if (p.mesh.instanceColor) { tmpC.setRGB(r, g, b); p.mesh.setColorAt(i, tmpC); }
        return i;
    }
    function unplace(name, i) { var p = props[name]; p.mesh.setMatrixAt(i, ZERO); p.free.push(i); }
    function flush(name) { var p = props[name]; p.mesh.instanceMatrix.needsUpdate = true; if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true; }

    function treeGeometry() {                          // trunk + canopy merged, canopy uses vertex colour white (tinted per instance)
        var trunk = new T.CylinderGeometry(0.25, 0.4, 3, 5), canopy = new T.ConeGeometry(2.4, 6, 6);
        trunk.translate(0, 1.5, 0); canopy.translate(0, 5.5, 0);
        return merge([trunk, canopy], [[0.45, 0.3, 0.18], [1, 1, 1]]);
    }
    function merge(geoms, tints) {
        var n = 0, ni = 0;
        for (var i = 0; i < geoms.length; i++) { n += geoms[i].attributes.position.count; ni += geoms[i].index.count; }
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3), idx = new Uint16Array(ni), o = 0, oi = 0;
        for (i = 0; i < geoms.length; i++) {
            var g = geoms[i], p = g.attributes.position.array, nn = g.attributes.normal.array, c = g.attributes.position.count, t = tints[i];
            pos.set(p, o * 3); nor.set(nn, o * 3);
            for (var k = 0; k < c; k++) { colr[(o + k) * 3] = t[0]; colr[(o + k) * 3 + 1] = t[1]; colr[(o + k) * 3 + 2] = t[2]; }
            var ix = g.index.array; for (k = 0; k < ix.length; k++) idx[oi + k] = ix[k] + o;
            o += c; oi += ix.length;
        }
        var out = new T.BufferGeometry();
        out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
        out.setAttribute('color', new T.BufferAttribute(colr, 3)); out.setIndex(new T.BufferAttribute(idx, 1));
        return out;
    }
    W.merge = merge;

    W.init = function (sc, quality) {
        scene = sc; Q = quality; seg = Q.seg;
        chunkPool = []; live = {}; pendingRecolor = []; props = {}; items.length = 0; itemPool = []; loadQueue.length = 0; lastCx = 1e9; lastCz = 1e9;
        /* shared index + uv for every chunk */
        var n = (seg + 1) * (seg + 1); index = new Uint16Array(seg * seg * 6); uvs = new Float32Array(n * 2);
        var k = 0;
        for (var j = 0; j < seg; j++) for (var i = 0; i < seg; i++) {
            var a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
            index[k++] = a; index[k++] = c; index[k++] = b; index[k++] = b; index[k++] = c; index[k++] = d;
        }
        var mat = new T.MeshLambertMaterial({ vertexColors: true });
        var count = (Q.view * 2 + 1) * (Q.view * 2 + 1) + Q.view * 4 + 4;
        for (i = 0; i < count; i++) {
            var g = new T.BufferGeometry();
            g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
            g.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * 3), 3));
            g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
            g.setIndex(new T.BufferAttribute(index, 1));
            var mesh = new T.Mesh(g, mat);
            mesh.visible = false; mesh.receiveShadow = Q.shadows; mesh.frustumCulled = true;
            scene.add(mesh);
            chunkPool.push({ mesh: mesh, key: null, cx: 0, cz: 0, tree: [], treePos: [], rock: [], grass: [], items: [] });
        }
        var area = count;
        makePool('tree', treeGeometry(), new T.MeshLambertMaterial({ vertexColors: true }), Math.round(area * 26 * Q.trees));
        makePool('rock', new T.DodecahedronGeometry(1, 0), new T.MeshLambertMaterial({ vertexColors: false, color: 0xffffff }), area * 8);
        var blade = new T.PlaneGeometry(0.5, 0.9); blade.translate(0, 0.45, 0);
        makePool('grass', blade, new T.MeshLambertMaterial({ color: 0x5f9c35, side: T.DoubleSide }), Math.max(1, area * Q.grass));
        makePool('item', new T.IcosahedronGeometry(0.35, 0), new T.MeshLambertMaterial({ color: 0xffffff }), area * 10);
        for (i = 0; i < props.item.cap; i++) itemPool.push({ x: 0, y: 0, z: 0, type: '', key: '', inst: -1, on: false, chunk: null });
        props.tree.mesh.castShadow = Q.shadows; props.rock.mesh.castShadow = Q.shadows;

        /* water, sky, lights */
        water = new T.Mesh(new T.PlaneGeometry(G.WORLD * 1.5, G.WORLD * 1.5, 1, 1),
            new T.MeshLambertMaterial({ color: 0x2a6fb8, transparent: true, opacity: 0.78 }));
        water.rotation.x = -Math.PI / 2; water.position.y = G.SEA; scene.add(water);
        hemi = new T.HemisphereLight(0xbfd8ff, 0x5a4a2a, 0.8); scene.add(hemi);
        sun = new T.DirectionalLight(0xffffff, 1.6); scene.add(sun); scene.add(sun.target);
        if (Q.shadows) {
            sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
            var sc2 = sun.shadow.camera; sc2.left = -70; sc2.right = 70; sc2.top = 70; sc2.bottom = -70; sc2.near = 1; sc2.far = 400; sun.shadow.bias = -0.002;
        }
        scene.fog = new T.Fog(0x9fc5e8, Q.fog * 0.45, Q.fog);
        scene.background = new T.Color(0x9fc5e8);
        W.sun = sun; W.hemi = hemi; W.water = water;
    };

    /* fill a pooled chunk with terrain + props for chunk coords cx, cz */
    function loadChunk(slot, cx, cz) {
        var ox = cx * CH, oz = cz * CH, g = slot.mesh.geometry, pos = g.attributes.position.array, cl = g.attributes.color.array, k = 0;
        for (var j = 0; j <= seg; j++) for (var i = 0; i <= seg; i++) {
            var x = ox + i / seg * CH, z = oz + j / seg * CH, h = heightAt(x, z);
            pos[k * 3] = i / seg * CH; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j / seg * CH;
            W.slopeAt(x, z, slopeOut); groundColor(x, z, h, slopeOut.s, col);
            cl[k * 3] = col.r; cl[k * 3 + 1] = col.g; cl[k * 3 + 2] = col.b; k++;
        }
        g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
        g.computeVertexNormals(); g.computeBoundingSphere();
        slot.mesh.position.set(ox, 0, oz); slot.mesh.visible = true; slot.key = cx + ',' + cz; slot.cx = cx; slot.cz = cz;
        /* props */
        var rng = new G.Rng(G.hash2(cx + 5000, cz + 5000) * 4294967295);
        var leaf = SEASON_LEAF[W.season];
        var nTrees = Math.round(18 * Q.trees), nRocks = 5, nGrass = Q.grass, nItems = 6;
        var taken = G.state.taken, key;
        for (i = 0; i < nTrees; i++) {
            x = ox + rng.range(2, CH - 2); z = oz + rng.range(2, CH - 2); h = heightAt(x, z);
            var b = W.biome(x, z, h), ok = (b === 1 && rng.next() < 0.9) || (b === 0 && rng.next() < 0.25) || (b === 2 && rng.next() < 0.2);
            if (!ok || h < 1.5 || W.slopeAt(x, z, slopeOut) > 0.6 || nearPoi(x, z)) continue;
            var sz = rng.range(0.8, 1.4), v = rng.range(0.85, 1.15);
            var id = place('tree', x, h - 0.2, z, rng.range(0, 6.28), sz, leaf[0] * v, leaf[1] * v, leaf[2] * v);
            if (id >= 0) { slot.tree.push(id); slot.treePos.push(x, z, 0.45 * sz); }
        }
        for (i = 0; i < nRocks; i++) {
            x = ox + rng.range(1, CH - 1); z = oz + rng.range(1, CH - 1); h = heightAt(x, z);
            if (h < 0.5 || nearPoi(x, z)) continue;
            var gr = rng.range(0.35, 0.55);
            id = place('rock', x, h, z, rng.range(0, 6.28), rng.range(0.6, 2.2), gr, gr, gr * 1.05);
            if (id >= 0) slot.rock.push(id);
        }
        for (i = 0; i < nGrass; i++) {
            x = ox + rng.range(0, CH); z = oz + rng.range(0, CH); h = heightAt(x, z);
            if (h < 1.5 || h > 70 || W.biome(x, z, h) === 3) continue;
            id = place('grass', x, h, z, rng.range(0, 3.14), rng.range(0.8, 1.6), 0, 0, 0);
            if (id >= 0) slot.grass.push(id);
        }
        for (i = 0; i < nItems; i++) {
            x = ox + rng.range(2, CH - 2); z = oz + rng.range(2, CH - 2); h = heightAt(x, z);
            if (h < 1.5) continue;
            b = W.biome(x, z, h);
            var type = b === 1 ? (rng.next() < 0.5 ? 'mushroom' : 'apple') : b === 0 ? (rng.next() < 0.6 ? 'apple' : 'herb') : b === 2 || b === 5 ? 'shard' : b === 3 ? 'herb' : '';
            if (rng.next() < 0.06) type = 'stick'; else if (rng.next() < 0.015) type = 'club';
            if (!type) continue;
            key = cx + ',' + cz + ',' + i;
            if (taken[key]) continue;
            spawnItem(slot, type, x, h + 0.4, z, key);
        }
        flush('tree'); flush('rock'); flush('grass'); flush('item');
    }
    function spawnItem(slot, type, x, y, z, key) {
        var it = null; for (var k = 0; k < itemPool.length; k++) if (!itemPool[k].on) { it = itemPool[k]; break; }
        if (!it) return null;
        var c = G.ITEMS[type].color;
        it.inst = place('item', x, y, z, 0, type === 'shard' ? 0.8 : type === 'stick' || type === 'club' ? 1.3 : 1, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
        if (it.inst < 0) return null;
        it.x = x; it.y = y; it.z = z; it.type = type; it.key = key; it.on = true; it.chunk = slot;
        if (slot) slot.items.push(it);
        items.push(it);
        return it;
    }
    /* drop something on the ground (loot) - belongs to no chunk, disappears when far */
    W.dropItem = function (type, x, z) { var it = spawnItem(null, type, x, heightAt(x, z) + 0.4, z, ''); if (it) flush('item'); return it; };
    function removeItem(it) {
        if (!it.on) return;
        it.on = false; unplace('item', it.inst);
        var i = items.indexOf(it); if (i >= 0) { items[i] = items[items.length - 1]; items.pop(); }
        if (it.chunk) { i = it.chunk.items.indexOf(it); if (i >= 0) it.chunk.items.splice(i, 1); }
        it.chunk = null;
    }
    /* the player picked it up: remember it so it does not grow back until a red night */
    W.takeItem = function (it) {
        if (!it.on) return;
        if (it.key) G.state.taken[it.key] = 1;
        removeItem(it); flush('item');
    };
    function unloadChunk(slot) {
        var i;
        for (i = 0; i < slot.tree.length; i++) unplace('tree', slot.tree[i]);
        for (i = 0; i < slot.rock.length; i++) unplace('rock', slot.rock[i]);
        for (i = 0; i < slot.grass.length; i++) unplace('grass', slot.grass[i]);
        for (i = slot.items.length - 1; i >= 0; i--) removeItem(slot.items[i]);
        slot.tree.length = 0; slot.treePos.length = 0; slot.rock.length = 0; slot.grass.length = 0; slot.items.length = 0;
        slot.mesh.visible = false; delete live[slot.key]; slot.key = null;
        flush('tree'); flush('rock'); flush('grass'); flush('item');
    }
    function nearPoi(x, z) {
        var p = G.POIS;
        for (var i = 0; i < p.length; i++) { var dx = x - p[i].x, dz = z - p[i].z; if (dx * dx + dz * dz < p[i].r * p[i].r * 1.1) return true; }
        return false;
    }
    W.nearPoi = nearPoi;
    /* Push a circle (x, z, radius r) out of tree trunks in the chunk under it. Writes into out {x, z}. */
    W.pushOutTrees = function (x, z, r, out) {
        out.x = x; out.z = z;
        var slot = live[Math.floor(x / CH) + ',' + Math.floor(z / CH)]; if (!slot) return out;
        var tp = slot.treePos;
        for (var i = 0; i < tp.length; i += 3) {
            var dx = out.x - tp[i], dz = out.z - tp[i + 1], rr = r + tp[i + 2], d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && d2 > 1e-6) { var d = Math.sqrt(d2); out.x = tp[i] + dx / d * rr; out.z = tp[i + 1] + dz / d * rr; }
        }
        return out;
    };
    /* nearest dry, gentle ground to (x, z), searched in a spiral; writes into out {x, z} */
    W.findLand = function (x, z, out) {
        for (var r = 0; r < 160; r += 6) for (var a = 0; a < 6.28; a += r ? 3 / r : 7) {
            var tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r, h = heightAt(tx, tz);
            if (h > 2 && h < 70 && W.slopeAt(tx, tz, slopeOut) < 0.45) { out.x = tx; out.z = tz; return out; }
        }
        out.x = x; out.z = z; return out;
    };
    W.chunkReady = function (x, z) { return !!live[Math.floor(x / CH) + ',' + Math.floor(z / CH)]; };

    var lastCx = 1e9, lastCz = 1e9, loadQueue = [];
    /* Called every frame with the player position: loads at most one chunk per frame. */
    W.update = function (px, pz) {
        var cx = Math.floor(px / CH), cz = Math.floor(pz / CH);
        if (cx !== lastCx || cz !== lastCz) {
            lastCx = cx; lastCz = cz; loadQueue.length = 0;
            var v = Q.view, i;
            for (i = 0; i < chunkPool.length; i++) {
                var s = chunkPool[i];
                if (s.key && (Math.abs(s.cx - cx) > v + 1 || Math.abs(s.cz - cz) > v + 1)) unloadChunk(s);
            }
            for (var r = 0; r <= v; r++) for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                var k = (cx + dx) + ',' + (cz + dz);
                if (!live[k]) loadQueue.push(cx + dx, cz + dz);
            }
        }
        if (loadQueue.length) {
            var wx = loadQueue[0], wz = loadQueue[1]; loadQueue.splice(0, 2);
            var k2 = wx + ',' + wz;
            if (!live[k2]) {
                var slot = null;
                for (i = 0; i < chunkPool.length; i++) if (!chunkPool[i].key) { slot = chunkPool[i]; break; }
                if (!slot) {                   // steal the farthest
                    var best = -1;
                    for (i = 0; i < chunkPool.length; i++) { var d = Math.max(Math.abs(chunkPool[i].cx - cx), Math.abs(chunkPool[i].cz - cz)); if (d > best) { best = d; slot = chunkPool[i]; } }
                    unloadChunk(slot);
                }
                loadChunk(slot, wx, wz); live[k2] = slot;
            }
        } else if (pendingRecolor.length) {
            var sl = pendingRecolor.pop(); if (sl.key) recolor(sl);
        }
        /* loose loot far away disappears */
        for (i = items.length - 1; i >= 0; i--) { var it = items[i]; if (!it.chunk && ((it.x - px) * (it.x - px) + (it.z - pz) * (it.z - pz)) > 150 * 150) { removeItem(it); flush('item'); } }
        water.position.x = px; water.position.z = pz;
    };
    function recolor(slot) {
        var g = slot.mesh.geometry, cl = g.attributes.color.array, pos = g.attributes.position.array, ox = slot.cx * CH, oz = slot.cz * CH, k = 0;
        for (var j = 0; j <= seg; j++) for (var i = 0; i <= seg; i++) {
            var x = ox + pos[k * 3], z = oz + pos[k * 3 + 2], h = pos[k * 3 + 1];
            W.slopeAt(x, z, slopeOut); groundColor(x, z, h, slopeOut.s, col);
            cl[k * 3] = col.r; cl[k * 3 + 1] = col.g; cl[k * 3 + 2] = col.b; k++;
        }
        g.attributes.color.needsUpdate = true;
        var leaf = SEASON_LEAF[W.season], tm = props.tree.mesh;
        for (i = 0; i < slot.tree.length; i++) { var v = 0.85 + G.hash2(slot.tree[i], 3) * 0.3; tmpC.setRGB(leaf[0] * v, leaf[1] * v, leaf[2] * v); tm.setColorAt(slot.tree[i], tmpC); }
        tm.instanceColor.needsUpdate = true;
    }
    W.setSeason = function (s) {
        if (s === W.season) return; W.season = s; pendingRecolor.length = 0;
        for (var i = 0; i < chunkPool.length; i++) if (chunkPool[i].key) pendingRecolor.push(chunkPool[i]);
        props.grass.mesh.material.color.setRGB(SEASON_GRASS[s][0] * 1.1, SEASON_GRASS[s][1] * 1.1, SEASON_GRASS[s][2] * 1.1);
    };
    /* Red night: everything taken grows back. Reload every chunk by forgetting them. */
    W.reload = function () {
        for (var i = 0; i < chunkPool.length; i++) if (chunkPool[i].key) unloadChunk(chunkPool[i]);
        for (i = items.length - 1; i >= 0; i--) removeItem(items[i]);    // loose loot
        flush('item');
        lastCx = 1e9;
    };
    W.respawnAll = function () { G.state.taken = {}; W.reload(); };

    /* ---------------- sky, sun and time of day ---------------- */
    var SKY = [[0.05, 0.06, 0.16], [0.95, 0.6, 0.35], [0.62, 0.77, 0.91], [0.98, 0.55, 0.3]];  // night, dawn, day, dusk
    var fogC = new T.Color();
    W.setTime = function (hour, px, pz, red) {        // hour 0..24
        var t, a, b;
        if (hour < 5) { t = 0; a = 0; b = 0; } else if (hour < 7) { t = (hour - 5) / 2; a = 0; b = 1; }
        else if (hour < 9) { t = (hour - 7) / 2; a = 1; b = 2; } else if (hour < 17) { t = 0; a = 2; b = 2; }
        else if (hour < 19) { t = (hour - 17) / 2; a = 2; b = 3; } else if (hour < 21) { t = (hour - 19) / 2; a = 3; b = 0; } else { t = 0; a = 0; b = 0; }
        var A = SKY[a], B = SKY[b];
        fogC.setRGB(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
        if (red) { fogC.r = fogC.r * 0.5 + 0.35; fogC.g *= 0.3; fogC.b *= 0.3; }
        scene.fog.color.copy(fogC); scene.background.copy(fogC);
        var day = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
        sun.intensity = 0.15 + day * 1.5; hemi.intensity = 0.25 + day * 0.6;
        sun.color.setRGB(1, 0.75 + day * 0.25, 0.55 + day * 0.45);
        var ang = (hour - 6) / 12 * Math.PI;
        sun.position.set(px + Math.cos(ang) * 120, 40 + Math.sin(ang) * 150, pz + 60);
        sun.target.position.set(px, 0, pz);
        if (red) sun.color.setRGB(1, 0.3, 0.25);
    };
})();
