import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.amehnities.monitor',
  appName: 'Amehnities Monitor',
  webDir: 'dist',
  server: {
    url: 'https://monitor.amehnities.org',
    cleartext: true
  },
};

export default config;