import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

export interface FacePose {
  detected: boolean;
  /** Eye center X in container percentage (0 - 100) */
  eyeCenterX: number;
  /** Eye center Y in container percentage (0 - 100) */
  eyeCenterY: number;
  /** Inter-ocular distance in container width percentage */
  eyeDistPct: number;
  /** Head crown / top center X in container percentage */
  headTopX: number;
  /** Head crown / top center Y in container percentage */
  headTopY: number;
  /** Head roll angle in degrees */
  angleDeg: number;
}

export type FaceTrackerStatus =
  | 'idle'
  | 'loading'
  | 'ready_no_face'
  | 'tracking'
  | 'error';

let modelsPromise: Promise<void> | null = null;

async function ensureFaceModelsLoaded() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      ]);
    })();
  }
  return modelsPromise;
}

function averagePoint(pts: faceapi.Point[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function useFaceTracker(options: {
  videoEl: HTMLVideoElement | null;
  active: boolean;
  mirrored: boolean;
}) {
  const { videoEl, active, mirrored } = options;
  const [status, setStatus] = useState<FaceTrackerStatus>('idle');
  const [pose, setPose] = useState<FacePose | null>(null);

  const smoothPoseRef = useRef<FacePose | null>(null);
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;

  useEffect(() => {
    if (!active || !videoEl) {
      setStatus('idle');
      setPose(null);
      smoothPoseRef.current = null;
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastDetectAt = 0;
    let busy = false;
    let missedFrames = 0;

    const detectorOpts = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.35,
    });

    const run = async () => {
      setStatus('loading');
      try {
        await ensureFaceModelsLoaded();
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }

      if (cancelled) return;
      setStatus('ready_no_face');

      const tick = async (now: number) => {
        if (cancelled) return;
        rafId = window.requestAnimationFrame(tick);

        if (busy || now - lastDetectAt < 70) return;
        if (
          videoEl.readyState < 2 ||
          videoEl.videoWidth === 0 ||
          videoEl.clientWidth === 0
        ) {
          return;
        }

        busy = true;
        lastDetectAt = now;

        try {
          const result = await faceapi
            .detectSingleFace(videoEl, detectorOpts)
            .withFaceLandmarks(true);

          if (cancelled) return;

          if (!result) {
            missedFrames += 1;
            if (missedFrames > 10) {
              setStatus('ready_no_face');
              setPose(null);
              smoothPoseRef.current = null;
            }
            return;
          }

          missedFrames = 0;
          const landmarks = result.landmarks;
          const leftEyeRaw = averagePoint(landmarks.getLeftEye());
          const rightEyeRaw = averagePoint(landmarks.getRightEye());

          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          const cw = videoEl.clientWidth;
          const ch = videoEl.clientHeight;

          // Map raw video pixel coordinates to CSS object-cover container pixels
          const scale = Math.max(cw / vw, ch / vh);
          const renderedW = vw * scale;
          const renderedH = vh * scale;
          const padX = (cw - renderedW) / 2;
          const padY = (ch - renderedH) / 2;

          const isMirrored = mirroredRef.current;
          const mapX = (rx: number) =>
            padX + (isMirrored ? vw - rx : rx) * scale;
          const mapY = (ry: number) => padY + ry * scale;

          const lx = mapX(leftEyeRaw.x);
          const ly = mapY(leftEyeRaw.y);
          const rx = mapX(rightEyeRaw.x);
          const ry = mapY(rightEyeRaw.y);

          const eyeMidX = (lx + rx) / 2;
          const eyeMidY = (ly + ry) / 2;
          const eyeDistPx = Math.hypot(rx - lx, ry - ly);

          // Ensure vector points from viewer-left eye to viewer-right eye
          const vx = lx < rx ? rx - lx : lx - rx;
          const vy = lx < rx ? ry - ly : ly - ry;
          const angleRad = Math.atan2(vy, vx);
          const angleDeg = (angleRad * 180) / Math.PI;

          // Upward head normal vector perpendicular to eye axis
          const upX = Math.sin(angleRad);
          const upY = -Math.cos(angleRad);
          const crownX = eyeMidX + upX * (eyeDistPx * 1.48);
          const crownY = eyeMidY + upY * (eyeDistPx * 1.48);

          const nextRaw: FacePose = {
            detected: true,
            eyeCenterX: (eyeMidX / cw) * 100,
            eyeCenterY: (eyeMidY / ch) * 100,
            eyeDistPct: (eyeDistPx / cw) * 100,
            headTopX: (crownX / cw) * 100,
            headTopY: (crownY / ch) * 100,
            angleDeg,
          };

          const prev = smoothPoseRef.current;
          const smoothed: FacePose = prev
            ? {
                detected: true,
                eyeCenterX: lerp(prev.eyeCenterX, nextRaw.eyeCenterX, 0.42),
                eyeCenterY: lerp(prev.eyeCenterY, nextRaw.eyeCenterY, 0.42),
                eyeDistPct: lerp(prev.eyeDistPct, nextRaw.eyeDistPct, 0.35),
                headTopX: lerp(prev.headTopX, nextRaw.headTopX, 0.42),
                headTopY: lerp(prev.headTopY, nextRaw.headTopY, 0.42),
                angleDeg: lerp(prev.angleDeg, nextRaw.angleDeg, 0.38),
              }
            : nextRaw;

          smoothPoseRef.current = smoothed;
          setPose(smoothed);
          setStatus('tracking');
        } catch {
          // Ignore transient frame errors
        } finally {
          busy = false;
        }
      };

      rafId = window.requestAnimationFrame(tick);
    };

    run();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [active, videoEl]);

  return { status, pose };
}
