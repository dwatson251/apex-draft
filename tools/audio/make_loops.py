#!/usr/bin/env python3
"""Turn Demucs stems into seamless, bar-aligned OGG loops for the game.

Needs: numpy, soundfile, librosa, imageio-ffmpeg (see tools/audio/README.md).
Usage: python3 -I tools/audio/make_loops.py <stems_dir> <out_dir> [--bars=N] [--bpm=N] biome=trackname ...
  e.g. make_loops.py stems/htdemucs src/renderer/public/audio --bars=64 --bpm=172 city=city_1000 moon=moon_1000
  (--bpm is the tempo the beat tracker starts from; --bars falls back to fewer when a track is too short)

Per biome writes drums.ogg, bass.ogg, music.ogg (Demucs "other" + "vocals") plus loop.json.
All three stems share one start and length so they stay in sync when looped together.
"""
import json, pathlib, subprocess, sys
import numpy as np, soundfile as sf, librosa, imageio_ffmpeg

START_BPM = 100
BPM_GIVEN = False
# how well the music must line up with itself one loop later (the onset envelope's correlation) for a loop that long to be seamless
MIN_SELF_MATCH = 0.35
BARS = 8          # loop length in bars (4/4), unless the command line says `--bars N`; a long track takes a long loop (fewer repeats in a race)
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


HOP = 256


def refine_length(mono, sr, est, spread=0.06):
    """The loop length (samples) near `est` at which the track best repeats itself: the onset envelope's autocorrelation peak, then the waveform."""
    env = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=HOP)
    env = (env - env.mean()) / (env.std() + 1e-9)
    lag0 = est / HOP
    lo, hi = int(lag0 * (1 - spread)), int(lag0 * (1 + spread)) + 1
    best_lag, best = lo, -1e9
    for lag in range(lo, min(hi, len(env) - 1)):
        a, b = env[:-lag], env[lag:]
        s = float(np.dot(a, b) / len(a))
        if s > best:
            best, best_lag = s, lag
    n = best_lag * HOP
    edge = best_lag in (lo, min(hi, len(env) - 1) - 1)
    # to the sample: the shift (within one envelope frame) at which the drums, one loop apart, match best over a long stretch
    seg = mono[: len(mono) - n - HOP]
    w = min(len(seg), int(20 * sr))
    if w > sr:
        offs = range(-HOP, HOP + 1, 4)
        errs = [float(np.mean((mono[:w] - mono[n + o: n + o + w]) ** 2)) for o in offs]
        n += list(offs)[int(np.argmin(errs))]
    return n, (best, edge)


def make_loop(stem_dir, out_dir, name):
    stems = {k: load(stem_dir / f"{k}.wav") for k in ("drums", "bass", "other", "vocals")}
    sr = stems["drums"][1]
    d = {k: v[0] for k, v in stems.items()}
    music = d["other"] + d["vocals"]
    mix = d["drums"] + d["bass"] + music

    mono = d["drums"].mean(1)
    tempo, beats = librosa.beat.beat_track(y=mono, sr=sr, units="time", start_bpm=START_BPM)
    tempo = float(np.atleast_1d(tempo)[0])
    # The loop's length from the music itself: beat times snap to analysis frames and the tracker can drop or add a beat, so a length from beats can
    # be a few percent out, and a long loop that far out ends mid-bar. The length that makes the music line up best with itself (the peak of the
    # drums' onset envelope correlated with itself, near what the beats say) is a whole number of bars by construction, and is then fine-tuned on
    # the waveform itself to the sample.
    # (centred on the tempo asked for when there is one: the tracker's own is frame-quantised and can be 4% out)
    period = 60.0 / START_BPM if BPM_GIVEN else float(np.median(np.diff(beats)))
    # the longest of BARS, BARS/2, BARS/4 at which the track really repeats itself (a generated track need not come round again after 64 bars,
    # and a loop that long would then jump at the seam); if none does, the one that comes closest
    global BARS
    tries = []
    for bars in (BARS, BARS // 2, BARS // 4):
        if bars < 8: continue
        cand, pk = refine_length(mono, sr, int(round(period * 4 * bars * sr)))
        tries.append((bars, cand, pk))
        if pk[0] >= MIN_SELF_MATCH and not pk[1]: break
    good = [t for t in tries if t[2][0] >= MIN_SELF_MATCH and not t[2][1]]
    BARS, n, peak = good[0] if good else max(tries, key=lambda t: t[2][0])
    bpm = 60.0 / (n / sr / (4 * BARS))
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
    print(f"{name}: {bpm:.1f} BPM (librosa {tempo:.1f}), {BARS} bars = {n / sr:.2f}s, start {b:.2f}s, self-match {peak[0]:.2f}{' AT THE EDGE OF THE SEARCH' if peak[1] else ''}", flush=True)


def main():
    global BARS, START_BPM, BPM_GIVEN
    stems, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    want = BARS
    for arg in sys.argv[3:]:
        if arg.startswith("--bars="): want = int(arg[7:]); continue
        if arg.startswith("--bpm="): START_BPM = float(arg[6:]); BPM_GIVEN = True; continue
        biome, track = arg.split("=")
        # the longest loop the track holds, halving down from what was asked
        BARS = want
        while True:
            try: make_loop(stems / track, out / biome, track); break
            except SystemExit:
                if BARS <= 8: raise
                BARS //= 2


if __name__ == "__main__":
    main()
