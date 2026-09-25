# Upgrade all Street Views to real high-quality panoramas

## What will change
- Replace the remaining older Street View viewer with the app’s unified Google panorama experience.
- Make every map Street View control open the nearest real Google panorama, using the exact panorama identifier and full interactive navigation.
- Improve panorama matching with progressively wider searches, valid-coordinate checks, imagery date/location details, and a clear distance from the selected point.
- Preserve a real street-level imagery fallback where Google has no local coverage, without presenting satellite imagery as Street View.
- Improve full-screen and mobile viewing so panoramas use the largest practical display area and resize cleanly.

## Reliability and quality
- Load Google Maps asynchronously through the shared loader and avoid duplicate scripts or viewers.
- Handle unavailable coverage, rejected keys, slow loading, and navigation between panoramas without blank panels.
- Keep external “Open in Google Maps” links aligned to the exact panorama being displayed.

## Verification
- Check every Street View entry point in the codebase uses the shared viewer.
- Verify the app compiles cleanly.
- Test a representative Street View flow in the live preview at desktop and mobile sizes, including full-screen, movement, and fallback behavior.

## Important deployment note
Google’s highest-quality panoramas require a browser key authorized for Maps JavaScript API and for `https://www.amehnities.org/*`. If the live domain’s current key is restricted to Lovable domains, the app will still use its fallback until a custom-domain Google key is connected.
