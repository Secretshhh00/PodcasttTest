import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'off' | 'error';

interface UseCameraStreamOptions {
  autoStart?: boolean;
}

export function useCameraStream({ autoStart = true }: UseCameraStreamOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>(
    autoStart ? 'requesting' : 'off',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
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

      try {
        const constraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? {
                deviceId: { exact: targetDeviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: 'user',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
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
    [refreshDevices, selectedDeviceId, stopTracks],
  );

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
    status,
    errorMessage,
    mirrored,
    setMirrored,
    devices,
    selectedDeviceId,
    switchDevice,
    startCamera,
    turnOffCamera,
    toggleCamera,
  };
}
