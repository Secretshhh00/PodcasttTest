import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { FacePose } from '../hooks/useFaceTracker.ts';
import type { FaceFilterId, FaceFilterState } from '../types/live.ts';

interface FaceFilterOverlayProps {
  faceFilter: FaceFilterState;
  facePose: FacePose | null;
  isPortrait: boolean;
  onDragAdjust?: (offsetX: number, offsetY: number) => void;
}

const BASE_TOP_PERCENT: Record<FaceFilterId, number> = {
  shades: 37,
  heart_glasses: 37,
  headphones: 32,
  crown: 17,
  cat_ears: 18,
};

export const FaceFilterOverlay: React.FC<FaceFilterOverlayProps> = ({
  faceFilter,
  facePose,
  isPortrait,
  onDragAdjust,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  } | null>(null);

  const active = faceFilter.activeFilter;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onDragAdjust) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: faceFilter.offsetX,
      origOffsetY: faceFilter.offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragOrigin.current || !containerRef.current || !onDragAdjust) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragOrigin.current.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragOrigin.current.startY) / rect.height) * 100;
    onDragAdjust(
      Math.max(-30, Math.min(30, dragOrigin.current.origOffsetX + dxPct)),
      Math.max(-30, Math.min(30, dragOrigin.current.origOffsetY + dyPct)),
    );
  };

  const handlePointerUp = () => {
    dragOrigin.current = null;
  };

  const renderFilterArt = (filterId: FaceFilterId) => {
    switch (filterId) {
      case 'shades':
        return (
          <svg
            viewBox="0 0 280 96"
            className="w-full h-auto drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
            fill="none"
          >
            <defs>
              <linearGradient id="arShadeLens" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#18181B" stopOpacity="0.96" />
                <stop offset="55%" stopColor="#09090B" stopOpacity="0.93" />
                <stop offset="100%" stopColor="#27272A" stopOpacity="0.96" />
              </linearGradient>
              <linearGradient id="arShadeRim" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="50%" stopColor="#FDE68A" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <path d="M6 26h20M254 26h20" stroke="url(#arShadeRim)" strokeWidth="5" strokeLinecap="round" />
            <path
              d="M22 18h96c4 0 7 3 7 8 0 24-15 48-44 48-28 0-59-16-59-48v-8Z"
              fill="url(#arShadeLens)"
              stroke="url(#arShadeRim)"
              strokeWidth="4.5"
            />
            <path
              d="M258 18h-96c-4 0-7 3-7 8 0 24 15 48 44 48 28 0 59-16 59-48v-8Z"
              fill="url(#arShadeLens)"
              stroke="url(#arShadeRim)"
              strokeWidth="4.5"
            />
            <path
              d="M124 27c8-6 24-6 32 0"
              stroke="url(#arShadeRim)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M42 29l20 26M58 29l12 16M176 29l20 26M192 29l12 16"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.32"
            />
          </svg>
        );

      case 'heart_glasses':
        return (
          <svg
            viewBox="0 0 280 110"
            className="w-full h-auto drop-shadow-[0_10px_24px_rgba(255,59,92,0.45)]"
            fill="none"
          >
            <path
              d="M78 92S24 62 24 32c0-13 10-22 23-22 10 0 18 6 21 13 3-7 11-13 21-13 13 0 23 9 23 22 0 30-34 60-34 60Z"
              fill="#FF3B5C"
              fillOpacity="0.82"
              stroke="#FFF1F2"
              strokeWidth="4.5"
            />
            <path
              d="M202 92s-54-30-54-60c0-13 10-22 23-22 10 0 18 6 21 13 3-7 11-13 21-13 13 0 23 9 23 22 0 30-34 60-34 60Z"
              fill="#FF3B5C"
              fillOpacity="0.82"
              stroke="#FFF1F2"
              strokeWidth="4.5"
            />
            <path d="M112 32c14-9 42-9 56 0" stroke="#FFF1F2" strokeWidth="5" strokeLinecap="round" />
            <path d="M40 28c-4 5-5 11-2 17M164 28c-4 5-5 11-2 17" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
          </svg>
        );

      case 'headphones':
        return (
          <svg
            viewBox="0 0 320 220"
            className="w-full h-auto drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
            fill="none"
          >
            <path
              d="M46 132V98C46 46 97 10 160 10s114 36 114 88v34"
              stroke="#FB923C"
              strokeWidth="16"
              strokeLinecap="round"
            />
            <path
              d="M64 82C72 40 112 14 160 14s88 26 96 68"
              stroke="#27272A"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <rect x="22" y="108" width="38" height="86" rx="19" fill="#18181B" stroke="#FDBA74" strokeWidth="5" />
            <rect x="260" y="108" width="38" height="86" rx="19" fill="#18181B" stroke="#FDBA74" strokeWidth="5" />
            <circle cx="41" cy="151" r="9" fill="#F59E0B" />
            <circle cx="279" cy="151" r="9" fill="#F59E0B" />
          </svg>
        );

      case 'crown':
        return (
          <svg
            viewBox="0 0 240 140"
            className="w-full h-auto drop-shadow-[0_10px_28px_rgba(245,158,11,0.55)]"
            fill="none"
          >
            <defs>
              <linearGradient id="arCrownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>
            <path
              d="M36 108 18 38l54 34L120 18l48 54 54-34-18 70H36Z"
              fill="url(#arCrownGrad)"
              stroke="#FEF9C3"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <rect x="34" y="110" width="172" height="16" rx="8" fill="#FBBF24" stroke="#FEF9C3" strokeWidth="3" />
            <circle cx="120" cy="16" r="8" fill="#FEF08A" />
            <circle cx="18" cy="34" r="7" fill="#FEF08A" />
            <circle cx="222" cy="34" r="7" fill="#FEF08A" />
            <circle cx="120" cy="78" r="10" fill="#FF3B5C" stroke="#FFE4E6" strokeWidth="2.5" />
          </svg>
        );

      case 'cat_ears':
        return (
          <svg
            viewBox="0 0 260 130"
            className="w-full h-auto drop-shadow-[0_8px_24px_rgba(244,114,182,0.5)]"
            fill="none"
          >
            <path
              d="M34 114c12-40 50-62 96-62s84 22 96 62"
              stroke="#F472B6"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path d="M36 86 44 14l56 44Z" fill="#EC4899" stroke="#FCE7F3" strokeWidth="4" strokeLinejoin="round" />
            <path d="M224 86 216 14l-56 44Z" fill="#EC4899" stroke="#FCE7F3" strokeWidth="4" strokeLinejoin="round" />
            <path d="M51 73 56 32l31 24Z" fill="#FDE68A" />
            <path d="M209 73 204 32l-31 24Z" fill="#FDE68A" />
          </svg>
        );
    }
  };

  // Compute live face-tracked anchor or graceful centered fallback
  const isTracked = Boolean(
    faceFilter.faceTrackingEnabled && facePose && facePose.detected,
  );

  let topPct = active ? BASE_TOP_PERCENT[active] : 37;
  let leftPct = 50;
  let widthPct =
    active === 'headphones'
      ? isPortrait
        ? 64
        : 34
      : isPortrait
        ? 48
        : 24;
  let rotateDeg = 0;

  if (active && isTracked && facePose) {
    rotateDeg = facePose.angleDeg;
    if (active === 'shades' || active === 'heart_glasses') {
      leftPct = facePose.eyeCenterX;
      topPct = facePose.eyeCenterY;
      widthPct = Math.max(10, Math.min(72, facePose.eyeDistPct * 2.55));
    } else if (active === 'headphones') {
      leftPct = (facePose.eyeCenterX + facePose.headTopX) * 0.5;
      topPct = facePose.eyeCenterY - facePose.eyeDistPct * 0.38;
      widthPct = Math.max(14, Math.min(82, facePose.eyeDistPct * 3.45));
    } else {
      // crown / cat_ears
      leftPct = facePose.headTopX;
      topPct = facePose.headTopY;
      widthPct = Math.max(
        10,
        Math.min(70, facePose.eyeDistPct * (active === 'cat_ears' ? 2.75 : 2.45)),
      );
    }
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-15 overflow-hidden"
    >
      <AnimatePresence>
        {active && (
          <motion.div
            key={active}
            initial={{ opacity: 0, scale: 0.65 }}
            animate={{
              opacity: 1,
              scale: faceFilter.scale,
              rotate: rotateDeg,
            }}
            exit={{ opacity: 0, scale: 0.75 }}
            transition={{
              opacity: { duration: 0.2 },
              scale: { type: 'spring', stiffness: 360, damping: 24 },
              rotate: { duration: 0.1, ease: 'linear' },
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title="Face-tracked AR filter (drag to nudge offset)"
            style={{
              top: `${topPct + faceFilter.offsetY}%`,
              left: `${leftPct + faceFilter.offsetX}%`,
              width: `${widthPct}%`,
              transition: isTracked
                ? 'top 75ms linear, left 75ms linear, width 90ms linear'
                : 'top 200ms ease, left 200ms ease',
            }}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none"
          >
            {renderFilterArt(active)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
