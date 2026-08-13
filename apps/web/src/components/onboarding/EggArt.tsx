import type { EggVariant } from "@/engine/onboarding";

/**
 * Procedural egg art — no model, no texture, just SVG. Three cosmetic
 * variants, hand-drawn to sit in the same warm/dark palette as the rest of
 * the game (Shop.tsx's RARITY_COLOR family) rather than fetched from
 * anywhere. The fox itself is one real animated model regardless of which
 * egg you pick; the variant is a keepsake choice, not a stat.
 */
export const EGG_INFO: Record<EggVariant, { name: string; accent: string; blurb: string }> = {
  ember: {
    name: "Ember Egg",
    accent: "#f2a24e",
    blurb: "Warm to the touch, even cold. Bold, restless, first through a door.",
  },
  moss: {
    name: "Moss Egg",
    accent: "#7fae62",
    blurb: "Cool and quiet, flecked like a forest floor. Patient. Notices things first.",
  },
  frost: {
    name: "Frost Egg",
    accent: "#7fb3d9",
    blurb: "Pale, faintly cold, veined like a hard winter. Wary, and loyal for it.",
  },
};

export function EggArt({ variant, size = 96 }: { variant: EggVariant; size?: number }) {
  const { accent } = EGG_INFO[variant];
  const speckles = SPECKLES[variant];
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 100 118" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`shell-${variant}`} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1a140f" stopOpacity="0.9" />
        </radialGradient>
      </defs>
      {/* The shell — an egg silhouette is just two arcs; drawn as one path so
          the speckles below can clip to it. */}
      <path
        id={`shellpath-${variant}`}
        d="M50 6 C74 6 90 42 90 68 C90 96 72 112 50 112 C28 112 10 96 10 68 C10 42 26 6 50 6 Z"
        fill={`url(#shell-${variant})`}
        stroke={accent}
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <clipPath id={`clip-${variant}`}>
        <use href={`#shellpath-${variant}`} />
      </clipPath>
      <g clipPath={`url(#clip-${variant})`}>
        {speckles.map((s, i) => (
          <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill={accent} fillOpacity={0.35 + (i % 3) * 0.12} />
        ))}
        {/* A soft highlight so it reads as glossy shell, not a flat sticker. */}
        <ellipse cx="38" cy="30" rx="14" ry="20" fill="#ffffff" opacity="0.16" />
      </g>
    </svg>
  );
}

/** Hand-placed speckle positions per variant — different enough to read as
 *  distinct shells at a glance, not just a recolored copy. */
const SPECKLES: Record<EggVariant, [number, number, number][]> = {
  ember: [
    [30, 40, 5], [58, 30, 4], [70, 55, 6], [40, 70, 4.5], [60, 85, 5],
    [25, 80, 3.5], [50, 50, 3], [78, 75, 4],
  ],
  moss: [
    [35, 25, 6], [55, 45, 7], [25, 55, 5], [65, 65, 6], [45, 90, 5],
    [72, 35, 4], [30, 95, 4], [50, 65, 3.5],
  ],
  frost: [
    [40, 20, 3], [60, 40, 3.5], [30, 50, 2.5], [70, 60, 3], [45, 75, 3],
    [55, 95, 2.5], [25, 75, 2], [75, 85, 2.5], [50, 45, 2],
  ],
};
