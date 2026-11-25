import React, { useState } from 'react';
import {
  Camera,
  CameraOff,
  FlipHorizontal2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  RefreshCw,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { HOST_AVATAR_URL } from '../data/podcastData.ts';
import { useCameraStream } from '../hooks/useCameraStream.ts';
import { useGuestDevicePeer } from '../hooks/useGuestStarPeer.ts';
import { VideoStreamPlayer } from './VideoStreamPlayer.tsx';

interface GuestStarViewProps {
  roomId: string;
}

export const GuestStarView: React.FC<GuestStarViewProps> = ({ roomId }) => {
  const camera = useCameraStream({
    autoStart: true,
    audio: true,
    fallbackToVideoOnly: true,
  });

  const [guestName, setGuestName] = useState('Guest Star');
  const [hostAudioMuted, setHostAudioMuted] = useState(false);
  const [splitPreview, setSplitPreview] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const peer = useGuestDevicePeer({
    roomId,
    localStream: camera.status === 'active' ? camera.stream : null,
    guestName,
    camOff: camera.status !== 'active',
    micMuted: camera.micMuted,
    mirrored: camera.mirrored,
  });

  const isJoinedOrConnecting =
    peer.status === 'connecting' ||
    peer.status === 'waiting_stage' ||
    peer.status === 'connected';

  const statusLabel =
    peer.status === 'connected'
      ? 'ON AIR · Guest Star Live'
      : peer.status === 'waiting_stage'
        ? 'Waiting for Host Live Output (?mode=stage) to open…'
        : peer.status === 'connecting'
          ? 'Connecting to podcastHorizon…'
          : peer.status === 'kicked'
            ? 'Session ended by Host'
            : peer.status === 'error'
              ? 'Connection error · Tap Join to retry'
              : 'Greenroom · Ready to Join';

  return (
    <div className="min-h-screen bg-[#090A0F] text-zinc-100 flex flex-col">
      {/* Top Guest Star Header */}
      <header className="border-b border-white/10 bg-[#0E1016]/95 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-[#FF3B5C] shrink-0 bg-amber-500/20 flex items-center justify-center">
              {!avatarFailed ? (
                <img
                  src={HOST_AVATAR_URL}
                  alt="podcastHorizon"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-amber-200">pH</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm sm:text-base text-white truncate">
                  {peer.stageInfo.hostName}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Guest Star
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate">
                {peer.stageInfo.streamTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block font-mono text-[11px] text-zinc-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
              Room: {roomId}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                peer.status === 'connected'
                  ? 'bg-[#FF3B5C] text-white'
                  : peer.status === 'waiting_stage' || peer.status === 'connecting'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                    : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  peer.status === 'connected'
                    ? 'bg-white animate-pulse'
                    : peer.status === 'waiting_stage' ||
                        peer.status === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-zinc-400'
                }`}
              />
              <span>
                {peer.status === 'connected' ? 'LIVE' : 'DEVICE 1'}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Guest Star Stage */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col gap-4 justify-between">
        {/* Status Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#13151E] border border-white/10 text-xs">
          <div className="flex items-center gap-2 text-zinc-200">
            <Radio
              className={`w-4 h-4 ${
                peer.status === 'connected'
                  ? 'text-[#FF3B5C]'
                  : 'text-amber-400'
              }`}
            />
            <span className="font-medium">{statusLabel}</span>
          </div>

          {peer.stageInfo.guestMutedByHost && peer.status === 'connected' && (
            <span className="text-[11px] font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
              Muted by Host
            </span>
          )}

          {peer.status === 'connected' && (
            <button
              type="button"
              onClick={() => setSplitPreview((v) => !v)}
              className="text-[11px] font-medium text-amber-300 hover:text-amber-200 underline-offset-4 hover:underline cursor-pointer"
            >
              {splitPreview ? 'Focus Self View' : 'Show 2-Cam Split'}
            </button>
          )}
        </div>

        {/* Camera Viewport (Explicit responsive height so 2-cam grid never collapses) */}
        <div className="relative h-[56vh] min-h-[360px] max-h-[600px] rounded-3xl overflow-hidden bg-[#101218] ring-1 ring-white/12 shadow-2xl">
          {peer.status === 'connected' && splitPreview ? (
            <div className="w-full h-full grid grid-cols-2">
              {/* Left: Host Feed */}
              <div className="relative h-full min-h-0 overflow-hidden bg-[#0C0E14] border-r-2 border-black">
                {peer.hostStream || peer.hostFallbackFrame ? (
                  <VideoStreamPlayer
                    stream={peer.hostStream}
                    fallbackFrame={peer.hostFallbackFrame}
                    onDecodedVideoChange={peer.setHostHasDecodedVideo}
                    connectingLabel="Menghubungkan kamera Host…"
                    muted={hostAudioMuted}
                    unmuteLabel="Unmute Host"
                    unmuteButtonClassName="top-12 left-3"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <Sparkles className="w-7 h-7 text-amber-400 animate-pulse" />
                    <span className="text-xs font-semibold text-zinc-200">
                      {peer.stageInfo.hostName}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Connecting Host video…
                    </span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 z-20 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white">
                  {peer.stageInfo.hostName} · Host
                </div>
              </div>

              {/* Right: Guest Star Self Feed */}
              <div className="relative h-full min-h-0 overflow-hidden bg-[#0C0E14]">
                {camera.status === 'active' ? (
                  <VideoStreamPlayer
                    stream={camera.stream}
                    muted
                    mirrored={camera.mirrored}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <CameraOff className="w-7 h-7 text-zinc-500" />
                    <span className="text-xs text-zinc-300">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-3 right-3 z-20 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-amber-200">
                  {guestName.trim() || 'Guest Star'} (You)
                </div>
              </div>

              {/* Center Equalizer Indicator */}
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/15 flex items-center gap-0.5">
                <span className="w-0.5 h-2.5 bg-white/90 rounded-full animate-pulse" />
                <span className="w-0.5 h-3.5 bg-amber-300 rounded-full animate-pulse" />
                <span className="w-0.5 h-2 bg-white/90 rounded-full animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full bg-[#0C0E14]">
              {camera.status === 'active' ? (
                <VideoStreamPlayer
                  stream={camera.stream}
                  muted
                  mirrored={camera.mirrored}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <CameraOff className="w-7 h-7 text-zinc-400" />
                  </div>
                  {camera.status === 'requesting' ? (
                    <p className="text-xs text-zinc-300">
                      Requesting camera & microphone permission…
                    </p>
                  ) : camera.status === 'error' ? (
                    <div className="space-y-3 max-w-xs">
                      <p className="text-xs text-rose-200 leading-relaxed">
                        {camera.errorMessage}
                      </p>
                      <button
                        type="button"
                        onClick={() => camera.startCamera()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF3B5C] hover:bg-[#ff5270] text-white text-xs font-semibold cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Camera</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Camera is off. Turn on camera below to appear on stage.
                    </p>
                  )}
                </div>
              )}

              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-semibold text-white">
                {guestName.trim() || 'Guest Star'}
              </div>

              {peer.status === 'connected' &&
                (peer.hostStream || peer.hostFallbackFrame) && (
                  <div className="absolute top-3 right-3 z-20 w-28 sm:w-36 aspect-[9/16] rounded-2xl overflow-hidden ring-2 ring-amber-400/60 shadow-2xl bg-black">
                    <VideoStreamPlayer
                      stream={peer.hostStream}
                      fallbackFrame={peer.hostFallbackFrame}
                      onDecodedVideoChange={peer.setHostHasDecodedVideo}
                      connectingLabel="Menghubungkan…"
                      muted={hostAudioMuted}
                      unmuteLabel="Unmute"
                      unmuteButtonClassName="top-2 left-1/2 -translate-x-1/2 scale-90"
                    />
                    <div className="absolute bottom-1.5 inset-x-1.5 z-20 text-center text-[10px] font-semibold bg-black/65 rounded-full py-0.5 text-white truncate">
                      {peer.stageInfo.hostName}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Bottom Device 1 Controls */}
        <div className="rounded-2xl bg-[#13151E] border border-white/10 p-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <label
                htmlFor="guest-star-name-input"
                className="text-[11px] font-medium text-zinc-400 block"
              >
                Your Guest Star Display Name
              </label>
              <input
                id="guest-star-name-input"
                type="text"
                maxLength={28}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Guest Star"
                className="w-full px-3 py-2 rounded-xl bg-[#0B0C10] border border-white/10 text-xs text-white outline-none focus:border-amber-400/50"
              />
            </div>

            {camera.devices.length > 1 && (
              <div className="space-y-1">
                <label
                  htmlFor="guest-camera-select"
                  className="text-[11px] font-medium text-zinc-400 block"
                >
                  Camera Source
                </label>
                <select
                  id="guest-camera-select"
                  value={camera.selectedDeviceId}
                  onChange={(e) => camera.switchDevice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0B0C10] border border-white/10 text-xs text-white outline-none cursor-pointer"
                >
                  {camera.devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={camera.toggleCamera}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  camera.status === 'active'
                    ? 'bg-zinc-800 border-white/10 text-white hover:bg-zinc-700'
                    : 'bg-rose-500/20 border-rose-500/35 text-rose-200'
                }`}
              >
                {camera.status === 'active' ? (
                  <>
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Cam On</span>
                  </>
                ) : (
                  <>
                    <CameraOff className="w-4 h-4" />
                    <span>Cam Off</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={camera.toggleMic}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  !camera.micMuted
                    ? 'bg-zinc-800 border-white/10 text-white hover:bg-zinc-700'
                    : 'bg-rose-500/20 border-rose-500/35 text-rose-200'
                }`}
              >
                {!camera.micMuted ? (
                  <>
                    <Mic className="w-4 h-4 text-emerald-400" />
                    <span>Mic On</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Muted</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => camera.setMirrored((m) => !m)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  camera.mirrored
                    ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                    : 'bg-[#0B0C10] border-white/10 text-zinc-300'
                }`}
                title="Mirror camera"
              >
                <FlipHorizontal2 className="w-4 h-4" />
                <span className="hidden sm:inline">Mirror</span>
              </button>

              {peer.status === 'connected' && (
                <button
                  type="button"
                  onClick={() => setHostAudioMuted((m) => !m)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    !hostAudioMuted
                      ? 'bg-[#0B0C10] border-white/10 text-zinc-200'
                      : 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                  }`}
                  title="Mute Host audio (prevents echo if in same room)"
                >
                  {hostAudioMuted ? (
                    <>
                      <VolumeX className="w-4 h-4" />
                      <span className="hidden sm:inline">Host Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                      <span className="hidden sm:inline">Host Sound</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {!isJoinedOrConnecting ? (
              <button
                type="button"
                onClick={peer.joinLive}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF3B5C] hover:bg-[#ff5270] text-white text-xs sm:text-sm font-bold shadow-[0_4px_20px_rgba(255,59,92,0.4)] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>Join Live as Guest Star</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={peer.leaveLive}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 text-rose-100 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Leave Live</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
