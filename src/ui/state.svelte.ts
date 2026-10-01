/** Reactive UI state shared between the app controller and the Svelte HUD. */
export const SPEEDS = [0.01, 0.1, 1, 10, 30] as const;

export const ui = $state({
  ready: false,
  paused: false,
  speed: 1 as number,
  time: 0,
  cellCount: 0,
  arterialSaturation: 0,
  mixedVenousSaturation: 0,
  meanCirculationTime: 0,
  cardiacOutput: 0,
  bloodVolume: 0,
  infoOpen: false,
});
