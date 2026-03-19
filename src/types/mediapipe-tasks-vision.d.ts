declare module "@mediapipe/tasks-vision" {
  export interface ImageSegmenterOptions {
    baseOptions?: {
      modelAssetPath?: string;
      delegate?: "GPU" | "CPU";
    };
    runningMode?: "IMAGE" | "VIDEO";
    outputCategoryMask?: boolean;
    outputConfidenceMasks?: boolean;
  }

  export interface ImageSegmenterResult {
    confidenceMasks?: Array<{
      width: number;
      height: number;
      getAsFloat32Array(): Float32Array;
    }>;
    categoryMask?: {
      width: number;
      height: number;
      getAsUint8Array(): Uint8Array;
    };
  }

  export class ImageSegmenter {
    static createFromOptions(
      vision: any,
      options: ImageSegmenterOptions
    ): Promise<ImageSegmenter>;
    segmentForVideo(
      image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      timestamp: number,
      callback: (result: ImageSegmenterResult) => void
    ): void;
    segment(
      image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      callback: (result: ImageSegmenterResult) => void
    ):