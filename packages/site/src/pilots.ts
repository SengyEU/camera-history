export interface PilotStory {
  /** Customer name shown on the card. */
  name: string;
  /** One or two sentences about the camera they run and why. */
  caption: string;
  /** Screenshot of their site with the widget, e.g. "/pilots/alpine-summit.webp". */
  screenshot?: { src: string; alt: string };
  /** Link to the customer site. */
  href?: string;
}

/**
 * Hand-curated customer wall, not derived from tenant data.
 * Add an entry only after the customer agrees in writing.
 * Screenshots go to packages/site/public/pilots/.
 */
export const pilotStories: PilotStory[] = [];
