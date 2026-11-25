import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'off' | 'error';

interface UseCameraStreamOptions {
  autoStart?: boolean;
  audio?: boolean;
  fallbackToVideoOnly?: boolean;
}

export function useCameraStream({
  autoStart = true,
  audio = false,
  fallbackToVideoOnly = true,
}: UseCameraStreamOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>(
    autoStart ? 'requesting' : 'off',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [micMuted, setMicMutedState] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setHasAudioTrack(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      if (cams.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(cams[0].deviceId);
      }
    } catch {
      // Ignore enumerate failure
    }
  }, [selectedDeviceId]);

  const startCamera = useCallback(
    async (deviceIdOverride?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setErrorMessage(
          'Browser does not support camera access on this context.',
        );
        return;
      }

      stopTracks();
      setStatus('requesting');
      setErrorMessage(null);

      const targetDeviceId = deviceIdOverride ?? selectedDeviceId;

      const videoConstraints: MediaTrackConstraints = targetDeviceId
        ? {
            deviceId: { exact: targetDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      const audioConstraints: boolean | MediaTrackConstraints = audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false;

      const requestMedia = async (
        vConstraints: boolean | MediaTrackConstraints,
      ): Promise<MediaStream> => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: vConstraints,
            audio: audioConstraints,
          });
        } catch (audioErr) {
          if (audio && fallbackToVideoOnly) {
            return await navigator.mediaDevices.getUserMedia({
              video: vConstraints,
              audio: false,
            });
          }
          throw audioErr;
        }
      };

      try {
        let nextStream: MediaStream;
        try {
          nextStream = await requestMedia(videoConstraints);
        } catch (constraintErr) {
          const errName =
            constraintErr instanceof Error ? constraintErr.name : '';
          if (
            errName === 'OverconstrainedError' ||
            errName === 'NotFoundError' ||
            errName === 'ConstraintNotSatisfiedError'
          ) {
            nextStream = await requestMedia({ facingMode: 'user' }).catch(() =>
              requestMedia(true),
            );
          } else {
            throw constraintErr;
          }
        }

        nextStream.getAudioTracks().forEach((t) => {
          t.enabled = !micMuted;
        });

        streamRef.current = nextStream;
        setStream(nextStream);
        setHasAudioTrack(nextStream.getAudioTracks().length > 0);

        if (videoRef.current) {
          videoRef.current.srcObject = nextStream;
          await videoRef.current.play().catch(() => undefined);
        }

        setStatus('active');
        await refreshDevices();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to access camera.';
        setStatus('error');
        setErrorMessage(
          message.includes('Permission') || message.includes('NotAllowed')
            ? 'Camera permission blocked. Allow camera access in your browser bar and retry.'
            : 'Camera not detected or currently used by another app.',
        );
      }
    },
    [
      audio,
      fallbackToVideoOnly,
      micMuted,
      refreshDevices,
      selectedDeviceId,
      stopTracks,
    ],
  );

  const setMicMuted = useCallback((muted: boolean) => {
    setMicMutedState(muted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }, []);

  const toggleMic = useCallback(() => {
    setMicMuted(!micMuted);
  }, [micMuted, setMicMuted]);

  const turnOffCamera = useCallback(() => {
    stopTracks();
    setStatus('off');
  }, [stopTracks]);

  const toggleCamera = useCallback(() => {
    if (status === 'active' || status === 'requesting') {
      turnOffCamera();
    } else {
      startCamera();
    }
  }, [startCamera, status, turnOffCamera]);

  const switchDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      if (status === 'active') {
        startCamera(deviceId);
      }
    },
    [startCamera, status],
  );

  // Attach stream whenever videoRef mounts/remounts
  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (autoStart) {
      startCamera();
    }
    return () => {
      stopTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    attachVideoRef,
    videoEl,
    stream,
    status,
    errorMessage,
    mirrored,
    setMirrored,
    micMuted,
    setMicMuted,
    toggleMic,
    hasAudioTrack,
    devices,
    selectedDeviceId,
    switchDevice,
    startCamera,
    turnOffCamera,
    toggleCamera,
  };
}
