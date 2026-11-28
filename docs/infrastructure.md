# Infrastructure, Capacity & Caching

Status: pilot planning document. No destructive disk cleanup has been performed.

## 1. Decisions

- Camera interval: **60 minutes, fixed** (one capture per camera per hour).
- Standard retention: **12 months**.
- First 20 pilot customers: may run on the existing shared host, with no SLA.
- Production host purchase: only after 100/500/1,000-camera load tests and a storage forecast.
- NSFW v1: report-only; no full-image scanning.
- Caching v1: short image TTL plus purge; signed URLs are a later step.
- Do not prune Docker volumes or delete camera data without a separate approval and backup.

## 2. Workload model

Assumptions:

- Average WebP image: **80 KB** (current observed average is ~80,134 bytes).
- Captures per camera/day = `1440 / interval_minutes`.
- Storage per camera/year = captures/day × 365 × average image size.
- Add 30–50% headroom for backups, metadata, logs and growth.

| Workload | Images/day | Storage/day | Storage/month | Storage/year | DB rows/year |
|---|---:|---:|---:|---:|---:|
| 20 cameras, 60 min | 480 | ~38 MB | ~1.15 GB | ~14 GB | ~175,000 |
| 1,000 cameras, 60 min | 24,000 | ~1.9 GB | ~58 GB | ~700 GB | ~8.8 million |

At 1,000 cameras/60 min the worker averages only ~0.28 images/second. The hard problems are storage lifecycle, retention deletion, backups, cache invalidation and availability, not raw request throughput.

Legacy intervals (no longer offered for new cameras):

| Interval | Storage/camera/year | 1,000 cameras/year |
|---|---:|---:|
| 5 min | ~8.4 GB | ~8.4 TB |
| 15 min | ~2.8 GB | ~2.8 TB |
| 60 min | ~0.7 GB | ~0.7 TB |

## 3. Current pilot host

Observed at planning time:

- 4 vCPU, 24 GB RAM, ~194 GB disk, ~80% used.
- Shared with Pterodactyl/game servers and other services.
- Docker accounts for the largest share of disk: unused images, build cache and stopped containers.
- Camera History itself uses only ~0.2 GB of database + MinIO data.

The host is sufficient for the first 20 cameras at 60 minutes, but it is not an HA platform. Before the pilot:

- take a verified offsite backup,
- add uptime/disk/resource monitoring,
- isolate resource limits,
- keep no-SLA wording on the pilot/terms page,
- do not run destructive cleanup without a separate reviewed plan.

### Internal CRM host

- `crm.camera-history.com` serves `packages/crm/dist` from the same host; the wildcard origin cert covers the subdomain.
- Nginx proxies only `/api/v1/auth/` and `/api/v1/internal/` to the API, so the CRM is same-origin and does not expose the rest of the API.
- Access is limited by `INTERNAL_EMAILS` (comma-separated); every `/api/v1/internal/*` route returns 404 for other accounts.
- CRM data lives in the same Postgres in global `leads` and `lead_activities` tables; it is not tenant-scoped and never exposed by public routes.
- The CRM does not send email and does not generate PDFs. Outreach is sent manually from `marek@`; one-pagers stay on the host CLI (`scripts/pilot-onepager`).

## 4. Caching policy

Current state: image and JSON responses do not have explicit cache headers; Cloudflare reports `DYNAMIC`. Some 404 responses receive a default cache TTL. This must be fixed before the pilot.

### V1 policy

| Resource | Cache policy |
|---|---|
| Image file `/api/v1/cameras/:id/:date/:file` | `public, max-age=3600, stale-while-revalidate=...`; purge on delete/NSFW block |
| Current-day image JSON | 60 seconds |
| Historical-day image JSON | 24 hours |
| Camera metadata | 5 minutes |
| Group metadata | 1 minute |
| Latest timestamp | 60 seconds |
| Admin/authenticated API | `private, no-store` |
| 404/410/blocked responses | `no-store` |
| `/embed.js` | bypass/no-cache |
| Static site assets | immutable, fingerprint-based |

### Revocation

- Purging exact URLs is enough for the first 20 customers.
- TTL must stay short while content can be removed for privacy, NSFW or billing reasons.
- Later, if instant revocation at scale is required, move to signed URLs or an origin/Worker check keyed by camera status.
- Do not use year-long immutable caching for content that can be deleted; CDN copies are still data.

### Targets

- Cache hit ratio above 80–90% for images and historical JSON.
- Origin egress and CDN cost monitored per camera/month.
- Cache purge tested on camera deletion, tenant deletion, billing cancellation, NSFW block and GDPR erasure.

## 5. Production topology

### Phase A — pilot

- Current host with Cloudflare.
- Backup target outside the host.
- No SLA; first 20 only.

### Phase B — first production

- Dedicated EU app host.
- Object storage separate from the app server (Cloudflare R2, Hetzner Storage Box or S3-compatible).
- Managed Postgres with PITR.
- Cloudflare CDN and cache rules.
- Staging environment.

### Phase C — scale

- API and worker separated.
- Multiple API instances behind a load balancer.
- Worker pool with a queue/distributed lock; never run duplicate capture workers without it.
- Managed database with read replica/HA.
- Object storage lifecycle and CDN purge automation.

### Phase D — multi-region

Only after paying demand and latency/data-residency requirements justify it. Do not add multi-region complexity for the first 1,000 cameras.

## 6. Server purchase gate

Do not buy production hardware before load tests. Baseline shortlist:

- **App tier:** 8–16 vCPU, 64 GB RAM, 2× NVMe (RAID1), 1 Gbps, EU location.
- **Database:** managed Postgres preferred; otherwise a dedicated DB host with PITR and offsite backups.
- **Object storage:** S3-compatible/R2; do not keep the archive only on the app server.
- **CDN:** Cloudflare in front of images, static assets and metadata.
- **Vendor shortlist:** Hetzner AX42/AX52/AX102 class, Cloudflare R2/Storage Box, EU managed Postgres provider. Confirm current price and availability at purchase.

Purchase triggers:

- pilot conversion to paid customers,
- disk watermark above 70%,
- sustained CPU above 60%,
- capture lag above one interval,
- cache hit ratio below 80%,
- database growth/backup window approaching the recovery target.

## 7. Backups and retention

- Postgres: daily full + WAL/PITR; RPO 15 minutes, RTO 4 hours.
- Object images: daily offsite replication; RPO 24 hours.
- Encrypted offsite backups with separate credentials and object lock.
- Monthly restore test; quarterly DR drill.
- Image retention must delete from object storage, Postgres, CDN cache and eventually backups.
- Backups must not become an uncontrolled permanent copy of deleted images.

## 8. Load test and SLO plan

Run on staging, not production:

1. 20 cameras/60 min (pilot baseline).
2. 100 cameras/60 min.
3. 500 cameras/60 min.
4. 1,000 cameras/60 min, with viewer/API load.

Measure:

- capture lag and failed captures,
- worker CPU/RAM and image conversion time,
- API p50/p95 latency,
- database size, rows and query latency,
- object-storage throughput,
- cache hit ratio and origin egress,
- backup duration and restore time.

Initial SLO targets to validate:

- API availability 99.5% for the pilot/production phase.
- Metadata p95 below 300 ms.
- Cached image p95 below 500 ms.
- Capture lag below one interval.
- Zero silent retention-deletion failures.

## 9. Operational guardrails

- No `docker system prune --volumes` without explicit approval.
- Preserve `camera-history_pgdata` and `camera-history_miniodata`.
- Do not remove volumes belonging to other applications without owner confirmation.
- Keep Docker log rotation enabled.
- Monitor disk, inodes, backup age and restore tests.
- Document every destructive cleanup with before/after `df -h` and a backup check.
