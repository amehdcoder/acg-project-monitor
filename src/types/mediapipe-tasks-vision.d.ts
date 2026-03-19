declare module "@mediapipe/tasks-vision" {
  export interface FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<any>;
  }

  export const FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<any>;
  };

  export interface ImageSegmenterOptions {
    baseOptions?: {
      modelAssetPath?: string;
      delegate?: "GPU" | "CPU";
    };
    runningMode?: "IMAGE" | "VIDEO";
    outputCategoryMask?: boolean;
    outputConfidenceMasks?: boolean;
  }

  export interface MPMask {
    width: number;
    height: number;
    getAsFloat32Array(): Float32Array;
    getAsUint8Array(): Uint8Array;
    close(): void;
  }

  export interface ImageSegmenterResult {
    confidenceMasks?: MPMask[];
    categoryMask?: MPMask;
  }

  export class ImageSegmenter {
    static createFromOptions(
      vision: any,
      options: ImageSegmenterOptions
    ): Promise<ImageSegmenter>;
    segmentForVideo(
      image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      timestamp: number,
      callback?: (result: ImageSegmenterResult) => void
    ): ImageSegmenterResult;
    segment(
      image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      callback?: (result: ImageSegmenterResult) => void
    ): ImageSegmenterResult;
    close(): void;
  }
}
