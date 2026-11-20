import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Glasses,
  Heart,
  MessageSquarePlus,
  Monitor,
  Music2,
  Pause,
  Pin,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ScanFace,
  Send,
  Shuffle,
  SkipForward,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  AMBIENT_AUDIO_PRESETS,
  AVATAR_PALETTE,
  CHAT_PHASES,
  COZY_PLAYLIST_PRESETS,
  GIFT_CATALOG,
  HOST_AVATAR_URL,
  SUGGESTED_SENDERS,
} from '../data/podcastData.ts';
import type {
  AspectMode,
  AudioPresetId,
  ChatMessage,
  ChatPhase,
  ChatScriptLine,
  ChatSpeed,
  FaceFilterState,
  GiftId,
  HudScale,
  LiveState,
  ReactionKind,
} from '../types/live.ts';
import { GiftVisual } from './GiftVisual.tsx';

interface ControlDashboardProps {
  state: LiveState;
  isConnected: boolean;
  onSetAspectMode: (mode: AspectMode) => void;
  onSetHudScale: (scale: HudScale) => void;
  onPatchState: (patch: Partial<LiveState>) => void;
  onUpdateFilter: (patch: Partial<FaceFilterState>) => void;
  onToggleLive: (isLive: boolean) => void;
  onResetTimer: () => void;
  onPushChat: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  onClearChat: () => void;
  onTriggerBurst: (kind: ReactionKind, count: number) => void;
  onSendGift: (giftId: GiftId, sender: string, senderColor: string) => void;
  onSetActiveQa: (qaId: string | null) => void;
  onAddQa: (author: string, topic: string, question: string) => void;
  onRemoveQa: (qaId: string) => void;
  onOpenInlineStage: () => void;
}

const SPEED_BASE_MS: Record<ChatSpeed, number> = {
  slow: 2800,
  natural: 1650,
  lively: 900,
};

function formatDuration(startedAt: number | null, now: number): string {
  if (!startedAt) return '00:00';
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export const ControlDashboard: React.FC<ControlDashboardProps> = ({
  state,
  isConnected,
  onSetAspectMode,
  onSetHudScale,
  onPatchState,
  onUpdateFilter,
  onToggleLive,
  onResetTimer,
  onPushChat,
  onClearChat,
  onTriggerBurst,
  onSendGift,
  onSetActiveQa,
  onAddQa,
  onRemoveQa,
  onOpenInlineStage,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [linkCopied, setLinkCopied] = useState(false);

  // Phased English Chat Sequencer (ON by default for lively natural flow!)
  const [activePhaseId, setActivePhaseId] = useState<string>(CHAT_PHASES[0].id);
  const [phaseCursors, setPhaseCursors] = useState<Record<string, number>>(() =>
    Object.fromEntries(CHAT_PHASES.map((p) => [p.id, 0])),
  );
  const [firedScriptIds, setFiredScriptIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [autoAdvancePhases, setAutoAdvancePhases] = useState(true);
  const [chatSpeed, setChatSpeed] = useState<ChatSpeed>('natural');

  // Sudden Random Gifts + Real-Life Ambient Viewer Hearts
  const [autoRandomGifts, setAutoRandomGifts] = useState(true);
  const [ambientHeartsOn, setAmbientHeartsOn] = useState(true);

  // Custom Chat Composer
  const [customUser, setCustomUser] = useState('starry_sky99');
  const [customReplyTo, setCustomReplyTo] = useState('');
  const [customText, setCustomText] = useState('');

  // Gift Sender Selection
  const [giftSender, setGiftSender] = useState(SUGGESTED_SENDERS[0].name);

  // New Q&A Composer
  const [qaAuthor, setQaAuthor] = useState('');
  const [qaTopic, setQaTopic] = useState('Manners');
  const [qaQuestion, setQaQuestion] = useState('');

  const [mobileSection, setMobileSection] = useState<'stage' | 'chat' | 'qa'>(
    'stage',
  );

  const cursorsRef = useRef(phaseCursors);
  cursorsRef.current = phaseCursors;
  const activePhaseRef = useRef(activePhaseId);
  activePhaseRef.current = activePhaseId;

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const currentPhase: ChatPhase = useMemo(
    () => CHAT_PHASES.find((p) => p.id === activePhaseId) ?? CHAT_PHASES[0],
    [activePhaseId],
  );

  const currentCursor = phaseCursors[currentPhase.id] ?? 0;

  const fireScriptLine = useCallback(
    (line: ChatScriptLine) => {
      onPushChat({
        username: line.username,
        text: line.text,
        replyTo: line.replyTo,
        badge: line.badge,
        avatarColor: line.avatarColor,
      });
      setFiredScriptIds((prev) => {
        const next = new Set(prev);
        next.add(line.id);
        return next;
      });
    },
    [onPushChat],
  );

  const fireNextInPhase = () => {
    const idx = phaseCursors[currentPhase.id] ?? 0;
    if (idx >= currentPhase.lines.length) {
      setPhaseCursors((prev) => ({ ...prev, [currentPhase.id]: 0 }));
      return;
    }
    const line = currentPhase.lines[idx];
    fireScriptLine(line);
    setPhaseCursors((prev) => ({ ...prev, [currentPhase.id]: idx + 1 }));
  };

  const fireNextBurst = (count = 5) => {
    const idx = phaseCursors[currentPhase.id] ?? 0;
    const end = Math.min(currentPhase.lines.length, idx + count);
    for (let i = idx; i < end; i++) {
      const line = currentPhase.lines[i];
      window.setTimeout(() => {
        fireScriptLine(line);
      }, (i - idx) * 240);
    }
    setPhaseCursors((prev) => ({ ...prev, [currentPhase.id]: end }));
  };

  // Organic variable-pacing natural chat stream
  useEffect(() => {
    if (!isAutoPlaying || !state.isLive) return;
    let timerId: number;

    const scheduleNext = () => {
      const base = SPEED_BASE_MS[chatSpeed];
      const jitter = base * (0.65 + Math.random() * 0.85);
      timerId = window.setTimeout(() => {
        const pId = activePhaseRef.current;
        const phaseIdx = CHAT_PHASES.findIndex((p) => p.id === pId);
        const phase = CHAT_PHASES[phaseIdx >= 0 ? phaseIdx : 0];
        const idx = cursorsRef.current[phase.id] ?? 0;

        if (idx < phase.lines.length) {
          const line = phase.lines[idx];
          fireScriptLine(line);
          setPhaseCursors((prev) => ({ ...prev, [phase.id]: idx + 1 }));
        } else if (autoAdvancePhases) {
          const nextPhase = CHAT_PHASES[(phaseIdx + 1) % CHAT_PHASES.length];
          setActivePhaseId(nextPhase.id);
          setPhaseCursors((prev) => ({ ...prev, [nextPhase.id]: 1 }));
          fireScriptLine(nextPhase.lines[0]);
        } else {
          setPhaseCursors((prev) => ({ ...prev, [phase.id]: 1 }));
          fireScriptLine(phase.lines[0]);
        }

        scheduleNext();
      }, jitter);
    };

    scheduleNext();
    return () => window.clearTimeout(timerId);
  }, [autoAdvancePhases, chatSpeed, fireScriptLine, isAutoPlaying, state.isLive]);

  // Real-life ambient background heart taps from live viewers
  useEffect(() => {
    if (!ambientHeartsOn || !state.isLive) return;
    let timerId: number;

    const scheduleHeart = () => {
      const delay = 2200 + Math.random() * 2400;
      timerId = window.setTimeout(() => {
        const amt = Math.random() < 0.72 ? 1 : 2;
        onTriggerBurst('heart', amt);
        scheduleHeart();
      }, delay);
    };

    scheduleHeart();
    return () => window.clearTimeout(timerId);
  }, [ambientHeartsOn, onTriggerBurst, state.isLive]);

  const triggerRandomGiftDrop = useCallback(() => {
    const senderObj =
      SUGGESTED_SENDERS[Math.floor(Math.random() * SUGGESTED_SENDERS.length)];
    const giftObj =
      GIFT_CATALOG[Math.floor(Math.random() * GIFT_CATALOG.length)];
    onSendGift(giftObj.id, senderObj.name, senderObj.color);

    if (giftObj.filterId) {
      window.setTimeout(() => {
        const reactor =
          SUGGESTED_SENDERS[
            Math.floor(Math.random() * SUGGESTED_SENDERS.length)
          ];
        onPushChat({
          username: reactor.name,
          text: `omg look at the ${giftObj.name.toLowerCase()} filter!! 😂✨`,
          avatarColor: reactor.color,
        });
      }, 950);
    }
  }, [onPushChat, onSendGift]);

  // Sudden random gifts arriving periodically during live performance
  useEffect(() => {
    if (!autoRandomGifts || !state.isLive) return;
    let timerId: number;

    const scheduleGift = () => {
      const delay = 9000 + Math.random() * 8500;
      timerId = window.setTimeout(() => {
        triggerRandomGiftDrop();
        scheduleGift();
      }, delay);
    };

    scheduleGift();
    return () => window.clearTimeout(timerId);
  }, [autoRandomGifts, state.isLive, triggerRandomGiftDrop]);

  const stagePath = `${import.meta.env.BASE_URL}?mode=stage`;

  const stageUrl = useMemo(() => {
    if (typeof window === 'undefined') return stagePath;
    return `${window.location.origin}${stagePath}`;
  }, [stagePath]);

  const handleCopyStageUrl = async () => {
    try {
      await navigator.clipboard.writeText(stageUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCustomChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    const matched = SUGGESTED_SENDERS.find(
      (s) => s.name.toLowerCase() === customUser.trim().toLowerCase(),
    );
    const color =
      matched?.color ??
      AVATAR_PALETTE[
        Math.abs(customUser.trim().length) % AVATAR_PALETTE.length
      ];
    onPushChat({
      username: customUser.trim() || 'guest_listener',
      replyTo: customReplyTo.trim() || undefined,
      text: customText.trim(),
      avatarColor: color,
    });
    setCustomText('');
    setCustomReplyTo('');
  };

  const handleAddQaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaQuestion.trim()) return;
    onAddQa(qaAuthor || 'listener_live', qaTopic || 'Manners', qaQuestion);
    setQaAuthor('');
    setQaQuestion('');
  };

  const activeQa = useMemo(
    () => state.qaQueue.find((q) => q.id === state.activeQaId) ?? null,
    [state.activeQaId, state.qaQueue],
  );

  const selectedSenderColor = useMemo(() => {
    const found = SUGGESTED_SENDERS.find(
      (s) => s.name.toLowerCase() === giftSender.trim().toLowerCase(),
    );
    return found?.color ?? '#F59E0B';
  }, [giftSender]);

  const filterRemainingSec = useMemo(() => {
    if (!state.faceFilter.activeFilter || state.faceFilter.pinned) return null;
    if (!state.faceFilter.expiresAt) return null;
    return Math.max(0, Math.ceil((state.faceFilter.expiresAt - nowMs) / 1000));
  }, [nowMs, state.faceFilter]);

  return (
    <div className="min-h-screen bg-[#0B0C10] text-zinc-100 flex flex-col">
      {/* Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0E1016]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-5 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <img
              src={HOST_AVATAR_URL}
              alt="podcastHorizon"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover ring-1 ring-white/15"
            />
            <span className="font-display font-bold text-lg tracking-tight text-white whitespace-nowrap shrink-0">
              podcastHorizon
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-xs text-zinc-400 whitespace-nowrap shrink-0">
            <span className="inline-flex items-center gap-1.5 text-zinc-200 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {isConnected ? 'Tab Sync Live' : 'Tab Sync Ready'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-zinc-300">
              {state.aspectMode} · HUD {state.hudScale}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-zinc-300">
              {formatDuration(state.startedAt, nowMs)}
            </span>
            <button
              type="button"
              onClick={onOpenInlineStage}
              className="text-zinc-300 hover:text-white underline-offset-4 hover:underline transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Preview Stage Here
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href={stagePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF3B5C] hover:bg-[#ff5270] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Live Output (New Tab)</span>
            </a>
          </div>
        </div>
      </header>

      {/* Mobile Section Switcher */}
      <div className="lg:hidden px-4 pt-3">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#14161F] border border-white/8">
          <button
            type="button"
            onClick={() => setMobileSection('stage')}
            className={`py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              mobileSection === 'stage'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400'
            }`}
          >
            Stage & Gifts
          </button>
          <button
            type="button"
            onClick={() => setMobileSection('chat')}
            className={`py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              mobileSection === 'chat'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400'
            }`}
          >
            Chat Flow
          </button>
          <button
            type="button"
            onClick={() => setMobileSection('qa')}
            className={`py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              mobileSection === 'qa'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400'
            }`}
          >
            Q&A & Audio
          </button>
        </div>
      </div>

      {/* Main 3-Column Producer Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMN 1: Stage Controls, Love Spam & Gift + Face-Tracked AR Filter Launcher */}
        <section
          className={`lg:col-span-4 space-y-5 ${
            mobileSection === 'stage' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Output Tab, Framing & HUD Scale */}
          <div className="rounded-2xl bg-[#13151E] border border-white/8 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Live Output & Framing
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Screen aspect, viewer dynamics & HUD size
                </p>
              </div>
              <button
                type="button"
                onClick={() => onToggleLive(!state.isLive)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  state.isLive
                    ? 'bg-[#FF3B5C]/15 text-[#FF6B84] border border-[#FF3B5C]/30 hover:bg-[#FF3B5C]/25'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{state.isLive ? 'On Air · Pause' : 'Go Live'}</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 block">
                Live Screen Format
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0B0C10] border border-white/8">
                <button
                  type="button"
                  onClick={() => onSetAspectMode('9:16')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    state.aspectMode === '9:16'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>9:16 TikTok</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetAspectMode('16:9')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    state.aspectMode === '16:9'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>16:9 Laptop Wide</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 block">
                Comments & HUD Size
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0B0C10] border border-white/8">
                {(['normal', 'large', 'xlarge'] as HudScale[]).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => onSetHudScale(sc)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                      state.hudScale === sc
                        ? 'bg-zinc-800 text-amber-200'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sc === 'xlarge' ? 'Extra Large' : sc}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="stream-title-input"
                  className="text-xs font-medium text-zinc-300"
                >
                  Stream Topic Title
                </label>
                <button
                  type="button"
                  onClick={onResetTimer}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Timer</span>
                </button>
              </div>
              <input
                id="stream-title-input"
                type="text"
                value={state.streamTitle}
                onChange={(e) => onPatchState({ streamTitle: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#0B0C10] border border-white/10 text-xs text-white focus:border-amber-400/50 outline-none"
              />
            </div>

            <div className="pt-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <span className="text-xs text-zinc-300">Base Viewers</span>
                <span className="font-mono tabular-nums text-xs font-semibold text-white">
                  {state.viewerCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onPatchState({
                      viewerCount: Math.max(20, state.viewerCount - 30),
                    })
                  }
                  className="px-2 py-1 rounded-lg bg-[#0B0C10] border border-white/10 text-xs font-mono hover:bg-white/10 transition-colors cursor-pointer"
                >
                  -30
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPatchState({ viewerCount: state.viewerCount + 30 })
                  }
                  className="px-2 py-1 rounded-lg bg-[#0B0C10] border border-white/10 text-xs font-mono hover:bg-white/10 transition-colors cursor-pointer"
                >
                  +30
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPatchState({
                      viewerDriftEnabled: !state.viewerDriftEnabled,
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    state.viewerDriftEnabled
                      ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                      : 'bg-[#0B0C10] border-white/10 text-zinc-400'
                  }`}
                >
                  {state.viewerDriftEnabled ? 'Wave On' : 'Fixed'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-white/8 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Music2 className="w-3.5 h-3.5 text-amber-400" />
                  On-Screen Song Tag
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onPatchState({
                      nowPlaying: {
                        ...state.nowPlaying,
                        visible: !state.nowPlaying.visible,
                      },
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    state.nowPlaying.visible
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {state.nowPlaying.visible ? 'Visible on Live' : 'Hidden'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COZY_PLAYLIST_PRESETS.map((preset) => (
                  <button
                    key={preset.track}
                    type="button"
                    onClick={() =>
                      onPatchState({
                        nowPlaying: {
                          visible: true,
                          track: preset.track,
                          artist: preset.artist,
                        },
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer ${
                      state.nowPlaying.track === preset.track &&
                      state.nowPlaying.visible
                        ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                        : 'bg-[#0B0C10] border-white/8 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {preset.track}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-400 truncate">
                {stageUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyStageUrl}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B0C10] border border-white/10 hover:bg-white/10 text-[11px] text-zinc-200 transition-colors cursor-pointer shrink-0"
              >
                {linkCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-Life Love Spam & Ambient Viewer Reactions */}
          <div className="rounded-2xl bg-[#13151E] border border-white/8 p-5 space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Love Spam & Reactions
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Organic ambient taps + instant bursts (or double-tap stage)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAmbientHeartsOn((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                  ambientHeartsOn
                    ? 'bg-[#FF3B5C]/15 border-[#FF3B5C]/35 text-[#FF8599]'
                    : 'bg-[#0B0C10] border-white/10 text-zinc-400'
                }`}
              >
                {ambientHeartsOn ? 'Ambient Hearts On' : 'Ambient Off'}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Live heart counter</span>
              <span className="font-mono tabular-nums text-zinc-200 font-semibold">
                {state.likeCount.toLocaleString()} likes
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onTriggerBurst('heart', 1)}
                className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-[#0B0C10] border border-white/10 hover:border-[#FF3B5C]/50 hover:bg-[#FF3B5C]/10 active:scale-95 transition-all cursor-pointer"
              >
                <Heart className="w-4 h-4 text-[#FF3B5C] fill-[#FF3B5C]" />
                <span className="text-xs font-medium text-white">Tap +1</span>
              </button>

              <button
                type="button"
                onClick={() => onTriggerBurst('heart', 12)}
                className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-[#FF3B5C]/15 border border-[#FF3B5C]/35 hover:bg-[#FF3B5C]/25 active:scale-95 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 text-[#FF6B84]" />
                <span className="text-xs font-semibold text-white">
                  Burst +12
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTriggerBurst('heart', 35)}
                className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-[#FF3B5C] hover:bg-[#ff5270] text-white shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <Heart className="w-4 h-4 fill-white" />
                <span className="text-xs font-bold">Spam +35</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onTriggerBurst('sparkle', 8)}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-[#0B0C10] border border-white/10 hover:bg-white/5 text-xs text-zinc-200 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Sparkles</span>
              </button>
              <button
                type="button"
                onClick={() => onTriggerBurst('clap', 8)}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-[#0B0C10] border border-white/10 hover:bg-white/5 text-xs text-zinc-200 active:scale-95 transition-all cursor-pointer"
              >
                <span>🙌</span>
                <span>Applause</span>
              </button>
              <button
                type="button"
                onClick={() => onTriggerBurst('fire', 8)}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-[#0B0C10] border border-white/10 hover:bg-white/5 text-xs text-zinc-200 active:scale-95 transition-all cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>Hype</span>
              </button>
            </div>
          </div>

          {/* Gifts + Face-Tracked Wearable AR Filters */}
          <div className="rounded-2xl bg-[#13151E] border border-white/8 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Gifts & Face-Tracked Filters
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Detects host face & follows head movement automatically
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoRandomGifts((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                  autoRandomGifts
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                    : 'bg-[#0B0C10] border-white/10 text-zinc-400'
                }`}
              >
                {autoRandomGifts ? 'Auto Gifts On' : 'Auto Off'}
              </button>
            </div>

            <button
              type="button"
              onClick={triggerRandomGiftDrop}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-[#FF3B5C] hover:opacity-95 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Drop Sudden Random Gift Now</span>
            </button>

            <div className="p-3 rounded-xl bg-[#0B0C10] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                  <Glasses className="w-3.5 h-3.5 text-amber-300" />
                  {state.faceFilter.activeFilter ? (
                    <span>
                      Active:{' '}
                      <strong className="text-amber-300">
                        {state.faceFilter.activeFilter.replace('_', ' ')}
                      </strong>
                      {filterRemainingSec !== null &&
                        ` · ${filterRemainingSec}s`}
                    </span>
                  ) : (
                    <span className="text-zinc-400">No AR filter worn</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateFilter({
                        faceTrackingEnabled:
                          !state.faceFilter.faceTrackingEnabled,
                      })
                    }
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      state.faceFilter.faceTrackingEnabled
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                    title="Toggle real-time camera face detection"
                  >
                    <ScanFace className="w-3 h-3" />
                    <span>
                      {state.faceFilter.faceTrackingEnabled
                        ? 'Face AI'
                        : 'Manual'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateFilter({
                        pinned: !state.faceFilter.pinned,
                        expiresAt: !state.faceFilter.pinned
                          ? null
                          : Date.now() + 14000,
                      })
                    }
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      state.faceFilter.pinned
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {state.faceFilter.pinned ? 'Pinned' : 'Pin'}
                  </button>
                  {state.faceFilter.activeFilter && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFilter({
                          activeFilter: null,
                          activatedBy: null,
                          expiresAt: null,
                        })
                      }
                      className="px-2 py-1 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-400">
                <label className="space-y-1">
                  <span>Nudge Y ({Math.round(state.faceFilter.offsetY)}%)</span>
                  <input
                    type="range"
                    min={-25}
                    max={25}
                    value={state.faceFilter.offsetY}
                    onChange={(e) =>
                      onUpdateFilter({ offsetY: Number(e.target.value) })
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span>Nudge X ({Math.round(state.faceFilter.offsetX)}%)</span>
                  <input
                    type="range"
                    min={-25}
                    max={25}
                    value={state.faceFilter.offsetX}
                    onChange={(e) =>
                      onUpdateFilter({ offsetX: Number(e.target.value) })
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span>Scale ({state.faceFilter.scale.toFixed(1)}x)</span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={state.faceFilter.scale}
                    onChange={(e) =>
                      onUpdateFilter({ scale: Number(e.target.value) })
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="gift-sender-input"
                className="text-[11px] font-medium text-zinc-400"
              >
                Gift Sender Handle
              </label>
              <input
                id="gift-sender-input"
                type="text"
                value={giftSender}
                onChange={(e) => setGiftSender(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {SUGGESTED_SENDERS.slice(0, 6).map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setGiftSender(s.name)}
                    className={`px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                      giftSender === s.name
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                        : 'bg-[#0B0C10] text-zinc-400 border border-white/8 hover:text-zinc-200'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {GIFT_CATALOG.map((gift) => {
                const liveCombo = state.activeGifts.find(
                  (g) =>
                    g.giftId === gift.id &&
                    g.sender.toLowerCase() === giftSender.trim().toLowerCase(),
                );
                return (
                  <button
                    key={gift.id}
                    type="button"
                    onClick={() =>
                      onSendGift(
                        gift.id,
                        giftSender.trim() || 'aya_gabriella',
                        selectedSenderColor,
                      )
                    }
                    className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl bg-[#0B0C10] border transition-all active:scale-95 cursor-pointer ${
                      gift.filterId
                        ? 'border-amber-400/25 hover:border-amber-400/60'
                        : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    {gift.filterId && (
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase text-amber-300">
                        AR
                      </span>
                    )}
                    {liveCombo && (
                      <span className="absolute top-1.5 right-1.5 font-mono tabular-nums text-[10px] font-bold text-amber-300">
                        x{liveCombo.comboCount}
                      </span>
                    )}
                    <GiftVisual giftId={gift.id} className="w-9 h-9" />
                    <span className="text-[11px] font-medium text-white truncate max-w-full">
                      {gift.name}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-amber-300/90">
                      {gift.coins}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* COLUMN 2: Lively Phased English Chat Stream Sequencer */}
        <section
          className={`lg:col-span-4 space-y-5 ${
            mobileSection === 'chat' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="rounded-2xl bg-[#13151E] border border-white/8 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Lively English Chat Stream
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Organic audience chatter across 4 manners chapters
                </p>
              </div>
              <button
                type="button"
                onClick={onClearChat}
                className="text-[11px] text-zinc-400 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
              >
                Clear Chat
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {CHAT_PHASES.map((phase) => {
                const isSelected = phase.id === currentPhase.id;
                const doneCount = phase.lines.filter((l) =>
                  firedScriptIds.has(l.id),
                ).length;
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => setActivePhaseId(phase.id)}
                    className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400/40 text-white'
                        : 'bg-[#0B0C10] border-white/8 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span
                        className={
                          isSelected ? 'text-amber-300 font-semibold' : ''
                        }
                      >
                        {phase.indexLabel}
                      </span>
                      <span>
                        {doneCount}/{phase.lines.length}
                      </span>
                    </div>
                    <div className="text-xs font-medium mt-0.5 truncate">
                      {phase.title}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-[#0B0C10] border border-white/8 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsAutoPlaying((a) => !a)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isAutoPlaying
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
                >
                  {isAutoPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Chat Flowing · Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Crowd Chat</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={fireNextInPhase}
                  className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg bg-[#FF3B5C] hover:bg-[#ff5270] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Next</span>
                </button>

                <button
                  type="button"
                  onClick={() => fireNextBurst(5)}
                  className="py-2 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                  title="Send next 5 lines quickly"
                >
                  +5
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPhaseCursors((prev) => ({
                      ...prev,
                      [currentPhase.id]: 0,
                    }))
                  }
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Reset phase cursor"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] gap-2">
                <div className="flex items-center gap-1">
                  {(['slow', 'natural', 'lively'] as ChatSpeed[]).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setChatSpeed(spd)}
                      className={`px-2 py-0.5 rounded capitalize transition-colors cursor-pointer ${
                        chatSpeed === spd
                          ? 'bg-zinc-800 text-amber-300 font-medium'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {spd}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setAutoAdvancePhases((v) => !v)}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    autoAdvancePhases
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-zinc-900 text-zinc-400'
                  }`}
                >
                  {autoAdvancePhases ? 'Auto Next Topic' : 'Loop This Topic'}
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {currentPhase.lines.map((line, idx) => {
                const isNext = idx === currentCursor;
                const isSent = firedScriptIds.has(line.id);
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => {
                      fireScriptLine(line);
                      if (idx >= currentCursor) {
                        setPhaseCursors((prev) => ({
                          ...prev,
                          [currentPhase.id]: idx + 1,
                        }));
                      }
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer group ${
                      isNext
                        ? 'bg-amber-500/10 border-amber-400/45'
                        : isSent
                          ? 'bg-[#0B0C10]/60 border-white/5 opacity-60 hover:opacity-100'
                          : 'bg-[#0B0C10] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span
                        className="font-semibold"
                        style={{ color: line.avatarColor }}
                      >
                        {line.username}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 group-hover:text-amber-300">
                        {isNext ? 'NEXT' : isSent ? 'Sent · Resend' : 'Fire'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-200 mt-1 leading-snug">
                      {line.replyTo && (
                        <span className="text-amber-300 mr-1">
                          @{line.replyTo}
                        </span>
                      )}
                      {line.text}
                    </p>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={handleCustomChatSubmit}
              className="pt-3 border-t border-white/8 space-y-2.5"
            >
              <span className="text-xs font-medium text-zinc-300 inline-flex items-center gap-1.5">
                <MessageSquarePlus className="w-3.5 h-3.5 text-amber-400" />
                Custom Live Chat
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customUser}
                  onChange={(e) => setCustomUser(e.target.value)}
                  placeholder="Username"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
                />
                <input
                  type="text"
                  value={customReplyTo}
                  onChange={(e) => setCustomReplyTo(e.target.value)}
                  placeholder="@replyTo (optional)"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Type natural English comment…"
                  className="flex-1 px-3 py-2 rounded-xl bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* COLUMN 3: Chill Podcast Audio & Manual-Cue Q&A Spotlight */}
        <section
          className={`lg:col-span-4 space-y-5 ${
            mobileSection === 'qa' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Chill Podcast Audio */}
          <div className="rounded-2xl bg-[#13151E] border border-white/8 p-5 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Chill Podcast Audio
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Lo-fi beats, acoustic Rhodes & calming rain beds
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onPatchState({
                    ambientAudio: {
                      ...state.ambientAudio,
                      enabled: !state.ambientAudio.enabled,
                    },
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  state.ambientAudio.enabled
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                }`}
              >
                {state.ambientAudio.enabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Playing</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>Play Audio</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {AMBIENT_AUDIO_PRESETS.map((preset) => {
                const selected = state.ambientAudio.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onPatchState({
                        ambientAudio: {
                          ...state.ambientAudio,
                          enabled: true,
                          preset: preset.id as AudioPresetId,
                        },
                      })
                    }
                    className={`text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-amber-500/12 border-amber-400/40 text-white'
                        : 'bg-[#0B0C10] border-white/8 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="text-xs font-medium">{preset.label}</div>
                    <div className="text-[11px] text-zinc-400">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <label className="flex-1 flex items-center gap-2 text-xs text-zinc-300">
                <span className="shrink-0">Volume</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={state.ambientAudio.volume}
                  onChange={(e) =>
                    onPatchState({
                      ambientAudio: {
                        ...state.ambientAudio,
                        volume: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  onPatchState({
                    ambientAudio: {
                      ...state.ambientAudio,
                      sfxEnabled: !state.ambientAudio.sfxEnabled,
                    },
                  })
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer shrink-0 ${
                  state.ambientAudio.sfxEnabled
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                    : 'bg-[#0B0C10] border-white/10 text-zinc-400'
                }`}
              >
                {state.ambientAudio.sfxEnabled ? 'Gift Chime On' : 'Chime Off'}
              </button>
            </div>
          </div>

          {/* Manual Q&A Spotlight Controller */}
          <div className="rounded-2xl bg-[#13151E] border border-white/8 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Q&A Spotlight (Manual Cue)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Questions stay hidden until you push them on air
                </p>
              </div>
              {activeQa && (
                <button
                  type="button"
                  onClick={() => onSetActiveQa(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/35 text-rose-200 hover:bg-rose-500/25 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide Q&A</span>
                </button>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[#0B0C10] border border-white/10">
              {activeQa ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-amber-300 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Pin className="w-3 h-3" />
                      Showing on Live · @{activeQa.author}
                    </span>
                    <span className="text-zinc-400">{activeQa.topic}</span>
                  </div>
                  <p className="text-xs text-white leading-relaxed">
                    {activeQa.question}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-zinc-400">
                  No Q&A card currently visible on Live Output.
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
              {state.qaQueue.map((item) => {
                const isOnLive = state.activeQaId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-colors space-y-2 ${
                      isOnLive
                        ? 'bg-amber-500/12 border-amber-400/45'
                        : 'bg-[#0B0C10] border-white/8'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-300 font-medium">
                        @{item.author} · {item.topic}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveQa(item.id)}
                        className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Remove question"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-100 leading-relaxed">
                      {item.question}
                    </p>
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          onSetActiveQa(isOnLive ? null : item.id)
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          isOnLive
                            ? 'bg-amber-500 text-zinc-950'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        }`}
                      >
                        {isOnLive ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>On Live · Hide</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Show on Live</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={handleAddQaSubmit}
              className="pt-3 border-t border-white/8 space-y-2.5"
            >
              <span className="text-xs font-medium text-zinc-300 block">
                Queue New Q&A Question
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={qaAuthor}
                  onChange={(e) => setQaAuthor(e.target.value)}
                  placeholder="Listener @handle"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
                />
                <input
                  type="text"
                  value={qaTopic}
                  onChange={(e) => setQaTopic(e.target.value)}
                  placeholder="Topic (e.g. Empathy)"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
                />
              </div>
              <textarea
                rows={2}
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                placeholder="Type an audience question for the host…"
                className="w-full px-3 py-2 rounded-xl bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50 resize-none"
              />
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Q&A Queue</span>
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
};
