import type { ReactElement } from "react";

/**
 * Hand-drawn line-art icons for the non-weapon shop items, replacing raw
 * emoji glyphs. Same idea as the real weapon renders (weaponThumb.ts): the
 * one screen whose whole job is "look at these and pick one" deserves actual
 * illustration, not whatever the OS happens to draw for 🔒.
 *
 * Same technique as Valor's GunIcons — plain inline SVG, `currentColor` so a
 * card can tint the icon by rarity — but drawn in FoxGlade's own idiom:
 * worn leather, brass, parchment, ward-stone. A tactical stencil icon would
 * read as a different game.
 */
interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

function Bandages({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Roll */}
      <ellipse cx="34" cy="50" rx="20" ry="20" fill={color} opacity={0.18} />
      <ellipse cx="34" cy="50" rx="20" ry="20" stroke={color} strokeWidth="2.5" opacity={0.85} />
      <ellipse cx="34" cy="50" rx="7" ry="7" stroke={color} strokeWidth="2" opacity={0.5} />
      {/* Spiral wrap lines */}
      {[26, 34, 42, 50].map((r) => (
        <path
          key={r}
          d={`M ${34 - r * 0.55} ${50 - r * 0.4} A ${r} ${r} 0 0 1 ${34 + r * 0.55} ${50 + r * 0.4}`}
          stroke={color}
          strokeWidth="1"
          opacity={0.2}
        />
      ))}
      {/* Trailing strip with a cross */}
      <path d="M52 42 L82 36 Q86 35, 86 39 L86 44 Q86 48, 82 47 L52 53 Z" fill={color} opacity={0.75} />
      <rect x="66" y="37" width="4" height="12" fill="#0c0906" opacity={0.55} />
      <rect x="61" y="41.5" width="14" height="4" fill="#0c0906" opacity={0.55} />
    </svg>
  );
}

function PowderCharge({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Keg body */}
      <path d="M30 42 Q30 30, 50 30 Q70 30, 70 42 L68 72 Q68 82, 50 82 Q32 82, 32 72 Z" fill={color} opacity={0.22} />
      <path d="M30 42 Q30 30, 50 30 Q70 30, 70 42 L68 72 Q68 82, 50 82 Q32 82, 32 72 Z" stroke={color} strokeWidth="2.5" opacity={0.85} />
      {/* Bands */}
      <path d="M30.8 48 Q50 55, 69.2 48" stroke={color} strokeWidth="2" opacity={0.5} />
      <path d="M31.5 64 Q50 71, 68.5 64" stroke={color} strokeWidth="2" opacity={0.5} />
      {/* Fuse */}
      <path d="M50 30 Q46 20, 54 14 Q60 9, 58 4" stroke={color} strokeWidth="2.5" fill="none" opacity={0.8} strokeLinecap="round" />
      {/* Spark */}
      <circle cx="58" cy="4" r="3.5" fill={color} opacity={0.9} />
      <path d="M58 -2 L58 -6 M52 0 L48 -3 M64 0 L68 -3" stroke={color} strokeWidth="1.4" opacity={0.6} strokeLinecap="round" />
    </svg>
  );
}

function Chart({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Rolled ends */}
      <rect x="10" y="30" width="10" height="42" rx="5" fill={color} opacity={0.4} />
      <rect x="80" y="30" width="10" height="42" rx="5" fill={color} opacity={0.4} />
      {/* Unrolled parchment */}
      <path d="M18 32 L82 28 L84 74 L16 78 Z" fill={color} opacity={0.16} />
      <path d="M18 32 L82 28 L84 74 L16 78 Z" stroke={color} strokeWidth="2" opacity={0.75} />
      {/* Route dots + a marked X */}
      <path d="M26 62 Q40 50, 50 56 T70 42" stroke={color} strokeWidth="1.5" strokeDasharray="1 5" opacity={0.55} strokeLinecap="round" />
      <path d="M65 36 L73 44 M73 36 L65 44" stroke={color} strokeWidth="2" opacity={0.8} strokeLinecap="round" />
      {/* Compass rose, small, top-left of the sheet */}
      <g opacity={0.5}>
        <circle cx="32" cy="46" r="7" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M32 40 L32 52 M26 46 L38 46" stroke={color} strokeWidth="1" />
      </g>
    </svg>
  );
}

function Lockbox({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Chest body */}
      <rect x="18" y="42" width="64" height="36" rx="4" fill={color} opacity={0.2} />
      <rect x="18" y="42" width="64" height="36" rx="4" stroke={color} strokeWidth="2.5" opacity={0.85} />
      {/* Domed lid */}
      <path d="M18 42 Q18 22, 50 22 Q82 22, 82 42 Z" fill={color} opacity={0.28} />
      <path d="M18 42 Q18 22, 50 22 Q82 22, 82 42 Z" stroke={color} strokeWidth="2.5" opacity={0.85} />
      {/* Banding */}
      <rect x="18" y="41" width="64" height="4" fill={color} opacity={0.5} />
      <rect x="46" y="22" width="8" height="56" fill={color} opacity={0.35} />
      {/* Corner studs */}
      {[[22, 46], [78, 46], [22, 74], [78, 74]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill={color} opacity={0.6} />
      ))}
      {/* Lock plate + keyhole */}
      <rect x="41" y="48" width="18" height="16" rx="2" fill={color} opacity={0.7} />
      <circle cx="50" cy="54" r="2.6" fill="#0c0906" opacity={0.7} />
      <path d="M48.8 56 L51.2 56 L50.4 61 L49.6 61 Z" fill="#0c0906" opacity={0.7} />
    </svg>
  );
}

function WardingCharm({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Chain */}
      <path d="M50 8 Q40 16, 50 24 Q60 32, 50 38" stroke={color} strokeWidth="2" fill="none" opacity={0.5} />
      {/* Setting */}
      <circle cx="50" cy="60" r="27" fill={color} opacity={0.14} />
      <circle cx="50" cy="60" r="27" stroke={color} strokeWidth="2.5" opacity={0.85} />
      <circle cx="50" cy="60" r="21" stroke={color} strokeWidth="1.2" opacity={0.4} />
      {/* Eye */}
      <path d="M28 60 Q50 46, 72 60 Q50 74, 28 60 Z" fill={color} opacity={0.35} />
      <path d="M28 60 Q50 46, 72 60 Q50 74, 28 60 Z" stroke={color} strokeWidth="1.6" opacity={0.8} />
      <circle cx="50" cy="60" r="9" fill={color} opacity={0.85} />
      <circle cx="50" cy="60" r="4" fill="#0c0906" opacity={0.7} />
      {/* Facet lines around the rim */}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 22, y1 = 60 + Math.sin(a) * 22;
        const x2 = 50 + Math.cos(a) * 27, y2 = 60 + Math.sin(a) * 27;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" opacity={0.3} />;
      })}
    </svg>
  );
}

function BrassSight({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      <g transform="translate(4,20) rotate(-8 50 30)">
        {/* Barrel, tapering toward the objective end */}
        <path d="M4 26 L60 22 L60 38 L4 34 Z" fill={color} opacity={0.75} />
        <path d="M60 18 L86 24 L86 36 L60 42 Z" fill={color} opacity={0.6} />
        {/* Rings */}
        <rect x="22" y="20" width="4" height="18" fill="#0c0906" opacity={0.35} />
        <rect x="46" y="19" width="4" height="20" fill="#0c0906" opacity={0.35} />
        {/* Objective lens (glinting) */}
        <circle cx="88" cy="30" r="9" fill={color} opacity={0.3} />
        <circle cx="88" cy="30" r="9" stroke={color} strokeWidth="2" opacity={0.85} />
        <circle cx="85" cy="27" r="2.4" fill="#fff" opacity={0.55} />
        {/* Eyepiece */}
        <circle cx="2" cy="30" r="5" stroke={color} strokeWidth="2" opacity={0.7} />
        {/* Mount */}
        <rect x="34" y="38" width="16" height="7" rx="1.5" fill={color} opacity={0.55} />
        <rect x="34" y="45" width="4" height="8" fill={color} opacity={0.5} />
        <rect x="46" y="45" width="4" height="8" fill={color} opacity={0.5} />
      </g>
    </svg>
  );
}

function WrappedGrip({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      <g transform="rotate(20 50 50)">
        {/* Pommel */}
        <circle cx="50" cy="18" r="9" fill={color} opacity={0.75} />
        {/* Grip body */}
        <rect x="40" y="26" width="20" height="46" rx="6" fill={color} opacity={0.22} />
        <rect x="40" y="26" width="20" height="46" rx="6" stroke={color} strokeWidth="2.2" opacity={0.85} />
        {/* Diagonal wrap */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={i}
            x1={41}
            y1={30 + i * 6}
            x2={59}
            y2={35 + i * 6}
            stroke={color}
            strokeWidth="1.6"
            opacity={0.45}
          />
        ))}
        {/* Guard */}
        <rect x="30" y="72" width="40" height="7" rx="3.5" fill={color} opacity={0.7} />
      </g>
    </svg>
  );
}

function BombSatchel({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Pouch */}
      <path d="M24 46 Q24 40, 32 40 L68 40 Q76 40, 76 46 L72 82 Q71 88, 64 88 L36 88 Q29 88, 28 82 Z" fill={color} opacity={0.2} />
      <path d="M24 46 Q24 40, 32 40 L68 40 Q76 40, 76 46 L72 82 Q71 88, 64 88 L36 88 Q29 88, 28 82 Z" stroke={color} strokeWidth="2.4" opacity={0.85} />
      {/* Strap */}
      <path d="M14 20 Q50 10, 86 20" stroke={color} strokeWidth="2.4" fill="none" opacity={0.6} />
      {/* Buckle */}
      <rect x="43" y="52" width="14" height="10" rx="2" fill={color} opacity={0.5} />
      {/* Bomb peeking out the top */}
      <circle cx="50" cy="34" r="12" fill={color} opacity={0.8} />
      <path d="M50 22 Q46 14, 54 8" stroke={color} strokeWidth="2.2" fill="none" opacity={0.8} strokeLinecap="round" />
      <circle cx="54" cy="8" r="2.6" fill={color} opacity={0.9} />
    </svg>
  );
}

function Satchel({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Strap */}
      <path d="M20 12 Q50 2, 80 12" stroke={color} strokeWidth="2.4" fill="none" opacity={0.6} />
      {/* Body */}
      <rect x="20" y="42" width="60" height="42" rx="8" fill={color} opacity={0.2} />
      <rect x="20" y="42" width="60" height="42" rx="8" stroke={color} strokeWidth="2.4" opacity={0.85} />
      {/* Flap */}
      <path d="M20 42 Q50 26, 80 42 L74 54 Q50 42, 26 54 Z" fill={color} opacity={0.4} />
      <path d="M20 42 Q50 26, 80 42 L74 54 Q50 42, 26 54 Z" stroke={color} strokeWidth="2" opacity={0.75} />
      {/* Buckle */}
      <rect x="43" y="46" width="14" height="9" rx="2" fill={color} opacity={0.6} />
      {/* Stitching */}
      <path d="M26 78 L74 78" stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity={0.35} />
    </svg>
  );
}

function Rucksack({ size = 48, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
      {/* Straps */}
      <path d="M36 30 Q34 60, 38 86" stroke={color} strokeWidth="3" fill="none" opacity={0.55} strokeLinecap="round" />
      <path d="M64 30 Q66 60, 62 86" stroke={color} strokeWidth="3" fill="none" opacity={0.55} strokeLinecap="round" />
      {/* Main body */}
      <path d="M24 40 Q24 18, 50 18 Q76 18, 76 40 L74 82 Q73 90, 64 90 L36 90 Q27 90, 26 82 Z" fill={color} opacity={0.2} />
      <path d="M24 40 Q24 18, 50 18 Q76 18, 76 40 L74 82 Q73 90, 64 90 L36 90 Q27 90, 26 82 Z" stroke={color} strokeWidth="2.4" opacity={0.85} />
      {/* Drawstring top */}
      <path d="M32 30 Q50 24, 68 30" stroke={color} strokeWidth="1.6" opacity={0.5} />
      <circle cx="50" cy="27" r="2.2" fill={color} opacity={0.7} />
      {/* Front pocket */}
      <rect x="34" y="58" width="32" height="24" rx="5" fill={color} opacity={0.28} />
      <rect x="34" y="58" width="32" height="24" rx="5" stroke={color} strokeWidth="1.8" opacity={0.6} />
      <rect x="45" y="62" width="10" height="6" rx="2" fill={color} opacity={0.5} />
    </svg>
  );
}

const ITEM_ICONS: Record<string, (props: IconProps) => ReactElement> = {
  s_restore: Bandages,
  s_bomb: PowderCharge,
  s_chart: Chart,
  s_lockbox: Lockbox,
  s_extralife: WardingCharm,
  a_sight: BrassSight,
  a_grip: WrappedGrip,
  b_satchel: BombSatchel,
  g_satchel: Satchel,
  g_rucksack: Rucksack,
};

/** The illustrated icon for a non-weapon item, or null (weapons render the real mesh). */
export function ItemIcon({ itemId, ...props }: IconProps & { itemId: string }) {
  const Icon = ITEM_ICONS[itemId];
  return Icon ? <Icon {...props} /> : null;
}
