import type { DecodeRequest, DecodeResponse } from "./zstd.worker";

// A decoded volume: the raw voxel bytes plus the coarse occupancy grid used for
// empty-space skipping.
export interface DecodedVolume {
  data: Uint8Array;
  occupancy: Uint8Array;
}

interface PendingDecode {
  resolve: (value: DecodedVolume) => void;
  reject: (reason: Error) => void;
}

// A single shared worker decompresses one volume at a time, off the main thread.
// The worker is created lazily so no worker is spun up until a volume is needed.
let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, PendingDecode>();

function getWorker(): Worker {
  if (worker) return worker;

  const created = new Worker(new URL("./zstd.worker.ts", import.meta.url), {
    type: "module",
  });

  created.addEventListener("message", (event: MessageEvent<DecodeResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if ("error" in message) {
      entry.reject(new Error(message.error));
    } else {
      entry.resolve({
        data: new Uint8Array(
          message.buffer,
          message.byteOffset,
          message.byteLength,
        ),
        occupancy: new Uint8Array(message.occupancy),
      });
    }
  });

  created.addEventListener("error", (event) => {
    // A worker-level failure (e.g. it failed to load) rejects everything in
    // flight and drops the worker so the next request recreates it.
    const error = new Error(
      event.message || "Volume decompression worker failed.",
    );
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    created.terminate();
    worker = null;
  });

  worker = created;
  return created;
}

// Decompress zstd data off the main thread and build its occupancy grid. The
// input is copied before being handed to the worker, so the caller's buffer
// (e.g. a cached compressed volume) stays intact for reuse.
export function decodeZstd(
  compressed: Uint8Array,
  dimensions: { width: number; height: number; depth: number },
): Promise<DecodedVolume> {
  const active = getWorker();
  const id = nextRequestId++;
  const copy = compressed.slice();

  return new Promise<DecodedVolume>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: DecodeRequest = {
      id,
      buffer: copy.buffer as ArrayBuffer,
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
    };
    active.postMessage(request, [copy.buffer as ArrayBuffer]);
  });
}
