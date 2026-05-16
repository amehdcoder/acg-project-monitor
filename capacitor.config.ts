import type { CapacitorConfig } from '@capacitor/cli';

// IMPORTANT: For production Android builds we load the bundled `dist/` assets
// (offline-first). Setting `server.url` here would force the WebView to fetch
// the remote site on every launch — that is what produces the "Lovable proxy"
// / blank-screen failures on Android when connectivity is flaky or DNS to
// monitor.amehnities.org is briefly unreachable. Hot-reload from the Lovable
// sandbox should be enabled per-developer via a local override, not committed.
const config: CapacitorConfig = {
  appId: 'com.amehnities.monitor',
  appName: 'Amehnities Monitor',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#1B5E20',
  },
  server: {
    androidScheme: 'https',
    // Allow https requests + plaintext fallback (some Android networks block h2).
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#1B5E20',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
