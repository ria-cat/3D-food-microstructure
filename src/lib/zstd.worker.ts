import { decompress } from "fzstd";
import { buildOccupancy, OCCUPANCY_RESOLUTION } from "./occupancy";

// Worker protocol: the main thread hands over one compressed volume at a time
// and receives the decoded bytes back (transferred, not copied), together with
// a coarse occupancy grid used for empty-space skipping in the ray marcher.
export interface DecodeRequest {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  depth: number;
}

export type DecodeResponse =
  | {
      id: number;
      buffer: ArrayBuffer;
      byteOffset: number;
      byteLength: number;
      occupancy: ArrayBuffer;
    }
  | { id: number; error: string };

// Minimal typing for the dedicated worker scope. The project's tsconfig uses the
// DOM lib (not "webworker"), so `self` would otherwise be typed as `Window` and
// reject the worker-specific `postMessage` signature.
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage: (message: DecodeResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = ({ data }) => {
  const { id, buffer, width, height, depth } = data;
  try {
    const decoded = decompress(new Uint8Array(buffer));
    const occupancy = buildOccupancy(
      decoded,
      width,
      height,
      depth,
      OCCUPANCY_RESOLUTION,
    );
    // Hand the decoded bytes and the occupancy grid back by transferring their
    // underlying buffers so neither is copied on the way out.
    workerScope.postMessage(
      {
        id,
        buffer: decoded.buffer as ArrayBuffer,
        byteOffset: decoded.byteOffset,
        byteLength: decoded.byteLength,
        occupancy: occupancy.buffer as ArrayBuffer,
      },
      [decoded.buffer as ArrayBuffer, occupancy.buffer as ArrayBuffer],
    );
  } catch (error) {
    workerScope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Failed to decompress.",
    });
  }
};
