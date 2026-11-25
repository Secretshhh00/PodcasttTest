import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

interface VideoStreamPlayerProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
  unmuteLabel?: string;
  unmuteButtonClassName?: string;
  fallbackFrame?: string | null;
  connectingLabel?: string;
  onDecodedVideoChange?: (decoded: boolean) => void;
}

/**
 * Plays a MediaStream reliably across desktop & mobile browsers.
 * - Automatically falls back to muted playback if unmuted autoplay is blocked,
 *   showing a 1-tap unmute pill while keeping the face visible immediately.
 * - Detects whether real WebRTC video pixels (videoWidth > 0) are decoding.
 * - Supports seamless fallbackFrame rendering if WebRTC UDP/NAT is blocked.
 */
export const VideoStreamPlayer: React.FC<VideoStreamPlayerProps> = ({
  stream,
  muted = false,
  mirrored = false,
  className = 'w-full h-full object-cover',
  unmuteLabel = 'Tap to Unmute',
  unmuteButtonClassName = 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  fallbackFrame = null,
  connectingLabel,
  onDecodedVideoChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [autoplayMutedFallback, setAutoplayMutedFallback] = useState(false);
  const [hasDecodedVideo, setHasDecodedVideo] = useState(false);
  const decodedCallbackRef = useRef(onDecodedVideoChange);
  decodedCallbackRef.current = onDecodedVideoChange;

  const updateDecoded = useCallback((el: HTMLVideoElement | null) => {
    const ok = Boolean(
      el &&
        el.srcObject &&
        el.readyState >= 2 &&
        el.videoWidth > 0 &&
        el.videoHeight > 0,
    );
    setHasDecodedVideo((prev) => {
      if (prev !== ok) {
        decodedCallbackRef.current?.(ok);
      }
      return ok;
    });
  }, []);

  const attemptPlay = useCallback(
    async (el: HTMLVideoElement, desiredMuted: boolean) => {
      el.muted = desiredMuted;
      try {
        await el.play();
        if (!desiredMuted) {
          setAutoplayMutedFallback(false);
        }
      } catch {
        // Browser blocked unmuted autoplay — mute so camera face displays immediately
        if (!desiredMuted) {
          el.muted = true;
          setAutoplayMutedFallback(true);
          try {
            await el.play();
          } catch {
            // Ignore secondary play error
          }
        }
      }
      updateDecoded(el);
    },
    [updateDecoded],
  );

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!stream) {
      el.srcObject = null;
      setAutoplayMutedFallback(false);
      setHasDecodedVideo(false);
      decodedCallbackRef.current?.(false);
      return;
    }

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    const effectiveMuted = muted || autoplayMutedFallback;
    void attemptPlay(el, effectiveMuted);

    const handleTrackChange = () => {
      if (videoRef.current) {
        void attemptPlay(
          videoRef.current,
          muted || autoplayMutedFallback,
        );
      }
    };

    const probeTimer = window.setInterval(() => {
      updateDecoded(videoRef.current);
    }, 450);

    stream.addEventListener('addtrack', handleTrackChange);
    return () => {
      window.clearInterval(probeTimer);
      stream.removeEventListener('addtrack', handleTrackChange);
    };
  }, [attemptPlay, autoplayMutedFallback, muted, stream, updateDecoded]);

  useEffect(() => {
    if (muted) {
      setAutoplayMutedFallback(false);
    }
  }, [muted]);

  const handleUnmuteTap = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAutoplayMutedFallback(false);
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    try {
      await el.play();
    } catch {
      el.muted = true;
      setAutoplayMutedFallback(true);
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted || autoplayMutedFallback}
        onLoadedMetadata={(e) => {
          void attemptPlay(e.currentTarget, muted || autoplayMutedFallback);
          updateDecoded(e.currentTarget);
        }}
        onLoadedData={(e) => updateDecoded(e.currentTarget)}
        onPlaying={(e) => updateDecoded(e.currentTarget)}
        className={`${className} ${mirrored ? '-scale-x-100' : ''}`}
      />

      {!hasDecodedVideo && fallbackFrame && (
        <img
          src={fallbackFrame}
          alt="Live camera feed"
          className={`absolute inset-0 z-10 ${className} ${
            mirrored ? '-scale-x-100' : ''
          }`}
        />
      )}

      {!hasDecodedVideo && !fallbackFrame && connectingLabel && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="px-3.5 py-2 rounded-xl bg-black/65 backdrop-blur-md border border-white/10 text-[11px] text-zinc-200 text-center">
            {connectingLabel}
          </div>
        </div>
      )}

      {!muted && autoplayMutedFallback && stream && (
        <button
          type="button"
          onClick={handleUnmuteTap}
          className={`absolute z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-amber-400/45 text-xs font-semibold text-amber-200 shadow-lg transition-colors cursor-pointer whitespace-nowrap ${unmuteButtonClassName}`}
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-300" />
          <span>{unmuteLabel}</span>
        </button>
      )}
    </>
  );
};
