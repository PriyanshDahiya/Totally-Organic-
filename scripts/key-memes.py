"""Keys the green out of the meme clips and writes transparent WebMs.

For each clip: sample frames to find the subject's bounding box, then decode
the cropped clip, key it frame by frame (with despill), and encode VP9 with
alpha plus the original audio. Also writes a PNG poster and a catalog JSON.
The ffmpeg bundled with Remotion has no chroma-key filter, so keying is
done here in numpy and ffmpeg only decodes and encodes.

Run: python scripts/key-memes.py <memes folder> <out folder>
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

FF = os.path.join("node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
FPS = 30
MAX_W = 720  # plenty for a cut-out that covers at most ~60% of a 1080 frame
# Reels only need the payoff; the composition loops anything shorter.
MAX_SECONDS = 8


def probe_size(path):
    out = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    import re
    m = re.search(r"Video:.*?(\d{3,5})x(\d{3,5})", out)
    return int(m.group(1)), int(m.group(2))


def alpha_of(rgb):
    """1 = keep, 0 = green. Greenness = how much G exceeds max(R, B)."""
    rgb = rgb.astype(np.int16)
    g = rgb[..., 1]
    rb = np.maximum(rgb[..., 0], rgb[..., 2])
    d = g - rb
    return 1.0 - np.clip((d - 35) / 55.0, 0.0, 1.0)


def despill(rgb):
    rgb = rgb.astype(np.int16)
    rb = np.maximum(rgb[..., 0], rgb[..., 2])
    rgb[..., 1] = np.minimum(rgb[..., 1], rb + 12)
    return rgb.clip(0, 255).astype(np.uint8)


def frames(path, vf=None, count=None, ss=None, limit=None):
    """Decoded RGB frames via a temporary PNG sequence (the bundled ffmpeg
    can't pipe raw video)."""
    import glob
    import shutil
    import tempfile
    tmp = tempfile.mkdtemp(prefix="meme-")
    try:
        args = [FF, "-loglevel", "error"]
        if ss is not None:
            args += ["-ss", str(ss)]
        args += ["-i", path]
        if vf:
            args += ["-vf", vf]
        if count:
            args += ["-frames:v", str(count)]
        if limit:
            args += ["-t", str(limit)]
        args += ["-r", str(FPS), os.path.join(tmp, "f%05d.png")]
        subprocess.run(args, check=True)
        for f in sorted(glob.glob(os.path.join(tmp, "*.png"))):
            yield np.asarray(Image.open(f).convert("RGB"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def bbox(path, w, h, duration):
    mask = np.zeros((h, w), bool)
    for t in np.linspace(0.05, max(duration - 0.1, 0.1), 8):
        for f in frames(path, count=1, ss=round(float(t), 2)):
            mask |= alpha_of(f) > 0.6
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return 0, 0, w, h
    pad = 12
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, w)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, h)
    # Even sizes for the encoder.
    return x0, y0, (x1 - x0) // 2 * 2, (y1 - y0) // 2 * 2


def process(src, dst_dir, meme):
    base = os.path.splitext(meme["file"])[0]
    w, h = probe_size(src)
    dur = min(float(meme["duration_s"]), MAX_SECONDS)
    keyed = bool(meme.get("green_screen", True))
    x, y, cw, ch = bbox(src, w, h, dur) if keyed else (0, 0, w // 2 * 2, h // 2 * 2)
    scale = min(1.0, MAX_W / cw)
    ow, oh = int(cw * scale) // 2 * 2, int(ch * scale) // 2 * 2
    vf = f"crop={cw}:{ch}:{x}:{y},scale={ow}:{oh}"

    out = os.path.join(dst_dir, base + (".webm" if keyed else ".mp4"))
    import shutil
    import tempfile
    tmp = tempfile.mkdtemp(prefix="keyed-")
    poster = None
    n = 0
    for f in frames(src, vf=vf, limit=MAX_SECONDS):
        img = np.dstack([despill(f), (alpha_of(f) * 255).astype(np.uint8)]) if keyed else f
        Image.fromarray(img).save(os.path.join(tmp, f"k{n:05d}.png"), compress_level=1)
        if n == int(FPS * min(1.0, dur / 2)):
            poster = img
        n += 1
    enc = [FF, "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", os.path.join(tmp, "k%05d.png"),
           "-i", src, "-map", "0:v", "-map", "1:a?", "-shortest", "-t", str(MAX_SECONDS)]
    enc += (["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "34",
             "-c:a", "libopus", "-b:a", "96k"] if keyed else
            ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"])
    subprocess.run(enc + [out], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    if poster is not None:
        Image.fromarray(poster).save(os.path.join(dst_dir, base + ".png"))
    return {
        "id": meme["id"],
        "slug": base,
        "name": meme["name"],
        "quote": meme.get("audio"),
        "mood": meme["mood"],
        "useWhen": meme["use_when"],
        "tags": meme.get("tags", []),
        "transparent": keyed,
        "file": os.path.basename(out),
        "poster": base + ".png",
        "width": ow,
        "height": oh,
        "durationSeconds": round(n / FPS, 2),
    }


def main():
    src_dir, dst_dir = sys.argv[1], sys.argv[2]
    os.makedirs(dst_dir, exist_ok=True)
    memes = json.load(open(os.path.join(src_dir, "memes.json"), encoding="utf8"))["memes"]
    only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
    catalog = []
    for m in memes:
        if only and str(m["id"]) not in only:
            continue
        try:
            catalog.append(process(os.path.join(src_dir, m["file"]), dst_dir, m))
            print("ok", m["file"], flush=True)
        except Exception as e:  # keep going; report at the end
            print("FAILED", m["file"], e, flush=True)
    json.dump(catalog, open(os.path.join(dst_dir, "catalog.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
