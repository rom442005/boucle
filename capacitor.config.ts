import type { CapacitorConfig } from '@capacitor/cli';

/*
 * App iPhone (App Store) : la même app, emballée par Capacitor dans une coque native.
 * Construire : npm run ios (il faut Xcode), puis ouvrir ios/App/App.xcodeproj dans Xcode.
 * L'identifiant (appId) doit correspondre à celui déclaré dans App Store Connect.
 */
const config: CapacitorConfig = {
  appId: 'fr.boucle.parcours',
  appName: 'Boucle',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#F2F1ED',
    preferredContentMode: 'mobile',
  },
};

export default config;
