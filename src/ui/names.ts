/** Segment and place names in the viewer's chosen style: everyday (default) or anatomical. */
import { everydayName } from '../anatomy/plainNames';
import { ui } from './state.svelte';

/** A segment name, or a list entry such as an organ bed, in the chosen style. */
export const showName = (name: string): string => (ui.nameStyle === 'everyday' ? everydayName(name) : name);

/** The place part of a segment name ("left kidney: arterioles" → "Left kidney"), capitalised, in the chosen style. */
export const placeName = (name: string): string => capitalise(showName(name.replace(/: .*$/, '')));

export const capitalise = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
