import { useEffect, useState } from "react";
import type { Sample, ThumbnailImage } from "../data/variants";
import { loadSamples } from "../lib/volumes";
import SampleCard from "./SampleCard";
import FullScreenViewer from "./FullScreenViewer";

interface GalleryProps {
  // Optimized preview images keyed by sample id, generated in index.astro.
  thumbnails?: Record<string, ThumbnailImage>;
}

export default function Gallery({ thumbnails = {} }: GalleryProps) {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSamples()
      .then((loaded) => {
        if (!cancelled) setSamples(loaded);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load samples.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      id="gallery"
      className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
          Gallery
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Explore the collection
        </h2>
        <p className="mt-3 max-w-xl text-zinc-400">
          High-resolution 3D reconstructions of food microstructure. Tap a
          sample to explore its full volume in 3D.
        </p>
      </div>

      {error ? (
        <p className="mt-10 text-sm text-zinc-400">{error}</p>
      ) : samples === null ? (
        <div className="mt-10 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {samples.map((sample) => (
            <SampleCard
              key={sample.id}
              sample={sample}
              thumbnail={thumbnails[sample.id]}
              onOpen={() => setSelected(sample)}
            />
          ))}
        </ul>
      )}

      {selected ? (
        <FullScreenViewer sample={selected} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}
