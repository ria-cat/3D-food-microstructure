#!/usr/bin/env python3
"""Preprocess the raw TIFF volumes into browser-ready zstd-compressed raw volumes.

Expected input layout — each sample lives in its own folder under `data/`:

    data/<sample>/
        sample.yml       # required: title + description for the sample
        raw.tif          # required: original (analog) volume
        segmented.tif    # optional binary variant
        skeleton.tif     # optional binary variant

Every folder under `data/` must contain a `sample.yml` with a non-empty `title`
and `description`, and a `raw.tif` volume; the script fails if either is missing
or incomplete. The variant type is the source file's stem (e.g. `raw.tif` ->
`raw`), which the viewer maps to a global render configuration.

Every `.tif`/`.tiff` found is read directly from `data/` and written as a
slice-major `*.zst` file under `public/volumes/<sample>/`, mirroring the
input folder name, which the browser fetches, decompresses with `fzstd`, and
uploads straight to the GPU. There is no intermediate compressed-TIFF step: the
zstd compression applied here is exactly what the browser consumes.

Analog volumes (anything that is not a binary mask, e.g. the raw original) are
downsampled by 2x on every axis (area-averaged) to stay within the browser's
~100 MB budget. Binary volumes (segmented/skeleton) are kept at full resolution.

To keep the (CPU-bound) zstd compression fast, each volume is split into one
chunk per worker thread and the chunks are compressed in parallel with joblib.
`imagecodecs.zstd_encode` does not expose zstd's own multithreading, but zstd
releases the GIL, so threads give real parallelism. Each chunk becomes its own
zstd frame; `fzstd` concatenates frames on decode, so the browser sees the same
byte stream as a single-frame file.

Because a `.zst` file carries no header, each volume's dimensions are
recorded in `public/volumes/manifest.json`, which the viewer reads instead of
hardcoding dimensions in the frontend. The manifest groups volumes by sample and
carries each sample's title and description:

    {
      "samples": [
        {
          "id": "wpi-0.05gg",
          "title": "WPI 0.05% GG",
          "description": "Acid-induced composite gel ...",
          "variants": [
            {"type": "raw", "url": "/volumes/wpi-0.05gg/raw.zst",
             "width": 486, "height": 486, "depth": 337}
          ]
        }
      ]
    }

Progress is reported through the `logging` module (INFO level).

By default every volume is re-processed; pass `--skip-existing` to skip volumes
whose `.zst` output already exists, reusing their existing manifest entry.
The `pnpm preprocess` command enables this by default.

Requires `numpy`, `tifffile`, `imagecodecs`, `joblib`, and `pyyaml`.

Run from anywhere; all paths are resolved relative to this script.
"""

import argparse
import json
import logging
import os
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import imagecodecs
import numpy as np
import tifffile
import yaml
from joblib import Parallel, delayed

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "public" / "volumes"
MANIFEST = OUTPUT_DIR / "manifest.json"

TIF_SUFFIXES = {".tif", ".tiff"}

# Required per-sample metadata file, holding the sample's `title` and
# `description`.
SAMPLE_META = "sample.yml"

# The variant every sample must provide. It is the default volume shown when a
# sample is opened.
RAW_VARIANT = "raw"

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

# ANSI colors for the level name, keyed by logging level.
LEVEL_COLORS = {
    logging.DEBUG: "\033[36m",  # cyan
    logging.INFO: "\033[32m",  # green
    logging.WARNING: "\033[33m",  # yellow
    logging.ERROR: "\033[31m",  # red
    logging.CRITICAL: "\033[1;31m",  # bold red
}
RESET = "\033[0m"

LOG_FORMAT = "%(asctime)s %(levelname)s %(message)s"
LOG_DATEFMT = "%H:%M:%S"


class ColorFormatter(logging.Formatter):
    """Formatter that colorizes the level name with ANSI escape codes."""

    def format(self, record):
        color = LEVEL_COLORS.get(record.levelno)
        if color is not None:
            # Copy the record so the shared instance isn't mutated.
            record = logging.makeLogRecord(record.__dict__)
            record.levelname = f"{color}{record.levelname}{RESET}"
        return super().format(record)


def setup_logging() -> None:
    """Configure INFO logging, colorizing the level name on a TTY.

    Colors are disabled when stderr isn't a terminal (pipes, files, CI) or when
    the `NO_COLOR` environment variable is set, so redirected output stays
    clean.
    """
    handler = logging.StreamHandler()
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT)
    if sys.stderr.isatty() and "NO_COLOR" not in os.environ:
        formatter = ColorFormatter(LOG_FORMAT, datefmt=LOG_DATEFMT)
    handler.setFormatter(formatter)
    logging.basicConfig(level=logging.INFO, handlers=[handler])


class SampleError(Exception):
    """A sample's required files are missing, unreadable, or invalid."""


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


def sample_folders():
    """All per-sample folders under data/, sorted for stable output."""
    return sorted(path for path in RAW_DIR.iterdir() if path.is_dir())


def folder_volumes(folder):
    """All .tif/.tiff files in a sample folder.

    Raises SampleError when the required `raw` volume is missing, since every
    sample must provide one.
    """
    volumes = [
        path
        for path in folder.rglob("*")
        if path.is_file() and path.suffix.lower() in TIF_SUFFIXES
    ]
    if not any(path.stem.lower() == RAW_VARIANT for path in volumes):
        raise SampleError(
            f"Missing {RAW_VARIANT}.tif in {folder.relative_to(ROOT)} "
            f"(every sample must provide a '{RAW_VARIANT}' volume)"
        )
    return volumes


def load_sample_meta(folder):
    """Read the required `title` and `description` from a sample folder.

    Every folder under data/ must contain a `sample.yml` providing a non-empty
    `title` and `description`. Raises SampleError (naming the offending file)
    when it is missing, unreadable, malformed, or incomplete.
    """
    meta_path = folder / SAMPLE_META
    if not meta_path.is_file():
        raise SampleError(
            f"Missing {SAMPLE_META} in {folder.relative_to(ROOT)} "
            f"(expected a 'title' and 'description')"
        )

    try:
        data = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise SampleError(
            f"{meta_path.relative_to(ROOT)}: invalid YAML: {error}"
        ) from error

    if not isinstance(data, dict):
        raise SampleError(
            f"{meta_path.relative_to(ROOT)}: expected a mapping with "
            f"'title' and 'description'"
        )

    title = data.get("title")
    description = data.get("description")
    if not isinstance(title, str) or not title.strip():
        raise SampleError(f"{meta_path.relative_to(ROOT)}: missing non-empty 'title'")
    if not isinstance(description, str) or not description.strip():
        raise SampleError(
            f"{meta_path.relative_to(ROOT)}: missing non-empty 'description'"
        )
    return title.strip(), description.strip()


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


def target_for(source):
    """Output path for a source volume, mirroring its folder under data/."""
    relative = source.relative_to(RAW_DIR)
    return OUTPUT_DIR / relative.parent / f"{source.stem}.zst"


def volume_url(target):
    """Public URL the browser uses to fetch a written volume."""
    return f"/volumes/{target.relative_to(OUTPUT_DIR).as_posix()}"


def load_manifest_dimensions():
    """URL -> dimensions from an existing manifest, for --skip-existing.

    Understands both the current `{"samples": [...]}` layout and the legacy
    flat `{url: {width, height, depth}}` layout, so upgrading doesn't force a
    full re-run.
    """
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError) as error:
        logger.warning(
            "Ignoring unreadable manifest %s: %s",
            MANIFEST.relative_to(ROOT),
            error,
        )
        return {}

    dimensions = {}
    if isinstance(data, dict) and isinstance(data.get("samples"), list):
        for sample in data["samples"]:
            for variant in sample.get("variants", []):
                url = variant.get("url")
                if url:
                    dimensions[url] = {
                        "width": variant["width"],
                        "height": variant["height"],
                        "depth": variant["depth"],
                    }
    elif isinstance(data, dict):
        for url, dims in data.items():
            if isinstance(dims, dict) and {"width", "height", "depth"} <= dims.keys():
                dimensions[url] = {
                    "width": dims["width"],
                    "height": dims["height"],
                    "depth": dims["depth"],
                }
    return dimensions


def process(source):
    """Read, conditionally downsample, and compress one volume.

    The output mirrors the input's folder name, so `data/<sample>/<variant>.tif`
    becomes `public/volumes/<sample>/<variant>.zst`.

    Returns the volume's public URL and its `{width, height, depth}`.
    """
    target = target_for(source)
    target.parent.mkdir(parents=True, exist_ok=True)
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
    # joblib's Parallel.__call__ is unannotated, so the type checker can't tell
    # that return_as="generator" yields results rather than None.
    results = cast(
        "Iterator[tuple[bytes, float]]",
        Parallel(n_jobs=N_JOBS, prefer="threads", return_as="generator")(
            delayed(compress_chunk)(chunk) for chunk in chunks
        ),
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
    return volume_url(target), {
        "width": int(width),
        "height": int(height),
        "depth": int(depth),
    }


def parse_args(argv=None):
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Preprocess raw TIFF volumes into browser-ready .zst files.",
    )
    parser.add_argument(
        "--skip-existing",
        action=argparse.BooleanOptionalAction,
        default=False,
        help=(
            "Skip volumes whose .zst output already exists, reusing their "
            "manifest entry (default: %(default)s)."
        ),
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    setup_logging()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    folders = sample_folders()
    if not folders:
        logger.error("No sample folders found under %s", RAW_DIR)
        raise SystemExit(1)
    logger.info("Found %d sample(s) under %s", len(folders), RAW_DIR.relative_to(ROOT))

    existing = load_manifest_dimensions()
    failed = False
    samples = []
    for folder in folders:
        # Every sample must provide a `sample.yml` (title + description) and a
        # `raw.tif` volume; either being missing is a hard error.
        try:
            title, description = load_sample_meta(folder)
            volumes = folder_volumes(folder)
        except (OSError, SampleError) as error:
            logger.error("%s", error)
            raise SystemExit(1) from error

        logger.info("Sample %s: %d volume(s)", folder.name, len(volumes))
        variants = []
        for source in volumes:
            target = target_for(source)
            url = volume_url(target)
            if args.skip_existing and target.exists() and url in existing:
                dimensions = existing[url]
                logger.info(
                    "Skipping %s (already preprocessed)", target.relative_to(ROOT)
                )
            else:
                try:
                    url, dimensions = process(source)
                except Exception as error:  # noqa: BLE001 - report and continue
                    failed = True
                    logger.error("%s: %s", source.name, error)
                    continue
            variants.append(
                {
                    "type": source.stem,
                    "url": url,
                    "width": dimensions["width"],
                    "height": dimensions["height"],
                    "depth": dimensions["depth"],
                }
            )

        if not variants:
            logger.warning("No volumes processed for %s — skipping", folder.name)
            continue

        samples.append(
            {
                "id": folder.name,
                "title": title,
                "description": description,
                "variants": variants,
            }
        )

    MANIFEST.write_text(
        json.dumps({"samples": samples}, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("Wrote %s (%d sample(s))", MANIFEST.relative_to(ROOT), len(samples))

    if failed:
        raise SystemExit(1)
    logger.info("Done.")


if __name__ == "__main__":
    main()
