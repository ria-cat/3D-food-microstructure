export type ColormapName =
  "gray" | "viridis" | "inferno" | "magma" | "plasma" | "bone" | "turbo";

interface Stop {
  t: number;
  r: number;
  g: number;
  b: number;
}

const STOPS: Record<ColormapName, Stop[]> = {
  gray: [
    { t: 0, r: 0, g: 0, b: 0 },
    { t: 1, r: 255, g: 255, b: 255 },
  ],
  viridis: [
    { t: 0, r: 68, g: 1, b: 84 },
    { t: 0.25, r: 59, g: 82, b: 139 },
    { t: 0.5, r: 33, g: 145, b: 140 },
    { t: 0.75, r: 94, g: 201, b: 98 },
    { t: 1, r: 253, g: 231, b: 37 },
  ],
  inferno: [
    { t: 0, r: 0, g: 0, b: 4 },
    { t: 0.25, r: 66, g: 10, b: 105 },
    { t: 0.5, r: 145, g: 32, b: 110 },
    { t: 0.75, r: 236, g: 99, b: 42 },
    { t: 1, r: 252, g: 255, b: 164 },
  ],
  magma: [
    { t: 0, r: 0, g: 0, b: 4 },
    { t: 0.25, r: 76, g: 11, b: 106 },
    { t: 0.5, r: 183, g: 55, b: 121 },
    { t: 0.75, r: 247, g: 135, b: 61 },
    { t: 1, r: 252, g: 253, b: 191 },
  ],
  plasma: [
    { t: 0, r: 13, g: 8, b: 135 },
    { t: 0.25, r: 126, g: 3, b: 168 },
    { t: 0.5, r: 204, g: 71, b: 120 },
    { t: 0.75, r: 248, g: 149, b: 64 },
    { t: 1, r: 240, g: 249, b: 33 },
  ],
  bone: [
    { t: 0, r: 0, g: 0, b: 0 },
    { t: 0.375, r: 84, g: 84, b: 116 },
    { t: 0.75, r: 169, g: 169, b: 200 },
    { t: 1, r: 255, g: 255, b: 255 },
  ],
  turbo: [
    { t: 0, r: 48, g: 18, b: 59 },
    { t: 0.125, r: 70, g: 106, b: 250 },
    { t: 0.25, r: 40, g: 170, b: 255 },
    { t: 0.375, r: 0, g: 220, b: 220 },
    { t: 0.5, r: 95, g: 250, b: 145 },
    { t: 0.625, r: 210, g: 250, b: 60 },
    { t: 0.75, r: 250, g: 170, b: 20 },
    { t: 0.875, r: 190, g: 55, b: 0 },
    { t: 1, r: 122, g: 4, b: 3 },
  ],
};

export const COLORMAP_NAMES = Object.keys(STOPS) as ColormapName[];

/** CSS `linear-gradient` string used to preview a colormap swatch. */
export function colormapCss(name: ColormapName): string {
  const colors = STOPS[name]
    .map((s) => `rgb(${s.r},${s.g},${s.b}) ${Math.round(s.t * 100)}%`)
    .join(", ");
  return `linear-gradient(to right, ${colors})`;
}

export function isColormapName(value: unknown): value is ColormapName {
  return typeof value === "string" && value in STOPS;
}

function sampleStops(stops: Stop[], t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].t < clamped) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const span = b.t - a.t;
  const f = span === 0 ? 0 : (clamped - a.t) / span;
  return [
    Math.round(a.r + (b.r - a.r) * f),
    Math.round(a.g + (b.g - a.g) * f),
    Math.round(a.b + (b.b - a.b) * f),
  ];
}

/** Builds an RGBA lookup table (size × 1) for a named colormap. */
export function colormapLut(name: ColormapName, size = 256): Uint8Array {
  const stops = STOPS[name];
  const lut = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1);
    const [r, g, b] = sampleStops(stops, t);
    const o = i * 4;
    lut[o] = r;
    lut[o + 1] = g;
    lut[o + 2] = b;
    lut[o + 3] = 255;
  }
  return lut;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Builds a black → `color` gradient LUT (replicates the single-color render). */
export function colorToLut(hex: string, size = 256): Uint8Array {
  const [r, g, b] = hexToRgb(hex);
  const lut = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1);
    const o = i * 4;
    lut[o] = Math.round(r * t);
    lut[o + 1] = Math.round(g * t);
    lut[o + 2] = Math.round(b * t);
    lut[o + 3] = 255;
  }
  return lut;
}
