import type { FighterSpec } from '../game/types';

export function FighterPortrait({
  fighter,
  size = 56,
}: {
  fighter: FighterSpec;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0 rounded-control bg-background"
    >
      <rect width="64" height="64" rx="8" fill="#171412" />
      <circle cx="32" cy="32" r="22" fill={fighter.glowColor} />

      {/* Stickman torso + shoulders */}
      <path
        d="M20 58 L26 38 L38 38 L44 58"
        stroke={fighter.color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="32"
        y1="38"
        x2="32"
        y2="25"
        stroke={fighter.color}
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* Head */}
      <circle cx="32" cy="21" r="9.5" fill={fighter.color} stroke="#0e0c0a" strokeWidth="2" />
      {/* Visor eye */}
      <ellipse cx="35.5" cy="20.5" rx="2.8" ry="1.6" fill="#f7f3eb" />

      {/* Unique character silhouette mark */}
      {fighter.id === 'kael' && (
        <>
          <path d="M22 17 L42 17" stroke={fighter.accentColor} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M22 17 Q12 13 8 20 Q15 21 20 19" fill={fighter.color} />
          <circle cx="48" cy="36" r="5" fill={fighter.accentColor} />
        </>
      )}

      {fighter.id === 'veyra' && (
        <>
          <path
            d="M14 26 Q24 22 30 28 M12 34 Q22 30 30 35"
            stroke={fighter.accentColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}

      {fighter.id === 'bram' && (
        <>
          <circle cx="20" cy="40" r="6" fill={fighter.accentColor} stroke="#1d160b" strokeWidth="2" />
          <circle cx="44" cy="40" r="6" fill={fighter.accentColor} stroke="#1d160b" strokeWidth="2" />
        </>
      )}

      {fighter.id === 'sora' && (
        <>
          <path
            d="M13 17 L32 6 L51 17 Z"
            fill="#d4b87e"
            stroke="#1c1812"
            strokeWidth="2"
          />
          <line
            x1="41"
            y1="44"
            x2="56"
            y2="22"
            stroke={fighter.accentColor}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}

      {fighter.id === 'lyra' && (
        <>
          <path
            d="M19 15 A14 14 0 0 1 45 15"
            stroke={fighter.accentColor}
            strokeWidth="2.2"
            fill="none"
          />
          <line
            x1="44"
            y1="52"
            x2="50"
            y2="16"
            stroke="#b9e8f7"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="50" cy="16" r="3.5" fill={fighter.accentColor} />
        </>
      )}

      {fighter.id === 'hecker' && (
        <>
          {/* Terminal visor glasses */}
          <rect x="25" y="18" width="15" height="4.5" rx="1.5" fill="#091a10" stroke={fighter.accentColor} strokeWidth="1.4" />
          {/* Open hacking laptop weapon */}
          <path
            d="M36 42 L51 42 L57 27 L42 27 Z"
            fill="#14211b"
            stroke={fighter.accentColor}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M44 33 L42 36 L44 38 M49 33 L51 36 L49 38"
            stroke={fighter.accentColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <line x1="34" y1="43" x2="53" y2="43" stroke="#d8ffe9" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
