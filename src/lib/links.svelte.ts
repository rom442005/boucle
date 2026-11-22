import { app } from './state.svelte';
import { community } from './community.svelte';
import { STRAVA_CLIENT_ID } from './community/config';
import { CommunityError, type StravaData } from './community/types';
import { connectHealth, healthPossible, readHealth, type HealthData } from './health';
import { isNativeApp } from './platform';
import { haptic } from './haptics';

/*
 * Comptes reliés, pour l'onglet Profil : Strava (par le serveur Supabase, qui garde le code secret de
 * l'application et les jetons) et Apple Santé (lecture directe sur l'iPhone, dans l'app native).
 */
const HEALTH_KEY = 'boucle.sante';
const STATE = 'boucle-strava';

function flag(key: string, v?: string | null): string | null {
  try {
    if (v === undefined) return localStorage.getItem(key);
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* sans mémoire */
  }
  return null;
}

class Links {
  strava = $state.raw<StravaData | null>(null);
  stravaBusy = $state(false);
  health = $state.raw<HealthData | null>(null);
  healthOn = $state(flag(HEALTH_KEY) === '1');
  healthBusy = $state(false);

  /** Strava se relie depuis le site, avec un compte Boucle en ligne. */
  get stravaPossible() {
    return !!STRAVA_CLIENT_ID && community.configured && !community.demo && !isNativeApp;
  }
  get healthPossible() {
    return healthPossible;
  }

  /** Vers Strava, qui demande l'accord puis revient ici avec un code. */
  connectStrava() {
    haptic('tap');
    const back = location.origin + location.pathname;
    const q = new URLSearchParams({ client_id: STRAVA_CLIENT_ID, response_type: 'code', redirect_uri: back, approval_prompt: 'auto', scope: 'read,activity:read', state: STATE });
    location.href = `https://www.strava.com/oauth/authorize?${q}`;
  }

  /** Retour de Strava : le code est échangé par le serveur, puis le profil s'ouvre avec les chiffres. */
  async finishStrava() {
    const q = new URLSearchParams(location.search);
    if (q.get('state') !== STATE) return;
    history.replaceState(null, '', location.pathname);
    const code = q.get('code');
    if (!code || q.get('error')) {
      app.showToast('Connexion à Strava annulée.');
      return;
    }
    this.stravaBusy = true;
    try {
      await community.start();
      await community.strava('connect', code);
      haptic('success');
      app.showToast('Strava est relié');
      community.openMe();
      await this.loadStrava();
    } catch (e) {
      app.showToast(e instanceof CommunityError ? e.message : 'Strava n’a pas pu être relié. Réessaie.');
    } finally {
      this.stravaBusy = false;
    }
  }

  async loadStrava() {
    if (!this.stravaPossible || !community.signedIn) return;
    try {
      this.strava = await community.strava('stats');
    } catch {
      /* Strava attendra */
    }
  }

  async disconnectStrava() {
    this.stravaBusy = true;
    try {
      this.strava = await community.strava('disconnect');
      app.showToast('Strava n’est plus relié');
    } catch (e) {
      app.showToast(e instanceof CommunityError ? e.message : 'Action impossible pour le moment.');
    } finally {
      this.stravaBusy = false;
    }
  }

  async connectHealth() {
    this.healthBusy = true;
    try {
      if (!(await connectHealth())) {
        app.showToast('Santé n’est pas disponible sur cet appareil.');
        return;
      }
      this.healthOn = true;
      flag(HEALTH_KEY, '1');
      haptic('success');
      await this.loadHealth();
    } catch {
      app.showToast('Santé n’a pas donné son accord.');
    } finally {
      this.healthBusy = false;
    }
  }

  async loadHealth() {
    if (!healthPossible || !this.healthOn) return;
    try {
      this.health = await readHealth();
    } catch {
      /* Santé attendra */
    }
  }

  disconnectHealth() {
    this.healthOn = false;
    this.health = null;
    flag(HEALTH_KEY, null);
  }
}

export const links = new Links();
