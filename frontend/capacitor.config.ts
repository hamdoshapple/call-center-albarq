import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.albarq.staff',
  appName: 'Albarq Staff',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
