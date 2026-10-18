# Audio credits

Files are in `src/renderer/public/audio/`. The tools that made them are in `tools/audio/`.

| Files | Made with | Licence |
|---|---|---|
| `title/ grass/ desert/ snow/ city/ moon/ coast/ jungle/ volcano/` (drums, bass, music loops) | Generated with ACE-Step v1 3.5B (via ComfyUI), split with Demucs `htdemucs`, cut into loops by `make_loops.py --bars=64 --bpm=172` | ACE-Step: Apache-2.0. Demucs: MIT. |

One soundtrack, liquid drum and bass at 172 bpm (ACE-Step plays it at about 174), picked from three style sketches (jazz-funk fusion, synthwave, drum and bass) on 2026-10-18. Each place keeps the genre and changes the instruments. Prompts, tempos and keys are in `tools/audio/gen_music.py` (`DNB` and `BIOMES`); every take is 150 seconds long. The takes used: seed 1000 for the title, countryside, desert, Moon, coast and jungle; 8919 for snow; 16838 for city and volcano (the first takes of those did not repeat cleanly, see below). Mountains and forest plays the snow track, and open water the coast's: no take of the mountains came round cleanly.

`make_loops.py` finds each loop's length from the music itself (the drums' onset envelope correlated with itself, near 64 bars at the tempo asked for, then fine-tuned on the waveform) and falls back to 32 or 16 bars when a track does not repeat at 64. The loops run 88 to 94 seconds (the old ones were 16 to 21); each folder's `loop.json` has the take, the start, the length and how well it matched itself.

The pit-exit "Go go go" and the crowd cheer are synthesised in `audio.ts`. `make_voice.py` (Kokoro) and `make_cheer.py` (two CC0 OpenGameArt clips) exist but their output is not shipped.
