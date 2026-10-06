export default function Hero() {
	return (
		<section className="relative overflow-hidden border-b border-zinc-800/80 bg-zinc-950">
			{/* Ambient background glows */}
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl" />
				<div className="absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
			</div>

			<div className="relative mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
				<span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-300">
					<span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden />
					Food microstructure · 3D atlas
				</span>

				<h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
					See inside food,
					<br className="hidden sm:block" /> in three dimensions.
				</h1>

				<p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
					A curated collection of high-resolution 3D reconstructions of model food
					microstructure captured with Confocal Light Scanning Microscopy.
				</p>

				<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
					<a href="#gallery" className="btn btn-primary w-full sm:w-auto">
						Explore the gallery
					</a>
					<a href="#author" className="btn btn-ghost w-full sm:w-auto">
						Meet the author
					</a>
				</div>
			</div>
		</section>
	);
}
