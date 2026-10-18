# Audio credits

Files are in `src/renderer/public/audio/`. The tools that made them are in `tools/audio/`.

| Files | Made with | Licence |
|---|---|---|
| `title/ city/ desert/ grass/ moon/ snow/` (drums, bass, music loops) | Generated with ACE-Step v1 3.5B (via ComfyUI), split with Demucs `htdemucs`, cut into loops by `make_loops.py` | ACE-Step: Apache-2.0. Demucs: MIT. |

Prompts, tempos and keys for the music are in `tools/audio/gen_music.py`. Chosen takes: title 8919, city 1000, desert 8919, grass 1000, moon 1000, snow 8919 (seed numbers).

The pit-exit "Go go go" and the crowd cheer are synthesised in `audio.ts`. `make_voice.py` (Kokoro) and `make_cheer.py` (two CC0 OpenGameArt clips) exist but their output is not shipped.
