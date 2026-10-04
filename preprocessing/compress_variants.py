#!/usr/bin/env python3
"""Losslessly compress the variant volumes for every image.

Expected input layout — each image lives in its own folder under `data/raw`:

    data/raw/<image>/
        <image>-clahe.tif        # original volume (handled by compress_clahe.py)
        <image>-segmented.tif    # optional variant
        <image>-skeleton.tif     # optional variant

This script discovers every image folder automatically and losslessly compresses
every volume that is not the original (CLAHE) volume — the segmented/skeleton
variants, plus any other non-CLAHE `.tif` present. Each output is written to
`data/compressed/<image>/` to mirror the input layout. Variants are not
downsampled, so they stay at full resolution.

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
    processed = 0
    for folder in folders:
        tifs = [
            path
            for path in folder.iterdir()
            if path.is_file() and path.suffix.lower() in TIF_SUFFIXES
        ]
        clahe = find_clahe(folder)
        variants = [path for path in tifs if path != clahe]

        if not variants:
            print(f"\u00b7 {folder.name}: no variants to compress")
            continue

        target_dir = COMPRESSED_DIR / folder.name
        target_dir.mkdir(parents=True, exist_ok=True)

        for source in variants:
            target = target_dir / source.name
            try:
                volume = tifffile.imread(source)
                tifffile.imwrite(
                    target,
                    volume,
                    compression="zstd",
                    compressionargs={"level": 19},
                    predictor=True,
                )

                compressed = tifffile.imread(target)
                matches = np.array_equal(volume, compressed)
                print(
                    f"{'\u2713' if matches else '\u2717'} {source.name}: "
                    f"{volume.shape} \u2192 {target.relative_to(ROOT)} "
                    f"({os.path.getsize(target) / 1024**2:.1f} MiB)"
                )
                failed = failed or not matches
                processed += 1
            except Exception as error:  # noqa: BLE001 - report and continue
                failed = True
                print(f"\u2717 {source.name}: {error}")

    if failed:
        raise SystemExit(1)
    if processed == 0:
        print("No variants found.")
    print("Done.")


if __name__ == "__main__":
    main()
