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
npm run build       # TypeScript checks and production build
npm test            # Unit tests: meter acceptance rules, live guidance, number picking, checklist, geometry
npm run preview
npm run eval:meter  # Meter photo check against labeled photos in eval/meter (add -- --subject to include the classifier)
npm run dev:https   # HTTPS dev server (self-signed) so a phone on the same Wi-Fi can use its camera
```

The install script copies the pinned OpenCV.js package into `public/vendor/opencv.js`, and the on-device models for the meter step (ONNX Runtime WebAssembly and PaddleOCR) into `public/vendor/ort` and `public/vendor/paddle`. It is loaded from the same origin only when the optional estimate is requested. Keep `package-lock.json`; use `npm ci` for repeatable installation. The OpenCV runtime is relatively large and is deliberately excluded from the initial JavaScript bundle.

A phone camera requires a secure context (HTTPS, or localhost on the phone itself). A plain LAN `http://` address may not expose camera APIs; uploads and labeled samples still work. Use `npm run dev:https`, open the `https://<your-laptop-ip>:5173` address on the phone, and accept the self-signed certificate warning. The app requests the rear-facing camera with an `ideal` constraint and uses whichever camera the browser makes available.

## Demo flow

1. Tap **Start**. This is the first point at which camera access is requested.
2. **Meter number:** fit the meter inside the circle and follow the on-screen instruction. The app takes the photo automatically once it can read the meter number, then accepts or rejects it with a reason (see [Meter photo check](#meter-photo-check)). Upload and **Try sample photo** go through the same check.
3. **Meter wall photos (whole wall, then right of the meter, then left):** one after another with a progress strip. For each, follow the live instruction (phone sideways, step back, hold steady) and take the photo. The app finds the meter, asks "Is this your electric meter?" (or asks you to tap it), then accepts or rejects the photo (see [Whole meter wall check](#whole-meter-wall-check)).
4. Other photos: capture one still photo at a time, choose a local image, or select **Use sample photo**. No video is recorded. Confirm readability manually; retake any uncertain image.
5. Answer the fence question. “Yes” adds the behind-fence photo; “no” removes it; “not sure” leaves the final summary incomplete until resolved. Select the breaker location, including “not sure” if needed.
6. The rating step includes a safe skip option. Skipping never creates a completed photo.
7. Review thumbnails, mark images readable or flag a retake, and add optional solar/obstruction notes.
8. Finish to view **Ready for Base team review.** or **A few more photos would help.** These are local demo summaries, not a submission to Base. Samples remain conspicuously labeled and cannot represent the homeowner's actual property.

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

- React state and memory-only blob URLs hold images and answers. No login, database, cookies, localStorage, IndexedDB, service worker, analytics, Base API, image upload endpoint, or recording API is used. The meter step's classifier weights are downloaded once from Hugging Face and kept in the browser's Cache Storage; photos never leave the device.
- “Upload photo” means read a file from this device into the browser, not upload it to a server. Leaving/reloading the page loses the session. Sample images and the OpenCV script are ordinary static assets.
- Camera tracks stop when leaving the capture flow, choosing a file/sample, hiding the page, or unmounting. A delayed permission result is invalidated and immediately stopped if the user has already left.
- Replaced/abandoned blob URLs are revoked; photo ownership transfers from draft to session on confirmation.
- A local canvas checks unusually low average brightness and small image dimensions. These are heuristic suggestions, not image understanding. The customer can explicitly confirm that the details remain readable.
- **Meter step:** the photo is checked automatically on the device and must be *accepted* (or sent anyway after repeated rejections, which is recorded). See below.
- **Other steps:** blur, glare, obstruction, amperage, and site conditions are **not** automatically verified. Manual confirmation is required. “Complete” means a photo exists and the customer checked it.
- Readable JPG, PNG, and WebP files are supported up to 25 MB. HEIC/HEIF depends on browser decoding support; unsupported images show a clear error.
- In browsers supporting WebMCP, `get_photo_checklist` exposes read-only checklist statuses and sample indicators, never image data or notes.

## Meter photo check

Base's guide asks for a close-up where "the meter number … is legible", in daylight, sharp and unobstructed. The meter step turns that into measurable rules and does two things:

1. **Guides the customer live.** About 8 times a second it measures the camera preview inside the guide circle (brightness, blur, shake). Focus is judged **relative to the sharpest frame in the last 4 seconds** (≥ 60 % of it, with a very low absolute floor), so the same rule works for a phone camera and a soft laptop webcam. Shake or refocusing shows up as a drop. As fast as the models allow (about once a second) it also reads the text in the circle and asks the classifier what the subject is. It shows **one** instruction at a time, most important first, and the circle changes colour (white: searching, amber: adjust, green: ready). When the number has been read identically on two consecutive frames and the preview is steady, it takes the photo automatically. The shutter button is always available too.
2. **Accepts or rejects the photo** with the reason and how to fix it. Every check is listed. After two rejections the customer may send the photo anyway ("Base's team will review it"), which is recorded on the photo.

### Acceptance rules (`src/lib/meter/criteria.ts`)

| Check | Rule | Rejection message (abridged) |
| --- | --- | --- |
| Electric meter in view | Classifier probability for "electric meter" ≥ 0.5 | "That looks like a gas meter / breaker panel…", or "We can't see an electric meter" |
| Enough light | Mean brightness in the circle ≥ 45/255 | "It's too dark. Try again in daylight…" |
| In focus | Sharpness (Laplacian variance, ≤960 px) ≥ 40, **only enforced when the number can't be read**: a confident read is the proof of legibility | "The photo is blurry. Hold steady…" |
| No glare | Blown-out pixels ≤ 2.5 %, **only enforced when the number can't be read** (white nameplates often clip) | "Glare is covering part of the meter…" |
| Meter number readable | A 6–14 digit line on a light nameplate, OCR confidence ≥ 0.9, characters ≥ 16 px tall in the saved photo, and the same number the live preview read | "We couldn't find the meter number. Move closer…" / "…couldn't read every digit…" / "Move a little closer…" |
| Whole number in frame | Number box not touching the edge | "Part of the meter number is outside the photo…" |
| Nothing covering the number | No dark mass beside the number, and the number isn't a shorter part of a longer digit run elsewhere on the label (e.g. the barcode caption) | "Something may be covering the meter number…" |

"Accepted" means the photo meets the photo guide. It is not an eligibility decision.

### How it works

- **Text reading:** PaddleOCR PP-OCRv4 (text detection + recognition, ~16 MB ONNX, from the `@gutenye/ocr-models` npm package, self-hosted). `src/lib/meter/number.ts` picks the meter number from the text lines. It ignores spec lines ("FORM 2S CL200 240V") and barcode captions, which contain letters, and LCD kWh readings, which sit on a darker display.
- **Subject check:** CLIP ViT-B/32 zero-shot (`Xenova/clip-vit-base-patch32` via Transformers.js, 8-bit, ~150 MB, downloaded from Hugging Face on first use and then cached by the browser). The image is compared with text prompts for electric meter, gas meter, water meter, breaker panel and "other" (house wall, room, AC unit…). Prompts are in `criteria.ts`.
- Both models run in one Web Worker (`src/lib/meter/analyzer.worker.ts`) on ONNX Runtime WebAssembly, so the preview stays smooth. Decisions are pure functions (`acceptance.ts`, `guidance.ts`, `number.ts`) with unit tests.

### Testing without a real meter

- `?debug=1` shows live measurements, classifier probabilities and OCR lines under the camera.
- `?subject=electric_meter` (or `gas_meter`, `breaker_panel`, `other`, `off`) fakes the classifier, e.g. offline or before the model has downloaded.
- Point a laptop webcam at a meter photo on another screen, or use **Upload photo** with the images in `eval/meter`.
- `npm run eval:meter` scores the check on `eval/meter`. It currently gets 19/19 with 0 false accepts, but those images are all derived from **one** Oncor sample, so treat it as a regression test, not evidence of real-world accuracy. Add real photos (other utilities, analog dials, shade, angles, gas meters) to `eval/meter/manifest.json`.

### Known limits

- The classifier and all thresholds have **not been validated on real photos yet**. CLIP's zero-shot gas-vs-electric distinction is the least certain part. Use `?debug=1` and `npm run eval:meter -- --subject` to tune `criteria.ts`.
- First visit downloads ~170 MB of models (use Wi-Fi). If the classifier can't load, photos are rejected with a message saying so, rather than accepted unchecked.
- Browsers give little control over focus. "Tap to focus" isn't available, so the blur guidance asks the customer to hold steady or step back.
- Uploaded photos skip live guidance and get the final check on the whole image.

## Whole meter wall check

Base's guide: "From as far back as possible (at least 10 steps), take a photo of the wall surrounding your meter." Base uses it to plan where the 3 ft × 3 ft battery can go (within 20 ft of the meter, against the wall, on the ground, clear of windows, meters and gas meters).

**Live guidance** (`src/lib/wall/assess.ts` → `guideWall`): one instruction at a time. It asks the customer to turn the phone sideways, get more light, step back if the scene looks like a close-up of the meter, move outside if it looks like a room, and hold steady. The frame turns green when it's ready. The customer presses the shutter; nothing is auto-captured, because the app can't yet see where the meter is while framing.

**After capture** (`src/lib/wall/locate.ts`):

1. **Find the meter.** OpenCV's Hough circle transform finds round shapes (meter glass covers) at two box-filtered sizes. CLIP scores a crop around each: electric meter, or something else (AC unit, window, light, hose reel…).
2. **Confirm with the customer.** The best candidate is circled: "Is this your electric meter?" If it's wrong, or nothing was found, they **tap the meter in the photo**. A tap snaps to a nearby circle when there is one, so the meter's size is still measured. Keyboard users can move a marker with the arrow keys and press Enter. "My meter isn't in this photo" is also an answer.
3. **Accept or reject** (`decideWall`) with the reason and how to fix it:

| Check | Rule (`src/lib/wall/criteria.ts`) | Rejection message (abridged) |
| --- | --- | --- |
| Outside wall of your home | CLIP scene "house wall" ≥ 0.5 (skipped if the classifier isn't available) | "This photo needs to be taken outside…" |
| Meter in the photo | Customer confirmed or tapped the meter | "We need your electric meter in this photo…" |
| Taken from far enough back | A stand-in for coverage. Passes if the meter cover, used as a ruler, shows ≥ 3 ft of wall each side and the ground. Otherwise it needs cover diameter ≤ 12 % of photo height and a scene that isn't a meter close-up | "You're too close… step back until the wall on both sides and the ground are in the photo" |
| Wall visible on both sides | Meter centre ≥ 20 % from each side edge; if the size is known, ≥ 3 ft of wall each side | "Include more of the wall to the left/right…" |
| Ground visible below the meter | If the size is known, ≥ 2.5 ft of photo below the meter centre; otherwise meter in the top 70 % | "Include the ground below the meter…" |
| Phone held sideways | Landscape photo | "Turn your phone sideways…" |
| Enough light / In focus | Brightness ≥ 45/255; sharpness ≥ 15 (lenient: wide shots have no small text) | "It's too dark…" / "The photo is blurry…" |

**Looking for battery space (the wall survey).** Base's list asks for a whole-wall photo, then right-of-meter and left-of-meter photos. What reviewers need is a set of conditions: the meter, a clear 3 ft stretch of wall within 20 ft of it, and the ground in front of that stretch (which the angled side photos show). So the app runs the side photos like a technician would (`src/lib/wall/survey.ts`):

- After the whole-wall photo, an on-device object detector finds electrical boxes, cabinets, AC units, doors and windows, and a colour check finds tall plants at meter height. Using the meter cover as a ruler, the app measures the clear wall between them (`src/lib/wall/space.ts`). The result card says what it saw: "Good news: about 4+ ft of open wall to the left of your meter", or "There's an electrical box on the left and a large cabinet on the right of your meter. Next, we'll look along the wall for open space."
- **Open wall found:** one side photo, facing along the wall toward it ("We spotted open wall to the left… so we can see the ground in front of it"). The other side is marked **Not needed**.
- **Crowded:** the side with more clear wall comes first, with a specific instruction ("face along the wall to the left and step back so we can see past the electrical box"). If that side has no open wall either, the other side comes next. If neither does, the adjacent-wall step says "Your meter wall looks crowded. The wall around the nearest corner may have room."
- Side photos are accepted when they show the area beside the meter: the meter on the near half of the frame and, by the ruler, at least 3 ft of wall beyond it. When a side photo can't see past what's in the way, the card adds a gentle tip ("step back or use the 0.5× lens"), but the photo is still accepted.
- It never asks for more photos than Base's list, and often fewer. Reviewers get a one-line summary on the Review page, e.g. "Possible battery spot: about 4+ ft of clear wall left of the meter (whole-wall photo)."

**Is the ground in the photo?** Base needs to see where the battery would stand, and meters sit anywhere from about 3 to 6 ft up, so the meter's position in the frame can't tell. `src/lib/wall/ground.ts` compares the bottom 10 % of the photo with the bare wall beside the meter. Grass, dirt, mulch and gravel look different from the wall; a photo that ends partway down the wall doesn't. A photo with more than 6.5 ft below the meter (by the ruler) always counts, since meters are at most 6 ft up. On the labelled photos (7 real, 3 Base samples) this is 10/10, including the three 205 E Riverside photos that stop above the ground. That's a small set, so treat the thresholds as a first cut.

**Telling the customer what we're looking for.** Before each wall photo, a short card lists what the photo needs to show: the meter, the wall on both sides or along one side, the ground in front of the wall, and 3 ft of open wall with nothing mounted on it. It also gives the tips: step back, phone sideways, 0.5× lens. The result card shows the same list, each item found or not found with a short reason, followed by a highlighted box:
- **How to fix it** when the photo isn't accepted;
- **Can you show more of the wall?** when the photo is accepted but open wall hasn't been found yet. Here "Retake to show more wall" is the main button and "Use this photo" is secondary.
The photo is marked up too: open wall in green, what's in the way in orange, and a dashed "Ground not in the photo" line when needed. The full list of technical checks sits behind "All photo checks".

**On a phone.** While photos are being taken, the site header, journey bar, footer and checklist sidebar are hidden, so the camera sits near the top of the screen. Held sideways, as the wall photos ask, the camera fills the screen height and the instructions and result sit in a column beside it. The result card is kept short, for someone holding a phone with their hands full:
- a verdict ("Retake needed" / "Photo accepted" / "Accepted — can you show more wall?");
- one line to act on ("Tilt down or step back to show the ground.");
- chips for Meter · Wall · Ground · Open wall;
- two buttons.
The explanations are behind "Details", and the card scrolls itself into view.

**One instruction per rejection.** When several checks fail, the customer sees only the most important fix. "Step back" also covers "include more wall" and "include the ground", so they aren't listed as separate, conflicting instructions.

**Object detector.** YOLOE-11M (Ultralytics) with its text prompts baked in, pruned to the detection output and int8-quantized: `public/models/wall-objects.onnx`, about 21 MB, self-hosted, run in the analyzer worker on ONNX Runtime WebAssembly (about 0.5 s on a laptop). It is rebuilt with `scripts/export-wall-detector.py`, which downloads weights from GitHub releases, not Hugging Face. Labels are grouped because the model confuses them (a grey cabinet can score as "gas meter"). **It never claims a gas meter.** The detector also helps pick the meter: circles inside a detected meter rank first, and if the "cover" is implausibly small for the meter's enclosure (a round digit in the house number), the ruler is re-sized from the enclosure. `?objects=off` turns the detector off. Without it, the flow falls back to Base's fixed order.

**License note:** Ultralytics YOLOE is AGPL-3.0. That's fine for a hackathon demo. A production version needs an Ultralytics enterprise licence or a differently licensed detector.

**Tight spaces.** Many homeowners can't step back 10 steps (side yards, fences, narrow paths). The app handles this three ways:

- **Coverage, not steps.** What Base needs is the wall around the meter and the ground, so a photo that measurably shows them passes however close it was taken.
- **Wide lens.** Where the browser exposes a 0.5× lens, a **0.5×** button appears in the live view. It uses zoom below 1× where the camera supports it (some Android phones), or a back camera labelled ultra-wide (iPhone Safari). It's hidden when neither is available (`src/lib/lens.ts`).
- **"I can't step back any further."** Shown when the only failures are distance or side coverage. The photo is accepted, with the note "Limited space — customer couldn't step back further" for Base's reviewers, and Review shows "Accepted · limited space noted". The meter, ground, light and focus checks still apply.

**Distance estimates** use the meter's glass cover (about 7 in across on US socket meters) as a ruler. For example: "About 6 ft of wall shows left of the meter and 7 ft to the right." That's roughly ±30 %, so it's shown as an estimate and saved with the photo for Base's reviewers, and only a very short side (< 3 ft) is rejected.

**Testing:** `npm run eval:wall` runs the meter search, detector, clear-space check and decision in Node on `eval/wall/real`: 10 real photos from 203 and 205 E Riverside, Austin, including close-ups and an irrigation controller. `npm run eval:wall -- eval/wall` does the same on Base's guide samples. `?scene=house_wall|meter_closeup|indoors|other|off` fakes the scene classifier; `?debug=1` shows candidates, scores and estimates. `src/lib/wall/circles.test.ts` checks the circle search against Base's guide photos in `eval/wall`.

**Known limits:**

- CLIP prompts and thresholds are untested on real photos (Hugging Face was unreachable from the build environment). With the classifier unavailable, the strongest circle is offered and the customer confirms or taps it.
- Meters without a round cover, very distant meters (cover under ~1 % of the photo height), or meters in deep shade may not be found automatically; the tap covers these.
- The app doesn't check that the photo is the *meter's* wall versus another wall; the confirmed meter is the evidence.

## The checklist

The checklist is grouped by what Base needs to know, not listed as eight fixed photos (`src/lib/checklist.ts`, `src/components/PhotoChecklist.tsx`):

- **Your meter:** the meter number close-up, showing the number read ("Meter 149 214 094").
- **Space for the battery:**
  - the whole wall;
  - the two photos along the wall, in the order the survey takes them;
  - around the corner;
  - behind the fence.
  
  Each row says what it found ("Open wall, about 4+ ft left", "No open wall here"). Photos the survey no longer needs are struck through as "Not needed". The fence row only counts once the customer says there is a fence.
- **Your electrical panel:** the breaker box (and where it is) and the main breaker rating ("Reads 200 A").

Progress counts only the photos still expected, so "2 of 5" really means three to go. On a phone the sidebar becomes a thin Meter · Space · Panel bar above the camera; tapping a section jumps to its next photo.

## Breaker box, rating, around the corner, behind the fence

These steps use one shared screen (`src/components/CheckedCapture.tsx`): a single live instruction (light, steadiness, focus), a shutter, an on-device check, and the same brief result card as the wall. The decisions live in `src/lib/panel/steps.ts`, the pipeline in `src/lib/panel/analyze.ts`.

- **Breaker box:** the photo-recognition model checks that it's a breaker panel. If it's the meter instead, it says "That's your meter — now show the breaker box." If recognition isn't available, the photo is accepted and marked unchecked. A second question to the same model asks whether the photo shows the whole box or only part of it. If only part, the photo is still accepted, but "Retake" becomes the main button with "Step back so the whole box — top to bottom — and a bit of the wall around it fit." This framing prompt is untested on real photos: CLIP only runs in the browser. "Where is it?" is asked on the result card; pressing "Use this photo" before answering highlights the question instead of doing nothing.
- **Main breaker rating:** the same text reader as the meter number reads the number stamped on the handle (`src/lib/panel/amps.ts`). It only accepts real breaker sizes (60–400 A) read with high confidence, and retries with the photo turned both ways because some handles are stamped sideways. The result shows "Reads 200 A" and the amps are saved with the photo. `npm run eval:panel` checks the reader on close-ups cut from Base's guide photo, one of them sideways; photos taken from too far away are correctly not read (5/5).
- **Around the corner:** the object detector and ground check from the wall step, without a meter. The result lists what's on the wall ("On this wall: a door or window").
- **Behind the fence:** checks the photo is outside, shows the ground, and is clear.

## Review and finishing

**Review** (`src/components/Review.tsx`) is grouped like the checklist: Your meter, Space for the battery, Your electrical panel. Each photo shows what was found ("Open wall, about 4+ ft left", "Reads 200 A") and has a Retake or Take photo button. Photos the survey skipped are single "not needed" lines.

Below the photos is one short card:
- solar panels, since homes with solar need a 200 A panel;
- the fence and breaker location answers, pre-filled from the photo steps;
- optional notes.

The earlier obstacle checkboxes and the manual measuring tool are gone: the detector covers the first, and the second duplicated the automatic measurement.

**Finish** leads to "What happens next": Base's team reviews the photos, checks the panel, then contacts the homeowner. Below that is **What we'll send to Base**: meter number, space, main breaker amps, breaker location, solar and fence, with anything missing in red, plus the notes for reviewers:
- the space summary;
- photos sent without passing a check;
- samples;
- the customer's note.

It's all built by one pure function (`src/lib/report.ts`). **Download summary** saves `base-photo-check.json` with the findings and every photo (JPEG, ≤1600 px). That's what a technician view would read. It's a demo, so nothing is sent.

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

Icons: Lucide (ISC). PaddleOCR models via `@gutenye/ocr-models` / `@gutenye/ocr-common` (MIT; PaddleOCR models Apache-2.0). CLIP via Transformers.js (Apache-2.0); OpenAI CLIP weights (MIT). ONNX Runtime (MIT). OpenCV.js: OpenCV Apache-2.0 distribution via `@techstark/opencv-js`; see package license files. The Base wordmark and red/neutral visual treatment are a demo interpretation, not an official supplied brand kit.

## Source structure

- `src/components/Welcome.tsx`: introduction and explicit start action.
- `src/components/GuidedCapture.tsx`: camera, upload, samples, drafts, confirmation, safety, and conditional fence prompt.
- `src/components/MeterCapture.tsx`: the meter step — live guidance overlay, auto-capture, accept/reject result.
- `src/components/WallCapture.tsx`: the three meter-wall steps (whole wall, right, left) — live guidance, meter confirm/tap, accept/reject result.
- `src/lib/wall/`: `criteria.ts` (rules, prompts, copy), `assess.ts` (live instruction and decision), `circles.ts` (OpenCV meter-cover search), `objects.ts` (object detector input/output), `ground.ts` (is the ground in the photo), `space.ts` (clear wall beside the meter), `survey.ts` (which side photo next, what's not needed), `locate.ts` (photo pipeline).
- `scripts/eval-wall.ts`: runs the wall pipeline in Node on real photos; `scripts/export-wall-detector.py` rebuilds the detector model.
- `src/lib/meter/`: meter photo check — `criteria.ts` (rules and copy), `guidance.ts` (live instruction), `acceptance.ts` (accept/reject), `number.ts` (pick the meter number from OCR lines), `image.ts` / `metrics.ts` (image measurements), `frames.ts` (camera/photo plumbing), `analyzer.ts` + `analyzer.worker.ts` + `clip.ts` (on-device models).
- `scripts/eval-meter.ts`: runs the meter check in Node against labeled photos.
- `src/components/PhotoChecklist.tsx` + `src/lib/checklist.ts`: the grouped, dynamic checklist and the phone section bar.
- `src/components/CheckedCapture.tsx` + `src/lib/panel/`: breaker box, rating, around-the-corner and fence checks; `scripts/eval-panel.ts` checks the amp reader.
- `src/components/OptionalEstimate.tsx`: separate gated manual point-selection workflow.
- `src/components/Review.tsx` + `src/lib/report.ts`: grouped review, the two follow-up questions, and the finish screen / downloadable summary for Base.
- `src/lib/useCamera.ts` + `src/lib/lens.ts`: camera lifecycle, cancellation and the 0.5× lens toggle.
- `src/lib/photos.ts`: checklist, completion, and local quality heuristics.
- `src/lib/estimate.ts`: conservative geometry validation, runtime loading, and OpenCV memory cleanup.

## Validation and limits

`npm run build` checks all TypeScript and bundles the app. `npm test` checks conditional checklist completion, missing/retake evidence, observation requirements, rejection of invalid geometry, and synthetic known distances through the actual OpenCV runtime. Synthetic test dimensions are mathematical fixtures, not dimensions assigned to a real meter. Browser walkthroughs cover samples, review/retake, safe skip, measurement gating, local file selection, and narrow-screen layout. Physical rear-camera hardware and individual mobile browsers require real-device testing.

## Hand-held steadiness

Tuned after a test on iPhones at a real meter, where "Hold steady" never cleared. Measured on a real meter close-up:

| Hand movement between frames | Old measure (limit 6) | New measure (limit 14) |
| --- | --- | --- |
| 1 px | 6.4 | 3.6 |
| 2 px | 13.0 | 8.6 |
| 3 px | 18.2 | 13.7 |
| 5 px | 24.1 | 20.1 |

- **Motion** is measured on 4× shrunk frames (`metrics.motion`), and the limit is 14 on every step. Tremor of up to about 3 px per frame (⅛ s) passes: that's under half a pixel of blur in a 1/60 s exposure. Walking or swinging the phone still fails.
- **Steadiness window:** 4 good frames out of the last 6 (about ¾ s) instead of 6 in a row, so one shaky or refocusing frame doesn't restart the count.
- **Focus:** each frame must be at least 50 % as sharp as the recent best (was 60 %).
- **"Hold steady" only means movement.** While the number is being read, the banner says "Reading the meter number…".
- **Auto-capture doesn't wait for meter recognition** (about 150 MB, which can be slow or fail on an iPhone). The saved photo waits at most 8 s for it. If recognition still isn't available, a photo with a readable meter number is accepted and marked "not checked" for reviewers; before, it was rejected.
- **After 5 s,** "Or tap the button to take the photo yourself." appears above the shutter.
