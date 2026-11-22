import type { CapacitorConfig } from '@capacitor/cli';

/*
 * Apps iPhone (App Store) et Android : la même app, emballée par Capacitor dans une coque native.
 * iPhone : npm run ios (il faut Xcode), puis ouvrir ios/App/App.xcodeproj dans Xcode.
 * Android : npm run android (il faut le SDK Android et Java 21), voir MAINTENANCE.md.
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
  // Android : plein écran sous les barres du système (WebView récent) ; sur un WebView ancien, Capacitor
  // laisse des bandes en haut et en bas, sombres comme le voile des photos, avec des icônes claires.
  android: {
    backgroundColor: '#16181a',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
    },
  },
};

export default config;
