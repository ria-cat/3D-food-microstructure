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
            className="page-container page-section scroll-mt-6"
        >
            <>
                <h2 className="gallery-heading">
                    A closer look at <em>what’s inside.</em>
                </h2>
                <p className="gallery-intro mt-[1.3rem]">
                    Each specimen is a window into the structure of food. Open a
                    sample to rotate, inspect, and compare its 3D volume.
                </p>
                <ul className="gallery-notes mt-6 space-y-3">
                    <li className="border border-[#343d36] bg-[#1a201c] px-4 py-3">
                        <strong>Pre-processed Stack:</strong> The original image
                        stack after contrast enhancement, improving the
                        visibility of structural features.
                    </li>
                    <li className="border border-[#343d36] bg-[#1a201c] px-4 py-3">
                        <strong>Segmented Stack:</strong> A binary
                        representation where network voxels are identified as
                        foreground and all other voxels as background.
                    </li>
                    <li className="border border-[#343d36] bg-[#1a201c] px-4 py-3">
                        <strong>Skeletonized Stack:</strong> A simplified 3D
                        network reduced to a one-voxel-thick framework for
                        connectivity and topology analysis.
                    </li>
                </ul>
            </>

            {error ? (
                <p className="mt-10">{error}</p>
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
