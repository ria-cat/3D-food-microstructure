import { useState } from "react";

function SearchIcon() {
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
			<circle cx="11" cy="11" r="7" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
	);
}

interface ChipGroupProps {
	label: string;
	options: string[];
	value: string | null;
	onChange: (value: string | null) => void;
}

function ChipGroup({ label, options, value, onChange }: ChipGroupProps) {
	return (
		<div>
			<p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
				{label}
			</p>
			<div className="flex flex-wrap gap-2">
				{options.map((option) => {
					const active = option === value;
					return (
						<button
							key={option}
							type="button"
							onClick={() => onChange(active ? null : option)}
							aria-pressed={active}
							className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
								active
									? "border-teal-400 bg-teal-400 text-zinc-950"
									: "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
							}`}
						>
							{option}
						</button>
					);
				})}
			</div>
		</div>
	);
}

interface FiltersProps {
	foodTypes: string[];
	techniques: string[];
}

export default function Filters({ foodTypes, techniques }: FiltersProps) {
	const [query, setQuery] = useState("");
	const [foodType, setFoodType] = useState<string | null>(null);
	const [technique, setTechnique] = useState<string | null>(null);

	const hasFilters =
		query.trim() !== "" || foodType !== null || technique !== null;

	function clearAll() {
		setQuery("");
		setFoodType(null);
		setTechnique(null);
	}

	return (
		<div className="mt-8 space-y-6">
			<div className="relative">
				<span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
					<SearchIcon />
				</span>
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search samples…"
					autoComplete="off"
					className="w-full rounded-full border border-zinc-800 bg-zinc-900 py-3.5 pl-12 pr-4 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
				/>
			</div>

			<ChipGroup
				label="Food type"
				options={foodTypes}
				value={foodType}
				onChange={setFoodType}
			/>
			<ChipGroup
				label="Technique"
				options={techniques}
				value={technique}
				onChange={setTechnique}
			/>

			{hasFilters && (
				<div className="flex justify-end">
					<button
						type="button"
						onClick={clearAll}
						className="text-sm font-semibold text-teal-300 underline-offset-4 hover:text-teal-200 hover:underline"
					>
						Clear filters
					</button>
				</div>
			)}
		</div>
	);
}
