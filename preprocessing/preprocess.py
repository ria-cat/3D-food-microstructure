#!/usr/bin/env python3
"""Preprocess the raw TIFF volumes into browser-ready zstd-compressed raw volumes.

Expected input layout — each image lives in its own folder under `data/raw`:

    data/raw/<image>/
        <image>-clahe.tif        # original (analog) volume
        <image>-segmented.tif    # optional binary variant
        <image>-skeleton.tif     # optional binary variant

Every `.tif`/`.tiff` found is read directly from `data/raw/` and written as a
slice-major `*.raw.zst` file under `public/volumes/`, which the browser fetches,
decompresses with `fzstd`, and uploads straight to the GPU. There is no
intermediate compressed-TIFF step: the zstd compression applied here is exactly
what the browser consumes.

Analog volumes (anything that is not a binary mask, e.g. the CLAHE original) are
downsampled by 2x on every axis (area-averaged) to stay within the browser's
~100 MB budget. Binary volumes (segmented/skeleton) are kept at full resolution.

To keep the (CPU-bound) zstd compression fast, each volume is split into one
chunk per worker thread and the chunks are compressed in parallel with joblib.
`imagecodecs.zstd_encode` does not expose zstd's own multithreading, but zstd
releases the GIL, so threads give real parallelism. Each chunk becomes its own
zstd frame; `fzstd` concatenates frames on decode, so the browser sees the same
byte stream as a single-frame file.

Because a `.raw.zst` file carries no header, each volume's `{width, height,
depth}` is recorded in `public/volumes/manifest.json`, which the viewer reads
instead of hardcoding dimensions in `src/data/samples.ts`.

Progress is reported through the `logging` module (INFO level).

Requires `numpy`, `tifffile`, `imagecodecs`, and `joblib`.

Run from anywhere; all paths are resolved relative to this script.
"""

import json
import logging
import os
import time
from pathlib import Path

import imagecodecs
import numpy as np
import tifffile
from joblib import Parallel, delayed

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUTPUT_DIR = ROOT / "public" / "volumes"
MANIFEST = OUTPUT_DIR / "manifest.json"

TIF_SUFFIXES = {".tif", ".tiff"}

MB = 1024 * 1024

# zstd's maximum compression level.
ZSTD_LEVEL = 22

# Downsample factor applied to analog volumes on every axis (2 => half
# resolution, 8x fewer voxels). Lossless compression alone can't bring the
# analog volume within the browser's ~100 MB budget: the data has ~7.5
# bits/voxel of entropy, so zstd bottoms out around ~470 MB. Downsampling is the
# only way to hit the target while keeping the volume renderable as a uniform
# grid.
DOWNSAMPLE = 2

# Worker threads. zstd releases the GIL, so threads parallelize without the
# memory cost of processes.
N_JOBS = os.cpu_count() or 1

# Smallest chunk handed to a worker. A volume is split into one chunk per worker
# (capped by this floor) so a single large volume can use every core, while
# small volumes aren't fragmented into many tiny frames.
MIN_CHUNK_BYTES = 8 * MB

logger = logging.getLogger("preprocess")


def downsample(volume, factor):
    """Area-average downsample (anti-aliased) by `factor` along every axis."""
    z, y, x = volume.shape
    z2, y2, x2 = z // factor, y // factor, x // factor
    volume = volume[: z2 * factor, : y2 * factor, : x2 * factor]
    volume = volume.reshape(z2, factor, y2, factor, x2, factor)
    # Sum in uint32 (max factor**3 * 255) instead of letting `mean` allocate a
    # float64 temporary over the whole volume.
    summed = volume.sum(axis=(1, 3, 5), dtype=np.uint32)
    return (summed // factor**3).astype(np.uint8)


def is_binary(volume):
    """True when the volume holds at most two distinct values (a binary mask)."""
    counts = np.bincount(volume.reshape(-1), minlength=256)
    return np.count_nonzero(counts) <= 2


def source_volumes():
    """All .tif/.tiff files under data/raw, sorted for stable output.

    Only files inside per-image subfolders are considered, matching the
    `data/raw/<image>/` layout.
    """
    volumes = []
    for folder in sorted(path for path in RAW_DIR.iterdir() if path.is_dir()):
        volumes.extend(
            path
            for path in sorted(folder.rglob("*"))
            if path.is_file() and path.suffix.lower() in TIF_SUFFIXES
        )
    return volumes


def split_chunks(data, n_chunks):
    """Split a contiguous array into up to `n_chunks` contiguous 1-D views."""
    flat = data.reshape(-1)
    n_chunks = max(1, min(n_chunks, flat.size))
    size = flat.size
    bounds = [i * size // n_chunks for i in range(n_chunks + 1)]
    return [flat[bounds[i] : bounds[i + 1]] for i in range(n_chunks)]


def compress_chunk(chunk):
    """zstd-compress one chunk and verify it round-trips losslessly.

    Returns the compressed frame and how long the worker spent on it.
    """
    start = time.perf_counter()
    frame = imagecodecs.zstd_encode(chunk, level=ZSTD_LEVEL)
    # Compare against the chunk's buffer directly (no tobytes copy).
    if imagecodecs.zstd_decode(frame) != chunk.data:
        raise ValueError("round-trip mismatch")
    return frame, time.perf_counter() - start


def process(source):
    """Read, conditionally downsample, and compress one volume.

    Returns the manifest entry for the written volume.
    """
    target = OUTPUT_DIR / f"{source.stem}.raw.zst"
    started = time.perf_counter()

    logger.info("Reading %s", source.relative_to(ROOT))
    volume = np.ascontiguousarray(tifffile.imread(source), dtype=np.uint8)
    logger.info("  shape=%s dtype=%s", volume.shape, volume.dtype)

    binary = is_binary(volume)
    if binary:
        logger.info("  binary volume — keeping full resolution")
    else:
        logger.info("  analog volume — downsampling %dx per axis", DOWNSAMPLE)
        volume = downsample(volume, DOWNSAMPLE)
    data = np.ascontiguousarray(volume, dtype=np.uint8)

    n_chunks = min(N_JOBS, max(1, data.size // MIN_CHUNK_BYTES))
    chunks = split_chunks(data, n_chunks)
    logger.info(
        "  compressing %.1f MB in %d chunk(s) across %d thread(s)",
        data.size / MB,
        len(chunks),
        N_JOBS,
    )

    frames = []
    results = Parallel(n_jobs=N_JOBS, prefer="threads", return_as="generator")(
        delayed(compress_chunk)(chunk) for chunk in chunks
    )
    for index, (chunk, (frame, elapsed)) in enumerate(zip(chunks, results), start=1):
        frames.append(frame)
        logger.info(
            "  chunk %d/%d: %.1f MB -> %.1f MB (%.1fx) in %.1fs",
            index,
            len(chunks),
            chunk.size / MB,
            len(frame) / MB,
            chunk.size / len(frame),
            elapsed,
        )

    target.write_bytes(b"".join(frames))

    depth, height, width = data.shape
    logger.info(
        "Wrote %s: %dx%dx%d, %.1f MB in %.1fs",
        target.relative_to(ROOT),
        width,
        height,
        depth,
        target.stat().st_size / MB,
        time.perf_counter() - started,
    )
    return f"/volumes/{target.name}", {
        "width": int(width),
        "height": int(height),
        "depth": int(depth),
    }


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = source_volumes()
    if not files:
        raise SystemExit(f"No .tif files found under {RAW_DIR}")
    logger.info("Found %d volume(s) under %s", len(files), RAW_DIR.relative_to(ROOT))

    failed = False
    dimensions: dict[str, dict[str, int]] = {}
    for source in files:
        try:
            url, dims = process(source)
            dimensions[url] = dims
        except Exception as error:  # noqa: BLE001 - report and continue
            failed = True
            logger.error("%s: %s", source.name, error)

    MANIFEST.write_text(
        json.dumps(dimensions, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    logger.info("Wrote %s (%d volume(s))", MANIFEST.relative_to(ROOT), len(dimensions))

    if failed:
        raise SystemExit(1)
    logger.info("Done.")


if __name__ == "__main__":
    main()
