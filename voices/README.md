# NPC voice lines

Drop recorded lines here (or anywhere, then set `voiceBase` in the app config) as:

    voices/<lang>/<npc>_<line>.mp3      e.g. voices/en/mira_m1_talk.mp3, voices/ary/oren_oren1.mp3

`<lang>` is `en`, `fr`, `ar` or `ary`; `<npc>` is `mira pell brin oren lio tove hask`;
`<line>` is the text key in `i18n.js` that the character is saying (`mira1`, `m1_talk`, `s1_offer`, `hint_m3`…).

A line plays when the owner's config has `"voice": true`, the player's Settings > Character voices is on,
and the file loads within `voiceTimeoutMs` (default 1000 ms). Missing files are skipped quietly and
the TV's Voice Guide reads the subtitle instead. Keep files short and small (mono, 64 kbps).
