import type { Sample, ThumbnailImage } from "../data/variants";

function CubeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

interface SampleCardProps {
  sample: Sample;
  thumbnail?: ThumbnailImage;
  onOpen: () => void;
}

export default function SampleCard({
  sample,
  thumbnail,
  onOpen,
}: SampleCardProps) {
  return (
    <li className="sample-card group flex flex-col transition-transform duration-300 hover:-translate-y-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${sample.title} in 3D`}
        className="sample-image relative block aspect-[1.08] w-full cursor-pointer overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#697d4f]"
      >
        {thumbnail ? (
          <>
            <img
              src={thumbnail.src}
              srcSet={thumbnail.srcSet}
              width={thumbnail.width}
              height={thumbnail.height}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-t from-[#17231d]/75 via-transparent to-transparent"
            />
          </>
        ) : (
          <>
            {/* Placeholder shown until a preview image has been generated. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-br from-teal-500/20 via-zinc-900 to-amber-500/15"
            />
            <div
              aria-hidden
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
                backgroundSize: "14px 14px",
              }}
            />
          </>
        )}
        <div
          className={`absolute inset-0 flex flex-col items-center gap-3 ${
            thumbnail ? "justify-end pb-4" : "justify-center"
          }`}
        >
          {thumbnail ? null : (
            <span className="text-[#d8e9a8]/80 transition-colors group-hover:text-[#e5f0c8]">
              <CubeIcon />
            </span>
          )}
        </div>
      </button>

      <div className="sample-card-caption flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="sample-label">SPECIMEN / {sample.id.toUpperCase()}</p>
            <h3 className="mt-2 font-serif text-lg font-semibold leading-snug">
              {sample.title}
            </h3>
          </div>
          <span aria-hidden="true" className="sample-arrow">
            ↗
          </span>
        </div>
        {sample.description ? (
          <p className="sample-description text-sm leading-relaxed">
            {sample.description}
          </p>
        ) : null}
      </div>
    </li>
  );
}
