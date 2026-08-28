---
name: build-underwriting-report
description: Builds a pre-purchase underwriting walkthrough report from CompanyCam for a property address — pulls the walkthrough photos/videos, writes the deficiencies into a red/yellow/optional-flagged scope of work grouped by room and unit, picks clean room context photos, and produces the JSON that the Pre-Purchase Report Builder at section8pm.com/pre-purchase-report.html turns into a printable PDF for a buyer. Use when the user asks to build/draft/generate a pre-purchase report, an underwriting report, or a walkthrough report for a buyer, or says "/build-underwriting-report <address>". This is a SEPARATE skill from build-sow — do not edit one when changing the other.
---

# Build Pre-Purchase Underwriting Report

## What this is for

A buyer is underwriting a property and paid for a walkthrough. The property manager walked it, shot photos and a narrated video in CompanyCam, and now needs a clean **buyer-facing PDF report**: cover page, legal disclosures, marketing-style room photos, a flagged scope of work with a cost estimate broken out by severity, a list of photo/video links, and property-management notes.

This skill produces the **JSON** that the Pre-Purchase Report Builder
(`pre-purchase-report.html`) ingests. The builder is where a human fills in
Labor/Material prices (never you) and prints the PDF. Like `build-sow`, the
first-pass deliverable is a **Claude artifact** the user reviews and edits;
the JSON export comes after they ask for it.

This is a different product from `build-sow`:
- Every line item carries a **flag** (red / yellow / optional), not a checkbox.
- The report has **context photos** — clean room shots, not deficiency callouts.
- It prints as a **multi-section PDF for a buyer**, not a contractor punch list.

## Gathering the source (same mechanics as build-sow)

Follow `build-sow` steps 1–3a for pulling and reading the source — they apply here unchanged:

1. **Find every project at the address.** `mcp__companycam__search_projects` on the street number/name, AND `mcp__companycam__list_projects` matched on the `address` field (search matches project *name*, not address). Multi-unit properties often have one project covering both units, or one per unit — pull from all matches.
2. **Photos in walkthrough order** — `list_project_photos`, sort by `captured_at` ascending.
3. **Scan uncaptioned photos too** — especially exterior/yard/basement clusters, where real scope routinely has no caption. Thumbnails first, `web` variant on anything with a real issue.
4. **Videos + transcripts** — `list_project_videos`, then `get_video` with `include='transcript'` for each. A narrated walkthrough is usually the richest source. Place each video in walkthrough order by `captured_at`. Segment the transcript by the rooms/units the narrator moves through. Fix obvious speech-to-text errors ("GSA outlet" → "GFCI outlet").
5. **Caption wins on conflict** with a photo; use the photo to fill in detail and catch captions that are clearly about something else.
6. **Dedupe** transcript-derived items against caption-derived ones — one clean line per real-world issue, not one per source.

### The basement is mandatory — open every basement photo at full resolution

The narrated video almost always stops before the basement, and basement photos are almost always uncaptioned. So the basement usually has **zero human-written signal** — no caption, no narration telling you where to look. That does not make it low-priority; it makes it *entirely your job to read the photos*. This is where the expensive surprises for a buyer hide, and it is exactly what got missed on a past report.

Rules:
- **View every basement photo at `web` resolution, not thumbnail.** Basements are dark; at thumbnail size, water on the floor, an open panel, and bare wire splices are all invisible. Do not skim the basement cluster — open each one.
- Basement photos are the darker, concrete-floor / concrete-block / joist-and-pipe shots, usually clustered near the end of the walkthrough. If the user tells you which photos are the basement, trust that.
- **Look specifically for, and write a line for each you find:**
  - **Water** — pooling or wet patches on the slab, efflorescence (white crust) on walls or floor, rust/tide lines on walls, a running or dry sump, active drips. Unexplained water on a basement floor is **red** — the buyer is underwriting the cost of finding and fixing it.
  - **Electrical safety** — a panel with its cover (deadfront) off, an open junction box, exposed/loose conductors or wire nuts, knob-and-tube, a Federal Pacific / Zinsco / Pushmatic panel, aluminum branch wiring. Exposed live electrical is **red**.
  - **Foundation** — horizontal or stair-step cracks, bowing or leaning walls, crumbling mortar joints, spalling block/brick. Structural movement is **red**.
  - **Piping** — heavy corrosion on the cast-iron waste stack, galvanized supply lines, lead bends, failed patches, active drips.
  - **Housekeeping / safety** — debris and trash, combustible storage stacked against a gas water heater or furnace, missing basement CO detector.
- **Never state a system's age or "end of life" from how it looks.** An old-*looking* boiler or water heater in a dark basement is not evidence of age. Read the manufacture date off the data plate / rating label / serial number if the photo shows it. If you cannot read it, write the line from **condition** ("the water heater's tank base is corroded", "the water heater sits on stacked concrete blocks instead of a stand") and add "install date not verified — recommend confirming it" — do **not** write "old" or "near end of life". If the user or PM tells you the equipment's age, use that and drop any age-based concern.

## Writing the scope of work (Section 4)

### Line items

Same rules as `build-sow` step 4:
- **Verb-first**: Replace, Repair, Install, Seal, Mortar, Cut back, Reconnect, Tighten, Clean, Paint…
- **Plain language** — use the words the caption used; no trade jargon it didn't use.
- **Don't invent "left"/"right"** — keep a side only if the source gave one.
- **Name the room/spot.**

### Group by room and unit, in walkthrough order

- Section headings are the room. For a **multifamily** property, put the unit in the heading: `Kitchen — Lower Unit`, `Bathroom — Upper Unit`. For a single-family, just the room.
- Use bedroom position labels the same way `build-sow` step 5b describes (Front/Middle/Rear, Upper/Lower, Right/Left from the front door) when the position is knowable.
- **Exterior** and **whole-building** items (shared hallway, roof, yard, basement mechanicals) go in their own sections — `Exterior`, `Basement`, `Building — Common Areas` — not attached to a unit.
- Keep the walkthrough order of first encounter; don't alphabetize.

### Flag every line — exactly one of three

Every line item gets exactly one flag. When unsure between red and yellow, default to yellow and note it in the summary for the user to bump.

- **`red`** — *important concern to recognize.* Something that materially affects the underwrite: active or likely water intrusion, structural movement, roof at/near failure, a *verified* major system at end of life (furnace, boiler, roof, siding, service panel — verified by a data plate, an inspection note, or the PM telling you, **not** by how it looks in a photo), exposed live electrical, a safety hazard (missing smoke/CO detectors, trip hazard a city inspector would cite), anything expensive or anything that could get worse fast.
- **`yellow`** — *minor repair.* Normal turn/make-ready work: a loose fixture, chipped paint, a missing knob, re-caulk, a sticky floor tile, a cover plate. Individually cheap, non-urgent.
- **`optional`** — *not a repair.* Something that could be done in the future but isn't a defect: repaint for aesthetics, cosmetic upgrades, "nice to have" items, anything the source framed as optional / "consider" / "could." Optional items still get an estimate (the builder totals them separately) — they're just not part of "what's wrong."

### `photoUrl`

Set it to the source photo's own `photo_url` permalink (from `list_project_photos` / `get_photo`) whenever a photo backs the line — it becomes a clickable link on the printed report. For a video-derived line with no matching photo, use the project URL (`https://app.companycam.com/projects/{id}`). If nothing backs it, omit `photoUrl`.

## Context photos (Section 3)

Pick the **clean, marketing-style** shots — a tidy wide shot of the room, good light, no annotation markup, not a close-up of a defect. These give the buyer a feel for the property's condition and layout.

- **Max 3 per room per unit.** Caption is room + unit (`Kitchen — Lower Unit`); single-family is just the room.
- Prefer the room-overview photos the walkthrough almost always includes (often captioned just "Lower unit living room" with no issue).
- Put them in `contextPhotos` as `{ "room": "...", "unit": "...", "url": "..." }` where `url` is the photo's `web`/large image URI (not the thumbnail, not `photo_url`). `unit` is `""` for single-family.
- Order them room-by-room in walkthrough order.

## Cover (Section 1)

- `address` — the **full** property address (street, city, state, ZIP).
- `inspectionDate` — a human date string (e.g. `"August 27, 2026"`) from the walkthrough photos'/video's `captured_at`.
- `frontExteriorPhoto` — the image URI of a front-of-house exterior shot if the project has one; else `""`.
- `preparedFor` — `""` (the PM types the buyer's name on the builder).
- `companyName` — `"Detroit Section 8 Property Management"`.
- `companyCamProjectId` and `mediaLink` — the primary project's id and `https://app.companycam.com/projects/{id}` URL.

## Legal disclosures (Section 2)

Put this exact text in `legalDisclosures` (paragraphs separated by blank lines). It's editable on the builder, but ship it populated so the JSON is self-contained.

```
1. Who we are. Detroit Section 8 Property Management is a property management company. We are not licensed home inspectors, builders, engineers, architects, or construction contractors, and nothing in this report should be treated as a professional inspection, an engineering assessment, or a contractor's bid. Our observations are those of a property manager walking the property, based on what was visible and accessible on the date of inspection.

2. Not investment advice. This report is not investment, financial, legal, or tax advice, and is not a recommendation to buy, not buy, or pay any particular price for this property. Decisions about whether and how to proceed with a purchase are yours alone. You should retain your own licensed inspectors, contractors, and advisors before closing.

3. Informational purposes only. This report is provided for informational purposes only. It is not a warranty or guarantee of the property's condition, its compliance with any code or Section 8 / HQS standard, its rental income potential, or its future performance. Conditions not noted in this report may still exist, including latent or concealed defects.

4. Estimates are approximate. Any repair scopes, quantities, and cost figures in this report are rough estimates prepared for planning purposes. Actual costs may be materially higher or lower depending on contractor pricing, material costs, hidden conditions discovered during work, permit and inspection requirements, and the scope you ultimately choose. No figure in this report should be relied on as a firm quote.

5. No duty to you. Preparing this report does not create a fiduciary relationship, agency relationship, or any duty for us to advise, represent, or protect the interests of the buyer or any other reader. We are not obligated to manage this property, to perform any of the work described, or to take any action on your behalf.

6. Limitation. To the fullest extent permitted by law, Detroit Section 8 Property Management's liability arising out of this report is limited to the fee paid for the walkthrough, and we are not liable for any indirect, incidental, or consequential damages.
```

## Photo & video links (Section 5)

`mediaListLinks` is a plain list of `{ "label": "...", "url": "..." }`:
- One row per video: label it by what it covers (`"Video — exterior & lower unit"`, `"Video of upper unit"`), URL = the project media link (there's no stable per-video permalink).
- One row for the CompanyCam project itself: `{ "label": "All photos (CompanyCam project)", "url": "https://app.companycam.com/projects/{id}" }`.
- Add a row for any other distinct media grouping worth calling out.

## Property management notes (Section 6)

`pmNotes` — leave `""` unless the transcript/captions contain a genuine
whole-property observation that isn't a line item (access notes, "tenant in
lower unit is month-to-month," "seller says roof was done 2019 — could not
verify"). Keep it factual, short, and clearly not advice.

## The review artifact (first-pass deliverable)

Build a Claude artifact the same spirit as `build-sow`'s: load `artifact-design` first, then:

- Centered header band, property address + "Pre-Purchase Underwriting Report".
- Red-theme palette consistent with the SOW artifacts (`#E1432A` header, `#B23A2E` room bands), black borders, white rows.
- One editable row per line item: an editable **flag pill** (red / yellow / optional — color-coded), the editable line-item text, and a thumbnail (the source photo, or the video frame for a video-derived line).
- Room/unit section headings.
- A **context-photos** block per room showing the ≤3 chosen shots with captions.
- Show the cover fields (address, inspection date, prepared-by) and the media-links list as editable text.
- A short estimate note: "Prices are filled in on the website, not here."
- All text editable; flag pills cycle red → yellow → optional on click. No pricing.

In the chat reply alongside the artifact, give a room-by-room summary, call out which items you flagged **red** and why, which are **optional**, anything uncertain, and which lines came from a video vs a caption.

## Exporting to the website

When the user has reviewed the artifact and asks to send it to the website, first ask what they changed (a screenshot of the artifact is easiest — read the flags and edited text off it). Then write this exact JSON shape — the builder validates it:

```json
{
  "address": "8210 Decatur St, Detroit, MI 48228",
  "preparedFor": "",
  "inspectionDate": "August 27, 2026",
  "companyName": "Detroit Section 8 Property Management",
  "companyCamProjectId": "113248280",
  "mediaLink": "https://app.companycam.com/projects/113248280",
  "frontExteriorPhoto": "https://static.companycam.com/.../front.jpeg?d=1600x1600",
  "bufferPct": 20,
  "legalDisclosures": "1. Who we are. ...\n\n2. Not investment advice. ...",
  "contextPhotos": [
    { "room": "Living Room", "unit": "Lower Unit", "url": "https://static.companycam.com/.../lr.jpeg?d=1600x1600" }
  ],
  "sections": [
    {
      "room": "Exterior",
      "items": [
        { "text": "Mortar the front porch where it is sinking and pulling away from the house.", "flag": "red", "labor": null, "material": null, "photoUrl": "https://app.companycam.com/assets/Image/3512634637" }
      ]
    }
  ],
  "mediaListLinks": [
    { "label": "Video — exterior & lower unit", "url": "https://app.companycam.com/projects/113248280" },
    { "label": "All photos (CompanyCam project)", "url": "https://app.companycam.com/projects/113248280" }
  ],
  "pmNotes": ""
}
```

Rules:
- `flag` is exactly one of `"red"`, `"yellow"`, `"optional"` — never missing, never anything else.
- `labor` and `material` are always `null` — a human prices it on the website.
- `bufferPct` defaults to `20` unless the user says otherwise.
- Keep `contextPhotos` to ≤3 per room/unit. `url` is an image URI; `photoUrl` on line items is the `photo_url` permalink.
- Room/unit order and text match the final (possibly user-edited) artifact state.

Save it as `ppr-<address-slugified>.json` (e.g. `ppr-8210-decatur-st.json`) **in the current working directory**. If a file with that name already exists, compare: same address/structure from an earlier pass → overwrite; clearly a different report → tell the user and ask.

Once saved, send it with `SendUserFile` and tell the user to open
**https://section8pm.com/pre-purchase-report.html**, click **Upload report
file**, fill in the Labor/Material prices, then **Download Report PDF** or
**Send to CompanyCam Files**.

## A note on judgment

The buyer is making a purchase decision off this. The flags are the signal:
**red** should mean "factor this into your number," not "here's a scuff."
Reserve it for what actually moves the underwrite, keep the routine turn work
yellow, and don't let a long yellow list bury the two red items that matter.
