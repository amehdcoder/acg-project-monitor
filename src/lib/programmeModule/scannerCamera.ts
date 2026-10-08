/** A camera cannot be granted permission by the app; explain the device's result. */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  const text = String(error);
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /permission|denied/i.test(text)) {
    return "Camera permission was denied. Allow camera access in your browser or Amehnities app settings, then tap Retry camera.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device. Connect a camera or enter the Case ID below.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is busy or unavailable. Close other apps using it, then tap Retry camera.";
  }
  if (name === "SecurityError") {
    return "Camera access is blocked by this device's security settings. Allow camera access for Amehnities and try again.";
  }
  return "The camera could not start. Check camera access in your device settings and tap Retry camera, or enter the Case ID below.";
}

export function preferredCamera(cameras: { id: string; label: string }[]): string | undefined {
  return cameras.find((camera) => /back|rear|environment/i.test(camera.label))?.id
    ?? (cameras.length === 1 ? cameras[0]?.id : undefined);
}