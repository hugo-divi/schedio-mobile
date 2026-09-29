import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { getVisibleViewportHeight, subscribeVisibleViewportHeight } from '../services/pwa';

/**
 * How tall the screen *actually is right now*, for anything that sizes itself
 * against the viewport.
 *
 * On native this is just `useWindowDimensions().height`. On web it isn't:
 * `useWindowDimensions` reads `window.innerHeight`, which iOS Safari does not
 * shrink when the keyboard opens — so a sheet capped at "88% of the screen"
 * was capped against a screen 300px taller than the part you could see, and its
 * top (the title, the first field) was cut off above the visible band.
 * `pinAppToVisualViewport` already tracks the real visible height for its own
 * purposes; this just hands it to React.
 *
 * Falls back to the window height whenever there's no visual viewport in play
 * (native, older engines, static prerendering).
 */
export default function useVisibleViewportHeight() {
  const { height: windowHeight } = useWindowDimensions();
  const [visibleHeight, setVisibleHeight] = useState(getVisibleViewportHeight);

  useEffect(() => subscribeVisibleViewportHeight(setVisibleHeight), []);

  return visibleHeight ?? windowHeight;
}
