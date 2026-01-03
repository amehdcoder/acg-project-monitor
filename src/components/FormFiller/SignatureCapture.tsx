import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eraser, Check, PenTool } from "lucide-react";

interface SignatureCaptureProps {
  value: string | null;
  onChange: (signature: string | null) => void;
  disabled?: boolean;
}

const SignatureCapture = ({ value, onChange, disabled }: SignatureCaptureProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Set drawing styles
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Fill background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // If there's an existing signature, load it
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
      };
      img.src = value;
    }
  }, []);

  const getCoordinates = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();

      if ("touches" in e) {
        const touch = e.touches[0];
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      } else {
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled) return;

      const coords = getCoordinates(e);
      if (!coords) return;

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      setIsDrawing(true);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    },
    [disabled, getCoordinates]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || disabled) return;

      const coords = getCoordinates(e);
      if (!coords) return;

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      setHasSignature(true);
    },
    [isDrawing, disabled, getCoordinates]
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    onChange(null);
  }, [onChange]);

  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
  }, [hasSignature, onChange]);

  return (
    <Card className="border-border">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PenTool className="h-4 w-4" />
            <span>Sign below</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSignature}
              disabled={disabled || !hasSignature}
            >
              <Eraser className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={saveSignature}
              disabled={disabled || !hasSignature || !!value}
            >
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>

        <div
          className={`relative rounded-lg border-2 border-dashed ${
            disabled
              ? "border-muted bg-muted/50"
              : value
              ? "border-primary/50 bg-primary/5"
              : "border-border bg-background"
          }`}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-32 touch-none cursor-crosshair rounded-lg"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {value && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              <Check className="h-3 w-3" />
              Signed
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SignatureCapture;
