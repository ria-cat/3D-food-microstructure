import { COLORMAP_NAMES, colormapCss, type ColormapName } from "../lib/colormaps";

export type ColorSelection =
	| { type: "colormap"; name: ColormapName }
	| { type: "color"; value: string };

interface ColormapSelectorProps {
	value: ColorSelection;
	onChange: (selection: ColorSelection) => void;
}

export default function ColormapSelector({ value, onChange }: ColormapSelectorProps) {
	const customColor = value.type === "color" ? value.value : "#2dd4bf";

	return (
		<div className="flex items-center gap-3 overflow-x-auto border-b border-zinc-800 px-4 py-2 sm:px-6">
			<span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
				Color
			</span>

			<div className="flex items-center gap-1.5">
				{COLORMAP_NAMES.map((name) => {
					const active = value.type === "colormap" && value.name === name;
					return (
						<button
							key={name}
							type="button"
							aria-label={`${name} colormap`}
							aria-pressed={active}
							onClick={() => onChange({ type: "colormap", name })}
							className={`h-7 w-11 shrink-0 rounded-md border transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 ${
								active
									? "border-teal-300 ring-2 ring-teal-400/40"
									: "border-zinc-700 hover:border-zinc-500"
							}`}
							style={{ background: colormapCss(name) }}
						/>
					);
				})}

				<label
					className={`relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-teal-400/70 ${
						value.type === "color"
							? "border-teal-300 ring-2 ring-teal-400/40"
							: "border-zinc-700 hover:border-zinc-500"
					}`}
					style={{
						background:
							value.type === "color"
								? value.value
								: "conic-gradient(from 0deg, #f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7, #f43f5e)",
					}}
					title="Custom color"
				>
					<input
						type="color"
						value={customColor}
						onChange={(event) =>
							onChange({ type: "color", value: event.target.value })
						}
						aria-label="Custom color"
						className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
					/>
				</label>
			</div>
		</div>
	);
}
