# Food Microstructure — 3D Atlas

A curated collection of high-resolution 3D reconstructions of food
microstructure captured with micro-CT and microscopy.

The site renders each sample as an interactive volume directly in the browser:
the raw voxel data is fetched, decompressed client-side, and uploaded to the GPU
as a `THREE.Data3DTexture`, so visitors can rotate, slice, and recolor the
volumes without any server-side rendering. Each sample exposes multiple
variants (original, segmented, skeleton) that can be explored in a full-screen
viewer.

## Tech stack

- [Astro](https://astro.build) — static site framework and build tooling
- [React](https://react.dev) — interactive components (gallery, viewers)
- [Tailwind CSS](https://tailwindcss.com) — styling
- [three.js](https://threejs.org) — WebGL volume rendering
- [fzstd](https://github.com/101arrowz/fzstd) — client-side zstd decompression

## Prerequisites

- [Node.js](https://nodejs.org) >= 22.12.0
- [pnpm](https://pnpm.io) (the project pins `pnpm@11.17.0` via `packageManager`)
- [Conda](https://docs.conda.io) / [Miniconda](https://docs.conda.io/en/latest/miniconda.html)
  — only needed for image preprocessing

## Preprocessing the images

The source volumes are multi-page 8-bit TIFF z-stacks. Preprocessing turns them
into zstd-compressed raw binary volumes that the browser can fetch and upload
straight to the GPU, and records each volume's dimensions in a manifest.

### 1. Set up the conda environment

The preprocessing scripts depend on `numpy`, `tifffile`, and `imagecodecs`,
declared in `preprocessing/environment.yml`:

```sh
conda env create -f preprocessing/environment.yml
conda activate 3D_showcase
```

### 2. Add the raw volumes

Place each image in its own folder under `data/raw/`, named after its original
(CLAHE) volume. The scripts discover folders automatically:

```text
data/raw/<image>/
    <image>-clahe.tif        # original volume (required)
    <image>-segmented.tif    # optional variant
    <image>-skeleton.tif     # optional variant
```

> Note: `*.tif` files are git-ignored, so raw and intermediate volumes are not
> committed. Only the generated `public/volumes/*.raw.zst` files are tracked.

### 3. Run the pipeline

With the conda environment active, run the three steps (or the combined
`pnpm preprocess` script):

```sh
pnpm preprocess
```

This is equivalent to:

```sh
python3 preprocessing/compress_clahe.py    # downsample + losslessly compress the original
python3 preprocessing/compress_variants.py # losslessly compress segmented/skeleton variants
python3 preprocessing/convert-volumes.py   # write public/volumes/*.raw.zst + manifest.json
```

- `compress_clahe.py` downsamples the original volume by 2× on every axis
  (area-averaged) and writes a zstd-compressed TIFF to `data/compressed/`.
  Downsampling is required to keep the volume within the browser's ~100 MB
  budget.
- `compress_variants.py` losslessly compresses every non-CLAHE volume at full
  resolution into `data/compressed/`.
- `convert-volumes.py` converts the compressed TIFFs into slice-major
  `*.raw.zst` files under `public/volumes/` and writes `manifest.json`, which
  maps each volume URL to its `{width, height, depth}`.

Each script verifies its output (round-trip check) and exits non-zero on
failure.

### 4. Register the sample

Add an entry to `src/data/samples.ts` pointing at the generated volume URLs
(e.g. `/volumes/<image>-clahe.raw.zst`). Dimensions are read from the manifest
at runtime, so they do not need to be hardcoded.

## Building the website

Install dependencies and build the production site to `./dist/`:

```sh
pnpm install
pnpm build
```

Preview the production build locally:

```sh
pnpm preview
```

### Development server

Start the dev server (background mode is recommended, per `AGENTS.md`):

```sh
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`. The
dev server runs at `http://localhost:4321`.

## Deployment

The site is deployed to **GitHub Pages** via GitHub Actions. The workflow at
`.github/workflows/deploy.yml` runs on every push to `main` (and can be
triggered manually from the Actions tab):

1. **build** — checks out the repo and runs `withastro/action`, which installs
   dependencies, builds the site, and uploads the artifact.
2. **deploy** — publishes the artifact to GitHub Pages using
   `actions/deploy-pages`.

The deployment target is configured in `astro.config.mjs`:

```js
site: "https://ria-cat.github.io",
base: "/3D-food-microstructure",
```

Because the site is served from a sub-path, public asset URLs are prefixed with
the configured `base` at runtime (see `src/lib/volumes.ts`).

To deploy, simply commit and push to `main`:

```sh
git push origin main
```

Make sure the generated `public/volumes/*.raw.zst` files and `manifest.json`
are committed, since the build does not run the Python preprocessing pipeline.
