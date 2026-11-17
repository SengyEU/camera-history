# Graph Report - camera-history  (2026-11-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1152 nodes · 2066 edges · 89 communities (74 shown, 15 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d90ddcc7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76

## God Nodes (most connected - your core abstractions)
1. `Repos` - 42 edges
2. `environment` - 25 edges
3. `environment` - 24 edges
4. `HttpError` - 22 edges
5. `App()` - 21 edges
6. `AppConfig` - 16 edges
7. `App()` - 16 edges
8. `typescript` - 16 edges
9. `Camera` - 15 edges
10. `registerAdminRoutes()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `typescript@^5.6.3` --declares--> `typescript`  [EXTRACTED]
  packages/api/package.json → package.json
- `typescript@^5.6.3` --declares--> `typescript`  [EXTRACTED]
  packages/core/package.json → package.json
- `typescript@^5.6.3` --declares--> `typescript`  [EXTRACTED]
  packages/db/package.json → package.json
- `typescript@^5.6.3` --declares--> `typescript`  [EXTRACTED]
  packages/worker/package.json → package.json
- `typescript@^5.6.3` --declares--> `typescript`  [EXTRACTED]
  packages/admin/package.json → package.json

## Import Cycles
- None detected.

## Communities (89 total, 15 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (24): {closure#1}(), Ch_Client, Ch_Settings, Ch_Shortcode, add_shortcode(), did_action(), esc_attr(), esc_html() (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (48): build, depends_on, healthcheck, ports, restart, context, dockerfile, minio (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (30): environment, BILLING_GRACE_DAYS, DATABASE_URL, FEED_MAX_BYTES, FEED_TIMEOUT_MS, JWT_ACCESS_TTL_SECONDS, JWT_REFRESH_TTL_SECONDS, JWT_SECRET (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (19): HttpError, captureCustom(), CustomCaptureOptions, frameToBuffer(), JPEG_HEADER, captureHls(), captureRtsp(), FfmpegRunOptions (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (24): dependencies, zod@^3.23.8, devDependencies, @types/node@^22.10.2, typescript@^5.6.3, vitest@^3.0.0, exports, vitest (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (23): App(), CameraCard(), CameraForm(), CameraRoute, CameraSummary(), currentView(), emptyInput(), GroupRoute (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (23): AdminCamera, AdminGroup, api, ApiError, AUTH_PATHS, BillingDto, BillingStatus, BillingTierDto (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (24): devDependencies, eslint@^9.14.0, typescript-eslint@^8.15.0, engines, node, name, private, scripts (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (17): createDb(), Db, db, CameraRow, TenantRow, billingStatusEnum, cameraGroupMembers, cameraGroups (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (23): @testing-library/jest-dom@^6.6.3, @types/react@^18.3.12, @types/react-dom@^18.3.1, @vitejs/plugin-react@^4.3.4, devDependencies, jsdom@^25.0.1, @testing-library/jest-dom@^6.6.3, @types/react@^18.3.12 (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (11): AdminCameraGroup, BillingPatch, BillingStatus, NewTenant, NewUser, PublicGroupWithCameras, Tenant, User (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (21): typescript@^5.6.3, typescript, @types/node@^22.10.2, typescript@^5.6.3, @types/node, devDependencies, reveal.js@^6.0.2, @types/node@^22.10.2 (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (15): dayRangeOrNull(), notFound(), PublicRouteDeps, registerPublicRoutes(), todayStr, dayRangeInZone(), dayRangeUtc(), gatedRange() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (13): keyFor(), ObjectStorage, captureWithRetry(), runSchedule(), RunScheduleDeps, toWebp(), WEBP_ARGS, cfg (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (20): applySharedState(), derivedId(), ensureFrameId(), fontLinks(), frameFor(), frameOrigin(), hashTarget(), isOpaque() (+12 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (19): dependencies, @ch/design@*, @dnd-kit/core@^6.3.1, @dnd-kit/sortable@^10.0.0, @dnd-kit/utilities@^3.2.2, react@^18.3.1, react-dom@^18.3.1, react (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (19): dependencies, @ch/db@*, fastify@^5.2.0, @fastify/cookie@^11.0.1, @fastify/jwt@^9.0.2, @fastify/rate-limit@^10.1.0, @node-rs/argon2@^2.0.2, exports (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (14): "cameras", cameras_enabled_idx, cameras_tenant_idx, "images", images_camera_timestamp_idx, "tenants", tenants_slug_unique, "users" (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (18): devDependencies, drizzle-kit@^0.30.2, tsx@^4.19.2, @types/node@^22.10.2, @types/pg@^8.11.10, typescript@^5.6.3, vitest@^3.0.0, exports (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (12): GroupCamera, ImageDto, PublicCamera, PublicGroup, ThemeColors, WidgetBodyProps, FilmStripProps, defaultImages (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (4): App(), Box(), root, reportWebVitals()

### Community 21 - "Community 21"
Cohesion: 0.19
Nodes (4): ALL_PRICES, defineFakeStripeGateway(), makeApp(), testConfig

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (13): AppDeps, buildApp(), AuthUser, clearCookies(), @fastify/jwt, FastifyJWT, getAccessToken(), getRefreshToken() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (10): ThemeColors, Camera, CameraPatch, CameraStatus, FeedType, NewCamera, PublicCamera, PublicGroupCamera (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (16): getCamera(), getCameraLatest(), getGroup(), getImages(), App(), CameraSwitcher(), CUSTOM_THEME_VARS, isValidTheme() (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (14): applyThemeOverride(), CUSTOM_THEME_VARS, FontMessage, PRESET_THEMES, requestEmbedContext(), setupEmbedResize(), ThemeMessage, buildShareUrl() (+6 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (16): devDependencies, tsx@^4.19.2, @types/node@^22.10.2, typescript@^5.6.3, vitest@^3.0.0, engines, node, exports (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (3): ImageRecord, NewImage, Repos

### Community 28 - "Community 28"
Cohesion: 0.24
Nodes (14): requireAuth(), FEED_TYPES, INTERVALS, notFound(), parseCoordinate(), parsePlanMonths(), parseTimeFormat(), publicImageUrl() (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.15
Nodes (11): buildZip(), centralHeader(), collectFiles(), __dirname, entries, localHeader(), OUT_DIR, OUT_FILE (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.31
Nodes (12): WidgetBody(), FilmStrip(), ShareGlyph(), viewerCaptureLabel(), viewerHourParts(), formatCameraCaptureLabel(), formatCameraDate(), formatCameraHour() (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (4): animationsEnabled, ContentTransition(), ContentTransitionProps, FrozenLayer

### Community 32 - "Community 32"
Cohesion: 0.30
Nodes (11): configuredPrices(), graceUntil(), RATE_LIMIT, registerBillingRoutes(), adminBase(), BILLING_TIERS, BillingTier, eurPerCamera() (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess (+5 more)

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (13): devDependencies, jsdom@^25.0.1, @testing-library/react@^16.1.0, @testing-library/user-event@^14.5.2, vite@^6.0.3, vitest@^3.0.0, jsdom, vite (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (10): embedSnippet(), escapeHtmlAttribute(), groupEmbedId(), groupEmbedSrc(), EmbedCodePanel(), cameraLabel(), GroupEditor(), GroupInput (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (5): AppConfig, BillingJobInput, lastSynced, SubscriptionSyncGateway, cfg

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (11): compilerOptions, allowImportingTsExtensions, declaration, declarationMap, jsx, module, moduleResolution, noEmit (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (11): compilerOptions, allowImportingTsExtensions, declaration, declarationMap, jsx, module, moduleResolution, noEmit (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.21
Nodes (9): runBillingJobs(), cfg, db, repos, storage, sync, tick(), runLoop() (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (9): DEFAULT_THEME_COLORS, isValidThemeColor(), normalizeThemeColors(), PRESET_THEMES, PresetTheme, Theme, THEME_COLOR_KEYS, ThemeColorKey (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (10): dependencies, @fontsource-variable/montserrat@^5.3.0, exports, ./index.css, ./tokens.css, name, private, type (+2 more)

### Community 42 - "Community 42"
Cohesion: 0.20
Nodes (6): playwright@1.59.0, BASE, DECK_BASE, html, html, playwright

### Community 43 - "Community 43"
Cohesion: 0.20
Nodes (10): @ch/core@*, stripe@^22, stripe, @ch/core@*, @ch/core, dependencies, @ch/core@*, @ch/db@* (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (3): createStripeGateway(), StripeGateway, StripeWebhookEvent

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (6): Rfc7807Error, createObjectStorage(), ensureBucket(), ensureBucketExists(), minio, testConfig

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (9): dependencies, drizzle-orm@^0.38.3, minio@^8.0.2, pg@^8.13.1, minio, pg, db, dry (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, module, moduleResolution, noEmit, types, extends (+1 more)

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (5): CheckIcon(), LinkIcon(), NETWORKS, SharePopup(), SharePopupProps

### Community 49 - "Community 49"
Cohesion: 0.24
Nodes (3): createSubscriptionSyncGateway(), SubscriptionItemsClient, syncSubscriptionItems()

### Community 50 - "Community 50"
Cohesion: 0.22
Nodes (9): scripts, build, clean, deck:pdf, dev, preview, screenshots, test (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (3): ctor, FakeWS, JPG

### Community 52 - "Community 52"
Cohesion: 0.22
Nodes (8): entryImports, errors, required, root, scanned, scanRoots, tokens, tokensPath

### Community 53 - "Community 53"
Cohesion: 0.39
Nodes (8): API, call(), ensureCameras(), ensureGroups(), ensureTenant(), login(), makeJar(), TENANTS

### Community 54 - "Community 54"
Cohesion: 0.32
Nodes (7): ThemeColors, CONTRAST_PAIRS, contrastRatio(), contrastWarnings(), DEFAULT_THEME_COLORS, luminance(), THEME_COLOR_FIELDS

### Community 55 - "Community 55"
Cohesion: 0.25
Nodes (7): app, cfg, db, repos, storage, stripe, createRepos()

### Community 56 - "Community 56"
Cohesion: 0.25
Nodes (6): admin, deck, landing, robots, sitemap, web

### Community 57 - "Community 57"
Cohesion: 0.25
Nodes (8): scripts, build, clean, dev, e2e, preview, test, typecheck

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (6): isCaptureDue(), isInActiveWindow(), isInDaylightWindow(), minutesInZone(), baseCam, lakeLouiseCam

### Community 59 - "Community 59"
Cohesion: 0.25
Nodes (4): db, dry, env, minio

### Community 60 - "Community 60"
Cohesion: 0.36
Nodes (7): api(), findPortalConfig(), findPrice(), findProduct(), portalParams, priceIds, TIERS

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (6): background_color, display, icons, name, start_url, theme_color

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (7): scripts, build, clean, dev, preview, test, typecheck

### Community 63 - "Community 63"
Cohesion: 0.38
Nodes (5): groupServer(), jsonResponse(), listServer(), openGroups(), SeedGroup

### Community 64 - "Community 64"
Cohesion: 0.29
Nodes (7): devDependencies, tsx@^4.19.2, @types/node@^22.10.2, typescript@^5.6.3, vitest@^3.0.0, tsx, vitest

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (7): scripts, build, clean, db:generate, db:migrate, test, typecheck

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 67 - "Community 67"
Cohesion: 0.33
Nodes (6): scripts, build, clean, dev, test, typecheck

### Community 68 - "Community 68"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 69 - "Community 69"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 70 - "Community 70"
Cohesion: 0.33
Nodes (4): CAMERA, IMAGES, @playwright/test@^1.49.1, @playwright/test

### Community 71 - "Community 71"
Cohesion: 0.33
Nodes (6): scripts, build, clean, dev, test, typecheck

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 74 - "Community 74"
Cohesion: 0.40
Nodes (5): dependencies, @ch/design@*, react@^18.3.1, react-dom@^18.3.1, react

## Knowledge Gaps
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `typescript` connect `Community 11` to `Community 64`, `Community 4`, `Community 7`, `Community 9`, `Community 15`, `Community 16`, `Community 18`, `Community 26`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.057859703020993344 - nodes in this community are weakly interconnected._
- **Why does `@types/node` connect `Community 11` to `Community 64`, `Community 4`, `Community 9`, `Community 15`, `Community 16`, `Community 18`, `Community 26`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05612244897959184 - nodes in this community are weakly interconnected._
- **Why does `Repos` connect `Community 27` to `Community 36`, `Community 8`, `Community 73`, `Community 10`, `Community 12`, `Community 13`, `Community 21`, `Community 22`, `Community 23`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.10804597701149425 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1425287356321839 - nodes in this community are weakly interconnected._