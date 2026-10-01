<script lang="ts">
  import { ui } from './state.svelte';

  interface Props {
    menu: { x: number; y: number; cell: number | null; bed: number };
    onFollow: (cell: number) => void;
    onOpenBed: (capillary: number) => void;
  }
  let { menu, onFollow, onOpenBed }: Props = $props();

  let label = $derived.by(() => {
    const t = ui.segmentNames[menu.bed]?.replace(/: .*$/, '') ?? '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  // Keep the menu on screen.
  let left = $derived(Math.min(Math.max(16, menu.x - 110), globalThis.innerWidth - 236));
  let top = $derived(Math.min(menu.y + 14, globalThis.innerHeight - 240));
</script>

<div class="menu" role="menu" style:left={`${left}px`} style:top={`${top}px`}>
  <button role="menuitem" class="primary" onclick={() => onOpenBed(menu.bed)}>
    Zoom into capillaries
    <span>{label}</span>
  </button>
  {#if menu.cell !== null}
    <button role="menuitem" onclick={() => onFollow(menu.cell!)}>Follow this red cell</button>
  {/if}
  <button role="menuitem" class="cancel" onclick={() => (ui.tapMenu = null)}>Cancel</button>
</div>

<style>
  .menu {
    pointer-events: auto;
    position: absolute;
    width: 220px;
    display: grid;
    gap: 6px;
    padding: 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  button {
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 7px 10px;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .primary {
    border-color: var(--steel);
    display: grid;
  }
  .primary span {
    color: var(--muted);
    font-size: 12px;
  }
  .cancel {
    color: var(--muted);
    text-align: center;
  }
</style>
