/* Deterministic noise and random numbers. The whole world is generated from these, so every
 * player sees the same Ardalia and saves only need to remember what changed. */
(function () {
    'use strict';
    var G = window.G = window.G || {};

    function hash2(x, y) {                    // integer lattice -> [0,1)
        var h = (x * 374761393 + y * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function value(x, y) {                     // value noise, [0,1]
        var xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
        var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
        return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    }
    function fbm(x, y, oct) {                  // fractal noise, [0,1]
        var s = 0, a = 0.5, n = 0;
        for (var i = 0; i < oct; i++) { s += value(x, y) * a; n += a; x = x * 2.03 + 17.1; y = y * 1.97 + 9.7; a *= 0.5; }
        return s / n;
    }
    function ridge(x, y, oct) {                // sharp ridges for mountains, [0,1]
        var s = 0, a = 0.5, n = 0;
        for (var i = 0; i < oct; i++) { var v = 1 - Math.abs(value(x, y) * 2 - 1); s += v * v * a; n += a; x = x * 2.1 + 3.3; y = y * 2.1 + 7.9; a *= 0.5; }
        return s / n;
    }
    /* Seeded generator for per-chunk object placement (one per chunk, reset on load). */
    function Rng(seed) { this.s = (seed >>> 0) || 1; }
    Rng.prototype.next = function () { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; };
    Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };

    G.hash2 = hash2; G.noise = value; G.fbm = fbm; G.ridge = ridge; G.Rng = Rng;
})();
