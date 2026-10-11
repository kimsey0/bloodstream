<script lang="ts">
  /**
   * A dock sheet: a title bar with Close that stays in view, a body that scrolls on short screens,
   * and an optional footer of actions that also stays in view without covering the body.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    onClose: () => void;
    /** Max width, px. */
    width?: number;
    children: Snippet;
    footer?: Snippet;
  }
  let { title, onClose, width = 420, children, footer }: Props = $props();
</script>

<div class="sheet" role="dialog" aria-label={title} style:--sheet-width={`${width}px`}>
  <div class="head">
    <h2>{title}</h2>
    <button class="close" onclick={onClose}>Close</button>
  </div>
  <div class="body">
    {@render children()}
  </div>
  {#if footer}
    <div class="foot">{@render footer()}</div>
  {/if}
</div>

<style>
  .sheet {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(var(--dock-space, 150px) + 10px);
    width: min(var(--sheet-width), calc(100% - 32px));
    max-height: calc(100% - var(--dock-space, 150px) - 100px - env(safe-area-inset-top, 0px));
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    overflow: hidden;
  }
  .head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px 8px;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-stretch: 85%;
  }
  .close {
    font: inherit;
    font-size: 12px;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .close:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    gap: 10px;
    padding: 2px 14px 12px;
  }
  .foot {
    flex: none;
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 14px 12px;
    border-top: 1px solid var(--line);
  }
</style>
