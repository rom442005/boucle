import { app } from './state.svelte';
import { community } from './community.svelte';
import { STRAVA_CLIENT_ID } from './community/config';
import { CommunityError, type StravaData } from './community/types';
import { askHealth, healthPlatform, healthStillAllowed, installHealthConnect, openHealthSettings, readHealthDays, summarize, type HealthSummary } from './health';
import type { HealthDay } from './community/types';
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
  /** mes journées de santé (serveur), lues sur tous les appareils */
  healthDays = $state.raw<HealthDay[]>([]);
  /** l'app de ce téléphone a l'accord de Santé / Health Connect et envoie ses données */
  healthOn = $state(flag(HEALTH_KEY) === '1');
  healthBusy = $state(false);
  private syncedAt = 0;

  get health(): HealthSummary | null {
    return summarize(this.healthDays);
  }

  /** Strava se relie depuis le site, avec un compte Boucle en ligne. */
  get stravaPossible() {
    return !!STRAVA_CLIENT_ID && community.configured && !community.demo && !isNativeApp;
  }
  /** ce téléphone peut envoyer ses données (app iPhone ou Android) */
  get healthCanSend() {
    return healthPlatform != null;
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

  /** Accord de Santé (iPhone) ou de Health Connect (Android), puis premier envoi. */
  async connectHealth() {
    this.healthBusy = true;
    try {
      const a = await askHealth();
      if (a === 'unavailable') {
        app.showToast(healthPlatform === 'android' ? 'Installe Health Connect, puis reviens.' : 'Santé n’est pas disponible sur cet appareil.');
        if (healthPlatform === 'android') installHealthConnect();
        return;
      }
      if (a === 'denied') {
        app.showToast('Autorise Boucle dans Health Connect.');
        await openHealthSettings();
        return;
      }
      this.healthOn = true;
      flag(HEALTH_KEY, '1');
      haptic('success');
      await this.syncHealth(true);
    } catch {
      app.showToast('Santé n’a pas donné son accord.');
    } finally {
      this.healthBusy = false;
    }
  }

  /** Le téléphone lit ses 28 derniers jours et les envoie (au plus toutes les 30 min, sauf demande). */
  async syncHealth(force = false) {
    if (!this.sending) return;
    if (!force && Date.now() - this.syncedAt < 30 * 60000) return;
    this.syncedAt = Date.now();
    if (!(await healthStillAllowed())) {
      // Accord retiré dans Health Connect : la carte « Relier » revient, le serveur garde le dernier envoi.
      this.healthOn = false;
      flag(HEALTH_KEY, null);
      return;
    }
    let days: HealthDay[];
    try {
      days = await readHealthDays();
    } catch (e) {
      this.syncedAt = 0; // nouvel essai au prochain retour dans l'app
      throw e;
    }
    // Le profil montre tout de suite ce que le téléphone vient de lire ; l'envoi suit.
    this.healthDays = days;
    if (!community.signedIn) return;
    try {
      await community.saveHealth(days);
    } catch {
      this.syncedAt = 0; // pas de réseau : nouvel essai au prochain retour dans l'app
    }
  }

  /** ce téléphone lit Santé / Health Connect et envoie */
  private get sending() {
    return healthPlatform != null && this.healthOn;
  }

  /** Ce que le profil affiche : un envoi frais depuis ce téléphone, sinon les journées reçues par le serveur. */
  async loadHealth() {
    try {
      await this.syncHealth();
    } catch {
      /* lecture impossible : le serveur garde le dernier envoi */
    }
    try {
      if (community.signedIn && !(this.sending && this.healthDays.length)) this.healthDays = await community.healthDays();
    } catch {
      /* Santé attendra */
    }
  }

  /** Plus d'envoi depuis ce téléphone, et les journées déjà reçues sont effacées du serveur. */
  async disconnectHealth() {
    this.healthOn = false;
    flag(HEALTH_KEY, null);
    try {
      if (community.signedIn) await community.clearHealth();
      this.healthDays = [];
      app.showToast('Données de santé effacées de Boucle');
    } catch {
      app.showToast('Effacement impossible pour le moment.');
    }
  }
}

export const links = new Links();
