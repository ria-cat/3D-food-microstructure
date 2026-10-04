#!/usr/bin/env python3
"""Downsample and compress the original (CLAHE) volume for every image.

Expected input layout — each image lives in its own folder under `data/raw`:

    data/raw/<image>/
        <image>-clahe.tif        # original volume (required)
        <image>-segmented.tif    # optional variant
        <image>-skeleton.tif     # optional variant

The image folder is named after its original volume (`<image>-clahe`). This
script discovers every image folder automatically and compresses only the
original (CLAHE) volume, writing the result to `data/compressed/<image>/` to
mirror the input layout. Use `compress_variants.py` for the variants.

Run from anywhere; all paths are resolved relative to this script.
"""

import os
from pathlib import Path

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
COMPRESSED_DIR = ROOT / "data" / "compressed"

TIF_SUFFIXES = {".tif", ".tiff"}
CLAHE_SUFFIX = "-clahe"

# Downsample factor applied to every axis (2 => half resolution, 8x fewer voxels).
# Lossless compression alone can't reach 100 MB: the data has ~7.5 bits/voxel of
# entropy, so zstd bottoms out around ~470 MB. Downsampling is the only way to
# hit the target while keeping the volume renderable as a uniform grid.
DOWNSAMPLE = 2


def downsample(volume, factor):
    """Area-average downsample (anti-aliased) by `factor` along every axis."""
    z, y, x = volume.shape
    z2, y2, x2 = z // factor, y // factor, x // factor
    volume = volume[: z2 * factor, : y2 * factor, : x2 * factor]
    volume = volume.reshape(z2, factor, y2, factor, x2, factor)
    return volume.mean(axis=(1, 3, 5)).astype(np.uint8)


def find_clahe(folder):
    """Return the original (CLAHE) volume in `folder`, if present.

    The original is identified by its stem matching the folder name (each image
    folder is named after its CLAHE volume) or, failing that, a `-clahe` suffix.
    """
    tifs = [
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in TIF_SUFFIXES
    ]
    for path in tifs:
        if path.stem == folder.name:
            return path
    for path in tifs:
        if path.stem.lower().endswith(CLAHE_SUFFIX):
            return path
    return None


def main() -> None:
    folders = sorted(path for path in RAW_DIR.iterdir() if path.is_dir())
    if not folders:
        raise SystemExit(f"No image folders found in {RAW_DIR}")

    failed = False
    for folder in folders:
        source = find_clahe(folder)
        if source is None:
            failed = True
            print(f"\u2717 {folder.name}: no original ({CLAHE_SUFFIX}) volume found")
            continue

        target_dir = COMPRESSED_DIR / folder.name
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name

        volume = tifffile.imread(source)
        expected = downsample(volume, DOWNSAMPLE) if DOWNSAMPLE > 1 else volume

        tifffile.imwrite(
            target,
            expected,
            compression="zstd",
            compressionargs={"level": 19},
            predictor=True,
        )

        # The output is lossy, so verify it against a fresh downsample of the
        # source rather than the source itself.
        compressed = tifffile.imread(target)
        matches = np.array_equal(expected, compressed)
        print(
            f"{'\u2713' if matches else '\u2717'} {source.name}: "
            f"{expected.shape} \u2192 {target.relative_to(ROOT)} "
            f"({os.path.getsize(target) / 1024**2:.1f} MiB)"
        )
        failed = failed or not matches

    if failed:
        raise SystemExit(1)
    print("Done.")


if __name__ == "__main__":
    main()
