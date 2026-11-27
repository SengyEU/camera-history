# Pilot one-pager

Generates a personalised A4 pilot proposal (PDF + PNG preview) and the matching
outreach email for a lead.

## Usage

```bash
node scripts/pilot-onepager/generate.mjs pilots/kitesportcentre.json
```

Output goes to `out/pilots/<slug>/`:

- `camera-history-pilot-<slug>.pdf`
- `preview.png`
- `one-pager.html`
- `email.txt`

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
  "cameraLocations": [
    "Garrylucas Beach",
    "Garretstown Beach",
    "Garryvoe Beach",
    "Coolmaine Beach"
  ],
  "headline": "Your beaches, beyond the live moment.",
  "insight": "Your Live CAM page already brings the four beaches together. The archive gives visitors a reason to come back tomorrow — and next season.",
  "preparedAt": "2026-11-27"
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

Use `packageCode` only when the recommendation needs a manual override. The
override must still fit the camera count.
