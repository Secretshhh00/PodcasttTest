import React from 'react';
import type { GiftId } from '../types/live.ts';

interface GiftVisualProps {
  giftId: GiftId;
  className?: string;
}

export const GiftVisual: React.FC<GiftVisualProps> = ({
  giftId,
  className = 'w-10 h-10',
}) => {
  switch (giftId) {
    case 'shades':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <linearGradient id="shadesLens" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#18181B" />
              <stop offset="60%" stopColor="#27272A" />
              <stop offset="100%" stopColor="#09090B" />
            </linearGradient>
          </defs>
          <path
            d="M8 24h48v4c0 8-5 14-12 14-6 0-10-4-11.5-9h-1c-1.5 5-5.5 9-11.5 9-7 0-12-6-12-14v-4Z"
            fill="url(#shadesLens)"
            stroke="#F59E0B"
            strokeWidth="2.8"
          />
          <path
            d="M14 28l5 7M38 28l5 7"
            stroke="#FDE68A"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.7"
          />
          <circle cx="52" cy="17" r="2.2" fill="#FDE68A" />
        </svg>
      );

    case 'heart_glasses':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <path
            d="M20 42S9 34.5 9 25.5C9 21 12.5 18 16.5 18c2.2 0 4 1.2 4.5 2.8.5-1.6 2.3-2.8 4.5-2.8 4 0 7.5 3 7.5 7.5 0 9-13 16.5-13 16.5Z"
            fill="#FF3B5C"
            stroke="#FFE4E6"
            strokeWidth="2"
          />
          <path
            d="M44 42S33 34.5 33 25.5C33 21 36.5 18 40.5 18c2.2 0 4 1.2 4.5 2.8.5-1.6 2.3-2.8 4.5-2.8 4 0 7.5 3 7.5 7.5 0 9-13 16.5-13 16.5Z"
            fill="#FF3B5C"
            stroke="#FFE4E6"
            strokeWidth="2"
          />
          <path
            d="M29 24h6"
            stroke="#FFE4E6"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'headphones':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <path
            d="M14 34v-4c0-10 8-18 18-18s18 8 18 18v4"
            stroke="#FDBA74"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <rect
            x="9"
            y="31"
            width="10"
            height="19"
            rx="5"
            fill="#EA580C"
            stroke="#FED7AA"
            strokeWidth="2"
          />
          <rect
            x="45"
            y="31"
            width="10"
            height="19"
            rx="5"
            fill="#EA580C"
            stroke="#FED7AA"
            strokeWidth="2"
          />
        </svg>
      );

    case 'cat_ears':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <path
            d="M12 42c2-11 10-18 20-18s18 7 20 18"
            stroke="#F472B6"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M13 33 15 13l13 12Z"
            fill="#EC4899"
            stroke="#FCE7F3"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M51 33 49 13 36 25Z"
            fill="#EC4899"
            stroke="#FCE7F3"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M17 29 18 18l7 7Z" fill="#FDE68A" />
          <path d="M47 29 46 18l-7 7Z" fill="#FDE68A" />
        </svg>
      );

    case 'rose':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <radialGradient id="roseGrad" cx="50%" cy="35%" r="60%">
              <stop offset="0%" stopColor="#FF758F" />
              <stop offset="65%" stopColor="#FF3B5C" />
              <stop offset="100%" stopColor="#9F1239" />
            </radialGradient>
          </defs>
          <path
            d="M32 34v22"
            stroke="#22C55E"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M32 45c-6-2-10-6-10-10 5 0 9 3 10 10ZM32 49c6-2 10-6 10-10-5 0-9 3-10 10Z"
            fill="#16A34A"
          />
          <path
            d="M32 10c-8 0-14 6-14 14 0 9 7 14 14 14s14-5 14-14c0-8-6-14-14-14Z"
            fill="url(#roseGrad)"
          />
          <path
            d="M24 20c2-4 7-6 11-4 3 1.5 5 5 3 8-2 3-6 4-9 2-3-2-3-5-1-7"
            stroke="#FFE4E6"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'coffee':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <linearGradient id="cupGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          <path
            d="M23 14c0-3 3-4 2-7M32 13c0-3 3-4 2-7M41 14c0-3 3-4 2-7"
            stroke="#FDE68A"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M16 24h28v17c0 7.5-6 13-14 13s-14-5.5-14-13V24Z"
            fill="url(#cupGrad)"
          />
          <path
            d="M44 27h4.5a5.5 5.5 0 0 1 0 11H44"
            stroke="#F59E0B"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <ellipse cx="30" cy="24" rx="14" ry="3.5" fill="#78350F" />
          <path
            d="M14 55h34"
            stroke="#FDE68A"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>
      );

    case 'boba':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <path
            d="M36 8l-4 14"
            stroke="#FDE68A"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M19 22h26l-3 32H22l-3-32Z"
            fill="#34D399"
            stroke="#A7F3D0"
            strokeWidth="2.2"
          />
          <ellipse cx="32" cy="22" rx="13" ry="3.5" fill="#ECFDF5" />
          <circle cx="27" cy="48" r="2.2" fill="#064E3B" />
          <circle cx="33" cy="49" r="2.2" fill="#064E3B" />
          <circle cx="38" cy="47" r="2.2" fill="#064E3B" />
        </svg>
      );

    case 'mic':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <linearGradient id="micGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FDBA74" />
              <stop offset="100%" stopColor="#EA580C" />
            </linearGradient>
          </defs>
          <rect x="23" y="10" width="18" height="27" rx="9" fill="url(#micGrad)" />
          <path
            d="M26 19h12M26 24h12M26 29h12"
            stroke="#431407"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.55"
          />
          <path
            d="M17 28v4a15 15 0 0 0 30 0v-4"
            stroke="#E4E4E7"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M32 47v8M23 55h18"
            stroke="#E4E4E7"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'heart_box':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <linearGradient id="heartStorm" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F472B6" />
              <stop offset="50%" stopColor="#FF3B5C" />
              <stop offset="100%" stopColor="#BE185D" />
            </linearGradient>
          </defs>
          <path
            d="M32 52S11 39.2 11 24.5C11 17.6 16.4 12 23.2 12c3.9 0 7.4 1.9 8.8 4.8 1.4-2.9 4.9-4.8 8.8-4.8C47.6 12 53 17.6 53 24.5 53 39.2 32 52 32 52Z"
            fill="url(#heartStorm)"
          />
          <path
            d="M21 20c-2 1.8-3 4.2-2.6 6.8"
            stroke="#FCE7F3"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="49" cy="14" r="2.5" fill="#FDE68A" />
          <circle cx="15" cy="13" r="2" fill="#FDE68A" />
        </svg>
      );

    case 'crown':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <linearGradient id="crownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          <path
            d="M11 45 8 20l14 11 10-16 10 16 14-11-3 25H11Z"
            fill="url(#crownGrad)"
          />
          <rect x="11" y="47" width="42" height="5" rx="2.5" fill="#FBBF24" />
          <circle cx="32" cy="13" r="3" fill="#FEF08A" />
          <circle cx="8" cy="18" r="2.5" fill="#FEF08A" />
          <circle cx="56" cy="18" r="2.5" fill="#FEF08A" />
          <circle cx="32" cy="35" r="3.2" fill="#FF3B5C" />
        </svg>
      );

    case 'star_rain':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <path
            d="m32 10 5.4 11.4 12.6 1.8-9.1 8.9 2.2 12.5L32 38.7 20.9 44.6l2.2-12.5-9.1-8.9 12.6-1.8L32 10Z"
            fill="#FBBF24"
            stroke="#FEF08A"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="14" r="2.5" fill="#C4B5FD" />
          <circle cx="50" cy="48" r="3" fill="#C4B5FD" />
        </svg>
      );

    case 'horizon_galaxy':
      return (
        <svg viewBox="0 0 64 64" className={className} fill="none">
          <defs>
            <radialGradient id="planetGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#7DD3FC" />
              <stop offset="55%" stopColor="#0284C7" />
              <stop offset="100%" stopColor="#1E1B4B" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="15" fill="url(#planetGrad)" />
          <ellipse
            cx="32"
            cy="32"
            rx="26"
            ry="8"
            transform="rotate(-22 32 32)"
            stroke="#FDE68A"
            strokeWidth="3"
          />
          <circle cx="14" cy="16" r="2.2" fill="#FDE68A" />
          <circle cx="50" cy="46" r="2.5" fill="#BAE6FD" />
          <circle cx="48" cy="15" r="1.8" fill="#FFFFFF" />
        </svg>
      );
  }
};
