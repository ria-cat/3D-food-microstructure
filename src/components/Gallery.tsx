import { lazy, Suspense, useEffect, useState } from "react"
import type { Sample, ThumbnailImage } from "../data/variants"
import { loadSamples } from "../lib/volumes"
import SampleCard from "./SampleCard"

// The full-screen viewer pulls in three.js, which is heavy. Load it lazily so
// the gallery's initial JavaScript stays small and the 3D code is only fetched
// once a sample is actually opened.
const FullScreenViewer = lazy(() => import("./FullScreenViewer"))

interface GalleryProps {
    // Optimized preview images keyed by sample id, generated in index.astro.
    thumbnails?: Record<string, ThumbnailImage>
}

export default function Gallery({ thumbnails = {} }: GalleryProps) {
    const [samples, setSamples] = useState<Sample[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [selected, setSelected] = useState<Sample | null>(null)

    useEffect(() => {
        let cancelled = false
        loadSamples()
            .then(loaded => {
                if (!cancelled) setSamples(loaded)
            })
            .catch(err => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load samples."
                    )
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <section
            id="gallery"
            className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8 sm:py-24"
        >
            <div className="">
                <h2 className="m-0 font-serif text-[clamp(2.8rem,5.2vw,4.9rem)] leading-[0.98] font-normal tracking-[-0.055em] text-[#eceee6]">
                    A closer look at{" "}
                    <em className="font-normal text-[#b4ca88]">
                        what’s inside.
                    </em>
                </h2>
                <p className="mt-[1.3rem] text-[0.94rem] leading-[1.8] text-[#a3aaa1]">
                    Each specimen is a window into the structure of food. Open a
                    sample to rotate, inspect, and compare its 3D volume.
                </p>
                <ul className="mt-6 space-y-3 text-sm leading-relaxed text-[#a3aaa1]">
                    <li className="border border-[#343d36] bg-[#1a201c] px-4 py-3">
                        <strong className="font-medium text-[#b4ca88]">
                            Pre-processed Stack:
                        </strong>{" "}
                        The original image stack after contrast enhancement,
                        improving the visibility of structural features.
                    </li>
                    <li className="border border-[#343d36] bg-[#1a201c] px-4 py-3">
                        <strong className="font-medium text-[#b4ca88]">
                            Segmented Stack:
                        </strong>{" "}
                        A binary representation where network voxels are
                        identified as foreground and all other voxels as
                        background.
                    </li>
                    <li className="border border-[#343d36] bg-[#1a201c] px-4 py-3">
                        <strong className="font-medium text-[#b4ca88]">
                            Skeletonized Stack:
                        </strong>{" "}
                        A simplified 3D network reduced to a one-voxel-thick
                        framework for connectivity and topology analysis.
                    </li>
                </ul>
            </div>

            {error ? (
                <p className="mt-10 text-sm text-[#a3aaa1]">{error}</p>
            ) : samples === null ? (
                <div className="mt-10 flex justify-center">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#343d36] border-t-[#b4ca88]" />
                </div>
            ) : (
                <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {samples.map(sample => (
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
                <Suspense
                    fallback={
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950">
                            <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
                        </div>
                    }
                >
                    <FullScreenViewer
                        sample={selected}
                        onClose={() => setSelected(null)}
                    />
                </Suspense>
            ) : null}
        </section>
    )
}
