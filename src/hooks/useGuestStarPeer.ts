import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import { CloudRelayClient } from '../utils/cloudRelay.ts';

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

interface RelayPacket {
  type: 'media:relay';
  roomId: string;
  role: 'guest' | 'host';
  frame?: string;
  camOff?: boolean;
  name?: string;
  mirrored?: boolean;
  micMuted?: boolean;
  joined?: boolean;
  heartbeat?: boolean;
  bye?: boolean;
  hostName?: string;
  streamTitle?: string;
  isLive?: boolean;
  guestMutedByHost?: boolean;
  kick?: boolean;
  needFrames?: boolean;
}

// Fast reachable STUN servers (avoid dead public TURN servers that stall ICE gathering)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

function sanitizeRoomId(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'hz-live';
}

export function getStagePeerId(roomId: string): string {
  return `ph-stage-${sanitizeRoomId(roomId)}`;
}

function getTopicHostToGuest(roomId: string): string {
  return `podcasthorizon/v1/room/${sanitizeRoomId(roomId)}/host`;
}

function getTopicGuestToHost(roomId: string): string {
  return `podcasthorizon/v1/room/${sanitizeRoomId(roomId)}/guest`;
}

function supportsLocalWs(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.location.hostname.endsWith('.github.io');
}

/**
 * Creates a live ticking fallback MediaStream with BOTH video & silent audio tracks
 * so WebRTC SDP negotiates both m-lines cleanly and allows seamless track replacement.
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
 * Streams lightweight JPEG frames from a local MediaStream over WSS / DataChannel
 * whenever WebRTC UDP cannot traverse mobile carrier CGNAT.
 * IMPORTANT: Appends a tiny 2px off-screen <video> into document.body so iOS Safari
 * & Android Chrome do not suspend off-DOM MediaStream video decoding.
 */
function useFrameRelaySender(options: {
  enabled: boolean;
  stream: MediaStream | null;
  onFrame: (dataUrl: string) => void;
  fps?: number;
}) {
  const { enabled, stream, onFrame, fps = 9 } = options;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled || !stream) return;
    if (stream.getVideoTracks().length === 0) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('muted', 'true');
    video.style.position = 'fixed';
    video.style.left = '-24px';
    video.style.top = '-24px';
    video.style.width = '2px';
    video.style.height = '2px';
    video.style.opacity = '0.001';
    video.style.pointerEvents = 'none';
    video.srcObject = stream;
    document.body.appendChild(video);
    video.play().catch(() => undefined);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let disposed = false;

    const timer = window.setInterval(() => {
      if (disposed || !ctx) return;
      if (video.paused) {
        video.play().catch(() => undefined);
      }
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }
      const maxDim = 320;
      const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
      const targetW = Math.max(120, Math.round(video.videoWidth * scale));
      const targetH = Math.max(120, Math.round(video.videoHeight * scale));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.drawImage(video, 0, 0, targetW, targetH);
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.56);
        onFrameRef.current(dataUrl);
      } catch {
        // Ignore transient canvas export errors
      }
    }, Math.round(1000 / fps));

    return () => {
      disposed = true;
      window.clearInterval(timer);
      video.srcObject = null;
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    };
  }, [enabled, fps, stream]);
}

/**
 * Used on LiveStageView (Host / Output Tab).
 * Listens simultaneously via PeerJS WebRTC, Cloud WSS Relay (works on GitHub Pages!),
 * and local `/ws` relay so Device 1 (mobile phone) displays reliably across any network.
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
  const [guestNeedsHostFrames, setGuestNeedsHostFrames] = useState(true);
  const [relayGuestConnected, setRelayGuestConnected] = useState(false);
  const [peerReady, setPeerReady] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const activeCallRef = useRef<MediaConnection | null>(null);
  const activeDataRef = useRef<DataConnection | null>(null);
  const wsRelayRef = useRef<WebSocket | null>(null);
  const cloudRelayRef = useRef<CloudRelayClient | null>(null);
  const answeredWithFallbackRef = useRef(false);
  const relayGuestActiveRef = useRef(false);
  const lastGuestActivityRef = useRef(0);
  const lastMetaKeyRef = useRef('');

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

  const stageMetaRef = useRef({
    hostName,
    streamTitle,
    isLive,
    guestMuted,
    guestName,
  });
  stageMetaRef.current = {
    hostName,
    streamTitle,
    isLive,
    guestMuted,
    guestName,
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

  const sendRelayPacket = useCallback(
    (payload: Omit<RelayPacket, 'type' | 'roomId' | 'role'>) => {
      const fullPacket: RelayPacket = {
        type: 'media:relay',
        roomId,
        role: 'host',
        ...payload,
      };
      cloudRelayRef.current?.publish(getTopicHostToGuest(roomId), fullPacket);
      const ws = wsRelayRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(fullPacket));
        } catch {
          // Ignore
        }
      }
    },
    [roomId],
  );

  const handleIncomingRelayMessage = useCallback(
    (msg: RelayPacket) => {
      if (
        !msg ||
        msg.type !== 'media:relay' ||
        msg.roomId !== roomId ||
        msg.role !== 'guest'
      ) {
        return;
      }

      if (msg.bye) {
        relayGuestActiveRef.current = false;
        lastMetaKeyRef.current = '';
        setRelayGuestConnected(false);
        setGuestFallbackFrame(null);
        setGuestNeedsHostFrames(true);
        if (!activeCallRef.current) {
          callbacksRef.current.onGuestDisconnected();
        }
        return;
      }

      lastGuestActivityRef.current = Date.now();

      if (msg.joined || !relayGuestActiveRef.current) {
        const wasActive = relayGuestActiveRef.current;
        relayGuestActiveRef.current = true;
        setRelayGuestConnected(true);
        if (!wasActive) {
          callbacksRef.current.onGuestConnected();
        }
        if (msg.joined || !wasActive) {
          const meta = stageMetaRef.current;
          sendRelayPacket({
            hostName: meta.hostName,
            streamTitle: meta.streamTitle,
            isLive: meta.isLive,
            guestMutedByHost: meta.guestMuted,
            needFrames: !guestDecodedRef.current,
          });
        }
      }

      if (typeof msg.needFrames === 'boolean') {
        setGuestNeedsHostFrames(msg.needFrames);
      }

      if (msg.name !== undefined || msg.camOff !== undefined) {
        const metaKey = `${msg.name ?? ''}|${Boolean(msg.camOff)}|${Boolean(msg.micMuted)}|${msg.mirrored ?? true}`;
        if (metaKey !== lastMetaKeyRef.current) {
          lastMetaKeyRef.current = metaKey;
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
      }
    },
    [roomId, sendRelayPacket],
  );

  const handleRelayRef = useRef(handleIncomingRelayMessage);
  handleRelayRef.current = handleIncomingRelayMessage;

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
    sendRelayPacket({
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
    sendRelayPacket,
    streamTitle,
  ]);

  // Send fallback Host frames to Guest Star whenever Guest needs frames over relay
  useFrameRelaySender({
    enabled:
      guestNeedsHostFrames &&
      Boolean(localStream) &&
      (relayGuestConnected || Boolean(activeCallRef.current)),
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
      sendRelayPacket({ frame });
    },
  });

  // Swap Host tracks into active RTCPeerConnection (or request redial if answered with fallback)
  useEffect(() => {
    const call = activeCallRef.current;
    if (!call || !localStream) return;

    if (call.peerConnection) {
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];
      call.peerConnection.getSenders().forEach((sender) => {
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

  // Cloud WSS Relay + Optional Local /ws Relay + Staleness Watchdog
  useEffect(() => {
    const cloud = new CloudRelayClient({
      subscribeTopic: getTopicGuestToHost(roomId),
      onMessage: (raw) => {
        handleRelayRef.current(raw as RelayPacket);
      },
    });
    cloudRelayRef.current = cloud;

    let ws: WebSocket | null = null;
    if (supportsLocalWs()) {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRelayRef.current = ws;
        ws.onmessage = (event) => {
          try {
            handleRelayRef.current(JSON.parse(event.data) as RelayPacket);
          } catch {
            // Ignore non-relay payloads
          }
        };
        ws.onerror = () => {
          // Silent fallback
        };
      } catch {
        // Ignore WS failure
      }
    }

    const watchdogTimer = window.setInterval(() => {
      if (
        relayGuestActiveRef.current &&
        !activeCallRef.current &&
        Date.now() - lastGuestActivityRef.current > 15000
      ) {
        relayGuestActiveRef.current = false;
        lastMetaKeyRef.current = '';
        setRelayGuestConnected(false);
        setGuestFallbackFrame(null);
        callbacksRef.current.onGuestDisconnected();
      }
    }, 3000);

    return () => {
      window.clearInterval(watchdogTimer);
      cloud.close();
      cloudRelayRef.current = null;
      wsRelayRef.current = null;
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomId]);

  // PeerJS WebRTC Listener (Native HD Video & Bidirectional Audio when NAT allows)
  useEffect(() => {
    let disposed = false;
    let retryTimer: number | null = null;
    let fallbackCleanup: (() => void) | null = null;

    const closeWebRtcSession = (notifyIfNoRelay: boolean) => {
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
      setGuestStream(null);
      setGuestHasDecodedVideo(false);
      if (notifyIfNoRelay && !relayGuestActiveRef.current) {
        setGuestFallbackFrame(null);
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
            // Ignore
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
            relayGuestActiveRef.current = false;
            setRelayGuestConnected(false);
            setGuestFallbackFrame(null);
            closeWebRtcSession(true);
          }
        });

        conn.on('close', () => {
          if (activeDataRef.current === conn) {
            activeDataRef.current = null;
            closeWebRtcSession(true);
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
            const iceState = call.peerConnection?.iceConnectionState;
            if (iceState === 'failed') {
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
            if (!relayGuestActiveRef.current) {
              callbacksRef.current.onGuestDisconnected();
            }
          }
        });

        call.on('error', () => {
          if (activeCallRef.current === call) {
            activeCallRef.current = null;
            setGuestStream(null);
            if (!relayGuestActiveRef.current) {
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
          }, 2200);
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
      closeWebRtcSession(false);
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
    sendRelayPacket({ kick: true });
    if (activeCallRef.current) {
      activeCallRef.current.close();
      activeCallRef.current = null;
    }
    if (activeDataRef.current) {
      activeDataRef.current.close();
      activeDataRef.current = null;
    }
    relayGuestActiveRef.current = false;
    lastMetaKeyRef.current = '';
    setRelayGuestConnected(false);
    setGuestStream(null);
    setGuestFallbackFrame(null);
    setGuestHasDecodedVideo(false);
    callbacksRef.current.onGuestDisconnected();
  }, [sendRelayPacket]);

  return {
    guestStream,
    guestFallbackFrame,
    setGuestHasDecodedVideo,
    peerReady: peerReady || relayGuestConnected,
    disconnectGuest,
  };
}

/**
 * Used on GuestStarView (Device 1 / Guest Star Join Link).
 * Maintains an always-on Cloud WSS Relay connection (works on GitHub Pages & mobile 4G)
 * while independently attempting WebRTC PeerJS upgrade without causing reconnect loops.
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
  const [cloudRelayOpen, setCloudRelayOpen] = useState(false);
  const [wsRelayOpen, setWsRelayOpen] = useState(false);
  const [dataConnOpen, setDataConnOpen] = useState(false);
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
  const cloudRelayRef = useRef<CloudRelayClient | null>(null);
  const webrtcRetryTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const webrtcAttemptsRef = useRef(0);
  const joinedWantedRef = useRef(false);
  const calledWithFallbackRef = useRef(false);
  const hostSeenOverRelayRef = useRef(false);
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

  const sendRelayPacket = useCallback(
    (payload: Omit<RelayPacket, 'type' | 'roomId' | 'role'>) => {
      const fullPacket: RelayPacket = {
        type: 'media:relay',
        roomId,
        role: 'guest',
        ...payload,
      };
      cloudRelayRef.current?.publish(getTopicGuestToHost(roomId), fullPacket);
      const ws = wsRelayRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(fullPacket));
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
      sendRelayPacket({
        name: guestName.trim() || 'Guest Star',
        camOff,
        micMuted,
        mirrored,
        needFrames: !hostHasDecodedVideo,
      });
    }
  }, [
    camOff,
    guestName,
    hostHasDecodedVideo,
    micMuted,
    mirrored,
    sendRelayPacket,
  ]);

  const isActivelyJoined =
    status === 'connecting' || status === 'connected' || status === 'waiting_stage';

  // Stream Guest Star camera frames over WSS/DataChannel whenever Stage needs them
  useFrameRelaySender({
    enabled:
      isActivelyJoined &&
      !camOff &&
      Boolean(localStream) &&
      stageNeedsFrames &&
      (cloudRelayOpen || wsRelayOpen || dataConnOpen),
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
      sendRelayPacket({ frame });
    },
  });

  const cleanupWebRtc = useCallback(() => {
    if (webrtcRetryTimerRef.current) {
      window.clearTimeout(webrtcRetryTimerRef.current);
      webrtcRetryTimerRef.current = null;
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
    setDataConnOpen(false);
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
    setHostStream(null);
    setHostHasDecodedVideo(false);
  }, []);

  const cleanupAll = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    cleanupWebRtc();
    sendRelayPacket({ bye: true });
    if (cloudRelayRef.current) {
      cloudRelayRef.current.close();
      cloudRelayRef.current = null;
    }
    if (wsRelayRef.current && wsRelayRef.current.readyState <= WebSocket.OPEN) {
      wsRelayRef.current.close();
      wsRelayRef.current = null;
    }
    hostSeenOverRelayRef.current = false;
    setCloudRelayOpen(false);
    setWsRelayOpen(false);
    setHostFallbackFrame(null);
    setStageNeedsFrames(true);
  }, [cleanupWebRtc, sendRelayPacket]);

  const startWebRtcPeer = useCallback(() => {
    if (!joinedWantedRef.current) return;
    cleanupWebRtc();

    const guestId = `ph-guest-${sanitizeRoomId(roomId)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const targetStageId = getStagePeerId(roomId);

    const peer = new Peer(guestId, {
      debug: 0,
      config: RTC_CONFIG,
    });
    peerRef.current = peer;

    const scheduleQuietWebRtcRetry = () => {
      if (!joinedWantedRef.current) return;
      if (webrtcAttemptsRef.current >= 2) return;
      webrtcAttemptsRef.current += 1;
      if (!webrtcRetryTimerRef.current) {
        webrtcRetryTimerRef.current = window.setTimeout(() => {
          webrtcRetryTimerRef.current = null;
          startWebRtcPeer();
        }, 5000);
      }
    };

    const dialStage = () => {
      if (!joinedWantedRef.current || peer.destroyed) return;

      const dataConn = peer.connect(targetStageId, { reliable: true });
      dataRef.current = dataConn;

      dataConn.on('open', () => {
        setDataConnOpen(true);
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
          setStatus('connected');
        } else if (msg.type === 'stage:frame') {
          setHostFallbackFrame(msg.frame);
          setStatus('connected');
        } else if (msg.type === 'stage:redial') {
          if (joinedWantedRef.current) {
            startWebRtcPeer();
          }
        } else if (msg.type === 'stage:kick') {
          joinedWantedRef.current = false;
          cleanupAll();
          setStatus('kicked');
        }
      });

      dataConn.on('close', () => {
        if (dataRef.current === dataConn) {
          setDataConnOpen(false);
          if (joinedWantedRef.current && !hostSeenOverRelayRef.current) {
            scheduleQuietWebRtcRetry();
          }
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
        scheduleQuietWebRtcRetry();
        return;
      }

      if (call.peerConnection) {
        call.peerConnection.oniceconnectionstatechange = () => {
          const iceState = call.peerConnection?.iceConnectionState;
          if (iceState === 'failed') {
            call.peerConnection?.restartIce?.();
          }
        };
      }

      call.on('stream', (remoteStream) => {
        if (!joinedWantedRef.current || callRef.current !== call) return;
        setHostStream(remoteStream);
        setStatus('connected');
      });

      call.on('close', () => {
        if (callRef.current === call) {
          setHostStream(null);
          if (joinedWantedRef.current && !hostSeenOverRelayRef.current) {
            scheduleQuietWebRtcRetry();
          }
        }
      });
    };

    peer.on('open', dialStage);

    peer.on('disconnected', () => {
      if (joinedWantedRef.current && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // Ignore
        }
      }
    });

    peer.on('error', () => {
      if (!joinedWantedRef.current) return;
      scheduleQuietWebRtcRetry();
    });
  }, [cleanupAll, cleanupWebRtc, roomId]);

  const connectToStage = useCallback(() => {
    if (!joinedWantedRef.current) return;
    cleanupAll();
    webrtcAttemptsRef.current = 0;
    setStatus('connecting');

    const handleHostPacket = (msg: RelayPacket) => {
      if (
        !joinedWantedRef.current ||
        !msg ||
        msg.type !== 'media:relay' ||
        msg.roomId !== roomId ||
        msg.role !== 'host'
      ) {
        return;
      }

      if (msg.kick) {
        joinedWantedRef.current = false;
        cleanupAll();
        setStatus('kicked');
        return;
      }

      hostSeenOverRelayRef.current = true;

      if (msg.hostName || msg.streamTitle) {
        setStageInfo((prev) => ({
          hostName: msg.hostName ?? prev.hostName,
          streamTitle: msg.streamTitle ?? prev.streamTitle,
          isLive: msg.isLive ?? prev.isLive,
          guestMutedByHost: msg.guestMutedByHost ?? prev.guestMutedByHost,
        }));
      }

      if (typeof msg.needFrames === 'boolean') {
        setStageNeedsFrames(msg.needFrames);
      }

      if (msg.frame) {
        setHostFallbackFrame(msg.frame);
      }

      setStatus('connected');
    };

    const sendJoinAnnounce = () => {
      const m = metaRef.current;
      sendRelayPacket({
        joined: true,
        name: m.type === 'guest:meta' ? m.name : 'Guest Star',
        camOff: m.type === 'guest:meta' ? m.camOff : false,
        micMuted: m.type === 'guest:meta' ? m.micMuted : false,
        mirrored: m.type === 'guest:meta' ? m.mirrored : true,
        needFrames: m.type === 'guest:meta' ? m.needHostFrames : true,
      });
    };

    // 1. Always-on Cloud WSS Relay (works on GitHub Pages + any mobile network)
    const cloud = new CloudRelayClient({
      subscribeTopic: getTopicHostToGuest(roomId),
      onMessage: (raw) => handleHostPacket(raw as RelayPacket),
      onStatusChange: (open) => {
        setCloudRelayOpen(open);
        if (open && joinedWantedRef.current) {
          sendJoinAnnounce();
          // Optimistically transition off "connecting" if Stage already replied or wait briefly
          window.setTimeout(() => {
            if (joinedWantedRef.current && !hostSeenOverRelayRef.current) {
              setStatus((prev) =>
                prev === 'connecting' ? 'waiting_stage' : prev,
              );
            }
          }, 3500);
        }
      },
    });
    cloudRelayRef.current = cloud;

    // 2. Local Node /ws Relay (only when not on static GitHub Pages)
    if (supportsLocalWs()) {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRelayRef.current = ws;
        ws.onopen = () => {
          if (!joinedWantedRef.current) return;
          setWsRelayOpen(true);
          sendJoinAnnounce();
        };
        ws.onmessage = (event) => {
          try {
            handleHostPacket(JSON.parse(event.data) as RelayPacket);
          } catch {
            // Ignore non-relay payloads
          }
        };
        ws.onclose = () => setWsRelayOpen(false);
        ws.onerror = () => ws.close();
      } catch {
        // Ignore WS failure
      }
    }

    // 3. Keepalive + automatic discovery if Host opens Live Output after Guest clicks Join
    heartbeatTimerRef.current = window.setInterval(() => {
      if (!joinedWantedRef.current) return;
      if (!hostSeenOverRelayRef.current) {
        sendJoinAnnounce();
      } else {
        sendRelayPacket({ heartbeat: true });
      }
    }, 2800);

    // 4. Independent PeerJS WebRTC upgrade (never tears down Cloud Relay)
    startWebRtcPeer();
  }, [cleanupAll, roomId, sendRelayPacket, startWebRtcPeer]);

  // Replace tracks cleanly when switching cameras, OR redial WebRTC if initial call used fallback
  useEffect(() => {
    const call = callRef.current;
    if (!call || !localStream || !joinedWantedRef.current) return;

    if (calledWithFallbackRef.current) {
      startWebRtcPeer();
      return;
    }

    if (call.peerConnection) {
      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];
      call.peerConnection.getSenders().forEach((sender) => {
        if (sender.track?.kind === 'video' && videoTrack) {
          sender.replaceTrack(videoTrack).catch(() => undefined);
        }
        if (sender.track?.kind === 'audio' && audioTrack) {
          sender.replaceTrack(audioTrack).catch(() => undefined);
        }
      });
    }
  }, [localStream, startWebRtcPeer]);

  const joinLive = useCallback(() => {
    joinedWantedRef.current = true;
    connectToStage();
  }, [connectToStage]);

  const leaveLive = useCallback(() => {
    joinedWantedRef.current = false;
    cleanupAll();
    setStatus('idle');
  }, [cleanupAll]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupAll();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      joinedWantedRef.current = false;
      cleanupAll();
    };
  }, [cleanupAll]);

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
