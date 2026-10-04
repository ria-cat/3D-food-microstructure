#!/usr/bin/env python3
"""Convert compressed multi-page 8-bit TIFF volumes (z-stacks) into zstd-compressed
raw binary volume files that the browser can fetch, decompress, and upload
straight to the GPU.

Usage:
    python3 convert-volumes.py

Reads every *.tif inside the per-image folders under `data/compressed/`
(mirroring the `data/raw/<image>/` layout) and writes a matching `*.raw.zst` file
to `public/volumes/`. The raw layout is slice-major (z outer, then y, then x),
which matches THREE.Data3DTexture's expected memory order. The raw bytes are
zstd-compressed so the full-resolution variants stay under the ~100 MB browser
budget; the viewer decompresses them with `fzstd` before uploading to the GPU.

Because a `.raw.zst` file carries no header, the voxel dimensions are recorded in
`public/volumes/manifest.json`, mapping each volume's public URL to its
`{width, height, depth}`. The viewer reads this manifest instead of hardcoding
dimensions in `src/data/samples.ts`.

Requires `numpy`, `tifffile`, and `imagecodecs` (already used by the other
scripts in this repo).

Run from anywhere; all paths are resolved relative to this script.
"""

import json
from pathlib import Path

import imagecodecs
import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "data" / "compressed"
OUTPUT_DIR = ROOT / "public" / "volumes"
MANIFEST = OUTPUT_DIR / "manifest.json"

# zstd compression level for the raw volumes. Level 3 keeps the preprocessing
# fast while still shrinking the ~600 MB full-resolution variants to well under
# 100 MB (the viewer decompresses them client-side with `fzstd`).
ZSTD_LEVEL = 3


def source_volumes():
    """All .tif/.tiff files under data/compressed, sorted for stable output.

    Only files inside subfolders are considered, matching the per-image folder
    layout mirrored from data/raw.
    """
    volumes = []
    for folder in sorted(path for path in SOURCE_DIR.iterdir() if path.is_dir()):
        volumes.extend(
            path
            for path in folder.rglob("*")
            if path.is_file() and path.suffix.lower() in {".tif", ".tiff"}
        )
    return sorted(volumes)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = source_volumes()

    if not files:
        raise SystemExit(f"No .tif files found under {SOURCE_DIR}")

    failed = False
    dimensions: dict[str, dict[str, int]] = {}
    for source in files:
        target = OUTPUT_DIR / f"{source.stem}.raw.zst"
        try:
            volume = tifffile.imread(source)
            data = np.ascontiguousarray(volume, dtype=np.uint8)
            compressed = imagecodecs.zstd_encode(data.tobytes(), level=ZSTD_LEVEL)
            target.write_bytes(compressed)

            # Round-trip check: the browser decompresses with fzstd, so verify
            # the bytes decode back to exactly the expected voxel count.
            decoded = imagecodecs.zstd_decode(compressed)
            if len(decoded) != data.size:
                raise ValueError(
                    f"decode mismatch: got {len(decoded)} bytes, expected {data.size}"
                )

            depth, height, width = data.shape
            dimensions[f"/volumes/{target.name}"] = {
                "width": int(width),
                "height": int(height),
                "depth": int(depth),
            }
            mb = len(compressed) / (1024 * 1024)
            print(
                f"\u2713 {source.stem}: {width}\u00d7{height}\u00d7{depth} "
                f"\u2192 {target.relative_to(ROOT)} ({mb:.1f} MB)"
            )
        except Exception as error:  # noqa: BLE001 - report and continue
            failed = True
            print(f"\u2717 {source.name}: {error}")

    MANIFEST.write_text(
        json.dumps(dimensions, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"\u2713 manifest: {MANIFEST.relative_to(ROOT)} ({len(dimensions)} volumes)")

    if failed:
        raise SystemExit(1)
    print("Done.")


if __name__ == "__main__":
    main()
