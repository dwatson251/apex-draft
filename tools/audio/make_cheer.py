#!/usr/bin/env python3
"""Cut crowd-cheer one-shots from two CC0 recordings (see docs/AUDIO_CREDITS.md).

Usage: python3 -I tools/audio/make_cheer.py <crowd_shouting.ogg> <welldone.ogg> <out_dir>
Writes <out_dir>/cheer_0.ogg ... cheer_3.ogg: a swell of crowd voices with a little applause on top.
"""
import pathlib, subprocess, sys
import numpy as np, soundfile as sf, imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
# (crowd start s, length s, applause start s, applause gain, pitch ratio)
TAKES = [(2.0, 2.6, 0.2, 0.5, 1.0), (9.5, 3.0, 1.0, 0.4, 1.06), (15.0, 2.2, 0.0, 0.6, 0.95), (21.0, 3.2, 0.6, 0.45, 1.0)]


def mono(p):
    y, sr = sf.read(p, dtype="float32")
    y = y.mean(1) if y.ndim > 1 else y
    assert sr == SR, (p, sr)
    return y


def resample_ratio(y, r):
    """Cheap pitch/speed change by linear interpolation; r > 1 is higher and shorter."""
    x = np.arange(0, len(y) - 1, r)
    return np.interp(x, np.arange(len(y)), y).astype(np.float32)


def brighten(y):
    """Lift the top a little: crowd recordings of voices are dull next to a game mix."""
    return y + 0.35 * np.concatenate([[0], np.diff(y)])


def main():
    crowd, clap, out = mono(sys.argv[1]), mono(sys.argv[2]), pathlib.Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    for i, (cs, cl, ps, pg, pr) in enumerate(TAKES):
        seg = resample_ratio(crowd[int(cs * SR): int((cs + cl * pr) * SR)], pr)
        n = len(seg)
        seg = brighten(seg)
        a = clap[int(ps * SR): int(ps * SR) + n]
        seg[: len(a)] += a * pg
        t = np.arange(n) / SR
        env = np.minimum(1, t / 0.3) ** 1.5 * np.minimum(1, (n / SR - t) / 1.1) ** 1.5  # swell in, long fade out
        seg *= env
        seg *= 0.9 / np.abs(seg).max()
        wav = out / f"cheer_{i}.wav"
        sf.write(wav, seg, SR, subtype="PCM_16")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "4", str(out / f"cheer_{i}.ogg")], check=True)
        wav.unlink()
        print(f"cheer_{i}: {n / SR:.2f}s")


if __name__ == "__main__":
    main()
