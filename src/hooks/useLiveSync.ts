import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_PHASES,
  GIFT_CATALOG,
  INITIAL_QA_QUEUE,
} from '../data/podcastData.ts';
import type {
  ActiveGift,
  AspectMode,
  ChatMessage,
  FaceFilterState,
  GiftId,
  HudScale,
  LiveState,
  ReactionBurst,
  ReactionKind,
  QaItem,
  SyncClientAction,
  SyncServerMessage,
} from '../types/live.ts';
import { ambientAudioEngine } from '../utils/ambientAudio.ts';

const CHANNEL_NAME = 'podcasthorizon-sync-v1';
const AUDIO_LEADER_CHANNEL = 'podcasthorizon-audio-leader';
const STORAGE_KEY = 'podcasthorizon-state-v1';
const COMBO_WINDOW_MS = 4500;
const FILTER_DURATION_MS = 14000;

function makeEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_STATE: LiveState = {
  hostName: 'podcastHorizon',
  streamTitle: 'Manners & Magic Words · Cozy Talk',
  aspectMode: '9:16',
  hudScale: 'large',
  isLive: true,
  startedAt: Date.now(),
  viewerCount: 342,
  viewerDriftEnabled: true,
  likeCount: 12480,
  activeQaId: null,
  qaQueue: [...INITIAL_QA_QUEUE],
  chatMessages: CHAT_PHASES[0].lines.slice(0, 5).map((line, idx) => ({
    id: `seed-${line.id}`,
    username: line.username,
    text: line.text,
    replyTo: line.replyTo,
    badge: line.badge,
    avatarColor: line.avatarColor,
    timestamp: Date.now() - (5 - idx) * 3500,
  })),
  activeGifts: [],
  faceFilter: {
    activeFilter: null,
    activatedBy: null,
    expiresAt: null,
    pinned: false,
    faceTrackingEnabled: true,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  },
  nowPlaying: {
    visible: false,
    track: 'Rain on Warm Vinyl',
    artist: 'Sunset Tapes · Lo-Fi Mix',
  },
  ambientAudio: {
    enabled: false,
    preset: 'lofi_chill_podcast',
    volume: 0.38,
    sfxEnabled: true,
  },
};

function loadInitialState(): LiveState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<LiveState>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
    const now = Date.now();
    const rawFilter = parsed.faceFilter
      ? { ...DEFAULT_STATE.faceFilter, ...parsed.faceFilter }
      : DEFAULT_STATE.faceFilter;
    const filterExpired =
      !rawFilter.pinned &&
      rawFilter.activeFilter !== null &&
      rawFilter.expiresAt !== null &&
      rawFilter.expiresAt <= now;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      activeGifts: Array.isArray(parsed.activeGifts)
        ? parsed.activeGifts.filter((g) => g.expiresAt > now)
        : DEFAULT_STATE.activeGifts,
      faceFilter: filterExpired
        ? { ...rawFilter, activeFilter: null, activatedBy: null, expiresAt: null }
        : rawFilter,
      nowPlaying: parsed.nowPlaying
        ? { ...DEFAULT_STATE.nowPlaying, ...parsed.nowPlaying }
        : DEFAULT_STATE.nowPlaying,
      ambientAudio: parsed.ambientAudio
        ? { ...DEFAULT_STATE.ambientAudio, ...parsed.ambientAudio }
        : DEFAULT_STATE.ambientAudio,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function reduceLocalState(prev: LiveState, action: SyncClientAction): LiveState {
  const now = Date.now();
  const prunedGifts = prev.activeGifts.filter((g) => g.expiresAt > now);
  const filterExpired =
    !prev.faceFilter.pinned &&
    prev.faceFilter.activeFilter !== null &&
    prev.faceFilter.expiresAt !== null &&
    prev.faceFilter.expiresAt <= now;

  const baseFilter = filterExpired
    ? {
        ...prev.faceFilter,
        activeFilter: null,
        activatedBy: null,
        expiresAt: null,
      }
    : prev.faceFilter;

  switch (action.type) {
    case 'state:patch':
      return {
        ...prev,
        ...action.patch,
        activeGifts: prunedGifts,
        faceFilter: action.patch.faceFilter
          ? { ...baseFilter, ...action.patch.faceFilter }
          : baseFilter,
        nowPlaying: action.patch.nowPlaying
          ? { ...prev.nowPlaying, ...action.patch.nowPlaying }
          : prev.nowPlaying,
        ambientAudio: action.patch.ambientAudio
          ? { ...prev.ambientAudio, ...action.patch.ambientAudio }
          : prev.ambientAudio,
      };
    case 'stream:toggle_live':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        isLive: action.isLive,
        startedAt: action.isLive ? prev.startedAt ?? now : null,
      };
    case 'stream:reset_timer':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        startedAt: now,
      };
    case 'chat:push': {
      if (prev.chatMessages.some((m) => m.id === action.message.id)) {
        return { ...prev, activeGifts: prunedGifts, faceFilter: baseFilter };
      }
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        chatMessages: [...prev.chatMessages, action.message].slice(-80),
      };
    }
    case 'chat:clear':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        chatMessages: [],
      };
    case 'reaction:burst':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        likeCount: prev.likeCount + action.likeIncrement,
      };
    case 'gift:send': {
      const giftDef = GIFT_CATALOG.find((g) => g.id === action.giftId);
      if (!giftDef) return prev;
      const existingIdx = prunedGifts.findIndex(
        (g) =>
          g.giftId === action.giftId &&
          g.sender.toLowerCase() === action.sender.toLowerCase(),
      );
      let nextGifts: ActiveGift[];
      if (existingIdx >= 0) {
        const current = prunedGifts[existingIdx];
        nextGifts = [...prunedGifts];
        nextGifts[existingIdx] = {
          ...current,
          comboCount: current.comboCount + 1,
          updatedAt: now,
          expiresAt: now + COMBO_WINDOW_MS,
        };
      } else {
        const newGift: ActiveGift = {
          id: `${action.giftId}-${action.sender}-${now}`,
          giftId: giftDef.id,
          giftName: giftDef.name,
          sender: action.sender,
          senderColor: action.senderColor,
          coins: giftDef.coins,
          comboCount: 1,
          accentHex: giftDef.accentHex,
          tier: giftDef.tier,
          filterId: giftDef.filterId,
          updatedAt: now,
          expiresAt: now + COMBO_WINDOW_MS,
        };
        nextGifts = [...prunedGifts.slice(-2), newGift];
      }

      const nextFaceFilter = giftDef.filterId
        ? {
            ...baseFilter,
            activeFilter: giftDef.filterId,
            activatedBy: action.sender,
            expiresAt: baseFilter.pinned ? null : now + FILTER_DURATION_MS,
          }
        : baseFilter;

      return {
        ...prev,
        activeGifts: nextGifts,
        faceFilter: nextFaceFilter,
        likeCount: prev.likeCount + giftDef.coins * 3,
      };
    }
    case 'filter:update':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: {
          ...baseFilter,
          ...action.patch,
        },
      };
    case 'qa:set_active':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        activeQaId: action.qaId,
      };
    case 'qa:add':
      if (prev.qaQueue.some((q) => q.id === action.item.id)) {
        return { ...prev, activeGifts: prunedGifts, faceFilter: baseFilter };
      }
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        qaQueue: [action.item, ...prev.qaQueue],
      };
    case 'qa:remove':
      return {
        ...prev,
        activeGifts: prunedGifts,
        faceFilter: baseFilter,
        qaQueue: prev.qaQueue.filter((q) => q.id !== action.qaId),
        activeQaId: prev.activeQaId === action.qaId ? null : prev.activeQaId,
      };
    default:
      return prev;
  }
}

export function useLiveSync(options?: { defaultAudioLeader?: boolean }) {
  const [state, setState] = useState<LiveState>(loadInitialState);
  const [recentBursts, setRecentBursts] = useState<ReactionBurst[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioLeader, setIsAudioLeader] = useState(
    options?.defaultAudioLeader ?? false,
  );

  // Persist snapshot for newly opened tabs on static hosting (e.g. GitHub Pages)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota / privacy errors
    }
  }, [state]);

  const tabIdRef = useRef<string>(makeEventId());
  const wsRef = useRef<WebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const audioBcRef = useRef<BroadcastChannel | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const stateRef = useRef<LiveState>(state);
  stateRef.current = state;
  const audioLeaderRef = useRef(isAudioLeader);
  audioLeaderRef.current = isAudioLeader;

  const claimAudioLeader = useCallback(() => {
    setIsAudioLeader(true);
    try {
      audioBcRef.current?.postMessage({ leaderTabId: tabIdRef.current });
    } catch {
      // Ignore
    }
  }, []);

  const markSeen = useCallback((eventId: string): boolean => {
    if (seenEventsRef.current.has(eventId)) return false;
    seenEventsRef.current.add(eventId);
    if (seenEventsRef.current.size > 500) {
      const first = seenEventsRef.current.values().next().value;
      if (first) seenEventsRef.current.delete(first);
    }
    return true;
  }, []);

  const handleIncomingAction = useCallback(
    (action: SyncClientAction, authoritativeState?: LiveState) => {
      if (!markSeen(action.eventId)) return;

      if (action.type === 'reaction:burst') {
        setRecentBursts((prev) => [...prev.slice(-14), action.burst]);
      }

      if (
        action.type === 'gift:send' &&
        audioLeaderRef.current &&
        stateRef.current.ambientAudio.sfxEnabled
      ) {
        ambientAudioEngine.playGiftChime(stateRef.current.ambientAudio.volume);
      }

      if (authoritativeState) {
        setState(authoritativeState);
      } else {
        setState((prev) => reduceLocalState(prev, action));
      }
    },
    [markSeen],
  );

  // Audio leader broadcast listener (prevents duplicate audio across tabs)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(AUDIO_LEADER_CHANNEL);
    audioBcRef.current = ch;
    ch.onmessage = (e: MessageEvent<{ leaderTabId: string }>) => {
      if (e.data?.leaderTabId && e.data.leaderTabId !== tabIdRef.current) {
        setIsAudioLeader(false);
        ambientAudioEngine.stop();
      }
    };
    return () => {
      ch.close();
      audioBcRef.current = null;
    };
  }, []);

  // Sync chill podcast audio on whichever tab holds audio leadership
  useEffect(() => {
    if (!isAudioLeader) {
      ambientAudioEngine.stop();
      return;
    }
    ambientAudioEngine.update(
      state.ambientAudio.enabled,
      state.ambientAudio.preset,
      state.ambientAudio.volume,
    );
  }, [
    isAudioLeader,
    state.ambientAudio.enabled,
    state.ambientAudio.preset,
    state.ambientAudio.volume,
  ]);

  useEffect(() => {
    return () => {
      ambientAudioEngine.stop();
    };
  }, []);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      bcRef.current = channel;
      channel.onmessage = (event: MessageEvent<SyncClientAction>) => {
        if (event.data && event.data.eventId) {
          handleIncomingAction(event.data);
        }
      };
    }

    let reconnectTimer: number | null = null;
    let disposed = false;
    let hasConnectedWs = false;
    let initialFailures = 0;

    const connectWs = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        hasConnectedWs = true;
        initialFailures = 0;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SyncServerMessage;
          if (msg.type === 'state:full') {
            setState(msg.state);
          } else if (msg.type === 'event:broadcast') {
            handleIncomingAction(msg.action, msg.state);
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (disposed) return;
        if (!hasConnectedWs) {
          initialFailures += 1;
          // On static hosting (GitHub Pages), stop retrying /ws after 2 probes and use BroadcastChannel
          if (initialFailures >= 2) return;
        }
        reconnectTimer = window.setTimeout(connectWs, 1500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
      if (channel) channel.close();
    };
  }, [handleIncomingAction]);

  // Prune expired gift banners & timed wearable filters smoothly
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setState((prev) => {
        const hasExpiredGift = prev.activeGifts.some((g) => g.expiresAt <= now);
        const hasExpiredFilter =
          !prev.faceFilter.pinned &&
          prev.faceFilter.activeFilter !== null &&
          prev.faceFilter.expiresAt !== null &&
          prev.faceFilter.expiresAt <= now;

        if (!hasExpiredGift && !hasExpiredFilter) {
          return prev;
        }
        return {
          ...prev,
          activeGifts: prev.activeGifts.filter((g) => g.expiresAt > now),
          faceFilter: hasExpiredFilter
            ? {
                ...prev.faceFilter,
                activeFilter: null,
                activatedBy: null,
                expiresAt: null,
              }
            : prev.faceFilter,
        };
      });
    }, 350);
    return () => window.clearInterval(timer);
  }, []);

  const dispatch = useCallback(
    (action: SyncClientAction) => {
      markSeen(action.eventId);

      if (action.type === 'reaction:burst') {
        setRecentBursts((prev) => [...prev.slice(-14), action.burst]);
      }

      if (
        action.type === 'gift:send' &&
        audioLeaderRef.current &&
        stateRef.current.ambientAudio.sfxEnabled
      ) {
        ambientAudioEngine.playGiftChime(stateRef.current.ambientAudio.volume);
      }

      setState((prev) => reduceLocalState(prev, action));

      try {
        bcRef.current?.postMessage(action);
      } catch {
        // Ignore BroadcastChannel errors
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(action));
      }
    },
    [markSeen],
  );

  const setAspectMode = useCallback(
    (aspectMode: AspectMode) => {
      dispatch({
        type: 'state:patch',
        eventId: makeEventId(),
        patch: { aspectMode },
      });
    },
    [dispatch],
  );

  const setHudScale = useCallback(
    (hudScale: HudScale) => {
      dispatch({
        type: 'state:patch',
        eventId: makeEventId(),
        patch: { hudScale },
      });
    },
    [dispatch],
  );

  const patchState = useCallback(
    (patch: Partial<LiveState>) => {
      if (patch.ambientAudio) {
        claimAudioLeader();
      }
      dispatch({
        type: 'state:patch',
        eventId: makeEventId(),
        patch,
      });
    },
    [claimAudioLeader, dispatch],
  );

  const updateFaceFilter = useCallback(
    (patch: Partial<FaceFilterState>) => {
      dispatch({
        type: 'filter:update',
        eventId: makeEventId(),
        patch,
      });
    },
    [dispatch],
  );

  const toggleLive = useCallback(
    (isLive: boolean) => {
      dispatch({
        type: 'stream:toggle_live',
        eventId: makeEventId(),
        isLive,
      });
    },
    [dispatch],
  );

  const resetTimer = useCallback(() => {
    dispatch({
      type: 'stream:reset_timer',
      eventId: makeEventId(),
    });
  }, [dispatch]);

  const pushChat = useCallback(
    (message: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string }) => {
      const fullMessage: ChatMessage = {
        ...message,
        id: message.id ?? `msg-${makeEventId()}`,
        timestamp: Date.now(),
      };
      dispatch({
        type: 'chat:push',
        eventId: makeEventId(),
        message: fullMessage,
      });
    },
    [dispatch],
  );

  const clearChat = useCallback(() => {
    dispatch({
      type: 'chat:clear',
      eventId: makeEventId(),
    });
  }, [dispatch]);

  const triggerBurst = useCallback(
    (kind: ReactionKind, count: number) => {
      const burst: ReactionBurst = {
        id: `burst-${makeEventId()}`,
        kind,
        count,
        timestamp: Date.now(),
      };
      dispatch({
        type: 'reaction:burst',
        eventId: makeEventId(),
        burst,
        likeIncrement: count,
      });
    },
    [dispatch],
  );

  const sendGift = useCallback(
    (giftId: GiftId, sender: string, senderColor: string) => {
      dispatch({
        type: 'gift:send',
        eventId: makeEventId(),
        giftId,
        sender,
        senderColor,
      });
    },
    [dispatch],
  );

  const setActiveQa = useCallback(
    (qaId: string | null) => {
      dispatch({
        type: 'qa:set_active',
        eventId: makeEventId(),
        qaId,
      });
    },
    [dispatch],
  );

  const addQaItem = useCallback(
    (author: string, topic: string, question: string) => {
      const item: QaItem = {
        id: `qa-${makeEventId()}`,
        author: author.trim() || 'anonymous_listener',
        topic: topic.trim() || 'Manners',
        question: question.trim(),
        createdAt: Date.now(),
      };
      dispatch({
        type: 'qa:add',
        eventId: makeEventId(),
        item,
      });
      return item;
    },
    [dispatch],
  );

  const removeQaItem = useCallback(
    (qaId: string) => {
      dispatch({
        type: 'qa:remove',
        eventId: makeEventId(),
        qaId,
      });
    },
    [dispatch],
  );

  return {
    state,
    recentBursts,
    isConnected,
    setAspectMode,
    setHudScale,
    patchState,
    updateFaceFilter,
    toggleLive,
    resetTimer,
    pushChat,
    clearChat,
    triggerBurst,
    sendGift,
    setActiveQa,
    addQaItem,
    removeQaItem,
  };
}
