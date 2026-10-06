/* eslint-disable react/prop-types -- no prop-types dependency in this project */

// A chunky cartoon trophy cup, matching ClubBadge's Clash-of-Clans style
// (thick dark outline, gold gradient, shine highlight) for the one trophy
// shown in the club perks/rewards lists - distinct from the flat, single-
// colour IconTrophy used in nav/leaderboard chrome (see GameIcons.jsx).

export default function ClubTrophyIcon({ size = 28, className = '' }) {
  return (
    <svg
      className={`club-trophy-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Trophy"
    >
      <defs>
        <linearGradient id="clubTrophyGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="55%" stopColor="#ffc93f" />
          <stop offset="100%" stopColor="#e89a0c" />
        </linearGradient>
      </defs>
      {/* Handles */}
      <path
        d="M11 10H5v3a7 7 0 0 0 6 6.9"
        fill="none"
        stroke="#3d2b1a"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 10h6v3a7 7 0 0 1-6 6.9"
        fill="none"
        stroke="#3d2b1a"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Base */}
      <path
        d="M13 33h14l-1.4 4H14.4z"
        fill="#e89a0c"
        stroke="#3d2b1a"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <rect
        x="15.5"
        y="27.5"
        width="9"
        height="6.5"
        rx="1.5"
        fill="#ffd666"
        stroke="#3d2b1a"
        strokeWidth="2.6"
      />
      {/* Cup */}
      <path
        d="M10 9h20v7c0 7.2-5 12.5-10 12.5S10 23.2 10 16z"
        fill="url(#clubTrophyGold)"
        stroke="#3d2b1a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Shine */}
      <path
        d="M14.5 12c-.6 4.4 1 8.4 4 10.8"
        fill="none"
        stroke="#fff6d8"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Star */}
      <path
        d="M20 13.2l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"
        fill="#fff6d8"
        stroke="#c97b10"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
