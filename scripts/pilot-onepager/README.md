# Proposal one-pager

Generates a personalised A4 proposal (PDF + PNG preview) and the matching
outreach email for a lead.

## Usage

```bash
node scripts/pilot-onepager/generate.mjs pilots/kitesportcentre.json
```

Output goes to `out/proposals/<slug>/`:

- `camera-history-proposal-<slug>-wordpress.pdf` or `...-iframe.pdf`
- `preview-wordpress.png` or `preview-iframe.png`
- `one-pager-wordpress.html` or `one-pager-iframe.html`
- `email-wordpress.txt` or `email-iframe.txt`

Both `pilots/` and `out/` are gitignored because they contain lead data and
personalised documents.

## Lead JSON

```json
{
  "slug": "kitesportcentre",
  "company": "Kite Sport Centre",
  "contactName": "Ray",
  "email": "info@kitesportcentre.com",
  "website": "https://www.kitesportcentre.com",
  "location": "Cork, Ireland",
  "cameraCount": 4,
  "wordpress": true,
  "layout": "separate-pages",
  "signupUrl": "https://camera-history.com/admin/#/register?invite=...&package=plus",
  "cameraLocations": [
    "Garrylucas Beach",
    "Garretstown Beach",
    "Garryvoe Beach",
    "Coolmaine Beach"
  ],
  "headline": "Your beaches, beyond the live moment.",
  "insight": "Your Live CAM page already brings the four beaches together. The archive gives visitors a reason to come back tomorrow — and next season.",
  "preparedAt": "2026-11-28"
}
```

`cameraCount` drives the recommended package:

| Cameras | Package |
| --- | --- |
| 1 | Solo |
| 2–3 | Starter |
| 4–5 | Plus |
| 6–10 | Pro |
| 11–25 | Network |
| 26+ | Custom |

`wordpress: true` selects the WordPress widget copy; `false` (or omitted) uses
the generic iframe version.

`signupUrl` is optional. Use a personalised pilot registration URL so the lead
gets the right package and free months by themselves. If omitted, the email
points to the generic registration page and the text says the free months will
be activated manually.

`layout` controls the widget recommendation:

- `separate-pages` (default) — one single-camera widget per camera page.
- `one-page` — one group widget for all cameras on a single live-cam page.

Use `packageCode` only when the recommendation needs a manual override. The
override must still fit the camera count.
