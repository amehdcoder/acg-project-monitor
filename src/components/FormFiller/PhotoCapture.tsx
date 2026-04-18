import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, Upload, X, RotateCcw, Check, Image as ImageIcon } from "lucide-react";

interface PhotoCaptureProps {
  value: string | null;
  onChange: (photo: string | null) => void;
  disabled?: boolean;
  allowGallery?: boolean;
  autoTrigger?: boolean;
  /** Force camera (rear by default), disabling the gallery upload button. */
  cameraOnly?: boolean;
  /** Use the front-facing camera (selfie / attestation). */
  frontCamera?: boolean;
  /** Target longest-edge in pixels — image is downscaled before save. */
  maxResolutionPx?: number;
  /** JPEG quality 0–1. */
  quality?: number;
}

const PhotoCapture = ({
  value,
  onChange,
  disabled,
  allowGallery = true,
  autoTrigger,
  cameraOnly,
  frontCamera,
  maxResolutionPx,
  quality,
}: PhotoCaptureProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  const showGallery = allowGallery && !cameraOnly;
  const facingMode = frontCamera ? "user" : "environment";

  // Auto-trigger camera from voice command
  useEffect(() => {
    if (autoTrigger && !value && !showCamera) {
      startCamera();
    }
  }, [autoTrigger]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      setStream(mediaStream);
      setShowCamera(true);

      // Wait for dialog to open and video element to be available
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (error) {
      console.error("Error accessing camera:", error);
      // Fall back to file input
      fileInputRef.current?.click();
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setShowCamera(false);
    setCapturedPhoto(null);
  }, [stream]);

  /** Downscale + re-encode the image to honor builder-set resolution & quality. */
  const compressDataUrl = useCallback(
    async (src: string): Promise<string> => {
      if (!maxResolutionPx && !quality) return src;
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const longest = Math.max(img.width, img.height);
          const target = maxResolutionPx && longest > maxResolutionPx ? maxResolutionPx : longest;
          const scale = target / longest;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(src);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality ?? 0.85));
        };
        img.onerror = () => resolve(src);
        img.src = src;
      });
    },
    [maxResolutionPx, quality],
  );

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", quality ?? 0.8);
    setCapturedPhoto(dataUrl);
  }, [quality]);

  const confirmPhoto = useCallback(async () => {
    if (capturedPhoto) {
      const compressed = await compressDataUrl(capturedPhoto);
      onChange(compressed);
      stopCamera();
    }
  }, [capturedPhoto, onChange, stopCamera, compressDataUrl]);

  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        const compressed = await compressDataUrl(dataUrl);
        onChange(compressed);
      };
      reader.readAsDataURL(file);

      // Reset input
      e.target.value = "";
    },
    [onChange, compressDataUrl],
  );

  const removePhoto = useCallback(() => {
    onChange(null);
  }, [onChange]);

  return (
    <>
      <Card className="border-border">
        <CardContent className="p-3">
          {value ? (
            <div className="relative">
              <img
                src={value}
                alt="Captured photo"
                className="w-full h-48 object-cover rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={removePhoto}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-border rounded-lg bg-muted/30">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-3" />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={startCamera}
                  disabled={disabled}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
                {allowGallery && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Dialog open={showCamera} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Take Photo</DialogTitle>
          </DialogHeader>
          <div className="relative bg-black">
            {capturedPhoto ? (
              <img
                src={capturedPhoto}
                alt="Captured"
                className="w-full h-auto"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto"
              />
            )}
          </div>
          <div className="flex justify-center gap-3 p-4">
            {capturedPhoto ? (
              <>
                <Button variant="outline" onClick={retakePhoto}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retake
                </Button>
                <Button onClick={confirmPhoto}>
                  <Check className="h-4 w-4 mr-2" />
                  Use Photo
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={stopCamera}>
                  Cancel
                </Button>
                <Button onClick={capturePhoto}>
                  <Camera className="h-4 w-4 mr-2" />
                  Capture
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PhotoCapture;
