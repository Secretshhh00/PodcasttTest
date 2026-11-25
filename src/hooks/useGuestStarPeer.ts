import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export type GuestPeerConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting_stage'
  | 'connected'
  | 'kicked'
  | 'error';

export type GuestSignalPayload =
  | {
      type: 'guest:meta';
      name: string;
      camOff: boolean;
      micMuted: boolean;
      mirrored: boolean;
      needHostFrames?: boolean;
    }
  | { type: 'guest:frame'; frame: string }
  | { type: 'guest:bye' };

export type StageSignalPayload =
  | {
      type: 'stage:sync';
      hostName: string;
      streamTitle: string;
      isLive: boolean;
      guestMutedByHost: boolean;
      guestNameOverride?: string;
      stageNeedsFrames?: boolean;
    }
  | { type: 'stage:frame'; frame: string }
  | { type: 'stage:redial' }
  | { type: 'stage:kick' };

interface WsMediaRelayPacket {
  type: 'media:relay';
  roomId: string;
  role: 'guest' | 'host';
  frame?: string;
  camOff?: boolean;
  name?: string;
  mirrored?: boolean;
  micMuted?: boolean;
  joined?: boolean;
  bye?: boolean;
  hostName?: string;
  streamTitle?: string;
  isLive?: boolean;
  guestMutedByHost?: boolean;
  kick?: boolean;
  needFrames?: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

function sanitizeRoomId(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'hz-live';
}

export function getStagePeerId(roomId: string): string {
  return `ph-stage-${sanitizeRoomId(roomId)}`;
}

/**
 * Creates a live ticking fallback MediaStream with BOTH video & silent audio tracks
 * so WebRTC SDP negotiates both m-lines cleanly and allows seamless replaceTrack/redial.
 */
function createFallbackMediaStream(): {
  stream: MediaStream;
  cleanup: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  let frameToggle = false;
  const paint = () => {
    if (!ctx) return;
    frameToggle = !frameToggle;
    ctx.fillStyle = frameToggle ? '#090A0F' : '#0A0B11';
    ctx.fillRect(0, 0, 64, 64);
  };
  paint();
  const intervalId = window.setInterval(paint, 500);
  const stream = canvas.captureStream(2);

  let audioCtx: AudioContext | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
  } catch {
    // Ignore if AudioContext creation is restricted
  }

  return {
    stream,
    cleanup: () => {
      window.clearInterval(intervalId);
      stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) {
        audioCtx.close().catch(() => undefined);
      }
    },
  };
}

/**
 * Streams compressed JPEG frames from a local MediaStream when WebRTC UDP/TURN is blocked.
 */
function useFrameRelaySender(options: {
  enabled: boolean;
  stream: MediaStream | null;
  onFrame: (dataUrl: string) => void;
  fps?: number;
}) {
  const { enabled, stream, onFrame, fps = 11 } = options;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled || !stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.play().catch(() => undefined);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let disposed = false;

    const timer = window.setInterval(() => {
      if (disposed || !ctx) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;
      const targetW = 360;
      const aspect = video.videoHeight / video.videoWidth || 1.33;
      const targetH = Math.max(180, Math.round(targetW * aspect));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.drawImage(video, 0, 0, targetW, targetH);
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.58);
        onFrameRef.current(dataUrl);
      } catch {
        // Ignore canvas export error
      }
    }, Math.round(1000 / fps));

    return () => {
      disposed = true;
      window.clearInterval(timer);
      video.srcObject = null;
    };
  }, [enabled, fps, stream]);
}

/**
 * Used on LiveStageView (Host / Output Tab).
 * Listens on `ph-stage-<roomId>` via BOTH PeerJS WebRTC and `/ws` fallback relay
 * so Device 1 (mobile phone) always displays live even behind strict mobile NATs.
 */
export function useStageGuestPeer(options: {
  roomId: string;
  localStream: MediaStream | null;
  hostName: string;
  streamTitle: string;
  isLive: boolean;
  guestMuted: boolean;
  guestName: string;
  onGuestConnected: () => void;
  onGuestDisconnected: () => void;
  onGuestMeta: (meta: {
    name: string;
    camOff: boolean;
    micMuted: boolean;
    mirrored: boolean;
  }) => void;
}) {
  const {
    roomId,
    localStream,
    hostName,
    streamTitle,
    isLive,
    guestMuted,
    guestName,
    onGuestConnected,
    onGuestDisconnected,
    onGuestMeta,
  } = options;

  const [guestStream, setGuestStream] = useState<MediaStream | null>(null);
  const [guestFallbackFrame, setGuestFallbackFrame] = useState<string | null>(null);
  const [guestHasDecodedVideo, setGuestHasDecodedVideo] = useState(false);
  const [guestNeedsHostFrames, setGuestNeedsHostFrames] = useState(false);
  const [peerReady, setPeerReady] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const activeCallRef = useRef<MediaConnection | null>(null);
  const activeDataRef = useRef<DataConnection | null>(null);
  const wsRelayRef = useRef<WebSocket | null>(null);
  const answeredWithFallbackRef = useRef(false);
  const wsGuestActiveRef = useRef(false);
  const lastWsMetaKeyRef = useRef('');
  const localStreamRef = useRef<MediaStream | null>(localStream);
  localStreamRef.current = localStream;
  const guestDecodedRef = useRef(guestHasDecodedVideo);
  guestDecodedRef.current = guestHasDecodedVideo;

  const callbacksRef = useRef({
    onGuestConnected,
    onGuestDisconnected,
    onGuestMeta,
  });
  callbacksRef.current = {
    onGuestConnected,
    onGuestDisconnected,
    onGuestMeta,
  };

  const syncPayloadRef = useRef<StageSignalPayload>({
    type: 'stage:sync',
    hostName,
    streamTitle,
    isLive,
    guestMutedByHost: guestMuted,
    guestNameOverride: guestName,
    stageNeedsFrames: !guestHasDecodedVideo,
  });
  syncPayloadRef.current = {
    type: 'stage:sync',
    hostName,
    streamTitle,
    isLive,
    guestMutedByHost: guestMuted,
    guestNameOverride: guestName,
    stageNeedsFrames: !guestHasDecodedVideo,
  };

  const sendWsRelay = useCallback(
    (payload: Omit<WsMediaRelayPacket, 'type' | 'roomId' | 'role'>) => {
      const ws = wsRelayRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              type: 'media:relay',
              roomId,
              role: 'host',
              ...payload,
            } satisfies WsMediaRelayPacket),
          );
        } catch {
          // Ignore
        }
      }
    },
    [roomId],
  );

  // Push stage metadata updates to Guest Star whenever Host updates title/mute/live/decoded state
  useEffect(() => {
    const conn = activeDataRef.current;
    if (conn && conn.open) {
      try {
        conn.send(syncPayloadRef.current);
      } catch {
        // Ignore transient send errors
      }
    }
    sendWsRelay({
      hostName,
      streamTitle,
      isLive,
      guestMutedByHost: guestMuted,
      needFrames: !guestHasDecodedVideo,
    });
  }, [
    guestHasDecodedVideo,
    guestMuted,
    guestName,
    hostName,
    isLive,
    sendWsRelay,
    streamTitle,
  ]);

  // Send fallback Host frames to Guest Star if Guest Star cannot decode Host WebRTC stream
  useFrameRelaySender({
    enabled: guestNeedsHostFrames && Boolean(localStream),
    stream: localStream,
    onFrame: (frame) => {
      if (activeDataRef.current?.open) {
        try {
          activeDataRef.current.send({
            type: 'stage:frame',
            frame,
          } satisfies StageSignalPayload);
        } catch {
          // Ignore
        }
      }
      sendWsRelay({ frame });
    },
  });

  // Swap Host tracks into active RTCPeerConnection (or request redial if answered with fallback)
  useEffect(() => {
    const call = activeCallRef.current;
    if (!call || !localStream) return;

    if (call.peerConnection) {
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];
      const senders = call.peerConnection.getSenders();
      senders.forEach((sender) => {
        if (sender.track?.kind === 'video' && videoTrack) {
          sender.replaceTrack(videoTrack).catch(() => undefined);
        }
        if (sender.track?.kind === 'audio' && audioTrack) {
          sender.replaceTrack(audioTrack).catch(() => undefined);
        }
      });
    }

    if (answeredWithFallbackRef.current) {
      answeredWithFallbackRef.current = false;
      const conn = activeDataRef.current;
      if (conn && conn.open) {
        try {
          conn.send({ type: 'stage:redial' } satisfies StageSignalPayload);
        } catch {
          // Ignore
        }
      }
    }
  }, [localStream]);

  // WebSocket fallback relay listener (for AI Studio / Node server deployments)
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRelayRef.current = ws;

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data) as WsMediaRelayPacket;
          if (
            msg?.type !== 'media:relay' ||
            msg.roomId !== roomId ||
            msg.role !== 'guest'
          ) {
            return;
          }

          if (msg.bye) {
            wsGuestActiveRef.current = false;
            lastWsMetaKeyRef.current = '';
            setGuestFallbackFrame(null);
            setGuestNeedsHostFrames(false);
            if (!activeCallRef.current) {
              callbacksRef.current.onGuestDisconnected();
            }
            return;
          }

          if (msg.joined && !wsGuestActiveRef.current) {
            wsGuestActiveRef.current = true;
            callbacksRef.current.onGuestConnected();
            sendWsRelay({
              hostName,
              streamTitle,
              isLive,
              guestMutedByHost: guestMuted,
              needFrames: !guestDecodedRef.current,
            });
          }

          if (typeof msg.needFrames === 'boolean') {
            setGuestNeedsHostFrames(msg.needFrames);
          }

          if (msg.name !== undefined || msg.camOff !== undefined) {
            const metaKey = `${msg.name ?? ''}|${Boolean(msg.camOff)}|${Boolean(msg.micMuted)}|${msg.mirrored ?? true}`;
            if (metaKey !== lastWsMetaKeyRef.current) {
              lastWsMetaKeyRef.current = metaKey;
              callbacksRef.current.onGuestMeta({
                name: msg.name || 'Guest Star',
                camOff: Boolean(msg.camOff),
                micMuted: Boolean(msg.micMuted),
                mirrored: msg.mirrored ?? true,
              });
            }
          }

          if (msg.frame) {
            setGuestFallbackFrame(msg.frame);
            if (!wsGuestActiveRef.current) {
              wsGuestActiveRef.current = true;
              callbacksRef.current.onGuestConnected();
            }
          }
        } catch {
          // Ignore non-relay WS payloads
        }
      };

      ws.onerror = () => {
        // Silent — GitHub Pages static hosting has no /ws server
      };
    } catch {
      // Ignore WS creation failure
    }

    return () => {
      disposed = true;
      wsRelayRef.current = null;
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [guestMuted, hostName, isLive, roomId, sendWsRelay, streamTitle]);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | null = null;
    let fallbackCleanup: (() => void) | null = null;

    const closeGuestSession = (notifyDisconnected: boolean) => {
      if (activeCallRef.current) {
        activeCallRef.current.close();
        activeCallRef.current = null;
      }
      if (activeDataRef.current) {
        activeDataRef.current.close();
        activeDataRef.current = null;
      }
      if (fallbackCleanup) {
        fallbackCleanup();
        fallbackCleanup = null;
      }
      answeredWithFallbackRef.current = false;
      wsGuestActiveRef.current = false;
      lastWsMetaKeyRef.current = '';
      setGuestStream(null);
      setGuestFallbackFrame(null);
      setGuestHasDecodedVideo(false);
      setGuestNeedsHostFrames(false);
      if (notifyDisconnected) {
        callbacksRef.current.onGuestDisconnected();
      }
    };

    const initPeer = () => {
      if (disposed) return;
      const stageId = getStagePeerId(roomId);
      const peer = new Peer(stageId, {
        debug: 0,
        config: RTC_CONFIG,
      });
      peerRef.current = peer;

      peer.on('open', () => {
        if (!disposed) setPeerReady(true);
      });

      peer.on('disconnected', () => {
        if (!disposed && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch {
            // Ignore reconnect failure
          }
        }
      });

      peer.on('connection', (conn) => {
        const prevData = activeDataRef.current;
        activeDataRef.current = conn;
        if (prevData && prevData !== conn) {
          prevData.close();
        }

        conn.on('open', () => {
          try {
            conn.send(syncPayloadRef.current);
          } catch {
            // Ignore
          }
        });

        conn.on('data', (raw) => {
          const msg = raw as GuestSignalPayload;
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'guest:meta') {
            if (typeof msg.needHostFrames === 'boolean') {
              setGuestNeedsHostFrames(msg.needHostFrames);
            }
            callbacksRef.current.onGuestMeta({
              name: msg.name,
              camOff: msg.camOff,
              micMuted: msg.micMuted,
              mirrored: msg.mirrored,
            });
          } else if (msg.type === 'guest:frame') {
            setGuestFallbackFrame(msg.frame);
          } else if (msg.type === 'guest:bye') {
            closeGuestSession(true);
          }
        });

        conn.on('close', () => {
          if (activeDataRef.current === conn) {
            activeDataRef.current = null;
            closeGuestSession(true);
          }
        });
      });

      peer.on('call', (call) => {
        const prevCall = activeCallRef.current;
        activeCallRef.current = call;
        if (prevCall && prevCall !== call) {
          prevCall.close();
        }
        if (fallbackCleanup) {
          fallbackCleanup();
          fallbackCleanup = null;
        }

        let answerStream = localStreamRef.current;
        if (!answerStream) {
          const fb = createFallbackMediaStream();
          answerStream = fb.stream;
          fallbackCleanup = fb.cleanup;
          answeredWithFallbackRef.current = true;
        } else {
          answeredWithFallbackRef.current = false;
        }

        call.answer(answerStream);

        if (call.peerConnection) {
          call.peerConnection.oniceconnectionstatechange = () => {
            const state = call.peerConnection?.iceConnectionState;
            if (state === 'failed') {
              call.peerConnection?.restartIce?.();
            }
          };
        }

        call.on('stream', (remoteStream) => {
          if (disposed || activeCallRef.current !== call) return;
          setGuestStream(remoteStream);
          callbacksRef.current.onGuestConnected();
        });

        call.on('close', () => {
          if (activeCallRef.current === call) {
            activeCallRef.current = null;
            setGuestStream(null);
            if (!wsGuestActiveRef.current) {
              callbacksRef.current.onGuestDisconnected();
            }
          }
        });

        call.on('error', () => {
          if (activeCallRef.current === call) {
            activeCallRef.current = null;
            setGuestStream(null);
            if (!wsGuestActiveRef.current) {
              callbacksRef.current.onGuestDisconnected();
            }
          }
        });
      });

      peer.on('error', (err) => {
        if (disposed) return;
        if (
          err.type === 'unavailable-id' ||
          err.type === 'network' ||
          err.type === 'server-error' ||
          err.type === 'socket-error'
        ) {
          setPeerReady(false);
          retryTimer = window.setTimeout(() => {
            if (!disposed) {
              peer.destroy();
              initPeer();
            }
          }, 1800);
        }
      });
    };

    initPeer();

    const handleBeforeUnload = () => {
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setPeerReady(false);
      if (retryTimer) window.clearTimeout(retryTimer);
      closeGuestSession(false);
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [roomId]);

  const disconnectGuest = useCallback(() => {
    if (activeDataRef.current && activeDataRef.current.open) {
      try {
        activeDataRef.current.send({
          type: 'stage:kick',
        } satisfies StageSignalPayload);
      } catch {
        // Ignore
      }
    }
    sendWsRelay({ kick: true });
    if (activeCallRef.current) {
      activeCallRef.current.close();
      activeCallRef.current = null;
    }
    if (activeDataRef.current) {
      activeDataRef.current.close();
      activeDataRef.current = null;
    }
    wsGuestActiveRef.current = false;
    lastWsMetaKeyRef.current = '';
    setGuestStream(null);
    setGuestFallbackFrame(null);
    setGuestHasDecodedVideo(false);
    callbacksRef.current.onGuestDisconnected();
  }, [sendWsRelay]);

  return {
    guestStream,
    guestFallbackFrame,
    setGuestHasDecodedVideo,
    peerReady,
    disconnectGuest,
  };
}

/**
 * Used on GuestStarView (Device 1 / Guest Star Join Link).
 * Connects to Host's Live Stage `ph-stage-<roomId>` via PeerJS WebRTC + `/ws` fallback relay.
 */
export function useGuestDevicePeer(options: {
  roomId: string;
  localStream: MediaStream | null;
  guestName: string;
  camOff: boolean;
  micMuted: boolean;
  mirrored: boolean;
}) {
  const { roomId, localStream, guestName, camOff, micMuted, mirrored } = options;

  const [status, setStatus] = useState<GuestPeerConnectionStatus>('idle');
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [hostFallbackFrame, setHostFallbackFrame] = useState<string | null>(null);
  const [hostHasDecodedVideo, setHostHasDecodedVideo] = useState(false);
  const [stageNeedsFrames, setStageNeedsFrames] = useState(true);
  const [wsRelayConnected, setWsRelayConnected] = useState(false);
  const [stageInfo, setStageInfo] = useState<{
    hostName: string;
    streamTitle: string;
    isLive: boolean;
    guestMutedByHost: boolean;
  }>({
    hostName: 'podcastHorizon',
    streamTitle: 'Manners & Magic Words · Cozy Talk',
    isLive: true,
    guestMutedByHost: false,
  });

  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const dataRef = useRef<DataConnection | null>(null);
  const wsRelayRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const joinedWantedRef = useRef(false);
  const calledWithFallbackRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  localStreamRef.current = localStream;
  const fallbackCleanupRef = useRef<(() => void) | null>(null);

  const metaRef = useRef<GuestSignalPayload>({
    type: 'guest:meta',
    name: guestName,
    camOff,
    micMuted,
    mirrored,
    needHostFrames: !hostHasDecodedVideo,
  });
  metaRef.current = {
    type: 'guest:meta',
    name: guestName.trim() || 'Guest Star',
    camOff,
    micMuted,
    mirrored,
    needHostFrames: !hostHasDecodedVideo,
  };

  const sendWsRelay = useCallback(
    (payload: Omit<WsMediaRelayPacket, 'type' | 'roomId' | 'role'>) => {
      const ws = wsRelayRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              type: 'media:relay',
              roomId,
              role: 'guest',
              ...payload,
            } satisfies WsMediaRelayPacket),
          );
        } catch {
          // Ignore
        }
      }
    },
    [roomId],
  );

  // Send metadata updates whenever Guest edits name, toggles cam/mic, or flips mirror
  useEffect(() => {
    if (dataRef.current && dataRef.current.open) {
      try {
        dataRef.current.send(metaRef.current);
      } catch {
        // Ignore
      }
    }
    if (joinedWantedRef.current) {
      sendWsRelay({
        name: guestName.trim() || 'Guest Star',
        camOff,
        micMuted,
        mirrored,
        needFrames: !hostHasDecodedVideo,
      });
    }
  }, [guestName, camOff, micMuted, mirrored, hostHasDecodedVideo, sendWsRelay]);

  // Send lightweight camera frame fallback when Stage hasn't decoded WebRTC video yet
  const isActivelyJoined =
    status === 'connecting' || status === 'connected' || status === 'waiting_stage';

  useFrameRelaySender({
    enabled:
      isActivelyJoined &&
      !camOff &&
      Boolean(localStream) &&
      stageNeedsFrames &&
      (wsRelayConnected || Boolean(dataRef.current?.open)),
    stream: localStream,
    onFrame: (frame) => {
      if (dataRef.current?.open) {
        try {
          dataRef.current.send({
            type: 'guest:frame',
            frame,
          } satisfies GuestSignalPayload);
        } catch {
          // Ignore
        }
      }
      sendWsRelay({
        frame,
      });
    },
  });

  const cleanupPeer = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (dataRef.current) {
      if (dataRef.current.open) {
        try {
          dataRef.current.send({
            type: 'guest:bye',
          } satisfies GuestSignalPayload);
        } catch {
          // Ignore
        }
      }
      dataRef.current.close();
      dataRef.current = null;
    }
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (fallbackCleanupRef.current) {
      fallbackCleanupRef.current();
      fallbackCleanupRef.current = null;
    }
    calledWithFallbackRef.current = false;
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (wsRelayRef.current && wsRelayRef.current.readyState <= WebSocket.OPEN) {
      sendWsRelay({ bye: true });
      wsRelayRef.current.close();
      wsRelayRef.current = null;
    }
    setWsRelayConnected(false);
    setHostStream(null);
    setHostFallbackFrame(null);
    setHostHasDecodedVideo(false);
    setStageNeedsFrames(true);
  }, [sendWsRelay]);

  const connectToStage = useCallback(() => {
    if (!joinedWantedRef.current) return;
    cleanupPeer();
    setStatus('connecting');

    // Open parallel /ws relay channel if server.ts is available
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRelayRef.current = ws;

      ws.onopen = () => {
        if (!joinedWantedRef.current) return;
        setWsRelayConnected(true);
        sendWsRelay({
          joined: true,
          name: metaRef.current.type === 'guest:meta' ? metaRef.current.name : 'Guest Star',
          camOff: metaRef.current.type === 'guest:meta' ? metaRef.current.camOff : false,
          micMuted: metaRef.current.type === 'guest:meta' ? metaRef.current.micMuted : false,
          mirrored: metaRef.current.type === 'guest:meta' ? metaRef.current.mirrored : true,
          needFrames: true,
        });
      };

      ws.onmessage = (event) => {
        if (!joinedWantedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as WsMediaRelayPacket;
          if (
            msg?.type !== 'media:relay' ||
            msg.roomId !== roomId ||
            msg.role !== 'host'
          ) {
            return;
          }

          if (msg.kick) {
            joinedWantedRef.current = false;
            cleanupPeer();
            setStatus('kicked');
            return;
          }

          if (msg.hostName || msg.streamTitle) {
            setStageInfo((prev) => ({
              hostName: msg.hostName ?? prev.hostName,
              streamTitle: msg.streamTitle ?? prev.streamTitle,
              isLive: msg.isLive ?? prev.isLive,
              guestMutedByHost: msg.guestMutedByHost ?? prev.guestMutedByHost,
            }));
            setStatus((prev) => (prev === 'connecting' || prev === 'waiting_stage' ? 'connected' : prev));
          }

          if (typeof msg.needFrames === 'boolean') {
            setStageNeedsFrames(msg.needFrames);
          }

          if (msg.frame) {
            setHostFallbackFrame(msg.frame);
            setStatus('connected');
          }
        } catch {
          // Ignore non-relay payloads
        }
      };

      ws.onclose = () => {
        setWsRelayConnected(false);
      };
    } catch {
      // Ignore WS creation failure on static hosting
    }

    const guestId = `ph-guest-${sanitizeRoomId(roomId)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const targetStageId = getStagePeerId(roomId);

    const peer = new Peer(guestId, {
      debug: 0,
      config: RTC_CONFIG,
    });
    peerRef.current = peer;

    const dialStage = () => {
      if (!joinedWantedRef.current || peer.destroyed) return;

      const dataConn = peer.connect(targetStageId, { reliable: true });
      dataRef.current = dataConn;

      dataConn.on('open', () => {
        try {
          dataConn.send(metaRef.current);
        } catch {
          // Ignore
        }
      });

      dataConn.on('data', (raw) => {
        const msg = raw as StageSignalPayload;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'stage:sync') {
          setStageInfo({
            hostName: msg.hostName,
            streamTitle: msg.streamTitle,
            isLive: msg.isLive,
            guestMutedByHost: msg.guestMutedByHost,
          });
          if (typeof msg.stageNeedsFrames === 'boolean') {
            setStageNeedsFrames(msg.stageNeedsFrames);
          }
        } else if (msg.type === 'stage:frame') {
          setHostFallbackFrame(msg.frame);
        } else if (msg.type === 'stage:redial') {
          if (joinedWantedRef.current) {
            connectToStage();
          }
        } else if (msg.type === 'stage:kick') {
          joinedWantedRef.current = false;
          cleanupPeer();
          setStatus('kicked');
        }
      });

      dataConn.on('close', () => {
        if (joinedWantedRef.current && dataRef.current === dataConn) {
          const wsOpen = wsRelayRef.current?.readyState === WebSocket.OPEN;
          if (!wsOpen) {
            setStatus('waiting_stage');
          }
          retryTimerRef.current = window.setTimeout(connectToStage, 2400);
        }
      });

      let callStream = localStreamRef.current;
      if (!callStream) {
        const fb = createFallbackMediaStream();
        callStream = fb.stream;
        fallbackCleanupRef.current = fb.cleanup;
        calledWithFallbackRef.current = true;
      } else {
        calledWithFallbackRef.current = false;
      }

      const call = peer.call(targetStageId, callStream);
      callRef.current = call;

      if (!call) {
        if (wsRelayRef.current?.readyState !== WebSocket.OPEN) {
          setStatus('waiting_stage');
        }
        retryTimerRef.current = window.setTimeout(dialStage, 2400);
        return;
      }

      if (call.peerConnection) {
        call.peerConnection.oniceconnectionstatechange = () => {
          const state = call.peerConnection?.iceConnectionState;
          if (state === 'failed') {
            call.peerConnection?.restartIce?.();
          }
        };
      }

      call.on('stream', (remoteStream) => {
        if (!joinedWantedRef.current || callRef.current !== call) return;
        setHostStream(remoteStream);
        setStatus('connected');
      });

      window.setTimeout(() => {
        if (
          joinedWantedRef.current &&
          callRef.current === call &&
          dataConn.open
        ) {
          setStatus((prev) => (prev === 'connecting' ? 'connected' : prev));
        }
      }, 1500);

      call.on('close', () => {
        if (joinedWantedRef.current && callRef.current === call) {
          setHostStream(null);
          if (wsRelayRef.current?.readyState !== WebSocket.OPEN) {
            setStatus('waiting_stage');
          }
          retryTimerRef.current = window.setTimeout(connectToStage, 2400);
        }
      });
    };

    peer.on('open', () => {
      dialStage();
    });

    peer.on('disconnected', () => {
      if (joinedWantedRef.current && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // Ignore
        }
      }
    });

    peer.on('error', (err) => {
      if (!joinedWantedRef.current) return;
      if (
        err.type === 'peer-unavailable' ||
        err.type === 'network' ||
        err.type === 'server-error' ||
        err.type === 'socket-error'
      ) {
        if (wsRelayRef.current?.readyState !== WebSocket.OPEN) {
          setStatus('waiting_stage');
          retryTimerRef.current = window.setTimeout(() => {
            if (joinedWantedRef.current) connectToStage();
          }, 2400);
        }
      } else {
        setStatus('error');
      }
    });
  }, [cleanupPeer, roomId, sendWsRelay]);

  // Replace tracks cleanly when switching cameras, OR re-dial if initial call used fallback stream
  useEffect(() => {
    const call = callRef.current;
    if (!call || !localStream || !joinedWantedRef.current) return;

    if (calledWithFallbackRef.current) {
      connectToStage();
      return;
    }

    if (call.peerConnection) {
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];
      const senders = call.peerConnection.getSenders();
      senders.forEach((sender) => {
        if (sender.track?.kind === 'video' && videoTrack) {
          sender.replaceTrack(videoTrack).catch(() => undefined);
        }
        if (sender.track?.kind === 'audio' && audioTrack) {
          sender.replaceTrack(audioTrack).catch(() => undefined);
        }
      });
    }
  }, [connectToStage, localStream]);

  const joinLive = useCallback(() => {
    joinedWantedRef.current = true;
    connectToStage();
  }, [connectToStage]);

  const leaveLive = useCallback(() => {
    joinedWantedRef.current = false;
    cleanupPeer();
    setStatus('idle');
  }, [cleanupPeer]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupPeer();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      joinedWantedRef.current = false;
      cleanupPeer();
    };
  }, [cleanupPeer]);

  return {
    status,
    hostStream,
    hostFallbackFrame,
    setHostHasDecodedVideo,
    stageInfo,
    joinLive,
    leaveLive,
  };
}
