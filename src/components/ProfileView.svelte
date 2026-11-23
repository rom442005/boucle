<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import ActivityBars from './ActivityBars.svelte';
  import CountUp from './CountUp.svelte';
  import HealthCard from './HealthCard.svelte';
  import { community } from '../lib/community.svelte';
  import { app } from '../lib/state.svelte';
  import { LEVELS } from '../lib/community/types';
  import { SPORTS } from '../lib/sports';
  import { decodePolyline } from '../lib/geo';
  import { km, NNBSP } from '../lib/format';
  import { last28, SPORT_EMOJI } from '../lib/scenes';
  import { tactile } from '../lib/haptics';
  import { links } from '../lib/links.svelte';
  import { healthPlatform } from '../lib/health';
  import { duration } from '../lib/format';

  /*
   * Un profil en quelques blocs de verre sur la photo : qui (photo, prénom, niveau, ville, présentation),
   * quatre chiffres en petits blocs, deux par ligne, l'activité des 28 derniers jours (le mien), puis les
   * parcours et les photos. Le reste (compte, déconnexion, confidentialité) vit dans « Modifier ».
   */
  const v = $derived(community.viewing!);
  const p = $derived(v.profile);
  const mine = $derived(community.me?.id === p.id);
  const followed = $derived(community.following.includes(p.id));
  const month = $derived(mine ? last28(app.history) : null);

  let picker = $state<HTMLInputElement>();
  let avatarBusy = $state(false);
  let more = $state(false);

  async function pickAvatar(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    avatarBusy = true;
    await community.changeAvatar(file);
    avatarBusy = false;
  }
  // Mon profil : les chiffres de Strava et de Santé, s'ils sont reliés ; relus au retour dans l'app (après le
  // raccourci « Boucle Santé », qui vient d'envoyer les données au serveur).
  $effect(() => {
    if (!mine) return;
    void links.loadStrava();
    void links.loadHealth();
    const back = () => document.visibilityState === 'visible' && void links.loadHealth();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  });
  const st = $derived(mine && links.strava?.connected ? links.strava : null);
  // Reçues par le serveur : elles s'affichent sur tous les appareils, pas seulement sur le téléphone.
  const hd = $derived(mine ? links.health : null);
  const dateShortFr = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso));
  const kmText = (m: number) => (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
</script>

<div class="cards">
  <section class="card hero glass photo-card" aria-label="Profil de {p.firstName}">
    <div class="who">
      {#if mine}
        <button use:tactile type="button" class="ph" aria-label={p.avatar ? 'Changer ma photo de profil' : 'Ajouter une photo de profil'} disabled={avatarBusy} onclick={() => picker?.click()}>
          <Avatar id={p.id} name={p.firstName} src={p.avatar} size={68} />
          <span class="ph-badge" aria-hidden="true"><Icon name="camera" size={13} fill /></span>
          {#if avatarBusy}<span class="ph-busy" aria-hidden="true"></span>{/if}
        </button>
        <input bind:this={picker} type="file" accept="image/*" hidden onchange={pickAvatar} />
      {:else}
        <Avatar id={p.id} name={p.firstName} src={p.avatar} size={68} />
      {/if}
      <div class="id">
        <h2>{p.firstName}</h2>
        <p class="sub">{LEVELS[p.level]}{p.city ? ` · ${p.city}` : ''}</p>
      </div>
      {#if mine}
        <button use:tactile type="button" class="round edit" aria-label="Modifier le profil" onclick={() => (community.sheet = { kind: 'edit' })}><Icon name="pencil" size={18} /></button>
      {:else}
        <button use:tactile type="button" class="follow" class:on={followed} aria-label={followed ? `Ne plus suivre ${p.firstName}` : `Suivre ${p.firstName}`} onclick={() => community.toggleFollow(p.id)}>
          {followed ? 'Abonné' : 'Suivre'}
        </button>
      {/if}
    </div>
    {#if p.bio}<p class="bio">{p.bio}</p>{/if}
  </section>

  <section class="card stat glass photo-card" aria-label="Parcours publiés">
    <span class="k">Parcours</span><span class="nrow"><span class="emo-s" aria-hidden="true">🗺️</span><b class="n rounded"><CountUp value={v.stats.routes} /></b></span>
  </section>
  <section class="card stat glass photo-card" aria-label="Abonnés">
    <span class="k">Abonnés</span><span class="nrow"><span class="emo-s" aria-hidden="true">👥</span><b class="n rounded"><CountUp value={v.stats.followers} /></b></span>
  </section>
  <section class="card stat glass photo-card" aria-label="J’aime reçus">
    <span class="k">J’aime</span><span class="nrow"><span class="emo-s" aria-hidden="true">❤️</span><b class="n rounded"><CountUp value={v.stats.likes} /></b></span>
  </section>
  <section class="card stat glass photo-card" aria-label="Sports">
    <span class="k">Sports</span>
    <b class="n emo">{#each p.sports as s (s)}<span title={SPORTS[s].label}>{SPORT_EMOJI[s]}</span>{:else}–{/each}</b>
  </section>

  {#if mine && links.stravaPossible && !st}
    <section class="card link glass photo-card" aria-label="Strava">
      <span class="k"><i class="strava-dot" aria-hidden="true"></i>Strava</span>
      <button use:tactile type="button" class="link-btn strava" disabled={links.stravaBusy} onclick={() => links.connectStrava()}>{links.stravaBusy ? 'Liaison…' : 'Relier'}</button>
    </section>
  {/if}
  {#if mine && links.healthCanSend && !links.healthOn}
    <section class="card link glass photo-card" aria-label={healthPlatform === 'android' ? 'Health Connect' : 'Apple Santé'}>
      <span class="k">❤️ Santé</span>
      <button use:tactile type="button" class="link-btn" disabled={links.healthBusy} onclick={() => links.connectHealth()}>{links.healthBusy ? 'Accord…' : 'Relier'}</button>
    </section>
  {:else if mine && !hd && (links.healthByShortcut || links.healthElsewhere)}
    <!-- Sans l'app : Santé passe par le raccourci de l'iPhone (feuille « Apple Santé »). -->
    <section class="card wide glass photo-card link-wide" aria-label="Apple Santé">
      <span class="heart" aria-hidden="true">❤️</span>
      <span class="lt">
        <b>Apple Santé</b>
        <span class="k">{links.healthByShortcut ? 'Tes pas, ta distance, ton énergie et plus, chaque jour ici.' : 'À relier depuis ton iPhone, puis visible ici aussi.'}</span>
      </span>
      <button use:tactile type="button" class="link-btn" onclick={() => (community.sheet = { kind: 'health' })}>{links.healthByShortcut ? 'Relier' : 'Comment'}</button>
    </section>
  {/if}

  {#if st}
    <section class="card wide glass photo-card" aria-label="Strava">
      <div class="card-top"><span class="k"><i class="strava-dot" aria-hidden="true"></i>Strava · cette année</span><span class="k">{st.athlete ?? ''}</span></div>
      <div class="pair">
        <span><b class="big2 rounded tabular">{kmText(st.ytd?.run.distance ?? 0)}<small>km</small></b><span class="k">🏃 {st.ytd?.run.count ?? 0} courses</span></span>
        <span><b class="big2 rounded tabular">{kmText(st.ytd?.ride.distance ?? 0)}<small>km</small></b><span class="k">🚴 {st.ytd?.ride.count ?? 0} sorties vélo</span></span>
      </div>
      {#if st.activities?.length}
        {@const a = st.activities[0]}
        <div class="sep"></div>
        <span class="k">Dernière activité · {dateShortFr(a.date)}</span>
        <span class="last">{a.name}<span class="k tabular"> · {kmText(a.distance)} km · {duration(a.time)}{a.elevation ? ` · ⛰️ ${a.elevation} m` : ''}</span></span>
      {/if}
      <span class="powered">Données Strava</span>
    </section>
  {/if}

  {#if hd}
    <HealthCard {hd} onsync={links.healthByShortcut ? () => links.runShortcut() : undefined} />
    <section class="card stat glass photo-card" aria-label="Pas par jour, moyenne sur 7 jours">
      <span class="k">Moy. 7 jours</span><span class="nrow"><span class="emo-s" aria-hidden="true">👣</span><b class="n rounded"><CountUp value={hd.steps} /></b></span>
    </section>
    <section class="card stat glass photo-card" aria-label="Fréquence cardiaque au repos">
      <span class="k">Au repos</span><span class="nrow"><span class="emo-s" aria-hidden="true">❤️</span><b class="n rounded">{#if hd.restingHr != null}<CountUp value={Math.round(hd.restingHr)} />{:else}–{/if}<small>bpm</small></b></span>
    </section>
    <section class="card stat glass photo-card" aria-label="VO2 max">
      <span class="k">VO2 max</span><span class="nrow"><span class="emo-s" aria-hidden="true">🫁</span><b class="n rounded">{#if hd.vo2max != null}<CountUp value={hd.vo2max} decimals={1} />{:else}–{/if}</b></span>
    </section>
    <section class="card stat glass photo-card" aria-label={hd.distance ? 'Sorties, 28 jours' : 'Marche et course, 28 jours'}>
      <span class="k">{hd.distance ? 'Sorties 28 j' : '28 jours'}</span><span class="nrow"><span class="emo-s" aria-hidden="true">{hd.distance ? '⌚' : '🚶'}</span><b class="n rounded"><CountUp value={(hd.distance || hd.walk28) / 1000} decimals={(hd.distance || hd.walk28) < 100000 ? 1 : 0} /><small>km</small></b></span>
    </section>
    {#if hd.last}
      <section class="card wide glass photo-card" aria-label="Dernière sortie">
        <div class="card-top"><span class="k">Dernière sortie · {dateShortFr(hd.last.start)}</span>{#if hd.last.source}<span class="k">via {hd.last.source}</span>{/if}</div>
        <b class="big2 rounded tabular">{hd.last.sport === 'ride' ? '🚴' : hd.last.sport === 'walk' ? '🥾' : '🏃'} {kmText(hd.last.distance)}<small>km</small></b>
        <span class="k tabular">{duration(hd.last.time)}{hd.last.kcal ? ` · 🔥 ${hd.last.kcal}${NNBSP}kcal` : ''}</span>
      </section>
    {/if}
  {/if}

  {#if month}
    <section class="card wide glass photo-card" aria-label="28 derniers jours">
      <div class="card-top">
        <span class="k">28 derniers jours</span>
        <span class="k">{month.active} sortie{month.active > 1 ? 's' : ''}</span>
      </div>
      <b class="big rounded"><CountUp value={month.total / 1000} decimals={month.total < 100000 ? 1 : 0} /><small>km</small></b>
      <ActivityBars />
    </section>
  {/if}

  {#if v.routes.length}
    <section class="card wide glass photo-card" aria-label="Parcours de {p.firstName}">
      <span class="k">Parcours</span>
      <ul class="routes">
        {#each v.routes as r, i (r.id)}
          <li style:--i={Math.min(i, 8)}>
            <button use:tactile type="button" onclick={() => community.openRoute(r.id, r)}>
              <span class="glyph"><RouteGlyph coords={decodePolyline(r.data.p, r.data.q)} size={44} active /></span>
              <span class="rt">
                <span class="rn">{r.name}</span>
                <span class="rm tabular">{SPORT_EMOJI[r.sport]} {km(r.distanceM)} · ⛰️ {r.ascentM}{NNBSP}m{r.likes ? ` · ❤️ ${r.likes}` : ''}</span>
              </span>
              <Icon name="chevron" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if v.photos.length}
    <section class="card wide glass photo-card" aria-label="Photos de sorties">
      <span class="k">Photos</span>
      <ul class="grid">
        {#each v.photos as ph, i (ph.id)}
          <li style:--i={Math.min(i, 12)}>
            <button use:tactile type="button" aria-label="Photo {i + 1}" onclick={() => community.openPhotos(v.photos, i)}><img src={ph.thumb} alt="" loading="lazy" decoding="async" /></button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if !mine}
    <div class="wide mod">
      {#if more}
        <button use:tactile type="button" class="text-btn" onclick={() => community.toggleBlock(p.id, p.firstName)}>{community.blocked.includes(p.id) ? 'Ne plus masquer' : 'Masquer'}</button>
        <button use:tactile type="button" class="text-btn" onclick={() => community.startReport({ profileId: p.id }, `le profil de ${p.firstName}`)}>Signaler</button>
      {:else}
        <button use:tactile type="button" class="round more" aria-label="Plus d’options" onclick={() => (more = true)}><Icon name="more" size={20} /></button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding-bottom: 8px;
  }
  .card {
    display: grid;
    gap: 6px;
    min-width: 0;
    border-radius: 26px;
    padding: 14px 16px;
    animation: card-in 560ms var(--spring) backwards;
  }
  .cards > :nth-child(2) { animation-delay: 60ms; }
  .cards > :nth-child(3) { animation-delay: 100ms; }
  .cards > :nth-child(4) { animation-delay: 140ms; }
  .cards > :nth-child(5) { animation-delay: 180ms; }
  .cards > :nth-child(n + 6) { animation-delay: 220ms; }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 14px;
      scale: 0.97;
    }
  }
  .hero,
  .wide {
    grid-column: 1 / -1;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .id {
    flex: 1;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 2px 0 0;
    font-size: 0.875rem;
    color: var(--label-2);
  }
  .bio {
    margin: 6px 0 0;
    font-size: 0.9375rem;
    line-height: 1.4;
    color: var(--label);
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ph {
    position: relative;
    flex: none;
    border-radius: 50%;
  }
  .ph-badge {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: var(--tint);
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.4);
  }
  .ph-busy {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
  }
  .edit,
  .more {
    width: 40px;
    height: 40px;
    flex: none;
    color: var(--label);
    background: var(--fill-2);
  }
  .follow {
    flex: none;
    min-height: 38px;
    padding: 0 18px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 0.9375rem;
    color: #fff;
    background: var(--tint);
    transition: transform 240ms var(--spring);
  }
  .follow.on {
    background: var(--fill-2);
  }
  .follow:active {
    transform: scale(0.95);
  }
  .k {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--label-2);
  }
  .stat .n {
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  /* Comme les blocs-onglets (Communauté, Mes parcours) : étiquette seule, l'émoji à côté du chiffre. */
  .nrow {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .emo-s {
    font-size: 1.125rem;
    line-height: 1;
  }
  .stat .emo {
    font-size: 1.625rem;
    letter-spacing: 0.06em;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
  }
  .stat .n small,
  .big2 small {
    font-family: var(--font);
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--label-2);
    margin-left: 3px;
  }
  .link {
    align-content: space-between;
    min-height: 104px;
  }
  .link-wide {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .heart {
    flex: none;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 1.25rem;
    background: rgba(255, 55, 95, 0.22);
    animation: heart-beat 1400ms var(--ease-out) 700ms 2;
  }
  @keyframes heart-beat {
    14% {
      transform: scale(1.14);
    }
    28% {
      transform: scale(1);
    }
    42% {
      transform: scale(1.1);
    }
    70% {
      transform: scale(1);
    }
  }
  .lt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .lt b {
    font-size: 1rem;
  }
  .link-wide .link-btn {
    flex: none;
    background: var(--tint);
  }
  .link-btn {
    justify-self: start;
    min-height: 34px;
    padding: 0 16px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 0.875rem;
    color: #fff;
    background: rgba(255, 255, 255, 0.2);
    transition: transform 240ms var(--spring);
  }
  .link-btn:active {
    transform: scale(0.95);
  }
  .link-btn.strava {
    background: #fc5200;
  }
  .strava-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 6px;
    border-radius: 50%;
    background: #fc5200;
    vertical-align: 1px;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .pair > span {
    display: grid;
    gap: 2px;
  }
  .big2 {
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  .sep {
    height: 0.5px;
    margin: 6px 0 2px;
    background: var(--separator);
  }
  .last {
    font-weight: 600;
    font-size: 0.9375rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .powered {
    justify-self: end;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #fc5200;
  }
  .big {
    font-size: 2.5rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
    margin-bottom: 6px;
  }
  .big small {
    font-family: var(--font);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--label-2);
    margin-left: 4px;
  }
  .routes {
    list-style: none;
    margin: 2px -8px -6px;
    padding: 0;
  }
  .routes li + li {
    border-top: 0.5px solid var(--separator);
  }
  .routes button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 16px;
    text-align: left;
    color: var(--label-3);
  }
  .routes button:active {
    background: var(--fill-2);
  }
  .glyph :global(.glyph) {
    background: rgba(255, 255, 255, 0.1);
  }
  .glyph :global(.glyph path) {
    stroke: #fff;
  }
  .rt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .rn {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rm {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    border-radius: 14px;
    overflow: hidden;
  }
  .grid li {
    aspect-ratio: 1;
  }
  .grid button {
    width: 100%;
    height: 100%;
    display: block;
  }
  .grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .mod {
    display: flex;
    justify-content: center;
    gap: 18px;
  }
  .mod .text-btn {
    color: var(--label-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
  /* Téléphone : des blocs un peu plus compacts (Romain, 23/11). */
  @media (max-width: 859px) {
    .cards {
      gap: 8px;
    }
    .card {
      padding: 12px 14px;
      border-radius: 24px;
    }
    .k {
      font-size: 0.75rem;
    }
    .big {
      font-size: 2.375rem;
    }
    .stat .n {
      font-size: 1.75rem;
    }
  }
</style>
