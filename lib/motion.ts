import type { Transition } from "motion/react";

/**
 * The widget has exactly two on-screen sizes. Both are fixed: the collapsed
 * search bar, and the expanded panel. The panel never resizes to fit its
 * content — taller steps scroll inside it — so the embedding iframe only ever
 * animates between these two heights. This is what keeps the host page's
 * layout perfectly still (see the overlay model in the landing LiveWidget).
 */
export const QUOTE_SIZES = {
  /** The glass card (.q) itself when collapsed — its natural search-bar
   *  height. */
  collapsedBar: 90,
  /** Slim collapsed card on phones — less chrome, same control. */
  collapsedBarMobile: 62,
  /** Full collapsed iframe height = the card + room BELOW it for the card's
   *  drop shadow to render (the card is top-aligned in the iframe). Without
   *  this the iframe clips the shadow at the bar's bottom edge. */
  collapsed: 120,
  /** Mobile iframe height for the slim bar + a tight shadow room. */
  collapsedMobile: 82,
  /** The expanded panel card itself — the step body scrolls internally past
   *  this. */
  expandedPanel: 544,
  /** Full expanded iframe height = the panel + the same shadow room below, so
   *  the panel's drop shadow isn't clipped at the bottom corners. */
  expanded: 574,
} as const;

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;

export const MOTION_DURATION = {
  fast: 0.14,
  base: 0.2,
  shell: 0.32,
} as const;

export const SHELL_TRANSITION: Transition = {
  duration: MOTION_DURATION.shell,
  ease: EASE_SOFT,
};

export const STEP_TRANSITION: Transition = {
  duration: MOTION_DURATION.base,
  ease: EASE_OUT,
};

export const PROGRESS_TRANSITION: Transition = {
  duration: MOTION_DURATION.base,
  ease: EASE_SOFT,
};

export const ADVANCE_DELAY_MS = 110;
