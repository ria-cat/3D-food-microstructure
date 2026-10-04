interface AuthorProps {
	name: string;
	role: string;
	affiliation: string;
	bio: string;
	avatar: string;
	linkedin: string;
	researchGroup: string;
	researchGroupLabel: string;
}

function LinkedInIcon() {
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
			<path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
		</svg>
	);
}

function GroupIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

export default function Author({
	name,
	role,
	affiliation,
	bio,
	avatar,
	linkedin,
	researchGroup,
	researchGroupLabel,
}: AuthorProps) {
	return (
		<section id="author" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-20 sm:px-8 sm:pb-28">
			<div className="flex flex-col items-center gap-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-10 md:flex-row md:items-center md:gap-10">
				<div className="shrink-0">
					<img
						src={avatar}
						alt={`Portrait of ${name}`}
						width="220"
						height="220"
						loading="lazy"
						className="h-40 w-40 rounded-full border-4 border-teal-500/20 object-cover sm:h-52 sm:w-52"
					/>
				</div>

				<div className="text-center md:text-left">
					<p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
						About the author
					</p>
					<h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
						{name}
					</h2>
					<p className="mt-2 font-semibold text-zinc-100">{role}</p>
					<p className="mt-1 text-sm text-zinc-500">{affiliation}</p>
					<p className="mx-auto mt-5 max-w-2xl leading-relaxed text-zinc-400 md:mx-0">
						{bio}
					</p>

					<div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row md:justify-start">
						<a
							href={linkedin}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center justify-center gap-2.5 rounded-full border border-zinc-700 bg-zinc-950/40 px-5 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-sky-400 hover:text-sky-300"
						>
							<LinkedInIcon />
							LinkedIn
						</a>
						<a
							href={researchGroup}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center justify-center gap-2.5 rounded-full border border-zinc-700 bg-zinc-950/40 px-5 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-teal-400 hover:text-teal-300"
						>
							<GroupIcon />
							{researchGroupLabel}
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}
