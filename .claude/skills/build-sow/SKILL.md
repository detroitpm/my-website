---
name: build-sow
description: Pulls photos and captions from CompanyCam for a property address, cross-checks each caption against what the photo actually shows, rewrites everything into a proper verb-first Scope of Work grouped by room, and delivers it as an editable checkbox-style Claude artifact (with photo thumbnails) for the user to review before it ever goes to the SOW website. Use this whenever the user gives a property address and asks to build, write, generate, or draft a scope of work / SOW, or asks to "pull captions" or "check the photos" for a job. Also trigger on phrasing like "make a SOW for <address>" or "/build-sow <address>".
---

# Build Scope of Work

## What this is for

The user manages property maintenance/renovation jobs. CompanyCam captions written on-site are sometimes vague or use inconsistent terminology, so each photo needs a look before writing the line item — but the caption was written by a human standing in the room, so **when a caption and a photo seem to conflict, the caption wins.** Use the photo to fill in missing detail (which room, what exactly is broken) and to catch cases where the caption is clearly about something else entirely — not to override a caption's read on what the issue is.

The deliverable for a first pass is a **Claude artifact** — an editable, checkbox-driven SOW the user reviews and edits themselves before anything goes to their SOW website. Pricing is out of scope for the artifact. Once the user has reviewed/edited it and asks to send it to the website, build the JSON export — see "Exporting to the website" below.

## Steps

### 1. Find every project at this address

There is often more than one CompanyCam project per property (e.g. separate projects for different units, or one opened by mistake). Don't stop at the first match.

- Try `mcp__companycam__search_projects` with the street number/name.
- Also check `mcp__companycam__list_projects` and match on the `address` field directly — `search_projects` matches on project *name*, and projects aren't always named after their address, so name search alone can miss real matches. Compare street address, city, and zip.
- If more than one project matches, pull photos from **all** of them, not just one.

### 1a. Check whether this property already has a saved SOW

Before building anything, look for `sow-files/sow-<address-slugified>.json`. If one
exists, read it — this run is very likely a **second pass on a job you already
scoped**, not a fresh SOW.

That second pass has a predictable shape: the user walked the property, you built
the list, and then they realized a few things were missed, went back, and shot
photos/video of **just those things**. So the new source material covers only the
missed items — especially when the user scopes the run ("yesterday's photos", "the
new pictures", "what I shot this morning"). The list you build from it is a
*fragment of the job*, not a replacement for it.

**Treat the saved file as the base and add to it.** Build the artifact from the
merged list — every item already in the file, plus the newly found ones — so what
the user reviews is the whole job, not just the new corner of it. Badge the new
ones ("New this pass") alongside the source badges from step 6a so they're easy to
pick out. An item already in the saved file **keeps its original wording** — don't
re-word it on a re-run; the user already read and approved that line.

If the saved file and what you just built don't look like the same property or the
same job at all, stop and ask before touching it.

### 2. Pull photos in walkthrough order

For each matched project, call `mcp__companycam__list_project_photos`. Sort the results by `captured_at` **ascending** (oldest first) — this reconstructs the order the photos were actually taken while walking the property, which is the order the final SOW should follow.

### 2b. Don't skip uncaptioned photos — scan them too, especially exterior/yard/garage

Photos with no caption still need a look, not just a slot in the ordering. In practice a lot of real scope never gets a caption at all: exterior condition (roof, siding, garage, brick), yard/weed/tree-branch cleanup, and other damage that's visually self-evident don't get typed out on-site the way an indoor fixture issue does — the person walking the property just photographs it and moves on. If you only review captioned photos, you will systematically miss this category, not just the occasional one-off.

- Scan every uncaptioned photo, at `variant='thumbnail'` to keep it cheap — you're looking for anything visually obvious, not reading fine print.
- Exterior/yard/garage photos are usually clustered together in the walkthrough order (typically the start or end of a visit, before/after going inside) — you'll recognize the cluster by content (siding, yard, driveway, garage) rather than by caption, since none of them will have one.
- Zoom to `variant='web'` on anything that looks like it has a real issue (debris pile, damaged roof/siding, open/damaged garage, branches touching the house, cracked walkway, gap in brick, etc.) before writing a line from it.
- **The basement counts as one of these clusters** — dark, concrete-floor / joist-and-pipe / mechanical-room shots, usually near the end of the walkthrough, almost always uncaptioned. Open the basement photos at `variant='web'` (thumbnails are too dark to read) and look for water on the slab, an electrical panel with its cover off or an open junction box, foundation cracks, and combustible storage against a gas appliance. Don't call a furnace/boiler/water heater "old" from how it looks — say what you can actually see.
- Anything you add this way is **AI-added** (step 6a) — flagged, unchecked by default — same as any other item you noticed independently in a photo with no caption behind it. The category is common enough to warrant deliberately checking for it, but that doesn't change how it's flagged; it's still your read, not a human's.
- This is a real cost trade-off on a large project (hundreds of uncaptioned photos): thumbnails keep individual calls cheap, but don't burn an unbounded budget scanning everything indiscriminately if the project is huge — prioritize the exterior/yard/garage cluster first since that's where the miss actually happens, then use judgment on how much of the rest to sweep.

### 2a. Pull videos too, and read their transcripts

Photos aren't the only source on a project — a narrated walkthrough video often exists and is frequently the richest source, describing multiple issues per room in far more detail than any single photo caption. Don't skip this.

- Call `mcp__companycam__list_project_videos` for each matched project.
- For every video, call `mcp__companycam__get_video` with `include='transcript'`. Some videos have no real narration (just address callouts) or no transcript at all (`transcript: null`) — skip those, but don't skip a video just because it's long.
- Use each video's `captured_at` to place it in the same walkthrough order as the photos (step 2), so transcript-derived items land in the right room section relative to the photo-derived ones.
- Read the full transcript before writing anything from it — it's normal for one video to cover many rooms in sequence, so segment it by the room names/transitions the narrator mentions ("now we're in the bathroom", "left bedroom", "let's go to the basement", etc.).

### 3. Look at every captioned photo, but the caption wins on conflict

For each photo that has a caption, call `mcp__companycam__view_photo` and actually look at it before writing anything. Use the photo to:
- confirm/identify which room the item is in,
- fill in specific detail the caption left out (what exactly is broken, roughly where),
- catch the case where a caption is unambiguously about something else entirely (e.g. captioned "stove hookup" but the photo is clearly a bathroom floor with no kitchen in sight — don't invent a stove line with no photo evidence).

When the caption and the photo give two different plausible reads of the *same* issue, **go with the caption** — it was written on-site by a human who was standing there. Don't "correct" a caption's description just because you'd have described the photo differently.

The caption wins on *what the issue is and where* — but **not on the name of the part.** See step 3b.

If a caption and photo genuinely can't be reconciled at all (photo too dark, clearly unrelated, totally ambiguous), don't silently guess — keep the item but flag it in your summary to the user as something to double-check.

### 3b. Fix wrong, made-up, and missing part names

The user writes captions and narrates video fast, standing in the room, and will sometimes reach for the wrong word. Three shapes this takes:

- **A plausible-sounding invention** — "conduit box" for what is actually a junction box, "water box" for a water heater pan.
- **An out-loud blank** — "crap, I forgot what that thing is called," "the whatchamacallit," "the doohickey on the wall."
- **A bare placeholder** — "fix this thing," "that piece is broken."

In all three, **look at the photo and write the correct name.** This is a deliberate exception to "the caption wins" in step 3, and it's at the user's explicit request: a wrong part name sends a contractor to the supply house for the wrong thing, and a line that says "fix that thing" isn't actionable at all.

How to do it well:
- **Correct the noun, keep their sentence.** Their phrasing and word order stay; only the misnamed part changes. "Put a cover plate on the open conduit box next to the furnace" becomes "Put a blank cover on the open junction box next to the furnace" — same shape, right nouns.
- **This is not a license to jargon-ify.** Step 4's plain-language rule still governs everything else. If a term is already unambiguous, leave it alone even when a trade guy would say it differently — "exhaust vent going into the chimney" does not need to become "vent connector entering the thimble." Only fix what would actually mislead someone.
- **Fix the fix, too.** A wrong part name often drags a wrong repair noun with it. A junction box takes a *blank cover*, not a *device plate* — name the right part for the job as well as the right part for the thing.
- **If the photo doesn't let you name it confidently, don't invent one.** Keep their wording, and flag it in the summary as a term to confirm. A confidently wrong name is worse than an honest "that thing by the furnace."
- **Say what you changed.** List each terminology fix in your chat summary with the original wording — the user is learning the terms, and wants to see the correction, not have it quietly applied.

This applies to video narration exactly as it does to captions, and it's a *different* rule from the ASR-noise correction in step 3a: that one fixes what the transcriber mis-heard, this one fixes what the speaker actually said.

### 3a. Pull scope items out of the video transcript(s) — then dedup against the photo captions

Work through each transcript from step 2a and pull out every distinct issue/fix the narrator describes, sorted into the room they were describing it in. Rewrite each into a scope line the same way you would a caption (step 4).

Speech-to-text transcripts are noisy — expect mis-heard words (e.g. "GSA outlet" almost certainly means "GFCI outlet", "sealless motor detector" almost certainly means "sealed battery smoke detector"). Use context (the room, the rest of the sentence, construction common sense) to resolve these the way you'd silently correct a typo, and don't preserve an obvious mis-transcription just because it's literally what the transcript says — that rule is for genuine on-site caption wording, not ASR noise.

**Before adding a transcript-derived item to the SOW, check it against every caption-derived item already pulled from photos in that same room.** The video and the photos usually cover overlapping ground — a caption might say "sink fixture base needs tightening" while the video separately says "kitchen faucet, it's very loose." Treat these as the same real-world item, not two line items:
- If a video item clearly matches an existing caption-derived item (same fix, same rough location), **don't add a second line.** If the video adds a genuinely new detail the caption lacked, you may fold that detail into the existing caption-derived line's text — but keep the caption's own wording as the base per step 4, and don't let a re-write from the video override it.
- If a video item is genuinely new — no photo/caption anywhere covers it — add it as its own line, sourced from the video (see step 6a for how these are flagged).
- When it's a judgment call whether two items are "the same," lean toward treating them as the same and merging rather than duplicating; a missed duplicate is more confusing to the user than a slightly-terse merged line.

### 4. Rewrite as a proper scope line

Every line must:
- **Start with an operational verb**: Replace, Repair, Install, Paint, Clean, Fix, Remove, Reconnect, Tighten, Inspect, etc. — matched to what the caption says needs doing.
- **Stick to simple, plain-language vocabulary** — use the words already in the caption wherever possible. Avoid construction/trade jargon the caption itself didn't use (no "skim coat," "lockset," "reglaze," etc. unless the caption used that term). The goal is a line item anyone can read, not a contractor spec sheet. **The one exception is a misnamed or unnamed part** — correct that per step 3b. Naming the right part isn't jargon; swapping "fix the window so it opens" for "restore sash operation" is.
- **Don't invent "left"/"right"** — if the caption specifies a side, keep it exactly as written; if it doesn't, don't add one.
- **Be specific about location** — name the room/spot, the way the caption already implies it.
- **Keep it terse — no fluffy full sentences.** Say the job and stop. Trim filler openers and framing clauses ("This is a...", "Please make sure to...", "It appears that..."), and don't pad a caption into prose. Extra detail that a contractor actually needs — a size, a count, a qualifier — stays, but as a fragment appended after the job, not as its own sentence. Write "Clean out the entire house — living room, all closets, basement. 20 yard clean out." not "Clean out the entire house, including the living room, all closets, and the basement. This is a 20 yard cleanout."

If a line item is something *you* noticed independently in a photo with no caption support for it, still add it — but see step 6a, it must be flagged as AI-added, not blended in as if it came from the caption.

### 5. Group by room, in walkthrough order

Use the photo order from step 2. If a caption doesn't name a room, infer it from what's visible in the photo (visible kitchen cabinets → "Kitchen," even if the caption never says the word). Keep the room grouping in the order rooms were first encountered during the walkthrough, not alphabetical.

### 5a. Use "General" for whole-house/multi-room items

If an item applies to the whole house or to multiple rooms rather than one specific room, put it in a section called **"General"** — never "Whole House" or any other phrasing. Examples of what belongs in General:
- Clean outs
- Painting the whole house
- Installing blinds on the first floor
- Installing carpet and turn cleaning
- Turn cleaning
- Installing CO2/smoke detectors according to Section 8 standards

Place the General section wherever it naturally falls in walkthrough order (typically near the start or end, wherever the source first raises a whole-house item) — it doesn't need to be first or last by default.

**Also consolidate when the same fix recurs across 3+ rooms** — but how depends on whether the fix is per-location work or a bulk/non-location-specific action:

- **Bulk actions** (buying/installing a batch of the same thing, where nobody needs to track which specific instance is done — e.g. "these rooms all need new blinds") — fully consolidate: pull it into one General line, and **drop the per-room copies entirely.** A "repair the existing blinds" item is a *different* fix from "install new blinds" even though both are about blinds — don't merge across different fix types just because the category matches (e.g. a living room's "repair blinds so they open and close" stays put; it's not the same job as replacing damaged blinds elsewhere).
- **Per-location work** (something a contractor has to physically go verify/complete at each specific spot — e.g. "remove the screws holding *this* window shut") — add a General line summarizing the pattern (useful as a heads-up / count), but **keep each room's own line too.** The contractor still needs a separate checkbox per window to know which ones are actually done; collapsing them loses that.

When unsure which kind a recurring fix is, default to keeping the per-room lines and adding the General summary alongside them — losing a checkbox a contractor needs is worse than one redundant summary line.

### 5b. How to label bedroom section headers

Never head a bedroom section with just "Bedroom" or a vague description when its position in the house is knowable. Build the label from up to three position words, in this order:

1. **Front-to-back position** — `Front`, `Middle`, or `Rear`
2. **Floor** — `Upper` or `Lower` (only include this word if the house has more than one floor of bedrooms — skip it on a single-story)
3. **Side** — `Right` or `Left`, determined by standing at the front door and facing into the house (i.e. as if you just walked in the front door and are looking at the house from that vantage point — not as viewed from the street)

Combine into a heading like **"Upper Rear Left Bedroom"** or **"Lower Front Right Bedroom"**. Only include the words you actually have evidence for from the caption/photo/report — don't guess a dimension that isn't indicated. If a bedroom's position truly can't be determined from any source, fall back to a plain "Bedroom" heading (or "Bedroom (unclear position)") and flag it in the summary rather than inventing a position.

### 6. Mark optional items

If a caption explicitly frames something as optional, a nice-to-have, or something to "consider," mark that item optional (grey it out in the artifact — see below). Don't infer optional status otherwise — only mark it when the source actually says so.

### 6a. Flag AI-added and video-derived items

Every line item comes from one of three sources, and each must be visually distinguishable in the artifact:
- **Caption-derived** (from a photo's written caption, per steps 3–4) — the default look, no badge, **checked** by default.
- **AI-added** (something *you* noticed independently in a photo with no caption support for it) — badge it distinctly (e.g. "AI-added — not in caption") and default it to **unchecked**, since it's your read, not a human's. These do **not** go in the artifact at all — the user picks them in chat from a numbered photo sheet, and only the picked ones are folded into their rooms. See "Picking the AI-added items" under Delivering the artifact.
- **Video-derived** (a genuinely new item from a transcript per step 3a, with no matching caption anywhere) — badge it distinctly from both of the above (e.g. "From video walkthrough") but default it to **checked**, same as caption-derived — it's still a human on-site describing a real issue, just narrated instead of typed. Use a different badge color than AI-added so the user can tell "a person said this" apart from "the AI inferred this."

### 7. Always add a closing Questions section

Append one final section, "Questions," with exactly these two items, answers left blank:
- "Is the job 100% done?"
- "Did I put the keys back?"

### 8. Write video-derived captions back onto uncaptioned photos

Whenever a project has **both** a video with a usable transcript **and** photos with no caption, push the video's wording onto those photos with `mcp__companycam__add_photo_description`. Captions are what make the next pass over this property useful, and a narrated walkthrough is exactly the material to fill them in with. Do this on the first pass, at the same time you deliver the artifact.

**Write them automatically — don't ask.** The user has standing approval for this specific write. Report what you wrote in the chat summary; don't pause the job for a confirmation.

The rules:
- **Never overwrite an existing caption.** `add_photo_description` *replaces* — it does not append. Only write to photos whose `description` is `null` or empty. A caption someone typed on-site is the more authoritative source and must survive untouched.
- **Only caption a photo the video actually covers.** Match on a confident read — same fix, same room, same thing visible in frame. If the video never mentions what's in the photo, **leave it blank.** Never write an AI-only observation into CompanyCam; that turns your inference into what looks like a human record. Same answer when the match is merely plausible: skip it.
- **Write the scope line plain** — the same verb-first text as the SOW line (steps 4 and 3b, so corrected terminology goes in too). **No provenance prefix**, no "[from video]" tag. The user asked for these clean.
- **One caption per photo.** Where several SOW lines share one photo, write the one that best describes what's actually in frame, not all of them concatenated.
- **Badging for this run doesn't change.** An item you sourced from the video is still video-derived in the artifact (step 6a), even though its photo now carries a caption. Be aware of the consequence on a *re-run*: the skill will then read that caption as an ordinary on-site caption and treat it as caption-derived. Same text either way, so nothing breaks — but don't be surprised by the badge flip.
- **Attribution is not yours.** CompanyCam files the caption under the photo's owner, so it will read as though that person typed it. Mention this in the summary the first time you write captions on a project.

In your chat reply, list which photos got captions and which you deliberately left blank, with the reason.

## Delivering the artifact

Build the SOW as a **Claude artifact** (HTML). Before writing it, load the `artifact-design` skill for layout/theming guidance, then follow these SOW-specific requirements:

- **Heading centered** at the top: property address + type of work, inside a colored header band.
- Room headings are just the room name (e.g. "Kitchen") — no "Room:" or "Section:" label/eyebrow in front of it. It's obvious from context.
- **Table styling**: bold outer border, thin inner gridlines.
- **Color palette matches the existing SOW Google Sheets** (see the "SOW and Estimates" Drive folder, e.g. the monthly "<Month> 2026 SOW" spreadsheets) — a red theme, not an arbitrary accent color: bright red header/title band (e.g. `#E1432A`) with white text, a slightly darker/muted red band for each room heading (e.g. `#B23A2E`) with white text, black/near-black bold borders, white row backgrounds with light-grey thin inner gridlines. Keep this consistent across light/dark themes (darken the reds for dark mode, don't swap to a different hue).
- **One row per line item**, grouped under room headers in walkthrough order. The room tables hold **only caption-derived and video-derived items** — AI-added ones live in their own section (below). Each row contains:
  - a **checkbox**, checked by default,
  - the editable line-item text (verb-first, plain language, per step 4),
  - a **thumbnail** next to the item so the user can verify without leaving the artifact — the source photo for caption-derived items; for a video-derived item (no single photo to point to), use that video's `thumbnail_urls` frame instead, so there's still something to look at,
  - a badge on video-derived rows per step 6a, plus a "New this pass"
    badge on items added in a re-run over a saved SOW (step 1a),
  - optional items shown greyed-out (step 6).
- **Thumbnails must be inlined as base64 data URIs, not linked to the CompanyCam CDN.** The Artifact sandbox's CSP blocks remote `<img>` loads, so a `src="https://static.companycam.com/..."` renders as a broken image every time. Download each photo/video-thumbnail (`curl`/`urllib`, the `web`-size CompanyCam photo URL or the video's `medium` thumbnail is plenty) and inline it as `src="data:image/jpeg;base64,..."` before publishing. Do this for every thumbnail up front — don't publish first and fix it only if the user notices.
- **No pricing anywhere** — that's a later step, not part of this artifact.
- Everything (checkboxes, text, grey/optional state) should be editable by the user directly in the artifact. **All text on the page must be editable** — every line item, room heading, the address/type-of-work in the header band, and the Questions answers — not just the line items.
- Don't wrap a checkbox and its line-item text in the same `<label>`/click target. That makes clicking into the text to edit it also toggle the checkbox. Keep the checkbox and the editable text as independent elements so each can be interacted with on its own.
- No JSON file, no `SendUserFile` at this stage — the artifact itself is the deliverable for the review pass.

### Picking the AI-added items — do this in chat, with a photo sheet

AI-added items (step 6a) are the one thing the user has to *judge* rather than read, and
they can only judge them from the photo. **Keep them out of the artifact entirely** and
settle them in chat instead, at the same time you deliver the artifact.

The reason is mechanical: the artifact is a static page and you cannot read back what the
user ticked in it. Any picking surface built into the artifact just makes them tick boxes
and then type the answer to you anyway. Chat is where the answer can actually reach you —
so the pictures have to come to chat too.

Do it in two calls, in the same turn as the artifact:

1. **Build one numbered contact sheet image** of every AI-added item and send it with
   `SendUserFile` (`display: "render"` so it opens inline). One tile per suggestion:
   a **big** photo — crop to the defect when it's small in a wide frame, a whole room shot
   is useless for judging a hole in the tile — a large number badge in the corner, the room
   name, and the proposed scope line underneath. Three across reads well; keep the whole
   sheet under ~2000px wide. Compose it with PIL; there is no ImageMagick on this machine.
   Match the SOW palette (red badges, near-black borders) so it reads as part of the job.
2. **Ask with `AskUserQuestion`**, `multiSelect: true`, one option per suggestion, each
   labelled with its **number from the sheet** first (`"3 — Tree stump in back yard"`) so
   the option list and the picture line up at a glance. Split across several questions when
   there are more than four, grouped by room.

Then republish the artifact with the picked items folded into their room sections in normal
walkthrough position (step 5), so the page ends up being the real agreed scope rather than
a draft full of maybes.

Never ask about these as a bare text list with no sheet — that is choosing without the
photos, which is the whole problem.

If a run produces no AI-added items, skip all of this silently.

In your chat reply alongside the artifact, include:
- A short summary grouped by room of what you found.
- Anything flagged as uncertain in step 3, which items are AI-added, and which items came from a video transcript rather than a caption.
- Any videos that had no usable transcript (no narration, or `transcript: null`), so the user knows that source wasn't covered.

If the user hand-edits something in the artifact, treat it as a signal a rule might be missing from this skill — flag it and offer to fold it in, rather than silently repeating the same fix next time.

## Exporting to the website

The artifact is a static page — there's no capability declared to read its live DOM state back, so you cannot see what the user checked/unchecked or edited after you published it. Before generating the export, ask the user whether they made any changes since the draft, and how they want to convey them (typically a screenshot of the artifact is easiest — read the checkbox states and any edited text straight off the image). Don't assume the original draft still matches what they approved.

Once you know the final state, build a JSON file matching this exact schema — the website's upload feature validates this shape and will reject anything else:

```json
{
  "address": "123 Example St, Detroit, MI 48227",
  "typeOfWork": "Pre-inspection list",
  "mediaLink": "https://app.companycam.com/projects/123456",
  "bufferPct": 20,
  "sections": [
    {
      "room": "Kitchen",
      "items": [
        { "text": "Replace cracked window glass", "labor": 50, "material": 250, "priceSource": "suggested", "priceBasis": "Closest past job: \"Replace glass in upper and lower panes - cracked\" at $50/$250", "optional": false, "photoUrl": "https://app.companycam.com/assets/Image/3466100976" }
      ]
    }
  ],
  "questions": [
    { "text": "Is the job 100% done?", "answer": "" },
    { "text": "Did I put the keys back?", "answer": "" }
  ]
}
```

Rules for this file:
- **Only include items that were left checked.** Unchecked items (including any still-unchecked AI-added items) are dropped entirely — they don't appear in the JSON at all.
- `labor` and `material` carry a **suggested** price, or `null` — see "Suggesting prices" below. Never set a price without also setting `priceSource` and `priceBasis`; an unmarked price is indistinguishable from one the user typed, and the website will treat it as confirmed and learn from it.
- `optional` is a real boolean (`true`/`false`), taken from whichever items were marked optional/greyed-out in the artifact.
- `bufferPct` defaults to `20` unless the user says otherwise.
- `mediaLink` is the primary CompanyCam project's URL (`https://app.companycam.com/projects/{project_id}`) from step 1.
- `photoUrl` makes the line item clickable on the website and in the PDF, linking straight to the source in CompanyCam. Set it whenever a photo backs the item — use that photo's own `photo_url` field (a stable permalink, from `get_photo` or already present on `list_project_photos` results), not the thumbnail/web/original image URIs. For a video-derived item (step 3a) with no matching photo, **omit `photoUrl` entirely.** Do not fall back to the project's `mediaLink`: the website shows a camera icon and a clickable link for any line that has a `photoUrl`, so a project link produces an icon that promises a photo and then reports there isn't one — it did that on 23 of 88 lines on a real SOW. The project's media link already appears once in the report footer, so nothing is lost by leaving these blank. If an item has no source photo at all (write it from memory/inference with nothing to point to), omit `photoUrl` entirely rather than guessing one.
- Room order and line-item text should match the final (possibly user-edited) state of the artifact, not the original draft.

### Suggesting prices

Run the price checker before writing the JSON. It splits the line items into the
ones the website can price on its own and the ones needing a judgement call:

```bash
node tools/sow-price-check.js sow-files/sow-<address>.json
```

(Write the file with `labor` and `material` as `null` first, run this, then fill
them in. The tool only reads the item text.)

It returns three things: `covered` (lines the site's own matcher will fill from
the rate table), `needsSuggestion` (lines it can't, each with `anchors` — the
closest past jobs and what they cost), and `priceLandscape` (what their pricing
generally looks like).

**Leave every `covered` line at `null`.** The website fills those in itself from
the real price the user charged before, and a price they actually charged beats
an estimate every time. Do not restate them — doing so overrides the match with
a guess.

For each `needsSuggestion` line, set `labor` and `material`, plus:
- `priceSource`: `"suggested"` — always, without exception. This is what makes
  the price show greyed out and keeps it out of the rate table until a human
  accepts it. A price without it silently becomes their standard rate.
- `priceBasis`: one short sentence showing your reasoning — for labor, the
  minutes and the arithmetic (see below). The user reads this to check you.

#### Labor: estimate the time, then apply the day rate

**The crew rate is $250 for a 7-hour day — $35.71/hr, about 60 cents a minute (0.5952 dollars/min).** For every
`needsSuggestion` line, estimate how long the job actually takes, multiply, and
**round up to a whole dollar**. 30 minutes → $17.86 → **$18**. Put the minutes in
`priceBasis`: `Est. 45 min at $35.71/hr ($250 per 7-hour day) = $27. Diagnose,
then swap flapper and/or fill valve, test.`

The day is billed as 8 hours but priced across **7 hours of on-site work** — the
eighth hour is absorbed by Home Depot runs. That has one consequence you must
respect: **estimate on-site wrench time only.** Never add minutes for a supply
run, a parts trip, or travel between jobs, and never add a separate line item
for one. That hour is already inside the rate; counting it again bills it twice.

This is the user's own instruction and it replaces anchor-matching for labor —
they would rather review a time estimate they can sanity-check than a price
pattern-matched off a job that only sounds similar. Estimating is expected to be
approximate; they review and adjust every number.

Estimate the time honestly:
- **You have the photos and the video — use them.** How bad is the access, how
  many of the thing are there, is it a five-minute swap or a strip-and-rebuild?
  That is most of what drives the number.
- **Count units and multiply.** Two windows at ~40 min each is 80 min. Say so in
  the basis.
- **Include the real setup cost — on site.** Mixing mortar has a fixed overhead
  no matter how small the patch. So does getting under a sink. This means setup
  *at the property*, not the trip to buy the mortar.
- **Don't inflate to look reasonable.** Some jobs genuinely are ten minutes and
  $6 — a cover plate, pulling two blind brackets. A too-small number is easy for
  the user to spot and fix; a padded one just quietly overcharges.
- **Sanity-check the total.** Sum the labor and divide by $250: that's how many
  person-days the punch list is. If the number doesn't match the size of the job
  you just looked at, individual estimates have drifted. Report this figure.

#### Material: only when it's obvious

Set `material` **only where the part is unambiguous and cheap** — a blank cover,
a toilet flapper, a light bulb, a handful of screws. Anchor those to the round
figures in `priceLandscape` (their material clusters at $25 and $50; minimum
seen is $10).

**Leave `material` at `null` whenever the price depends on a size, grade, or
count you can't judge from a photo** — a sash cord, a length of pipe, a fixture
the user may want to spec themselves. The user fills these in; that is the
agreed split. A blank costs them thirty seconds, a wrong number they don't catch
ends up in a contract.

#### Lines the site already prices

**Leave every `covered` line at `null`, and don't comment on it.** A price they
actually charged beats an estimate, so the history match wins and there's no
need to show what your time estimate would have been. The one exception worth
raising: if a `covered` match is clearly a *different fixture or job* — the
matcher pairing "tighten loose kitchen faucet" to a past job about an outlet —
flag that one line so they can check it. Still leave it `null`.

- **Never put a price in the artifact.** The review artifact stays price-free —
  prices belong only in the exported JSON.

In your chat reply, give the user a table of every line you priced with its
**estimated minutes and labor dollars**, so they can accept or adjust each one.
Then say how many lines the site will price from history, how many materials you
left blank for them, and the total labor as a person-day figure.

Save it as `sow-files/sow-<address-slugified>.json` (e.g. `sow-files/sow-123-example-st.json`) **in the project folder**, creating `sow-files/` if it does not exist yet — job files live there, separate from the website code, not loose in the repo root and not just in a scratch/temp directory — this is a deliverable file they'll want to find again locally, not a throwaway.

Before writing it, re-read the existing file if there is one (step 1a). **Merge into
it — never replace it.** Compare line item by line item, not by "rough structure":

- **Never drop a line the saved file already has.** If an item is in that file and
  not in the list you just built, it stays. It was scoped and approved on an earlier
  pass, and a re-run built from partial source material is not evidence against it —
  the photos for it simply weren't in this batch. The only thing that removes a line
  is the user telling you to remove it.
- **Carry prices forward untouched.** If a line in the saved file already has a
  `labor` or `material` number, keep that number, its `priceSource` and its
  `priceBasis` exactly as they are, and don't re-run the estimate on it. The user
  reviews and adjusts every price by hand; regenerating one silently throws that
  work away and replaces a number they accepted with a fresh guess.
- **Only price the genuinely new lines.** Run `sow-price-check.js` as usual, but
  fill in `labor`/`material` only for items that weren't already in the saved file.
- **Keep the saved file's room order.** Put new items into an existing room where
  one matches; add a new section only for a room that isn't in the file yet.
- **Ask only when something would actually be lost** — a line whose text would
  change, an `optional` flag flipping, a price being overwritten, or two items that
  are clearly the same real-world issue worded differently. List those specific
  lines and ask whether to overwrite, save under a new name (e.g. append `-v2`), or
  hold off. **Don't ask about pure additions** — adding missed items to an existing
  list is the normal case, not an exception.

After a merge, say plainly in your chat reply: how many items carried over from the
saved file, which ones are new this pass, and that the existing prices were left
alone.

**`typeOfWork` is half the SOW's identity on the website.** The builder stores one
SOW per address *plus* type of work, so the value you put in `typeOfWork` decides
what happens to the copy already on section8pm.com:

- **Same address, same type of work → the saved SOW is replaced.** That's what you
  want for a normal second pass, where you merged the missed items into the existing
  list and the result is the one true list for that job.
- **Same address, different type of work → a second, separate SOW.** Use this when
  the user wants both to survive as their own documents — "Pre-inspection list 1"
  and "Pre-inspection list 2", or a pre-inspection list and a later turn scope.

Don't change `typeOfWork` between passes by accident — casing and extra spaces are
ignored, but a reworded type of work ("Walkthrough punch list" one pass, "Punch
list" the next) silently creates a second SOW instead of updating the first. Reuse
the saved file's exact `typeOfWork` on a re-run unless the user asks for a new
version to sit alongside the old one.

Once saved, also send it with `SendUserFile` so it shows up in the conversation, and remind the user it's ready to upload via the "Upload SOW file" button at **https://section8pm.com**.

## A note on judgment

This task rewards reading each photo carefully to support and clarify the caption, not to override it. If a caption is already accurate and well-phrased, don't change it just to change it. The value of this skill is filling in what a fast on-site caption left out, in the caption's own plain language — while catching photos where a caption is unambiguously about something else.

The same applies to video transcripts: they're a great source for scope the photo captions missed entirely, but a narrated walkthrough often re-describes things a caption already covered. The goal is one clean line item per real-world issue, not one per source that mentioned it — when in doubt, merge rather than duplicate (step 3a).
