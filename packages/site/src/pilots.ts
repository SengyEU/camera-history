export interface PilotStory {
  /** Customer name shown on the card. */
  name: string;
  /** One or two sentences about the camera they run and why. */
  caption: string;
  /** Screenshot of their site with the widget, e.g. "/pilots/alpine-summit.webp". */
  screenshot?: { src: string; alt: string };
  /** Link to the customer site, or an internal page such as the demo archive. */
  href?: string;
  /** Link text; defaults to "Visit site →". */
  linkLabel?: string;
}

/**
 * Hand-curated customer wall, not derived from tenant data.
 * Add an entry only after the customer agrees in writing.
 * Screenshots go to packages/site/public/pilots/.
 */
export const pilotStories: PilotStory[] = [
  {
    name: "Alpine Summit (demo)",
    caption:
      "Three mountain cameras with 12 months of history. This is the same archive your visitors would browse.",
    screenshot: {
      src: "/pilots/alpine-summit.webp",
      alt: "Alpine Summit demo archive showing the Glacier Bowl camera",
    },
    href: "/group/alpine-summit/summit",
    linkLabel: "Open the demo →",
  },
];
