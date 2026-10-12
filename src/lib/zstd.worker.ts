import { decompress } from "fzstd";

// Worker protocol: the main thread hands over one compressed volume at a time
// and receives the decoded bytes back (transferred, not copied).
export interface DecodeRequest {
  id: number;
  buffer: ArrayBuffer;
}

export type DecodeResponse =
  | { id: number; buffer: ArrayBuffer; byteOffset: number; byteLength: number }
  | { id: number; error: string };

// Minimal typing for the dedicated worker scope. The project's tsconfig uses the
// DOM lib (not "webworker"), so `self` would otherwise be typed as `Window` and
// reject the worker-specific `postMessage` signature.
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage: (message: DecodeResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = ({ data }) => {
  const { id, buffer } = data;
  try {
    const decoded = decompress(new Uint8Array(buffer));
    // Hand the decoded bytes back by transferring the underlying buffer so the
    // result is never copied on the way out.
    workerScope.postMessage(
      {
        id,
        buffer: decoded.buffer as ArrayBuffer,
        byteOffset: decoded.byteOffset,
        byteLength: decoded.byteLength,
      },
      [decoded.buffer as ArrayBuffer],
    );
  } catch (error) {
    workerScope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Failed to decompress.",
    });
  }
};
