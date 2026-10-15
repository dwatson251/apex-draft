#!/usr/bin/env python3
"""Turn Demucs stems into seamless, bar-aligned OGG loops for the game.

Needs: numpy, soundfile, librosa, imageio-ffmpeg (see tools/audio/README.md).
Usage: python3 -I tools/audio/make_loops.py <stems_dir> <out_dir> biome=trackname ...
  e.g. make_loops.py stems/htdemucs src/renderer/public/audio city=city_1000 moon=moon_1000

Per biome writes drums.ogg, bass.ogg, music.ogg (Demucs "other" + "vocals") plus loop.json.
All three stems share one start and length so they stay in sync when looped together.
"""
import json, pathlib, subprocess, sys
import numpy as np, soundfile as sf, librosa, imageio_ffmpeg

BARS = 8          # loop length in bars (4/4)
XFADE = 0.25      # seconds of crossfade to hide the seam
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def load(p):
    y, sr = sf.read(p, dtype="float32")
    return y if y.ndim == 2 else np.stack([y, y], 1), sr


def seam_cost(mix, a, n, sr):
    """How different the audio just before the loop end is from just before the start (smaller = smoother)."""
    w = int(0.05 * sr)
    if a < w or a + n + w > len(mix):
        return 1e9
    return float(np.sum((mix[a:a + w] - mix[a + n:a + n + w]) ** 2))


def make_loop(stem_dir, out_dir, name):
    stems = {k: load(stem_dir / f"{k}.wav") for k in ("drums", "bass", "other", "vocals")}
    sr = stems["drums"][1]
    d = {k: v[0] for k, v in stems.items()}
    music = d["other"] + d["vocals"]
    mix = d["drums"] + d["bass"] + music

    mono = d["drums"].mean(1)
    tempo, beats = librosa.beat.beat_track(y=mono, sr=sr, units="time", start_bpm=100)
    tempo = float(np.atleast_1d(tempo)[0])
    # Refine the beat period from the median inter-beat gap (more stable than the tempo estimate).
    period = float(np.median(np.diff(beats)))
    bpm = 60.0 / period
    loop_len = period * 4 * BARS
    n = int(round(loop_len * sr))
    pad = int(XFADE * sr)

    best = None
    for b in beats[: 24]:
        if b < 1.0:
            continue
        a = int(round(b * sr))
        if a + n + pad > len(mix):
            break
        c = seam_cost(mix, a, n, sr)
        if best is None or c < best[0]:
            best = (c, a, b)
    if best is None:
        raise SystemExit(f"{name}: track too short for a {BARS}-bar loop at {bpm:.1f} BPM")
    _, a, b = best

    fade = np.linspace(0.0, 1.0, pad, dtype=np.float32)[:, None]
    out_dir.mkdir(parents=True, exist_ok=True)
    for stem, y in (("drums", d["drums"]), ("bass", d["bass"]), ("music", music)):
        seg = y[a:a + n + pad].copy()
        # Blend the audio that follows the loop end into the loop start, so the wrap is continuous.
        seg[:pad] = seg[:pad] * fade + seg[n:n + pad] * (1.0 - fade)
        seg = seg[:n]
        wav = out_dir / f"{stem}.wav"
        sf.write(wav, seg, sr, subtype="PCM_16")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "4",
                        str(out_dir / f"{stem}.ogg")], check=True)
        wav.unlink()
    meta = {"bpm": round(bpm, 2), "bars": BARS, "seconds": round(n / sr, 3), "start": round(a / sr, 3),
            "source": name}
    (out_dir / "loop.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{name}: {bpm:.1f} BPM (librosa {tempo:.1f}), {BARS} bars = {n / sr:.2f}s, start {b:.2f}s", flush=True)


def main():
    stems, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    for arg in sys.argv[3:]:
        biome, track = arg.split("=")
        make_loop(stems / track, out / biome, track)


if __name__ == "__main__":
    main()
