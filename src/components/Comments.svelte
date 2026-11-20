<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import { community } from '../lib/community.svelte';
  import { ago } from '../lib/community/time';
  import { tactile } from '../lib/haptics';
  import type { CommunityRoute } from '../lib/community/types';

  /** Commentaires d'un parcours de la communauté, et la saisie d'un nouveau. */
  let { r }: { r: CommunityRoute } = $props();

  let text = $state('');
  let sending = $state(false);
  const mineRoute = $derived(community.me?.id === r.authorId);

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (sending || !text.trim()) return;
    sending = true;
    if (await community.addComment(text)) text = '';
    sending = false;
  }
</script>

<section class="cm" aria-labelledby="cm-h" id="commentaires">
  <h3 id="cm-h" class="field-label">Commentaires{r.comments ? ` (${r.comments})` : ''}</h3>
  {#if community.comments.length}
    <ul class="cm-list">
      {#each community.comments as c, i (c.id)}
        <li class="cm-li li" style:--i={Math.min(i, 8)}>
          <button use:tactile type="button" class="who" aria-label="Profil de {c.authorName}" onclick={() => community.openProfile(c.authorId)}>
            <Avatar id={c.authorId} name={c.authorName} src={c.authorAvatar} size={30} />
          </button>
          <div class="cm-body">
            <p class="cm-head"><b>{c.authorName}</b><span>{ago(c.createdAt)}</span></p>
            <p class="cm-text">{c.body}</p>
            <div class="cm-acts">
              {#if community.me?.id === c.authorId || mineRoute}
                <button use:tactile type="button" class="mini" onclick={() => community.deleteComment(c)}>Retirer</button>
              {/if}
              {#if community.me?.id !== c.authorId}
                <button use:tactile type="button" class="mini" onclick={() => community.startReport({ commentId: c.id }, `le commentaire de ${c.authorName}`)}>Signaler</button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {:else if community.commentsLoading}
    <p class="hint">Chargement des commentaires…</p>
  {:else}
    <p class="hint">Pas encore de commentaire. Tu l’as fait ? Dis comment c’était.</p>
  {/if}

  <form class="cm-new" onsubmit={send}>
    <label class="visually-hidden" for="cm-input">Ton commentaire</label>
    <textarea id="cm-input" class="input" rows="1" maxlength="500" placeholder="Ajouter un commentaire…" bind:value={text}
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) {
          e.preventDefault();
          (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
        }
      }}></textarea>
    <button use:tactile type="submit" class="round send" aria-label="Envoyer le commentaire" disabled={!text.trim() || sending}><Icon name="send" size={18} /></button>
  </form>
</section>

<style>
  .cm {
    display: grid;
    gap: 10px;
  }
  .cm h3 {
    margin: 0;
  }
  .cm .hint {
    margin: 0 4px;
  }
  .cm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  .cm-li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .who {
    flex: none;
    border-radius: 50%;
  }
  .cm-body {
    flex: 1;
    min-width: 0;
    padding: 8px 12px 6px;
    border-radius: 4px 16px 16px 16px;
    background: var(--fill-group);
  }
  .cm-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin: 0;
    font-size: 0.8125rem;
  }
  .cm-head span {
    color: var(--label-2);
    font-size: 0.75rem;
  }
  .cm-text {
    margin: 2px 0 0;
    font-size: 0.9375rem;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .cm-acts {
    display: flex;
    gap: 14px;
  }
  .mini {
    min-height: 30px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--label-2);
  }
  .cm-new {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .cm-new .input {
    flex: 1;
    resize: none;
    min-height: 44px;
    max-height: 120px;
    padding-top: 11px;
    line-height: 1.35;
    field-sizing: content;
  }
  .send {
    width: 44px;
    height: 44px;
    color: var(--on-tint);
    background: var(--tint);
  }
  .send:disabled {
    background: var(--fill-2);
    color: var(--label-3);
    opacity: 1;
  }
</style>
