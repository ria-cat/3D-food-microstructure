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
    <li className="group flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 transition-transform duration-200 hover:-translate-y-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${sample.title} in 3D`}
        className="relative block aspect-square w-full cursor-pointer overflow-hidden rounded-t-[15px] bg-zinc-950 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400/70"
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
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-t from-zinc-950/80 via-zinc-950/10 to-transparent"
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
            <span className="text-teal-300/80 transition-colors group-hover:text-teal-200">
              <CubeIcon />
            </span>
          )}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="text-base font-bold leading-snug">{sample.title}</h3>
        {sample.description ? (
          <p className="text-sm leading-relaxed text-zinc-400">
            {sample.description}
          </p>
        ) : null}
      </div>
    </li>
  );
}
