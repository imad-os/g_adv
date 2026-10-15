# Echoes of Ardalia (g_adv)

An open-world, low-poly 3D adventure for **My PC** (Samsung TV desktop app). See `CLAUDE.md` and the
[My PC guide](https://raw.githubusercontent.com/imad-os/g/main/sdk/GUIDE.md).

App Store address: **https://imad-os.github.io/g_adv/**

Play standalone: open `index.html` in Chrome. Arrows move (◀ ▶ turn, ▲ forward, hold ▲ to run),
Enter/Space = OK (talk, pick up, attack, jump; hold in the air to glide; hold while standing still for the menu),
Shift = sprint, Backspace = map, Esc pauses.

## What is in it
- Procedural 1.5 km × 1.5 km world streamed in chunks: plains, forests, mountains, desert, beaches, snow, lakes and sea.
- Climb any slope, glide with the wind cloak, swim, sprint: one stamina wheel.
- Hearts, hunger, cooking at campfires, weapons that break, a tamable horse with spurs.
- Day/night (24 real minutes per day), four seasons, rain and snow, a Red Moon every 7th night that brings everything back.
- 8 main quests and 12 side quests, 6 beacons (map reveal + fast travel), 6 Hollow trials, 5 Grubber camps with chests,
  a boss, levels, achievements and a daily gift.
- AI: villagers with daily schedules who flee monsters, prey that flees, boars that fight back, wolf packs at night,
  Grubbers with sight/hearing suspicion, call-for-help and attack-turn tactics, a two-move boss.
- Four difficulties chosen at New game: Wanderer, Adventurer, Champion, Legend (enemy damage, health, speed and sight,
  hunger, weapon wear, healing and xp all scale; on Legend hearts only come back from food).
- Co-op for two over My PC multiplayer (same Wi-Fi, any two My PC devices): Title → Host a co-op game / Join a friend, or
  in game Menu → System → Invite a friend. The guest plays their own hero from their own save in the host's world;
  enemies attack the nearest player; every kill and every host quest reward is shared. Names are the My PC profile names.
- Settings › How to play: the story, gameplay and how to progress, in every language.
- Settings in six sections: Graphics (quality Auto/Low/Medium/High from My PC's tier, view distance, grass, shadows,
  render resolution, FPS counter), Gameplay, Camera (distance, height, field of view, shake), Audio, Interface (HUD size,
  clock, FPS) and Button mapping: press OK on an action, then press any button within 5 s (detected; nothing pressed = unchanged).
  Every gamepad button can be used (L, R, ZL, ZR, stick presses): `js/pad.js` reads the pad through the Gamepad API,
  because My PC only forwards A, B/X/Y (as one) and Start/Select; it falls back to the SDK actions when the pad is not readable.
- English, French, Arabic and Moroccan Darija.

## Owner config (App Store Manager → Config)
`dayMinutes`, `difficulty` (default for new games: `wanderer|adventurer|champion|legend`), `quality` (`low|medium|high`), `lang` (`en|fr|ar|ary`), `voice`, `voiceBase`, `voiceTimeoutMs`, `startHearts`.

`lib/three.min.js` is three.js r160 (MIT, see `lib/LICENSE-three.txt`).
