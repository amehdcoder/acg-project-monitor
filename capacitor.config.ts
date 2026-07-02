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
    // Match the web first-paint background (manifest background_color) so the
    // launch window → WebView transition is seamless with no color flash.
    backgroundColor: '#f5f7fa',
  },
  server: {
    androidScheme: 'https',
    // Allow https requests + plaintext fallback (some Android networks block h2).
    cleartext: true,
  },
  plugins: {
    // Splash screen fully disabled. In addition to this plugin config, run
    // `scripts/apply-android-splash.sh` after `npx cap add/sync android` to
    // strip the native launch-theme artwork (Android 12+ draws an icon splash
    // from the theme regardless of this plugin) so the app opens straight to
    // the auth page with no intermediate splash/loading screen.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#f5f7fa',
      showSpinner: false,
    },
  },
};

export default config;
