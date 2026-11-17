# Privacy, Content Safety & Retention

Status: draft for legal review. This is an engineering and operations plan, not legal advice.
The agreed baseline model is:

- **Camera operator = controller** of the camera content and its purpose.
- **Camera History = processor** for camera content.
- **Camera History = controller** for its own account, billing, support and website data.
- Joint-controller questions must be assessed before Camera History curates, promotes or reuses camera content beyond the operator's instructions.

## 1. GDPR operating model

### Roles

| Data | Primary role | Notes |
|---|---|---|
| Camera images, clips and public camera pages | Operator = controller; Camera History = processor | Operator decides location, field of view, purpose, retention plan and publication. Camera History stores, serves and embeds the content on the operator's instructions. |
| Account, users, billing and support | Camera History = controller | Contract and legal obligations; payment data processed by Stripe. |
| Access logs, security logs and IP addresses | Camera History = controller | Minimise, restrict access and define a retention period. |
| Marketing and analytics | Camera History = controller | No non-essential analytics without a lawful basis and consent where required. |

A DPA can allocate responsibilities and indemnities, but it cannot remove data-subject rights, processor obligations or regulator oversight. If Camera History decides to create a public directory, promote footage or use it in marketing, it must reassess its role.

### Operator obligations

The operator must have a lawful basis, provide appropriate notice to people in the camera's field of view and complete a DPIA where systematic monitoring requires one. Camera History provides a privacy-notice link, retention controls and deletion tooling, but cannot supply the operator's legal basis.

### Transparency

- Privacy notice for account/billing data.
- Camera operator terms and DPA.
- Short privacy notice linked from every public widget/group embed.
- No facial recognition. Optional face/plate blurring is a future privacy feature, not a substitute for a lawful basis.
- Document what happens when a camera is disabled, deleted or moves to another operator.

## 2. Data inventory and retention

| Data | Default retention | Deletion path |
|---|---|---|
| Camera images | Camera plan; standard plan is 12 months | Daily retention job: object storage, Postgres, CDN purge; backup expiry |
| Account and user data | Life of account plus legal retention | Account deletion workflow; backups expire |
| Billing records | Statutory/tax period | Stripe and accounting records; do not delete before legal expiry |
| Access/security logs | 30–90 days, minimised | Log rotation and retention policy |
| Support messages | 12–24 months | Support system deletion |
| Trial/abandoned checkout data | Short operational period | Cleanup job; Stripe data per Stripe policy |
| Backups | Defined backup window | Immutable until expiry; erasure requests documented as backup-limited |

**Current gap:** the public API hides images older than the plan, but there is no retention-deletion job. Deleting a camera cascades database rows but leaves MinIO objects behind. This must be fixed before the first paying customer.

Erasure must cover:

1. Postgres rows.
2. Object-storage keys and versions.
3. CDN cache entries (or a documented short residual TTL).
4. Backup expiry, with a documented exception if backups cannot be rewritten.
5. Derived indexes/thumbnails, if introduced later.

## 3. Data-subject requests

- Public contact route for access, rectification, erasure, restriction and objection.
- Identity verification proportional to the request.
- Target response within one month; document extensions where legally allowed.
- Operator requests are handled by the operator; Camera History assists as processor.
- Account requests are handled directly by Camera History as controller.
- Erasure test must include a camera with cached public images and an operator with no remaining cameras.
- Maintain a request log without storing more personal data than necessary.

## 4. Vendors and transfers

Maintain a public subprocessor list and DPAs for at least:

- Cloudflare (DNS, CDN, security).
- Stripe (payments, tax, billing).
- Hosting and object-storage provider.
- E-mail provider.
- Future moderation/NSFW provider.
- Backup provider.

Document EU hosting, international transfers, SCC/DPF position and the security measures for each vendor. Do not add a moderation provider until its DPA, data location and image-retention behaviour are reviewed.

## 5. Security and incidents

- Encryption in transit and at rest.
- Least-privilege access, strong authentication and secret rotation.
- Separate production/staging credentials.
- Audit access to admin and moderation tools.
- Backups tested monthly; DR drill quarterly.
- Incident runbook with detection, containment, evidence, notification assessment and regulator/customer communication.
- Do not promise "GDPR compliance" in marketing; describe concrete measures and policies.

## 6. NSFW and inappropriate content

### V1 scope: report-only

The first 20 customers use a report-only model. No full automated scan of every image.

Required flow:

1. A public report action on camera/group embeds (rate-limited, optional contact, category).
2. Report enters an admin moderation queue.
3. Credible reports hide the content pending review.
4. Reviewer decides: restore, keep hidden, block camera, delete, or escalate.
5. Operator is notified and the decision is recorded in an audit log.
6. False positives can be restored with a reason.

### Categories and policy

The acceptable-use policy must define at least:

- nudity/sexual content,
- graphic violence or gore,
- hate/extremist content,
- harassment/privacy abuse,
- minors,
- non-consensual intimate imagery,
- clearly illegal content.

Adult content may be legal but still prohibited by the platform policy. Illegal content is handled under the escalation path.

### Illegal content and CSAM

If Camera History obtains actual knowledge of illegal content:

- Remove or disable access expeditiously.
- Preserve minimal evidence and an audit trail.
- Do not redistribute the material internally or externally.
- Notify the operator.
- Follow legal advice and report to the competent authority where required.
- Record the decision and the authority contacted.

Do not wait for a court order for clearly illegal content. Get jurisdiction-specific legal advice before launch.

### Service levels

Proposed pilot targets:

- credible report acknowledged within 1 business day;
- urgent illegal-content report hidden immediately and escalated;
- takedown decision recorded with reason and reviewer;
- operator notified;
- monthly review of report volume and false positives.

### Later phases

Sampled scanning or full automated scanning only after:

- image volume and provider cost are known,
- DPA/data-location review is complete,
- quarantine and human-review workflow is tested,
- false-positive rate and appeal process are documented.

## 7. First-20 pilot privacy checklist

- [ ] DPA and operator terms accepted online; signed copy only on request.
- [ ] Privacy notice and widget notice published.
- [ ] DPIA template available to operators.
- [ ] Retention-deletion job tested on images, objects, CDN and backups.
- [ ] Camera/tenant deletion deletes objects.
- [ ] DSAR/erasure runbook tested.
- [ ] Subprocessor list and vendor DPAs complete.
- [ ] Log retention/IP minimisation configured.
- [ ] Breach contact and incident runbook ready.
- [ ] NSFW report queue, hiding, review, audit and escalation tested.
- [ ] Legal review completed for the launch market.

## 8. Open legal questions

- Whether any feature makes Camera History a joint controller.
- Whether the operator or Camera History must provide the primary notice for embedded cameras.
- Age/minor-specific obligations if a camera operator targets family venues.
- Jurisdiction-specific illegal-content reporting duties.
- Whether optional blurring changes the risk assessment or requires additional consent.
