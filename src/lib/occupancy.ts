// Coarse occupancy grid used for empty-space skipping in the volume ray marcher.
//
// The grid has `resolution` cells per axis; each cell is 255 when any voxel in
// its block is non-zero, and 0 only when the whole block is empty. 255 (rather
// than 1) is used because the grid is uploaded as a normalized UnsignedByteType
// texture, where 255 maps to 1.0 in the shader. The scan is conservative (it
// visits every voxel) so thin structures — e.g. a 1-voxel-thick skeleton — can
// never be skipped over. It is meant to run off the main thread in the decode
// worker, since a full-resolution volume can be hundreds of millions of voxels.
export const OCCUPANCY_RESOLUTION = 64;

export function buildOccupancy(
  data: Uint8Array,
  width: number,
  height: number,
  depth: number,
  resolution: number = OCCUPANCY_RESOLUTION,
): Uint8Array {
  const grid = new Uint8Array(resolution * resolution * resolution);
  const slice = width * height;

  for (let gz = 0; gz < resolution; gz++) {
    const z0 = Math.floor((gz * depth) / resolution);
    const z1 = Math.floor(((gz + 1) * depth) / resolution);
    for (let gy = 0; gy < resolution; gy++) {
      const y0 = Math.floor((gy * height) / resolution);
      const y1 = Math.floor(((gy + 1) * height) / resolution);
      const gBase = (gz * resolution + gy) * resolution;

      for (let gx = 0; gx < resolution; gx++) {
        const x0 = Math.floor((gx * width) / resolution);
        const x1 = Math.floor(((gx + 1) * width) / resolution);

        let occupied = 0;
        cell: for (let z = z0; z < z1; z++) {
          const zBase = z * slice;
          for (let y = y0; y < y1; y++) {
            const yBase = zBase + y * width;
            for (let x = x0; x < x1; x++) {
              if (data[yBase + x] !== 0) {
                occupied = 255;
                break cell;
              }
            }
          }
        }
        grid[gBase + gx] = occupied;
      }
    }
  }

  return grid;
}
