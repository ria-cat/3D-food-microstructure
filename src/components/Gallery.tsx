import { useState } from "react";
import { samples, type Sample } from "../data/samples";
import SampleCard from "./SampleCard";
import FullScreenViewer from "./FullScreenViewer";

export default function Gallery() {
  const [selected, setSelected] = useState<Sample | null>(null);

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

      <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {samples.map((sample) => (
          <SampleCard
            key={sample.id}
            sample={sample}
            onOpen={() => setSelected(sample)}
          />
        ))}
      </ul>

      {selected ? (
        <FullScreenViewer sample={selected} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}
