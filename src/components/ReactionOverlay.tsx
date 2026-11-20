import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ReactionBurst, ReactionKind } from '../types/live.ts';

interface Particle {
  id: string;
  kind: ReactionKind;
  color: string;
  offsetX: number;
  swayX: number;
  duration: number;
  scale: number;
  delay: number;
  emojiOverride?: string;
}

export interface TapHeartPop {
  id: string;
  x: number;
  y: number;
  color: string;
  rotate: number;
}

const HEART_COLORS = [
  '#FF3B5C',
  '#FF6B8B',
  '#F59E0B',
  '#FB7185',
  '#F472B6',
  '#FBBF24',
  '#FB923C',
];

function renderSymbol(
  kind: ReactionKind,
  color: string,
  emojiOverride?: string,
) {
  if (emojiOverride) {
    return (
      <span className="text-3xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)] select-none">
        {emojiOverride}
      </span>
    );
  }
  if (kind === 'heart') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="w-8 h-8 drop-shadow-[0_4px_12px_rgba(255,59,92,0.4)]"
        fill={color}
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  if (kind === 'sparkle') {
    return <span className="text-3xl drop-shadow-md select-none">✨</span>;
  }
  if (kind === 'clap') {
    return <span className="text-3xl drop-shadow-md select-none">🙌</span>;
  }
  return <span className="text-3xl drop-shadow-md select-none">🔥</span>;
}

interface ReactionOverlayProps {
  bursts: ReactionBurst[];
  tapPops?: TapHeartPop[];
}

export const ReactionOverlay: React.FC<ReactionOverlayProps> = ({
  bursts,
  tapPops = [],
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [processedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const newParticles: Particle[] = [];
    for (const burst of bursts) {
      if (processedIds.has(burst.id)) continue;
      processedIds.add(burst.id);
      if (processedIds.size > 120) {
        const oldest = processedIds.values().next().value;
        if (oldest) processedIds.delete(oldest);
      }

      const spawnCount = Math.min(burst.count, 40);
      for (let i = 0; i < spawnCount; i++) {
        const randomSweetEmoji =
          burst.kind === 'heart' && spawnCount >= 8 && Math.random() < 0.16
            ? ['🥰', '💕', '🫶'][Math.floor(Math.random() * 3)]
            : undefined;

        newParticles.push({
          id: `${burst.id}-${i}`,
          kind: burst.kind,
          color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
          offsetX: (Math.random() - 0.5) * 58,
          swayX: (Math.random() - 0.5) * 72,
          duration: 2.0 + Math.random() * 1.25,
          scale: 0.72 + Math.random() * 0.62,
          delay: (i / spawnCount) * (spawnCount > 10 ? 0.95 : 0.16),
          emojiOverride: randomSweetEmoji,
        });
      }
    }

    if (newParticles.length > 0) {
      setParticles((prev) => [...prev.slice(-90), ...newParticles]);
    }
  }, [bursts, processedIds]);

  const removeParticle = (id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <>
      {/* Right-Edge Rising Reaction Column */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-18 right-5 w-28 h-96 overflow-visible z-30"
      >
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                opacity: 0,
                y: 0,
                x: p.offsetX,
                scale: 0.25,
                rotate: (Math.random() - 0.5) * 20,
              }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: -330 - Math.random() * 60,
                x: [
                  p.offsetX,
                  p.offsetX + p.swayX * 0.65,
                  p.offsetX - p.swayX * 0.45,
                  p.offsetX + p.swayX * 0.3,
                ],
                scale: [0.35, p.scale * 1.18, p.scale, p.scale * 0.85],
                rotate: [0, 10, -10, 4],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.22, 1, 0.36, 1],
              }}
              onAnimationComplete={() => removeParticle(p.id)}
              className="absolute bottom-0 right-2"
            >
              {renderSymbol(p.kind, p.color, p.emojiOverride)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Real-Life Screen Tap Heart Pops */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden z-30"
      >
        <AnimatePresence>
          {tapPops.map((pop) => (
            <motion.div
              key={pop.id}
              initial={{
                opacity: 0.95,
                scale: 0.4,
                rotate: pop.rotate,
                y: 0,
              }}
              animate={{
                opacity: [0.95, 1, 0],
                scale: [0.4, 1.35, 1.05],
                y: -64,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
              style={{ left: pop.x - 28, top: pop.y - 28 }}
              className="absolute"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-14 h-14 drop-shadow-[0_6px_18px_rgba(255,59,92,0.55)]"
                fill={pop.color}
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
