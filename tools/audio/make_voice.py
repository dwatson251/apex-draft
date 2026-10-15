#!/usr/bin/env python3
"""Render the pit-exit shout with Kokoro-82M (Apache-2.0) into short OGG variants.

Needs: kokoro, misaki, soundfile, numpy, scipy-free (see tools/audio/README.md).
Usage: python3 -I tools/audio/make_voice.py <out_dir>
Writes <out_dir>/gogogo_0.ogg ... gogogo_N.ogg.

espeak-ng is skipped on purpose (its bundled build crashes on some machines); the dictionary G2P covers
"go", which is all we say.
"""
import pathlib, subprocess, sys
import numpy as np, soundfile as sf, torch, imageio_ffmpeg
from huggingface_hub import hf_hub_download
from kokoro import KModel
from misaki import en

REPO = "hexgrad/Kokoro-82M"
SR = 24000
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
# (text, voice, speed): short, punchy, one breath per call. Fast: the old one took ~1.2 s for three words.
TAKES = [
    ("Go! Go! Go!", "am_adam", 1.45),
    ("Go go go go!", "am_michael", 1.5),
    ("Go, go, go!", "am_onyx", 1.4),
    ("Go! Go! Go! Go!", "bm_george", 1.5),
]


def radio(y):
    """Band-limit and add a little grit so it sounds like a crew radio, not a studio."""
    n = len(y)
    spec = np.fft.rfft(y)
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= ((f > 320) & (f < 3600)).astype(np.float32)
    y = np.fft.irfft(spec, n).astype(np.float32)
    y = np.tanh(2.4 * y) * 0.8
    return y


def trim(y, thr=0.015):
    idx = np.where(np.abs(y) > thr)[0]
    return y[max(0, idx[0] - 240): idx[-1] + 480] if len(idx) else y


def main():
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    g2p = en.G2P(trf=False, british=False, fallback=None)
    model = KModel(repo_id=REPO).eval()
    for i, (text, voice, speed) in enumerate(TAKES):
        ps, _ = g2p(text)
        pack = torch.load(hf_hub_download(REPO, f"voices/{voice}.pt"), weights_only=True)
        with torch.no_grad():
            audio = model(ps, pack[len(ps) - 1], speed)
        y = trim(audio.numpy().astype(np.float32))
        y = radio(y)
        y *= 0.9 / max(1e-6, np.abs(y).max())
        wav = out / f"gogogo_{i}.wav"
        sf.write(wav, y, SR, subtype="PCM_16")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "4", str(out / f"gogogo_{i}.ogg")], check=True)
        wav.unlink()
        print(f"gogogo_{i}: {text!r} {voice} x{speed} -> {len(y) / SR:.2f}s", flush=True)


if __name__ == "__main__":
    main()
