/* All content data: items, places, people, quests. Texts are keys into window.TEXT (i18n.js).
 * Everything here is original: the land of Ardalia, the hero Kael, the Grubbers... */
(function () {
    'use strict';
    var G = window.G;

    /* ---- items ---- kind: weapon | food | raw | key | material */
    G.ITEMS = {
        stick:     { kind: 'weapon', dmg: 1, dur: 12, color: 0x8b5a2b },
        club:      { kind: 'weapon', dmg: 2, dur: 20, color: 0x6b4423 },
        rustsword: { kind: 'weapon', dmg: 3, dur: 28, color: 0x8a8f98 },
        ironsword: { kind: 'weapon', dmg: 5, dur: 45, color: 0xc9d1dc },
        wardenaxe: { kind: 'weapon', dmg: 8, dur: 70, color: 0xffb347 },
        apple:     { kind: 'raw',  hearts: 0.5, color: 0xe03a3a },
        mushroom:  { kind: 'raw',  hearts: 0.5, color: 0xd9a066 },
        herb:      { kind: 'raw',  hearts: 0, stamina: 0.3, color: 0x5ad35a },
        meat:      { kind: 'raw',  hearts: 1, color: 0xc35b5b },
        roastapple:{ kind: 'food', hearts: 2, color: 0xb22222 },
        stew:      { kind: 'food', hearts: 4, stamina: 1, color: 0xa0522d },
        herbtea:   { kind: 'food', hearts: 1, stamina: 2, color: 0x3cb371 },
        shard:     { kind: 'material', color: 0x9be7ff },
        windcloak: { kind: 'key', color: 0x7fd4ff },
        letter:    { kind: 'key', color: 0xfff1c1 },
        core:      { kind: 'key', color: 0xffd23f },
        orb:       { kind: 'key', color: 0xfff27a }          // from Hollows: 4 orbs = 1 heart or 1 stamina at the Elmbrook shrine
    };
    G.MAX_WEAPONS = 8;

    /* Achievements: small goals that keep giving the player a reason for "one more". */
    G.ACHIEVEMENTS = [
        { id: 'firststep', stat: 'quests', n: 1 },
        { id: 'quest5', stat: 'quests', n: 5 },
        { id: 'quest15', stat: 'quests', n: 15 },
        { id: 'hunter', stat: 'kills', n: 10 },
        { id: 'slayer', stat: 'kills', n: 50 },
        { id: 'chef', stat: 'cooked', n: 10 },
        { id: 'gatherer', stat: 'picked', n: 50 },
        { id: 'climber', stat: 'climbed', n: 200 },
        { id: 'glider', stat: 'glided', n: 500 },
        { id: 'rider', stat: 'rode', n: 1000 },
        { id: 'beacons', stat: 'beacons', n: 6 },
        { id: 'hollows', stat: 'hollows', n: 6 },
        { id: 'breaker', stat: 'broken', n: 10 },
        { id: 'survivor', stat: 'redNights', n: 1 },
        { id: 'level5', stat: 'level', n: 5 },
        { id: 'level10', stat: 'level', n: 10 }
    ];
    /* cooking: sorted ingredient list -> result */
    G.RECIPES = [
        { needs: ['apple'], gives: 'roastapple' },
        { needs: ['herb'], gives: 'herbtea' },
        { needs: ['meat', 'mushroom'], gives: 'stew' },
        { needs: ['apple', 'meat'], gives: 'stew' },
        { needs: ['herb', 'mushroom'], gives: 'herbtea' }
    ];

    /* ---- places ---- The terrain is flattened around each one (r = radius). */
    G.POIS = [
        { id: 'elmbrook',  type: 'village', x: 0,    z: 40,   y: 12, r: 60 },
        { id: 'saltmere',  type: 'village', x: -520, z: 380,  y: 4,  r: 55 },
        { id: 'highcairn', type: 'village', x: 430,  z: 110,  y: 0,  r: 50 },
        { id: 'b1', type: 'beacon', x: 110,  z: -60,  y: 30,  r: 18 },
        { id: 'b2', type: 'beacon', x: -400, z: 250,  y: 24,  r: 18 },
        { id: 'b3', type: 'beacon', x: 490,  z: 30,   y: 0,  r: 18 },
        { id: 'b4', type: 'beacon', x: -300, z: -420, y: 60,  r: 18 },
        { id: 'b5', type: 'beacon', x: 520,  z: 420,  y: 40,  r: 18 },
        { id: 'b6', type: 'beacon', x: 40,   z: 600,  y: 18,  r: 18 },
        { id: 'h1', type: 'hollow', x: -120, z: -160, y: 20,  r: 16 },
        { id: 'h2', type: 'hollow', x: 260,  z: 170,  y: 26,  r: 16 },
        { id: 'h3', type: 'hollow', x: -600, z: -80,  y: 14,  r: 16 },
        { id: 'h4', type: 'hollow', x: 300,  z: -620, y: 80,  r: 16 },
        { id: 'h5', type: 'hollow', x: -200, z: 560,  y: 12,  r: 16 },
        { id: 'h6', type: 'hollow', x: 640,  z: 60,   y: 35,  r: 16 },
        { id: 'c1', type: 'camp', x: 60,   z: -260, y: 22, r: 22, enemies: 4 },
        { id: 'c2', type: 'camp', x: -330, z: 120,  y: 18, r: 22, enemies: 5 },
        { id: 'c3', type: 'camp', x: 520,  z: -180, y: 48, r: 22, enemies: 5 },
        { id: 'c4', type: 'camp', x: 240,  z: 480,  y: 20, r: 22, enemies: 6 },
        { id: 'c5', type: 'camp', x: -560, z: -500, y: 40, r: 22, enemies: 6 },
        { id: 'crown', type: 'ruin', x: 20, z: -660, y: 70, r: 40, boss: true },
        { id: 'stable', type: 'stable', x: -80, z: 120, y: 12, r: 20 }
    ];

    /* ---- people ---- home: POI id; schedule: hour -> spot name (relative to home) */
    G.NPCS = [
        { id: 'mira', home: 'elmbrook', at: { x: 0, z: 0 },   color: 0x8e44ad, lines: ['mira1', 'mira2', 'mira3'] },
        { id: 'pell', home: 'elmbrook', at: { x: 18, z: 10 }, color: 0x27ae60, lines: ['pell1', 'pell2'] },
        { id: 'brin', home: 'stable',   at: { x: 0, z: 0 },   color: 0xd35400, lines: ['brin1', 'brin2'] },
        { id: 'oren', home: 'saltmere', at: { x: 0, z: 0 },   color: 0x2980b9, lines: ['oren1', 'oren2', 'oren3'] },
        { id: 'lio',  home: 'saltmere', at: { x: -16, z: 12 }, color: 0xf1c40f, lines: ['lio1', 'lio2'] },
        { id: 'tove', home: 'highcairn', at: { x: 0, z: 0 },  color: 0xecf0f1, lines: ['tove1', 'tove2'] },
        { id: 'hask', home: 'highcairn', at: { x: 14, z: -10 }, color: 0x7f8c8d, lines: ['hask1', 'hask2'] }
    ];

    /* ---- quests ----
     * main: ordered chain. side: unlocked by `after` (quest id) or from the start.
     * objective kinds: talk {npc}, reach {poi}, beacon {poi}, hollow {poi}, kill {camp|type, n},
     *                  collect {item, n}, give {npc, item, n}, cook {n}, tame, boss, survive_red
     * reward: { hearts, stamina, items: {id:n}, xp } */
    G.QUESTS = [
        { id: 'm1', main: true, obj: [{ k: 'talk', npc: 'mira' }], reward: { items: { windcloak: 1, stick: 1 }, xp: 50 } },
        { id: 'm2', main: true, obj: [{ k: 'beacon', poi: 'b1' }], reward: { xp: 100 } },
        { id: 'm3', main: true, obj: [{ k: 'hollow', poi: 'h1' }], reward: { stamina: 1, xp: 120 } },
        { id: 'm4', main: true, obj: [{ k: 'kill', camp: 'c1', n: 4 }], reward: { items: { rustsword: 1 }, xp: 150 } },
        { id: 'm5', main: true, obj: [{ k: 'reach', poi: 'saltmere' }, { k: 'talk', npc: 'oren' }], reward: { xp: 150 } },
        { id: 'm6', main: true, obj: [{ k: 'cook', n: 3 }, { k: 'give', npc: 'oren', item: 'stew', n: 1 }], reward: { hearts: 1, xp: 200 } },
        { id: 'm7', main: true, obj: [{ k: 'reach', poi: 'highcairn' }, { k: 'talk', npc: 'tove' }, { k: 'beacon', poi: 'b3' }], reward: { items: { ironsword: 1 }, xp: 250 } },
        { id: 'm8', main: true, obj: [{ k: 'boss', poi: 'crown' }], reward: { hearts: 2, items: { wardenaxe: 1 }, xp: 500 } },

        { id: 's1', after: 'm1', giver: 'pell', obj: [{ k: 'give', npc: 'pell', item: 'apple', n: 5 }], reward: { items: { roastapple: 2 }, xp: 60 } },
        { id: 's2', after: 'm1', giver: 'brin', obj: [{ k: 'tame' }], reward: { xp: 120, items: { herb: 3 } } },
        { id: 's3', after: 'm2', obj: [{ k: 'hollow', poi: 'h2' }, { k: 'hollow', poi: 'h3' }, { k: 'hollow', poi: 'h4' }], reward: { stamina: 1, xp: 300 } },
        { id: 's4', after: 'm2', obj: [{ k: 'beacon', poi: 'b2' }, { k: 'beacon', poi: 'b4' }, { k: 'beacon', poi: 'b5' }, { k: 'beacon', poi: 'b6' }], reward: { hearts: 1, xp: 400 } },
        { id: 's5', after: 'm4', obj: [{ k: 'kill', type: 'boar', n: 3 }], reward: { items: { meat: 3 }, xp: 80 } },
        { id: 's6', after: 'm5', giver: 'lio', obj: [{ k: 'give', npc: 'tove', item: 'letter', n: 1 }], reward: { items: { ironsword: 1 }, xp: 150 } },
        { id: 's7', after: 'm1', obj: [{ k: 'collect', item: 'shard', n: 10 }], reward: { stamina: 1, xp: 200 } },
        { id: 's8', after: 'm3', obj: [{ k: 'cook', n: 5 }], reward: { items: { stew: 2 }, xp: 100 } },
        { id: 's9', after: 'm4', obj: [{ k: 'kill', camp: 'c2', n: 5 }], reward: { xp: 180, items: { club: 1 } } },
        { id: 's10', after: 'm7', giver: 'hask', obj: [{ k: 'kill', camp: 'c3', n: 5 }], reward: { xp: 220, items: { meat: 2 } } },
        { id: 's11', after: 'm2', obj: [{ k: 'survive_red' }], reward: { items: { shard: 3 }, xp: 150 } },
        { id: 's12', after: 'm7', obj: [{ k: 'hollow', poi: 'h5' }, { k: 'hollow', poi: 'h6' }], reward: { hearts: 1, xp: 300 } }
    ];

    /* Level thresholds (xp). Each level: +1 attack power step every 3 levels. */
    G.LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
})();
