import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.kept.vault',
  appName: 'Kept',
  webDir: 'dist',
  android: {
    // Never allow plain HTTP or mixed content inside the app.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
