# Pirate Seas 3D

A gritty 3D age-of-sail game built with vendored Three.js r170. It is a plain static site with no build step.
Play it at https://jonnah1738.github.io/pirate-seas-3d/

This is a separate project from the 2D Pirate Seas. Its saves use their own localStorage keys (`ps3d_save_v1`, `ps3d_settings_v1`).

## Controls
| | Keyboard | Touch |
|---|---|---|
| Steer | A/D or ←/→ | helm stick (bottom left) |
| Sail / throttle | W/S, ↑/↓, +/− (10% steps); X or double-tap S = stop | brass lever (drag); FULL / STOP; double-tap the lever = stop |
| Broadsides | Q = port, E = starboard, Space = both | ◀ PORT / STBD ▶ |
| Camera | V toggles first person (helm) / third person (chase); drag to look; wheel zoom | 3rd/1st button; drag to look; pinch zoom |
| Dock | F near the pier | Dock button |
| Settings | Esc / P | ⚙ |

## Dev
```
python3 -m http.server 8796
URL=http://127.0.0.1:8796/ python3 tests/test_slice.py   # gameplay + mobile tests, screenshots to $OUT
URL=http://127.0.0.1:8796/ python3 tests/test_extra.py   # sinking/respawn, save, auto graphics, landscape
URL=http://127.0.0.1:8796/ python3 tests/fps.py          # fps under CDP CPU throttle
URL=http://127.0.0.1:8796/ python3 tests/test_vote.py    # 2D/3D vote + classic-2D link (BOTH= one origin serving both games)
```

## 2D/3D preference vote
`js/pseas-vote.js` is shared with the 2D game (identical copy in `pirate-game/tools/pg/pseas-vote.js`). After ~5 minutes of
combined play in either game it asks once "Which do you prefer: 2D or 3D?" (2D / 3D / Haven't tried 3D yet / Ask me later),
stores the answer in localStorage `pseas_pref_vote_v1` (shared by both games on jonnah1738.github.io), and can be changed in
Settings. Votes are anonymous +1 hits on Abacus counters (`vote-*`, `unvote-*` on change); results are never shown in-game.
The live site also counts `3d-devices` / `3d-sessions`. Nothing is sent from localhost or automated browsers.
