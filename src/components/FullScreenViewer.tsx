import { useEffect, useState } from "react";
import type { Sample, VolumeRenderOptions } from "../data/samples";
import VolumeViewer from "./VolumeViewer";
import ColormapSelector, { type ColorSelection } from "./ColormapSelector";
import {
  loadVolumeData,
  loadVolumeDimensions,
  prefetchVolumeData,
} from "../lib/volumes";

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function selectionFromRender(render?: VolumeRenderOptions): ColorSelection {
  if (render?.colormap) return { type: "colormap", name: render.colormap };
  if (render?.color) return { type: "color", value: render.color };
  return { type: "colormap", name: "gray" };
}

interface FullScreenViewerProps {
  sample: Sample;
  onClose: () => void;
}

export default function FullScreenViewer({
  sample,
  onClose,
}: FullScreenViewerProps) {
  const [variantId, setVariantId] = useState(sample.variants[0].id);
  const variant =
    sample.variants.find((v) => v.id === variantId) ?? sample.variants[0];
  const { volume } = variant;

  const [selection, setSelection] = useState<ColorSelection>(() =>
    selectionFromRender(variant.volume.render),
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Prefetch the non-default variants as soon as the default (CLAHE) volume has
  // been downloaded. The default is always fetched on its own; the remaining
  // variants are then fetched in parallel. The loader dedupes in-flight
  // requests, so switching to a variant mid-download just awaits the prefetch
  // instead of starting a second fetch.
  useEffect(() => {
    let cancelled = false;
    const [defaultVariant, ...otherVariants] = sample.variants;

    loadVolumeDimensions(defaultVariant.volume.url)
      .then((dimensions) =>
        loadVolumeData(defaultVariant.volume.url, dimensions),
      )
      .then(() => {
        if (cancelled) return;
        for (const variant of otherVariants) {
          const { url } = variant.volume;
          loadVolumeDimensions(url)
            .then((dimensions) => prefetchVolumeData(url, dimensions))
            .catch(() => {});
        }
      })
      .catch(() => {
        // The viewer surfaces load errors; prefetching is best-effort.
      });

    return () => {
      cancelled = true;
    };
  }, [sample]);

  const colormap = selection.type === "colormap" ? selection.name : undefined;
  const color = selection.type === "color" ? selection.value : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label={`${sample.title} 3D viewer`}
    >
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-zinc-100">
            {sample.title}
          </h2>
          {sample.description ? (
            <p className="truncate text-xs text-zinc-500">
              {sample.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
        >
          <CloseIcon />
        </button>
      </header>

      {sample.variants.length > 1 && (
        <div className="flex justify-center border-b border-zinc-800 px-4 py-2">
          <div
            className="inline-flex rounded-full border border-zinc-800 bg-zinc-900 p-1"
            role="tablist"
            aria-label="Rendering"
          >
            {sample.variants.map((v) => {
              const active = v.id === variant.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setVariantId(v.id);
                    setSelection(selectionFromRender(v.volume.render));
                  }}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 ${
                    active
                      ? "bg-teal-500 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ColormapSelector value={selection} onChange={setSelection} />

      <div className="relative min-h-0 flex-1">
        <VolumeViewer
          url={volume.url}
          spacing={volume.spacing}
          color={color}
          colormap={colormap}
          alpha={volume.render?.alpha}
          gamma={volume.render?.gamma}
          clim={volume.render?.clim}
          magFilter={volume.render?.magFilter}
          lighting={volume.render?.lighting}
        />
      </div>
    </div>
  );
}
