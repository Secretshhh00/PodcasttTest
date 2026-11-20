import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  CameraOff,
  Check,
  Eye,
  FlipHorizontal2,
  Heart,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music2,
  Pin,
  RefreshCw,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  COZY_BACKDROP_URL,
  HOST_AVATAR_URL,
  SUGGESTED_SENDERS,
} from '../data/podcastData.ts';
import type {
  ChatMessage,
  FaceFilterState,
  HudScale,
  LiveState,
  ReactionBurst,
  ReactionKind,
} from '../types/live.ts';
import { useCameraStream } from '../hooks/useCameraStream.ts';
import { useFaceTracker } from '../hooks/useFaceTracker.ts';
import { FaceFilterOverlay } from './FaceFilterOverlay.tsx';
import { GiftVisual } from './GiftVisual.tsx';
import { ReactionOverlay, type TapHeartPop } from './ReactionOverlay.tsx';

interface LiveStageViewProps {
  state: LiveState;
  recentBursts: ReactionBurst[];
  onTriggerBurst: (kind: ReactionKind, count: number) => void;
  onPushChat: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  onUpdateFilter: (patch: Partial<FaceFilterState>) => void;
  onToggleAudio?: () => void;
  onSwitchToDashboard?: () => void;
}

const TAP_COLORS = ['#FF3B5C', '#FF6B8B', '#F59E0B', '#F472B6'];

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(startedAt: number | null, now: number): string {
  if (!startedAt) return '00:00';
  const totalSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) return `${hrs}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

const SCALE_STYLES: Record<
  HudScale,
  {
    hostAvatar: string;
    hostName: string;
    hostMeta: string;
    liveBadge: string;
    viewerBadge: string;
    titleText: string;
    chatAvatar: string;
    chatText: string;
    chatBubble: string;
    qaText: string;
    qaHeader: string;
    giftSender: string;
    giftSub: string;
    giftCombo: string;
    giftSvg: string;
    inputHeight: string;
    actionBtn: string;
  }
> = {
  normal: {
    hostAvatar: 'w-9 h-9',
    hostName: 'text-sm',
    hostMeta: 'text-[11px]',
    liveBadge: 'text-xs px-3 py-1.5',
    viewerBadge: 'text-xs px-3 py-1.5',
    titleText: 'text-xs px-3 py-1',
    chatAvatar: 'w-6 h-6 text-[11px]',
    chatText: 'text-[13px] leading-[1.35]',
    chatBubble: 'px-3 py-1.5 rounded-xl',
    qaText: 'text-sm',
    qaHeader: 'text-xs',
    giftSender: 'text-xs',
    giftSub: 'text-[11px]',
    giftCombo: 'text-xl',
    giftSvg: 'w-11 h-11',
    inputHeight: 'h-10 text-xs',
    actionBtn: 'w-10 h-10',
  },
  large: {
    hostAvatar: 'w-10 h-10 sm:w-11 sm:h-11',
    hostName: 'text-sm sm:text-base',
    hostMeta: 'text-[11px] sm:text-xs',
    liveBadge: 'text-xs sm:text-sm px-3.5 py-1.5',
    viewerBadge: 'text-xs sm:text-sm px-3.5 py-1.5',
    titleText: 'text-xs sm:text-sm px-3.5 py-1.5',
    chatAvatar: 'w-6 h-6 sm:w-7 sm:h-7 text-[11px] sm:text-xs',
    chatText: 'text-[14px] sm:text-[15px] leading-[1.38]',
    chatBubble: 'px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl',
    qaText: 'text-[14px] sm:text-[15px] leading-snug',
    qaHeader: 'text-xs sm:text-[13px]',
    giftSender: 'text-sm',
    giftSub: 'text-xs',
    giftCombo: 'text-2xl',
    giftSvg: 'w-11 h-11 sm:w-12 sm:h-12',
    inputHeight: 'h-11 sm:h-12 text-xs sm:text-sm',
    actionBtn: 'w-11 h-11 sm:w-12 sm:h-12',
  },
  xlarge: {
    hostAvatar: 'w-12 h-12',
    hostName: 'text-lg',
    hostMeta: 'text-[13px]',
    liveBadge: 'text-sm px-4 py-2',
    viewerBadge: 'text-sm px-4 py-2',
    titleText: 'text-sm px-4 py-1.5',
    chatAvatar: 'w-8 h-8 text-xs',
    chatText: 'text-base sm:text-[17px] leading-[1.4]',
    chatBubble: 'px-4 py-2.5 rounded-2xl',
    qaText: 'text-base sm:text-lg leading-snug',
    qaHeader: 'text-xs sm:text-sm',
    giftSender: 'text-base',
    giftSub: 'text-xs sm:text-sm',
    giftCombo: 'text-3xl',
    giftSvg: 'w-14 h-14',
    inputHeight: 'h-12 text-sm sm:text-base',
    actionBtn: 'w-12 h-12',
  },
};

export const LiveStageView: React.FC<LiveStageViewProps> = ({
  state,
  recentBursts,
  onTriggerBurst,
  onPushChat,
  onUpdateFilter,
  onToggleAudio,
  onSwitchToDashboard,
}) => {
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const camera = useCameraStream({ autoStart: true });
  const isFaceTrackingActive =
    camera.status === 'active' &&
    Boolean(state.faceFilter.activeFilter && state.faceFilter.faceTrackingEnabled);

  const faceTracker = useFaceTracker({
    videoEl: camera.videoEl,
    active: isFaceTrackingActive,
    mirrored: camera.mirrored,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [displayViewers, setDisplayViewers] = useState(state.viewerCount);
  const [quickComment, setQuickComment] = useState('');
  const [imgAvatarFailed, setImgAvatarFailed] = useState(false);
  const [imgBackdropFailed, setImgBackdropFailed] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [tapPops, setTapPops] = useState<TapHeartPop[]>([]);

  const hideTimerRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const sz = SCALE_STYLES[state.hudScale ?? 'large'];

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setDisplayViewers(state.viewerCount);
  }, [state.viewerCount]);

  // Noticeable organic TikTok-like viewer fluctuations (+ / -)
  useEffect(() => {
    if (!state.viewerDriftEnabled || !state.isLive) return;
    let timeoutId: number;

    const scheduleNext = () => {
      const delay = 1400 + Math.random() * 1600;
      timeoutId = window.setTimeout(() => {
        setDisplayViewers((prev) => {
          const swing = Math.floor(Math.random() * 15) - 6;
          const minFloor = Math.max(12, Math.round(state.viewerCount * 0.78));
          const maxCeil = Math.round(state.viewerCount * 1.28) + 18;
          return Math.min(maxCeil, Math.max(minFloor, prev + swing));
        });
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => window.clearTimeout(timeoutId);
  }, [state.isLive, state.viewerCount, state.viewerDriftEnabled]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [state.chatMessages]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const bumpControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2800);
  };

  useEffect(() => {
    bumpControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await (stageRootRef.current ?? document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  };

  const activeQa = useMemo(
    () => state.qaQueue.find((q) => q.id === state.activeQaId) ?? null,
    [state.activeQaId, state.qaQueue],
  );

  const handleQuickSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickComment.trim();
    if (!trimmed) return;
    onPushChat({
      username: 'podcastHorizon',
      badge: 'host',
      text: trimmed,
      avatarColor: '#F59E0B',
    });
    setQuickComment('');
  };

  const handleStageShare = async () => {
    onTriggerBurst('sparkle', 5);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  // Real-life TikTok double-tap anywhere on live video to pop floating hearts
  const handleStageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, form, select, a')) return;

    const now = Date.now();
    const isDoubleTap = now - lastTapTimeRef.current < 340;
    lastTapTimeRef.current = now;

    if (isDoubleTap && frameRef.current) {
      const rect = frameRef.current.getBoundingClientRect();
      const popId = `tap-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const nextPop: TapHeartPop = {
        id: popId,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        color: TAP_COLORS[Math.floor(Math.random() * TAP_COLORS.length)],
        rotate: (Math.random() - 0.5) * 28,
      };
      setTapPops((prev) => [...prev.slice(-10), nextPop]);
      window.setTimeout(() => {
        setTapPops((prev) => prev.filter((p) => p.id !== popId));
      }, 780);
      onTriggerBurst('heart', 2);
    }
  };

  const isPortrait = state.aspectMode === '9:16';

  const frameClass = isPortrait
    ? isFullscreen
      ? 'relative h-screen max-h-screen aspect-[9/16] max-w-full overflow-hidden bg-[#101218] shadow-[0_0_80px_rgba(0,0,0,0.85)]'
      : 'relative h-[min(94vh,900px)] aspect-[9/16] max-w-[96vw] rounded-[28px] overflow-hidden bg-[#101218] ring-1 ring-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.85)]'
    : 'relative w-full h-full overflow-hidden bg-[#101218]';

  // Responsive laptop 16:9 chat sizing vs mobile 9:16 sizing
  const chatMaxHeightClass = isPortrait
    ? 'max-h-[clamp(210px,36vh,340px)]'
    : 'max-h-[clamp(160px,31vh,290px)]';

  const bottomLeftContainerClass = isPortrait
    ? 'absolute inset-x-0 bottom-0 z-20 px-4 pb-4 flex flex-col justify-end'
    : 'absolute left-4 sm:left-6 bottom-4 sm:bottom-5 z-20 w-[min(86vw,460px)] lg:w-[clamp(340px,36vw,490px)] flex flex-col justify-end';

  return (
    <div
      ref={stageRootRef}
      onMouseMove={bumpControls}
      onTouchStart={bumpControls}
      className="relative w-screen h-screen bg-[#07080C] flex items-center justify-center overflow-hidden select-none"
    >
      {isPortrait && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] rounded-full bg-amber-500/10 blur-[140px]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/3 w-[420px] h-[420px] rounded-full bg-[#FF3B5C]/10 blur-[130px]" />
        </div>
      )}

      {/* Discreet Studio Utility Bar */}
      <div
        className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/12 text-xs text-zinc-200 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={camera.toggleCamera}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          title={camera.status === 'active' ? 'Turn off camera' : 'Turn on camera'}
        >
          {camera.status === 'active' ? (
            <>
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cam On</span>
            </>
          ) : (
            <>
              <CameraOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Cam Off</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => camera.setMirrored((m) => !m)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            camera.mirrored ? 'bg-white/15 text-white' : 'hover:bg-white/10'
          }`}
          title="Mirror camera horizontally"
        >
          <FlipHorizontal2 className="w-3.5 h-3.5" />
          <span>Mirror</span>
        </button>

        {onToggleAudio && (
          <button
            type="button"
            onClick={onToggleAudio}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              state.ambientAudio.enabled
                ? 'bg-amber-500/20 text-amber-200'
                : 'hover:bg-white/10'
            }`}
            title="Toggle chill podcast background audio"
          >
            {state.ambientAudio.enabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-amber-300" />
                <span>Audio On</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Audio Off</span>
              </>
            )}
          </button>
        )}

        {camera.devices.length > 1 && (
          <select
            value={camera.selectedDeviceId}
            onChange={(e) => camera.switchDevice(e.target.value)}
            className="bg-zinc-900/90 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none max-w-[140px] truncate cursor-pointer"
            aria-label="Select camera"
          >
            {camera.devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Exit Fullscreen</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fullscreen</span>
            </>
          )}
        </button>

        {onSwitchToDashboard && (
          <button
            type="button"
            onClick={onSwitchToDashboard}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer whitespace-nowrap"
            title="Switch to Control Panel"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Panel</span>
          </button>
        )}
      </div>

      {/* Main Broadcast Stage Canvas (9:16 TikTok or 16:9 Laptop Widescreen) */}
      <div ref={frameRef} onClick={handleStageTap} className={frameClass}>
        {/* Layer 1: Live Camera Feed or Cozy Studio Fallback */}
        <div className="absolute inset-0 bg-[#0D0E14]">
          {camera.status === 'active' ? (
            <video
              ref={camera.attachVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                camera.mirrored ? '-scale-x-100' : ''
              }`}
            />
          ) : (
            <div className="relative w-full h-full">
              {!imgBackdropFailed ? (
                <img
                  src={COZY_BACKDROP_URL}
                  alt="podcastHorizon cozy studio backdrop"
                  referrerPolicy="no-referrer"
                  onError={() => setImgBackdropFailed(true)}
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1B1512] via-[#101219] to-[#090A0F]" />
              )}
              <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center">
                {camera.status === 'requesting' && (
                  <div className="px-4 py-3 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-sm text-zinc-200 max-w-xs">
                    Waiting for camera permission…
                  </div>
                )}
                {camera.status === 'error' && (
                  <div className="px-5 py-4 rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 max-w-xs space-y-3">
                    <p className="text-xs text-zinc-200 leading-relaxed">
                      {camera.errorMessage}
                    </p>
                    <button
                      type="button"
                      onClick={() => camera.startCamera()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF3B5C] hover:bg-[#ff5270] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Enable Camera</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Layer 1.5: Face-Tracked Wearable AR Gift Filters */}
        <FaceFilterOverlay
          faceFilter={state.faceFilter}
          facePose={faceTracker.pose}
          isPortrait={isPortrait}
          onDragAdjust={(offsetX, offsetY) =>
            onUpdateFilter({ offsetX, offsetY })
          }
        />

        {/* Measured Top & Bottom Scrims */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/75 via-black/30 to-transparent z-10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black/85 via-black/40 to-transparent z-10"
        />

        {/* Layer 2: Top Broadcast HUD */}
        <div className="relative z-20 px-4 sm:px-5 pt-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="inline-flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/12 max-w-full">
              <div
                className={`relative ${sz.hostAvatar} rounded-full overflow-hidden shrink-0 ring-2 ring-[#FF3B5C]`}
              >
                {!imgAvatarFailed ? (
                  <img
                    src={HOST_AVATAR_URL}
                    alt="podcastHorizon host avatar"
                    referrerPolicy="no-referrer"
                    onError={() => setImgAvatarFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-200">
                    pH
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-display font-bold ${sz.hostName} text-white truncate`}
                  >
                    {state.hostName}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    Host
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${sz.hostMeta} text-zinc-300 font-mono tabular-nums`}
                >
                  <span>{formatCompact(state.likeCount)} likes</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(state.startedAt, nowMs)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1.5 pl-1">
              <div
                className={`rounded-xl bg-black/45 backdrop-blur-sm font-medium text-amber-100/95 max-w-[320px] truncate ${sz.titleText}`}
              >
                {state.streamTitle}
              </div>

              <AnimatePresence>
                {state.nowPlaying.visible && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/30 text-xs text-amber-200 max-w-[320px]"
                  >
                    <Music2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="truncate">
                      {state.nowPlaying.track} · {state.nowPlaying.artist}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Top Viewers Avatars + Fluctuating Viewer Count + LIVE Badge */}
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <div className="hidden sm:flex items-center -space-x-2 pr-0.5">
              {SUGGESTED_SENDERS.slice(0, 3).map((viewer) => (
                <div
                  key={viewer.name}
                  className="w-7 h-7 rounded-full border-2 border-[#101218] flex items-center justify-center text-[10px] font-bold text-white shadow"
                  style={{ backgroundColor: viewer.color }}
                  title={viewer.name}
                >
                  {viewer.name.slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>

            <div
              className={`inline-flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/12 font-mono tabular-nums text-white ${sz.viewerBadge}`}
            >
              <Eye className="w-4 h-4 text-zinc-300" />
              <motion.span
                key={displayViewers}
                initial={{ opacity: 0.75, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {displayViewers}
              </motion.span>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide uppercase ${sz.liveBadge} ${
                state.isLive
                  ? 'bg-[#FF3B5C] text-white shadow-[0_0_20px_rgba(255,59,92,0.45)]'
                  : 'bg-zinc-800/90 text-zinc-300 border border-white/15'
              }`}
            >
              {state.isLive && (
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              )}
              <span>{state.isLive ? 'LIVE' : 'STANDBY'}</span>
            </div>
          </div>
        </div>

        {/* Layer 3: Animated Gift Combo Banners */}
        <div
          className={`relative z-30 px-4 sm:px-5 mt-4 flex flex-col gap-2.5 pointer-events-none ${
            isPortrait ? 'max-w-[90%]' : 'max-w-[440px]'
          }`}
        >
          <AnimatePresence mode="popLayout">
            {state.activeGifts.map((gift) => (
              <motion.div
                key={gift.id}
                layout
                initial={{ opacity: 0, x: -48, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -32, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="inline-flex items-center gap-3 pl-2 pr-4 py-2 rounded-full backdrop-blur-md border border-white/18 shadow-2xl w-fit"
                style={{
                  background: `linear-gradient(90deg, ${gift.accentHex}45 0%, rgba(16,18,24,0.86) 72%)`,
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: gift.senderColor }}
                >
                  {gift.sender.slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div
                    className={`${sz.giftSender} font-semibold text-white truncate max-w-[160px]`}
                  >
                    {gift.sender}
                  </div>
                  <div className={`${sz.giftSub} text-amber-100/95 truncate`}>
                    sent {gift.giftName}
                  </div>
                </div>

                <motion.div
                  key={`vis-${gift.comboCount}`}
                  initial={{ scale: 1.3, rotate: -6 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  className="shrink-0"
                >
                  <GiftVisual giftId={gift.giftId} className={sz.giftSvg} />
                </motion.div>

                <motion.div
                  key={`combo-${gift.comboCount}`}
                  initial={{ scale: 1.55, y: -2 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                  className={`font-display font-extrabold italic ${sz.giftCombo} text-amber-300 drop-shadow-[0_2px_8px_rgba(245,158,11,0.55)] font-mono tabular-nums pl-0.5`}
                >
                  x{gift.comboCount}
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Layer 4: Responsive Bottom Chat + Q&A Overlay */}
        <div className={bottomLeftContainerClass}>
          {/* Manual-Cue Q&A Spotlight Card */}
          <AnimatePresence>
            {activeQa && (
              <motion.div
                key={activeQa.id}
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className={`mb-3 rounded-2xl bg-[#14161F]/92 backdrop-blur-xl border border-amber-400/40 shadow-[0_14px_40px_rgba(0,0,0,0.6)] overflow-hidden ${
                  isPortrait ? 'mr-14' : ''
                }`}
              >
                <div
                  className={`px-3.5 py-2 bg-gradient-to-r from-amber-500/22 to-[#FF3B5C]/16 border-b border-white/10 flex items-center justify-between gap-2 ${sz.qaHeader}`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Pin className="w-3.5 h-3.5" />
                    <span>Q&A Spotlight · @{activeQa.author}</span>
                  </div>
                  <span className="text-zinc-300">{activeQa.topic}</span>
                </div>
                <div className={`px-3.5 py-2.5 font-medium text-white ${sz.qaText}`}>
                  {activeQa.question}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scrolling English Chat Stream */}
          <div
            ref={chatScrollRef}
            className={`chat-mask ${chatMaxHeightClass} overflow-y-auto no-scrollbar space-y-2 mb-3 ${
              isPortrait ? 'pr-14' : 'pr-2'
            }`}
          >
            {state.chatMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex items-start gap-2.5 bg-black/45 backdrop-blur-[4px] ${sz.chatBubble} w-fit max-w-full`}
              >
                <span
                  className={`mt-0.5 ${sz.chatAvatar} rounded-full shrink-0 flex items-center justify-center font-bold text-white`}
                  style={{ backgroundColor: msg.avatarColor }}
                >
                  {msg.username.slice(0, 1).toUpperCase()}
                </span>

                <p className={`${sz.chatText} text-zinc-100 break-words`}>
                  {msg.badge === 'host' && (
                    <span className="mr-1.5 text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                      Host
                    </span>
                  )}
                  {msg.badge === 'mod' && (
                    <span className="mr-1.5 text-[11px] font-bold text-emerald-300 uppercase tracking-wide">
                      Mod
                    </span>
                  )}
                  {msg.badge === 'top_fan' && (
                    <span className="mr-1.5 text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                      Top Fan
                    </span>
                  )}
                  {msg.badge === 'gifter' && (
                    <span className="mr-1.5 text-[11px] font-bold text-pink-300 uppercase tracking-wide">
                      Gifter
                    </span>
                  )}
                  <span
                    className="font-semibold mr-1.5"
                    style={{ color: msg.avatarColor }}
                  >
                    {msg.username}
                  </span>
                  {msg.replyTo && (
                    <span className="text-amber-300 font-medium mr-1.5">
                      @{msg.replyTo}
                    </span>
                  )}
                  <span className="text-white/95">{msg.text}</span>
                </p>
              </motion.div>
            ))}
          </div>

          {/* Bottom Comment Input (Unified in 9:16; Left-anchored in 16:9 laptop view) */}
          <div className="flex items-center gap-2.5">
            <form
              onSubmit={handleQuickSend}
              className={`flex-1 flex items-center gap-2.5 px-4 rounded-full bg-black/55 backdrop-blur-md border border-white/15 ${sz.inputHeight}`}
            >
              <MessageCircle className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={quickComment}
                onChange={(e) => setQuickComment(e.target.value)}
                placeholder="Host reply in chat…"
                className="w-full bg-transparent text-white placeholder:text-zinc-400 outline-none"
              />
              {quickComment.trim() && (
                <button
                  type="submit"
                  className="text-[#FF3B5C] hover:text-[#ff5d78] transition-colors cursor-pointer"
                  aria-label="Send comment"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>

            {isPortrait && (
              <>
                <button
                  type="button"
                  onClick={() => onTriggerBurst('sparkle', 6)}
                  className={`${sz.actionBtn} rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-amber-300 hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0`}
                  title="Send Sparkles"
                >
                  <Sparkles className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={handleStageShare}
                  className={`${sz.actionBtn} rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0`}
                  title={shareCopied ? 'Link copied!' : 'Copy stage link'}
                >
                  {shareCopied ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Share2 className="w-5 h-5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onTriggerBurst('heart', 1)}
                  className={`${sz.actionBtn} rounded-full bg-[#FF3B5C] hover:bg-[#ff5270] flex items-center justify-center text-white shadow-[0_4px_16px_rgba(255,59,92,0.45)] active:scale-90 transition-all cursor-pointer shrink-0`}
                  title="Tap Love"
                >
                  <Heart className="w-5 h-5 fill-white" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 16:9 Laptop Bottom-Right Reaction Buttons (Right beneath rising hearts stream) */}
        {!isPortrait && (
          <div className="absolute right-5 bottom-5 z-20 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onTriggerBurst('sparkle', 6)}
              className={`${sz.actionBtn} rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center text-amber-300 hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0`}
              title="Send Sparkles"
            >
              <Sparkles className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleStageShare}
              className={`${sz.actionBtn} rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0`}
              title={shareCopied ? 'Link copied!' : 'Copy stage link'}
            >
              {shareCopied ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Share2 className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onTriggerBurst('heart', 1)}
              className={`${sz.actionBtn} rounded-full bg-[#FF3B5C] hover:bg-[#ff5270] flex items-center justify-center text-white shadow-[0_4px_16px_rgba(255,59,92,0.45)] active:scale-90 transition-all cursor-pointer shrink-0`}
              title="Tap Love"
            >
              <Heart className="w-5 h-5 fill-white" />
            </button>
          </div>
        )}

        {/* Layer 5: Floating Love & Reaction Particles + Screen Double-Tap Pops */}
        <ReactionOverlay bursts={recentBursts} tapPops={tapPops} />
      </div>
    </div>
  );
};
