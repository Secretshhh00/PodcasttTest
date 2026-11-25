import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  CHAT_PHASES,
  GIFT_CATALOG,
  INITIAL_QA_QUEUE,
} from './src/data/podcastData.ts';
import type {
  ActiveGift,
  LiveState,
  SyncClientAction,
  SyncServerMessage,
} from './src/types/live.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const COMBO_WINDOW_MS = 4500;
const FILTER_DURATION_MS = 14000;

const initialSeedMessages = CHAT_PHASES[0].lines.slice(0, 5).map((line, idx) => ({
  id: `seed-${line.id}`,
  username: line.username,
  text: line.text,
  replyTo: line.replyTo,
  badge: line.badge,
  avatarColor: line.avatarColor,
  timestamp: Date.now() - (5 - idx) * 3500,
}));

let liveState: LiveState = {
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
  chatMessages: initialSeedMessages,
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
  guestStar: {
    enabled: false,
    roomId: `hz-${Math.random().toString(36).slice(2, 6)}`,
    guestName: 'Guest Star',
    guestJoined: false,
    guestMuted: false,
    guestCamOff: false,
    guestMirrored: true,
  },
};

function pruneExpired(state: LiveState): LiveState {
  const now = Date.now();
  const activeGifts = state.activeGifts.filter((g) => g.expiresAt > now);
  const filterExpired =
    !state.faceFilter.pinned &&
    state.faceFilter.activeFilter !== null &&
    state.faceFilter.expiresAt !== null &&
    state.faceFilter.expiresAt <= now;

  if (activeGifts.length === state.activeGifts.length && !filterExpired) {
    return state;
  }

  return {
    ...state,
    activeGifts,
    faceFilter: filterExpired
      ? {
          ...state.faceFilter,
          activeFilter: null,
          activatedBy: null,
          expiresAt: null,
        }
      : state.faceFilter,
  };
}

function applyAction(action: SyncClientAction): LiveState {
  liveState = pruneExpired(liveState);

  switch (action.type) {
    case 'state:request':
      return liveState;

    case 'state:patch': {
      liveState = {
        ...liveState,
        ...action.patch,
        nowPlaying: action.patch.nowPlaying
          ? { ...liveState.nowPlaying, ...action.patch.nowPlaying }
          : liveState.nowPlaying,
        ambientAudio: action.patch.ambientAudio
          ? { ...liveState.ambientAudio, ...action.patch.ambientAudio }
          : liveState.ambientAudio,
        faceFilter: action.patch.faceFilter
          ? { ...liveState.faceFilter, ...action.patch.faceFilter }
          : liveState.faceFilter,
        guestStar: action.patch.guestStar
          ? { ...liveState.guestStar, ...action.patch.guestStar }
          : liveState.guestStar,
      };
      return liveState;
    }

    case 'stream:toggle_live': {
      liveState = {
        ...liveState,
        isLive: action.isLive,
        startedAt: action.isLive ? liveState.startedAt ?? Date.now() : null,
      };
      return liveState;
    }

    case 'stream:reset_timer': {
      liveState = {
        ...liveState,
        startedAt: Date.now(),
      };
      return liveState;
    }

    case 'chat:push': {
      const exists = liveState.chatMessages.some(
        (m) => m.id === action.message.id,
      );
      if (exists) return liveState;
      const nextMessages = [...liveState.chatMessages, action.message].slice(-80);
      liveState = {
        ...liveState,
        chatMessages: nextMessages,
      };
      return liveState;
    }

    case 'chat:clear': {
      liveState = {
        ...liveState,
        chatMessages: [],
      };
      return liveState;
    }

    case 'reaction:burst': {
      liveState = {
        ...liveState,
        likeCount: liveState.likeCount + action.likeIncrement,
      };
      return liveState;
    }

    case 'gift:send': {
      const giftDef = GIFT_CATALOG.find((g) => g.id === action.giftId);
      if (!giftDef) return liveState;

      const now = Date.now();
      const existingIdx = liveState.activeGifts.findIndex(
        (g) =>
          g.giftId === action.giftId &&
          g.sender.toLowerCase() === action.sender.toLowerCase() &&
          g.expiresAt > now,
      );

      let nextGifts: ActiveGift[];
      if (existingIdx >= 0) {
        const current = liveState.activeGifts[existingIdx];
        const updated: ActiveGift = {
          ...current,
          comboCount: current.comboCount + 1,
          updatedAt: now,
          expiresAt: now + COMBO_WINDOW_MS,
        };
        nextGifts = [...liveState.activeGifts];
        nextGifts[existingIdx] = updated;
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
        nextGifts = [...liveState.activeGifts.slice(-2), newGift];
      }

      const nextFaceFilter = giftDef.filterId
        ? {
            ...liveState.faceFilter,
            activeFilter: giftDef.filterId,
            activatedBy: action.sender,
            expiresAt: liveState.faceFilter.pinned
              ? null
              : now + FILTER_DURATION_MS,
          }
        : liveState.faceFilter;

      liveState = {
        ...liveState,
        activeGifts: nextGifts,
        faceFilter: nextFaceFilter,
        likeCount: liveState.likeCount + giftDef.coins * 3,
      };
      return liveState;
    }

    case 'filter:update': {
      liveState = {
        ...liveState,
        faceFilter: {
          ...liveState.faceFilter,
          ...action.patch,
        },
      };
      return liveState;
    }

    case 'guest:update': {
      liveState = {
        ...liveState,
        guestStar: {
          ...liveState.guestStar,
          ...action.patch,
        },
      };
      return liveState;
    }

    case 'qa:set_active': {
      liveState = {
        ...liveState,
        activeQaId: action.qaId,
      };
      return liveState;
    }

    case 'qa:add': {
      const exists = liveState.qaQueue.some((q) => q.id === action.item.id);
      if (exists) return liveState;
      liveState = {
        ...liveState,
        qaQueue: [action.item, ...liveState.qaQueue],
      };
      return liveState;
    }

    case 'qa:remove': {
      liveState = {
        ...liveState,
        qaQueue: liveState.qaQueue.filter((q) => q.id !== action.qaId),
        activeQaId:
          liveState.activeQaId === action.qaId ? null : liveState.activeQaId,
      };
      return liveState;
    }

    default:
      return liveState;
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (payload: SyncServerMessage) => {
    const serialized = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  wss.on('connection', (ws) => {
    liveState = pruneExpired(liveState);
    const initialPayload: SyncServerMessage = {
      type: 'state:full',
      state: liveState,
    };
    ws.send(JSON.stringify(initialPayload));

    ws.on('message', (raw) => {
      try {
        const rawStr = raw.toString();
        const parsed = JSON.parse(rawStr) as
          | SyncClientAction
          | { type: 'media:relay'; roomId: string; role: 'guest' | 'host'; frame?: string; camOff?: boolean; name?: string };

        if (parsed.type === 'media:relay') {
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(rawStr);
            }
          }
          return;
        }

        if (parsed.type === 'state:request') {
          liveState = pruneExpired(liveState);
          const reply: SyncServerMessage = {
            type: 'state:full',
            state: liveState,
          };
          ws.send(JSON.stringify(reply));
          return;
        }
        const updatedState = applyAction(parsed);
        broadcast({
          type: 'event:broadcast',
          action: parsed,
          state: updatedState,
        });
      } catch {
        // Ignore malformed packets
      }
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, host: liveState.hostName });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`podcastHorizon Live Studio running on http://localhost:${PORT}`);
  });
}

startServer();
