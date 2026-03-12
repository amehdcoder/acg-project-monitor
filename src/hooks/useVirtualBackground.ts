import { useState, useRef, useCallback, useEffect } from "react";
import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

export type BackgroundMode = "none" | "blur" | "image";

interface VirtualBackgroundOptions {
  /** The raw camera MediaStream */
  cameraStream: MediaStream | null;
  /** Whether the virtual background pipeline is enabled */
  enabled: boolean;
}

export function useVirtualBackground({ cameraStream, enabled }: VirtualBackgroundOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [mode, setMode] = useState<BackgroundMode>("none");
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);

  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  // Initialize MediaPipe segmenter
  const initSegmenter = useCallback(async () => {
    if (segmenterRef.current) return;
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      segmenterRef.current = segmenter;
      setIsReady(true);
    } catch (err) {
      console.error("Failed to init segmenter:", err);
      // Fallback to CPU
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        segmenterRef.current = segmenter;
        setIsReady(true);
      } catch (err2) {
        console.error("Segmenter init failed completely:", err2);
      }
    }
  }, []);

  // Load background image from URL
  const loadBackgroundImage = useCallback((url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setBackgroundImage(img);
      setMode("image");
    };
    img.onerror = () => console.error("Failed to load background image:", url);
    img.src = url;
  }, []);

  // Set blur mode
  const setBlurMode = useCallback(() => {
    setMode("blur");
    setBackgroundImage(null);
  }, []);

  // Disable virtual background
  const disableBackground = useCallback(() => {
    setMode("none");
    setBackgroundImage(null);
  }, []);

  // Core render loop
  useEffect(() => {
    if (!enabled || mode === "none" || !cameraStream) {
      activeRef.current = false;
      return;
    }

    let mounted = true;

    const start = async () => {
      await initSegmenter();
      if (!mounted || !segmenterRef.current) return;

      // Create hidden video element for camera
      const video = document.createElement("video");
      video.srcObject = cameraStream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoElRef.current = video;

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;

      // Create offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      canvasRef.current = canvas;
      ctxRef.current = ctx;

      // Capture stream from canvas at ~24fps
      const outStream = canvas.captureStream(24);

      // Preserve audio from original stream
      cameraStream.getAudioTracks().forEach((t) => outStream.addTrack(t));

      outputStreamRef.current = outStream;
      activeRef.current = true;
      setIsProcessing(true);

      const processFrame = () => {
        if (!activeRef.current || !videoElRef.current || !segmenterRef.current || !ctxRef.current || !canvasRef.current) return;

        const vid = videoElRef.current;
        const segmenter = segmenterRef.current;
        const cvs = canvasRef.current;
        const c = ctxRef.current;

        if (vid.readyState < 2) {
          rafRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const now = performance.now();
        const result = segmenter.segmentForVideo(vid, now);

        c.drawImage(vid, 0, 0, cvs.width, cvs.height);

        if (result.categoryMask) {
          const maskData = result.categoryMask.getAsUint8Array();
          const frame = c.getImageData(0, 0, cvs.width, cvs.height);
          const pixels = frame.data;

          if (mode === "blur") {
            // Draw blurred version first
            c.save();
            c.filter = "blur(12px)";
            c.drawImage(vid, 0, 0, cvs.width, cvs.height);
            c.restore();
            const blurredFrame = c.getImageData(0, 0, cvs.width, cvs.height);
            const blurPixels = blurredFrame.data;

            // Redraw original
            c.drawImage(vid, 0, 0, cvs.width, cvs.height);
            const origFrame = c.getImageData(0, 0, cvs.width, cvs.height);
            const origPixels = origFrame.data;

            // Composite: person pixels from original, background from blurred
            for (let i = 0; i < maskData.length; i++) {
              const isPerson = maskData[i] > 0;
              const px = i * 4;
              if (!isPerson) {
                origPixels[px] = blurPixels[px];
                origPixels[px + 1] = blurPixels[px + 1];
                origPixels[px + 2] = blurPixels[px + 2];
              }
            }
            c.putImageData(origFrame, 0, 0);
          } else if (mode === "image" && backgroundImage) {
            // Draw background image
            c.drawImage(backgroundImage, 0, 0, cvs.width, cvs.height);
            const bgFrame = c.getImageData(0, 0, cvs.width, cvs.height);
            const bgPixels = bgFrame.data;

            // Redraw original on top
            c.drawImage(vid, 0, 0, cvs.width, cvs.height);
            const origFrame = c.getImageData(0, 0, cvs.width, cvs.height);
            const origPixels = origFrame.data;

            // Composite
            for (let i = 0; i < maskData.length; i++) {
              const isPerson = maskData[i] > 0;
              const px = i * 4;
              if (!isPerson) {
                origPixels[px] = bgPixels[px];
                origPixels[px + 1] = bgPixels[px + 1];
                origPixels[px + 2] = bgPixels[px + 2];
              }
            }
            c.putImageData(origFrame, 0, 0);
          }

          result.categoryMask.close();
        }

        rafRef.current = requestAnimationFrame(processFrame);
      };

      rafRef.current = requestAnimationFrame(processFrame);
    };

    start();

    return () => {
      mounted = false;
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      setIsProcessing(false);
      if (videoElRef.current) {
        videoElRef.current.pause();
        videoElRef.current.srcObject = null;
        videoElRef.current = null;
      }
    };
  }, [enabled, mode, cameraStream, backgroundImage, initSegmenter]);

  // Cleanup segmenter on unmount
  useEffect(() => {
    return () => {
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, []);

  return {
    /** The processed stream (with virtual background) or null when disabled */
    outputStream: mode !== "none" && isProcessing ? outputStreamRef.current : null,
    isProcessing,
    isReady,
    mode,
    setBlurMode,
    loadBackgroundImage,
    disableBackground,
  };
}
