#!/usr/bin/env python3
"""Generate per-biome music candidates with ACE-Step through a running ComfyUI server.

Standard library only. Usage:
  python3 tools/audio/gen_music.py [--host http://localhost:8188] [--seeds 2] [--seconds 64] [biome ...]
Writes tools/audio/out/<biome>_<seed>.mp3 (gitignored).
"""
import argparse, json, pathlib, sys, time, urllib.parse, urllib.request

OUT = pathlib.Path(__file__).parent / "out"

# Fixed tempo + key per biome so the stems can be trimmed to whole bars and layered consistently.
BIOMES = {
    "moon": ("instrumental, ambient, space, spacey analog synth pads, slow arpeggio, deep sub bass, soft pulse drums, "
             "cosmic, atmospheric, cinematic, 90 bpm, D minor", 90),
    "city": ("instrumental, synthwave, night drive, retro synths, punchy drums, driving bassline, neon, "
             "lo-fi warmth, 110 bpm, A minor", 110),
    "desert": ("instrumental, desert rock, dusty twangy electric guitar, hand percussion, tambourine, driving bass, "
               "warm, western, sunbaked, 100 bpm, E minor", 100),
    "snow": ("instrumental, glassy bells, shimmering pads, icy synths, light pulsing bass, crisp electronic drums, "
             "cold, crystalline, airy, 96 bpm, F# minor", 96),
    "title": ("instrumental, soft chill electronic, warm lo-fi drum loop, mellow rhodes piano chords, round bass, "
              "gentle plucked arpeggio, lush airy pads, uplifting, full and polished, racing game menu, 98 bpm, A minor", 98),
    "grass": ("instrumental, upbeat folk pop, acoustic guitar strumming, bright piano, warm bass, claps, "
              "feel-good, sunny, countryside, 105 bpm, G major", 105),
}


def api(host, path, data=None):
    req = urllib.request.Request(host + path, data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def workflow(tags, seconds, seed, prefix):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "ace_step_v1_3.5b.safetensors"}},
        "2": {"class_type": "TextEncodeAceStepAudio",
              "inputs": {"clip": ["1", 1], "tags": tags, "lyrics": "[instrumental]", "lyrics_strength": 1.0}},
        "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 5.0}},
        "5": {"class_type": "EmptyAceStepLatentAudio", "inputs": {"seconds": seconds, "batch_size": 1}},
        "6": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "seed": seed, "steps": 50, "cfg": 5.0, "sampler_name": "euler",
                         "scheduler": "simple", "positive": ["2", 0], "negative": ["3", 0],
                         "latent_image": ["5", 0], "denoise": 1.0}},
        "7": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveAudioMP3", "inputs": {"audio": ["7", 0], "filename_prefix": prefix, "quality": "V0"}},
    }


def wait(host, pid, timeout=900):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = api(host, f"/history/{pid}")
        if pid in h:
            return h[pid]
        time.sleep(3)
    sys.exit(f"timeout waiting for {pid}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="http://localhost:8188")
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--seconds", type=float, default=64)
    ap.add_argument("biomes", nargs="*", default=list(BIOMES))
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    for b in a.biomes:
        tags, _bpm = BIOMES[b]
        for s in range(a.seeds):
            seed = 1000 + s * 7919
            res = api(a.host, "/prompt", {"prompt": workflow(tags, a.seconds, seed, f"apex/{b}_{seed}")})
            hist = wait(a.host, res["prompt_id"])
            if hist["status"]["status_str"] != "success":
                sys.exit(json.dumps(hist["status"])[:800])
            for o in hist["outputs"].values():
                for f in o.get("audio", []):
                    q = urllib.parse.urlencode({"filename": f["filename"], "subfolder": f["subfolder"], "type": f["type"]})
                    dest = OUT / f"{b}_{seed}.mp3"
                    dest.write_bytes(urllib.request.urlopen(f"{a.host}/view?{q}", timeout=60).read())
                    print("wrote", dest, flush=True)


if __name__ == "__main__":
    main()
