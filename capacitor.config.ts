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
    backgroundColor: '#1E3A8A',
  },
  server: {
    androidScheme: 'https',
    // Allow https requests + plaintext fallback (some Android networks block h2).
    cleartext: true,
  },
  plugins: {
    // Splash screen disabled: launching the app icon opens straight to the
    // authentication page with no intermediate splash/loading screen.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#1E3A8A',
      showSpinner: false,
    },
  },
};

export default config;
