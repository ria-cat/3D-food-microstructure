import type { ColormapName } from "../lib/colormaps";

export interface VolumeRenderOptions {
  color?: string;
  colormap?: ColormapName;
  alpha?: number;
  gamma?: number;
  clim?: [number, number];
  magFilter?: "linear" | "nearest";
  lighting?: boolean;
}

export interface VolumeData {
  url: string;
  spacing: [number, number, number];
  render?: VolumeRenderOptions;
}

export interface VolumeVariant {
  id: string;
  label: string;
  volume: VolumeData;
}

export interface Sample {
  id: string;
  title: string;
  description: string;
  variants: VolumeVariant[];
}

// Physical voxel spacing shared by every volume (isotropic, 1 voxel = 1 unit).
export const DEFAULT_SPACING: [number, number, number] = [1, 1, 1];

interface VariantDefaults {
  label: string;
  render: VolumeRenderOptions;
}

// Global render defaults per variant type, keyed by the source file stem
// (e.g. `raw.tif` -> "raw"). Adding a sample only requires dropping its
// volumes and a `sample.yml` into `data/<id>/`; the render configuration is
// shared across every sample.
export const VARIANT_DEFAULTS: Record<string, VariantDefaults> = {
  raw: {
    label: "Raw",
    render: {
      colormap: "inferno",
      alpha: 0.5,
      clim: [0.15, 0.85],
      magFilter: "linear",
    },
  },
  segmented: {
    label: "Segmented",
    render: { color: "#2dd4bf" },
  },
  skeleton: {
    label: "Skeleton",
    render: { color: "#fbbf24", lighting: false },
  },
};

/** Defaults for a variant type, falling back to a plain label for unknowns. */
export function variantDefaults(type: string): VariantDefaults {
  return VARIANT_DEFAULTS[type] ?? { label: type, render: {} };
}

// The variant every sample is guaranteed to provide; it is shown first and is
// the default volume when a sample is opened.
export const RAW_VARIANT_ID = "raw";

/** Variants in display order: the raw variant first, the rest unchanged. */
export function orderVariants(variants: VolumeVariant[]): VolumeVariant[] {
  const raw = variants.find((variant) => variant.id === RAW_VARIANT_ID);
  if (!raw) return variants;
  return [raw, ...variants.filter((variant) => variant !== raw)];
}
