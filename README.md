# Base Power · Home Photo Check

A mobile-first React + TypeScript + Vite + Tailwind CSS demo that helps homeowners collect clear site photos for Base's team. It does **not** determine eligibility, approve an installation, or certify electrical/code clearances.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the Local URL Vite prints (normally `http://localhost:5173`).

```sh
npm run build   # TypeScript checks and production build
npm test        # Evidence-completeness rules and real OpenCV geometry checks
npm run preview
```

The install script copies the pinned OpenCV.js package into `public/vendor/opencv.js`. It is loaded from the same origin only when the optional estimate is requested. Keep `package-lock.json`; use `npm ci` for repeatable installation. The OpenCV runtime is relatively large and is deliberately excluded from the initial JavaScript bundle.

A phone camera requires a secure context (HTTPS, or localhost on the phone itself). A plain LAN `http://` address may not expose camera APIs; uploads and labeled samples still work. The app requests the rear-facing camera with an `ideal` constraint and uses whichever camera the browser makes available.

## Demo flow

1. Tap **Start**. This is the first point at which camera access is requested.
2. Capture one still photo at a time, choose a local image, or select **Use sample photo**. No video is recorded. Confirm readability manually; retake any uncertain image.
3. Answer the fence question. “Yes” adds the behind-fence photo; “no” removes it; “not sure” leaves the final summary incomplete until resolved. Select the breaker location, including “not sure” if needed.
4. The rating step includes a safe skip option. Skipping never creates a completed photo.
5. Review thumbnails, mark images readable or flag a retake, and add optional solar/obstruction notes.
6. Finish to view **Ready for Base team review.** or **A few more photos would help.** These are local demo summaries, not a submission to Base. Samples remain conspicuously labeled and cannot represent the homeowner's actual property.

The welcome-screen 5–10-minute duration is an illustrative estimate for the demo, not a Base-published service promise.

## Base-published source checklist

Sources reviewed September 25, 2026:

- [Why does Base request home photos? What does photo review entail?](https://help.basepowercompany.com/en/articles/10280641) (source reports updated July 29, 2026).
- [What are the electrical and spacing requirements for Base equipment?](https://help.basepowercompany.com/en/articles/10280705) (source reports updated August 17, 2026).

| Base photo-guide item | Implementation |
| --- | --- |
| Close-up with meter number readable in the red box | Meter number, manual readable/retake confirmation |
| Meter wall, at least 10 steps back | Whole meter wall, wide framing overlay |
| Area right of meter, from farther back | Right side, wide-view instruction |
| Area left of meter, from farther back | Left side, wide-view instruction |
| Adjacent wall, corner to corner | Adjacent wall |
| Area behind a fence, when applicable | Conditional behind-fence step |
| Main breaker box | Whole-box photo; outside/garage/closet/not-sure observation |
| Main disconnect amperage | Close-up with safe skip; no automatic amperage recognition |
| Breaker surroundings, if not captured | Included in the whole breaker box instruction and framing tip, rather than a separate mandatory image |

The guide recommends daylight, sharp details, and unobstructed views. Its left-side paragraph repeats “right”; this demo follows the **left-side heading**, as requested in the brief. The red number box is a guide overlay, not a claim that every physical meter has a red box printed on it.

The electrical/spacing article is background for Base's review, **not an eligibility engine**. Its placement, amperage, solar, panel, and spacing criteria are not encoded as pass/fail rules. Customer answers are unverified observations. Base's team confirms site fit and requirements. No assumption is made that every meter has the same dimensions.

## Photo handling and checks

- React state and memory-only blob URLs hold images and answers. No login, database, cookies, localStorage, IndexedDB, service worker, analytics, Base API, image upload endpoint, or recording API is used.
- “Upload photo” means read a file from this device into the browser, not upload it to a server. Leaving/reloading the page loses the session. Sample images and the OpenCV script are ordinary static assets.
- Camera tracks stop when leaving the capture flow, choosing a file/sample, hiding the page, or unmounting. A delayed permission result is invalidated and immediately stopped if the user has already left.
- Replaced/abandoned blob URLs are revoked; photo ownership transfers from draft to session on confirmation.
- A local canvas checks unusually low average brightness and small image dimensions. These are heuristic suggestions, not image understanding. The customer can explicitly confirm that the details remain readable.
- Blur, glare, obstruction, meter identity, OCR, amperage, and site conditions are **not** automatically verified. Manual confirmation is required. “Complete” means a photo exists and the customer checked it.
- Readable JPG, PNG, and WebP files are supported up to 25 MB. HEIC/HEIF depends on browser decoding support; unsupported images show a clear error.
- In browsers supporting WebMCP, `get_photo_checklist` exposes read-only checklist statuses and sample indicators, never image data or notes.

## Optional measurements: demo-only and unverified

This is separate from required photos and never affects completion or eligibility.

1. Enter an optional meter model, plus **verified width and height of the exact rectangular reference face**. A model alone does not provide scale. No model database or assumed standard dimensions are used.
2. Confirm a clear, straight-on photo and that the reference face and target points occupy the **same flat wall plane**. A raised meter face and the wall behind it are different planes: that does not qualify. Round-meter bounding boxes do not establish a rectangular physical reference.
3. Manually identify top-left, top-right, bottom-right, bottom-left corners and two distance endpoints. Click/tap the image or use keyboard-accessible pixel coordinate fields.
4. OpenCV.js computes a planar homography with `getPerspectiveTransform`, transforms the endpoints with `perspectiveTransform`, and reports an **Approximate photo estimate**. It does not infer depth or identify corners automatically.
5. Conservative *demo heuristics*, not metrology guarantees: convex ordered corners, reference edges >=100 original pixels, roughly right angles (80–100 degrees), opposite-side and dimension-ratio disagreement <=10%, target separation >=25 pixels, bounded extrapolation, finite transforms, and a ±2 pixel sensitivity check (suppress if variation exceeds 10%).
6. Unknown dimensions, unclear/angled references, unmet plane confirmations, or unstable geometry return **Can't estimate reliably—Base team review needed.** Entering inaccurate dimensions or falsely confirming the plane can still produce inaccurate output; these observations are not verified facts.
7. Every result is labeled approximate; manual correction and skip controls are available. Corrections are explicitly marked. Source/input changes invalidate the result. No confidence score, exact clearance, depth measurement, or compliance claim is invented.

Implementation references: [OpenCV homography](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html), [OpenCV.js geometric transformations](https://docs.opencv.org/4.13.0/dd/d52/tutorial_js_geometric_transformations.html), [OpenCV.js runtime/memory management](https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html).

## Assets and attribution

Photos in `public/images` are examples from [Base's published photo guide](https://help.basepowercompany.com/en/articles/10280641), accessed through its public FrontKB CDN. They are not user submissions or generated evidence. No general reuse license was stated in the source. This Base-specific demo retains attribution; obtain appropriate rights before unrelated public reuse.

CDN prefix: `https://usw2.frontkb-cdn.com/attachments/11263396/997313/`

| Local asset | Source filename |
| --- | --- |
| home-battery.jpg | 37c040d4-6670-40e9-83fa-1f2e99533ade.jpeg |
| meter.png | 330af251-b8d7-46ff-a110-0fdfe154d5a3.png |
| wall.png | 079c0b66-e449-47cb-a722-2a07496d55f7.png |
| right.png | ba371f6a-1cd0-484a-a412-2af9c25ca58f.png |
| left.png | d885432c-80dc-4fb5-a0cd-3a3c898baa8d.png |
| adjacent.png | b593c959-5340-4971-af56-e017beec54ee.png |
| fence.png | 82f9b090-57bf-4d6f-82c5-c9803f847d69.png |
| breaker.png | b635570d-c7c8-40ca-a0fe-6b54ae9c5348.png |
| rating.png | c2d36703-4635-462d-909b-b4c583ede320.png |

Icons: Lucide (ISC). OpenCV.js: OpenCV Apache-2.0 distribution via `@techstark/opencv-js`; see package license files. The Base wordmark and red/neutral visual treatment are a demo interpretation, not an official supplied brand kit.

## Source structure

- `src/components/Welcome.tsx`: introduction and explicit start action.
- `src/components/GuidedCapture.tsx`: camera, upload, samples, drafts, confirmation, safety, and conditional fence prompt.
- `src/components/PhotoChecklist.tsx`: capture progress and navigation.
- `src/components/OptionalEstimate.tsx`: separate gated manual point-selection workflow.
- `src/components/Review.tsx`: evidence review, observations, and result states.
- `src/lib/useCamera.ts`: camera lifecycle and cancellation.
- `src/lib/photos.ts`: checklist, completion, and local quality heuristics.
- `src/lib/estimate.ts`: conservative geometry validation, runtime loading, and OpenCV memory cleanup.

## Validation and limits

`npm run build` checks all TypeScript and bundles the app. `npm test` checks conditional checklist completion, missing/retake evidence, observation requirements, rejection of invalid geometry, and synthetic known distances through the actual OpenCV runtime. Synthetic test dimensions are mathematical fixtures, not dimensions assigned to a real meter. Browser walkthroughs cover samples, review/retake, safe skip, measurement gating, local file selection, and narrow-screen layout. Physical rear-camera hardware and individual mobile browsers require real-device testing.

---

## Base Operations console

The member app at `/` remains unchanged. Base Operations adds client-case review, demo controls, and a single Hono API:

- `/ops/:userId` — Client cases and case detail
- `/admin` — Local demo controls for failure and conflict scenarios
- `/admin/knowledge` — Rules library and jurisdiction-pack details
- API: `/api/ops/*`, `/api/admin/*` — one Hono catch‑all with a shared in‑memory demo store

The visible product language is intentionally Base-oriented:

- **Base Admin** — the single internal operations console used for this demo.
- **Client cases** — the work queue; each case combines site evidence, permit research, and a workflow plan.
- **Demo controls** — local-only scenario tools, not production account administration.
- **Rules library** — the jurisdiction packs and rules used to explain workflow decisions.

Run locally:

```sh
npm install
npm run dev
# Web: http://localhost:5173
# API: proxied at /api/* (origin http://localhost:8787)
```

Build and tests:

```sh
npm test
npm run build
```

Demo identity:

- `base_admin` — one shared seeded queue; older `/ops/ops_maya` links remain compatible.

### Case statuses

The API keeps stable status codes while the UI uses clearer operator language:

| Code | UI label | Meaning |
| --- | --- | --- |
| `QUEUED` | Waiting to run | The case has not started processing. |
| `OPS_READY` | Ready for review | The workflow completed and is ready for the next operator step. |
| `NEEDS_REVIEW` | Review required | Evidence or rules conflict and a human decision is needed. |
| `BLOCKED` | Blocked | A worker failed in a way that prevents the workflow from continuing. |
| `UNKNOWN` | Setup needed | No verified jurisdiction/rules pack could be matched; the system fails closed. |

`degraded: true` is a separate fallback flag. The UI presents it as **Fallback used** even when the underlying case status is `OPS_READY`.

Transient workflow states include `PLANNED`, `RUNNING`, and `RECONCILING`. Worker states are `PENDING`, `RUNNING`, `DONE`, and `FAILED`.

### Workflow graph

The case detail graph is organized into waves:

- **Wave 0:** Resolve pack
- **Wave 1:** City review, Electrical, Fire safety, and Utility rules run in parallel
- **Wave 2:** Reconcile combines the worker results

Red connectors show the critical path through Resolve pack, Fire safety, Utility rules, and Reconcile. Gray connectors show supporting dependencies. Red does not mean failure; node icons and node outlines communicate state. Desktop nodes use state icons with tooltips, while mobile nodes show the state text. The accessible Plan list retains the full worker names and state labels.

### Demo controls

The `/admin` page is a local demo harness rather than a production administration area:

- **Reset and reseed** restores the in-memory case store and clears scenario toggles.
- **Simulate a fallback** makes future utility checks retry, fail, and use cached verified rules. The case then shows Fallback used/Degraded.
- **Simulate a rule conflict** accepts a short or full case ID, reruns that case immediately, and makes Fire evidence conflict with the verified rules. The case becomes Review required.

These controls affect only the local in-memory demo store. They do not call external utilities, change real permits, or persist across a process restart/cold start.

### Queue behavior

The Cases page uses manual refresh rather than polling. It shows the last successful update time and marks the list stale if refresh fails. Search and status filters are presentational; opening a case preserves the existing API and workflow behavior.

### Site evidence

Each seeded case includes seven mock customer-submitted photos: meter number, whole meter wall, left side, right side, breaker box, disconnect rating, and adjacent wall. Cases rotate through compact image sets so the site evidence varies without inflating the repository. The files under `public/images/cases` are resized JPEGs and total roughly 1–2 MB.

Demo script (happy path + failure + conflict + gap):

1. Case A — Austin happy: Open `/ops/base_admin`, choose a case marked Ready for review, and inspect its evidence, plan, and citations.
2. Case B — Utility fallback: In `/admin`, enable the utility failure scenario, then run a queued case → retries → fallback → Fallback used.
3. Case C — Rule conflict: In `/admin`, enter a short or full case ID and choose Run conflict → the case is immediately rerun → Review required.
4. Waco — Open a Waco case → Rules pack: `UNKNOWN_PACK` → Setup needed (knowledge gap).

Vercel caveats:

- Single serverless function `api/[[...route]].ts` handles all `/api/*`. Ops/Admin share one in‑memory Map (clears on redeploy/cold start).
- `vercel.json` rewrites `/ops/*` and `/admin/*` to the SPA entry.
- No claims of legal “approval” or “permitting”; statuses are limited to Ops‑ready / Needs review / Blocked / Unknown.
