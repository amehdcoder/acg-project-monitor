import { useRef, useCallback, useEffect } from "react";

/**
 * Spatial audio hook using Web Audio API for immersive data visualization.
 * Maps data points to 3D audio positions for an auditory data exploration experience.
 */
export const useSpatialAudio = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const activeOscillators = useRef<Set<OscillatorNode>>(new Set());

  const getContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.gain.value = 0.15;
      gainRef.current.connect(ctxRef.current.destination);
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  /** Play a spatial tone mapped to a data point's quality score and position */
  const playDataTone = useCallback(
    (opts: { score: number; x?: number; y?: number; z?: number; duration?: number }) => {
      try {
        const ctx = getContext();
        if (!gainRef.current) return;

        const { score, x = 0, y = 0, z = -1, duration = 0.25 } = opts;

        // Map score 0-100 to frequency 200-800 Hz (higher = better quality)
        const freq = 200 + (score / 100) * 600;

        const osc = ctx.createOscillator();
        osc.type = score > 70 ? "sine" : score > 40 ? "triangle" : "sawtooth";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        // Create spatial panner
        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1;
        panner.maxDistance = 100;
        panner.rolloffFactor = 1;
        panner.setPosition(x, y, z);

        // Envelope for smooth onset/offset
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

        osc.connect(env).connect(panner).connect(gainRef.current);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.01);

        activeOscillators.current.add(osc);
        osc.onended = () => {
          activeOscillators.current.delete(osc);
          osc.disconnect();
          env.disconnect();
          panner.disconnect();
        };
      } catch {
        // Audio not supported — silent fail
      }
    },
    [getContext],
  );

  /** Play a sweep of data points as a spatial sonification */
  const playSonification = useCallback(
    (dataPoints: { score: number; x?: number; y?: number }[], intervalMs = 120) => {
      let i = 0;
      const id = setInterval(() => {
        if (i >= dataPoints.length) {
          clearInterval(id);
          return;
        }
        const dp = dataPoints[i];
        // Spread points across stereo field
        const normX = dataPoints.length > 1 ? ((i / (dataPoints.length - 1)) * 6 - 3) : 0;
        playDataTone({ score: dp.score, x: dp.x ?? normX, y: dp.y ?? 0, duration: 0.2 });
        i++;
      }, intervalMs);
      return () => clearInterval(id);
    },
    [playDataTone],
  );

  /** Play a quality alert sound */
  const playAlert = useCallback(
    (severity: "critical" | "warning" | "info") => {
      const freqMap = { critical: 280, warning: 440, info: 660 };
      playDataTone({ score: severity === "info" ? 90 : severity === "warning" ? 50 : 15, duration: 0.4 });
      setTimeout(() => playDataTone({ score: freqMap[severity] / 8, duration: 0.3 }), 200);
    },
    [playDataTone],
  );

  /** Set master volume (0-1) */
  const setVolume = useCallback((v: number) => {
    if (gainRef.current) gainRef.current.gain.value = Math.max(0, Math.min(1, v));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeOscillators.current.forEach((o) => {
        try { o.stop(); } catch {}
      });
      activeOscillators.current.clear();
      try { ctxRef.current?.close(); } catch {}
    };
  }, []);

  return { playDataTone, playSonification, playAlert, setVolume };
};
