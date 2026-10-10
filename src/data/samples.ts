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

export const samples: Sample[] = [
  {
    id: "WPI_0.05GG",
    title: "WPI 0.05% GG",
    description: "Acid-induced composite gel (3% w/w WPI, 0.05% w/w GG).",
    variants: [
      {
        id: "original",
        label: "Original",
        volume: {
          url: "/volumes/wpi-0.05gg/clahe.raw.zst",
          spacing: [1, 1, 1],
          render: {
            colormap: "inferno",
            alpha: 0.5,
            clim: [0.15, 0.85],
            magFilter: "linear",
          },
        },
      },
      {
        id: "segmented",
        label: "Segmented",
        volume: {
          url: "/volumes/wpi-0.05gg/segmented.raw.zst",
          spacing: [1, 1, 1],
          render: { color: "#2dd4bf" },
        },
      },
      {
        id: "skeleton",
        label: "Skeleton",
        volume: {
          url: "/volumes/wpi-0.05gg/skeleton.raw.zst",
          spacing: [1, 1, 1],
          render: { color: "#fbbf24", lighting: false },
        },
      },
    ],
  },
];
