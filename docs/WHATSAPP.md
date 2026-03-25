# WhatsApp Chat Ingestion Pipeline

## Overview

One-off import of the HAC WhatsApp support group export (`_chat.txt`) into the
platform's post/reply model. The goal is to preserve high-signal support
conversations, protect participant identities, and clearly label imported
content as coming from WhatsApp.

Script location: `server/src/scripts/ingestWhatsApp.ts`
Run with: `pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts`
Dry-run: `pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --dry-run`
Verbose: add `--verbose` to see per-message scores, category hits, and threading decisions
Line slice: add `--lines 114-161` to test a specific range

V1 scope:

- Support only `_chat.txt`
- Seed Postgres first, then reuse existing BullMQ ingestion
- Keep unanswered single-message questions as standalone posts
- Use per-sender pseudonyms instead of shared synthetic bucket users
- Show a small `WhatsApp archive` indicator in the product
- Use relevance scoring, topic overlap, and confidence scoring during import
- Apply a soft reply cap so long chats do not become bloated forum threads

---

## Phase 0 — Normalize Raw Export

Before parsing:

- Strip invisible/bidi characters from each line
- Normalize timestamp spacing around `AM` / `PM`
- Treat non-timestamp lines as continuations of the previous message
- Remove `"<This message was edited>"` from the body and store `edited = true`
- Normalize sender labels such as `~ Name`

Each normalized message gets a deterministic key:

`waMessageKey = sha256(timestamp + normalizedSender + normalizedBody)`

This key is used for rerun safety and provenance.

---

## Phase 1 — Parse

Expected V1 message shape after normalization:

`[DD/MM/YY, H:MM:SS AM/PM] Sender Name: message body`

For each parsed message, store:

- timestamp
- normalized sender label
- body
- edited flag
- system/media flags
- `waMessageKey`
- `language` (`"english"` | `"hinglish"`) — detected from romanized Hinglish marker words; used for QA visibility and future term tuning

Abort if parse failures cross a small threshold. Bad parsing should stop the
import instead of creating corrupted posts.

---

## Phase 2 — Filter Noise

Drop messages matching any of the following:

- Media placeholders only: `image omitted`, `video omitted`, `sticker omitted`,
  `document omitted`, `audio omitted`, `GIF omitted`
- System messages: `left`, `added`, `changed their phone number`,
  encryption notice, deleted message
- Pure reactions or emoji-only acknowledgements
- Ritika Makkar devotionals starting with `My Lord`, `मेरे प्रभु`, or
  `Shukrana`
- Repeated `दी Chapter` promotional posts
- Bare URL-only forwards and other obvious non-support spam

Keep short but meaningful replies such as `yes`, `same here`, or
`I had this too` when they belong to an active discussion.

---

## Phase 3 — Relevance Scoring

Score each non-dropped message for import relevance before threading.

High-signal features:

- treatment, drug, symptom, side effect, scan, nutrition, recurrence, or
  recovery terms
- direct help-seeking questions
- experiential answers such as `I had this too`, `for me`, or `my doctor said`
- concrete recommendations, cautions, or coping strategies

Low-signal penalties:

- generic acknowledgements, jokes, or light banter
- motivational content without support context
- repeated forwards, promos, and weak one-word replies outside an active thread

Rules:

- drop messages below a minimum relevance threshold
- keep borderline replies only when topic overlap is high enough
- store the numeric relevance score for later QA and provenance

Medical terms are grouped into semantic categories (treatment, scans, side effects,
symptoms, care). Scoring counts unique categories hit, not unique list entries, so
"chemo" and "chemotherapy" in the same message count as one signal, not two.

**Side-effect density bonus:** listing multiple distinct side-effect terms (e.g.
"mood swings, anxiety, dryness, body aches") awards a density bonus on top of the
single category hit: `+6` for 2 matches, `+12` for 3+. This prevents substantive
symptom-listing replies from being underscored.

V1 thresholds on a `0-100` scale:

- `< 15`: drop unconditionally
- `15-29`: eligible for near-thread relaxation (see Phase 5) but cannot enter
  normal threading or anchor a new thread
- `30-39`: can enter threading but cannot attach to a thread via overlap alone
- `40-54`: eligible to attach as a reply to a high-overlap thread; cannot start a new thread
- `>= 55`: eligible to anchor a new thread

---

## Phase 4 — Pseudonymous Users

Create one deterministic synthetic user per distinct sender.

Username rules:

- `wa_doctor_<hash8>` if sender starts with `Dr.` or `Dr `
- `wa_member_<hash8>` otherwise

Email rule:

- `<username>@hac.internal`

Real WhatsApp names are never written to app tables. The import keeps a local
mapping from normalized sender label to pseudonym so reruns stay stable while
preserving author separation.

---

## Phase 5 — Thread Reconstruction

Goal: convert chat into forum-shaped threads without using an LLM at parse time.

Thread anchors:

- medically relevant question-like messages
- support-seeking requests
- unanswered single-message questions, which still become posts

Heuristics:

1. Start a new thread when a question-like message appears and either there is
   no active thread, the gap from the last substantive on-topic message is
   greater than 90 minutes,
   or topic overlap with the current thread anchor is low.
2. Treat follow-up questions as replies when they stay on the same topic and
    arrive inside the active thread window.
3. Append substantive non-question messages as replies for up to 5 hours from
   the anchor.
4. Ignore non-question chatter when no active thread exists.

This avoids the earlier failure mode where every `?` became a new post.

Topic overlap should be explicit, not intuitive. Compare each new message
against the thread anchor and recent substantive replies using a blended signal:

- **60% lexical Jaccard** — token overlap after stop-word removal
- **40% medical-category Jaccard** — canonical medical terms matched via a
  synonym map that covers romanized Hinglish variants (e.g. `kimo` → `chemo`,
  `dard` → `pain`). Devanagari script is not supported in V1.

**Sender-aware threading:** effective overlap includes a sender bonus that
captures conversational flow (A asks, B answers, A follows up):

- `+0.12` if the message sender matches the thread anchor author
- `+0.08` if the sender matches one of the last 3 repliers

The sender bonus is additive to the blended Jaccard overlap. It nudges borderline
messages into the attach zone but cannot single-handedly push topically unrelated
messages over the threshold.

V1 behavior:

- attach to existing thread when effective overlap is `>= 0.35`, provided the
  message scores `>= 35`
- split into a new thread when effective overlap is `< 0.20` and the message
  scores `>= 55`
- **middle band** (`0.20–0.35`): attach only if at least one extra signal is
  present:
  1. **high relevance** (`>= 50`)
  2. **shared medical category** — message and thread context share at least one
     `TERM_CATEGORIES` category hit (treatment, scans, side effects, symptoms, care)
  3. **sender match** — sender bonus > 0
  4. **recent activity** — thread had activity within the last 15 minutes
  - if none of these hold, the message is added to the unattached pool for the
    backward pass (see below)
- **near-thread relaxation** (`score 15-29`): messages below `MIN_RELEVANCE` (30)
  but above 15 can attach to threads that had activity within the last 30 minutes,
  provided they share at least one medical category or have a sender match. This
  captures conversational replies (thank-yous, doctor encouragement, symptom lists)
  that score low individually but clearly belong to an active discussion.

Low overlap means:

- start a new thread if the message is independently relevant
- otherwise skip it as drift or chatter

Multiple active threads:

- allow `2-3` active candidate threads in the same time window
- attach a reply to the highest effective-overlap eligible thread instead of
  assuming only one open conversation at a time

Reply cap:

- use a soft cap of roughly `15` substantive replies per imported thread
- after the cap, only append replies with raw content overlap `>= 0.5`
- if overlap weakens after the cap, the message goes to the unattached pool

Thread age:

- keep the hard maximum reply window at `5 hours`
- once a thread is older than `2 hours`, a fresh question-like message should
  default to a new thread unless topic overlap is very strong

**Backward-looking reply attachment:** after the chronological forward pass
finalizes all threads, a second pass checks unattached messages against finalized
threads. This catches delayed responses where someone answers a question after
intervening chatter:

- only considers messages scoring `>= 35`
- only checks threads whose anchor is within `3 hours` before the message
- uses a slightly relaxed effective overlap threshold of `0.30` (vs `0.35` forward)
- sender bonus applies in this pass too
- attached replies are re-sorted chronologically and thread confidence recalculated

This prevents one active day in WhatsApp from collapsing into one oversized post.

---

## Phase 6 — Shape Posts + Replies

Use direct Prisma writes so original WhatsApp timestamps are preserved.

For each reconstructed thread:

- Create one `Post` from the anchor message
- Create `Reply` rows from the substantive follow-up messages
- Omit `parentReplyId` in V1 unless reply structure is recoverable with high
  confidence
- define `waThreadKey` as the `waMessageKey` of the anchor message

`waThreadKey` must remain stable across reruns. Do not derive it from the final
set of grouped replies, because thread heuristics may change over time.

Thread confidence scoring should determine structural publishability.

Suggested confidence inputs:

- parse quality of all messages in the thread
- anchor relevance score
- average topic overlap across replies
- number of substantive replies vs skipped drift
- title quality and coherence of the final thread

Use confidence bands:

- high confidence: auto-publish
- medium confidence: import but mark for manual QA
- low confidence: do not publish as first-class forum content

V1 publish thresholds on a `0-100` scale:

- `>= 75`: auto-publish
- `55-74`: import with manual QA flag
- `< 55`: do not publish as first-class forum content

Medical risk classification is out of scope for V1. All imported posts and replies
carry `medicalRisk = "low"` as a default placeholder; the field exists on the schema
for future use.

Title generation should be cleaned, not raw first-80-character truncation:

- remove greetings such as `Hello friends`
- if the anchor message contains a `?`, use the first question sentence as the title
- otherwise fall back to the first sentence or clause
- cap length at roughly 80 characters

Examples:

- `Hello friends ... loose motion after treatment?` ->
  `Loose motion after treatment?`
- `is anyone on zoladex ... what are the side effects?` ->
  `Is anyone on zoladex ... what are the side effects?`

---

## Phase 7 — Provenance + Product Indicator

Imported content must remain distinguishable from native forum content.

V1 storage approach:

- store content-level provenance directly on `Post` and `Reply`
- add a separate `ImportRun` table for run-level audit data
- do not start with a generic `ImportMeta` side table

Why this is the better V1 design:

- the UI needs provenance on the hot path to show a `WhatsApp archive` badge
- retrieval and vector ingestion need provenance without extra joins
- rerun safety depends on direct lookup by `waMessageKey` and `waThreadKey`
- `threadConfidence` affects product behavior, not just debug metadata
- a generic side table is awkward here because `Post` and `Reply` are separate models
  and the metadata is not optional

`ImportRun` should hold process-level data such as:

- source file name
- run start / finish time
- status
- counts of parsed, dropped, persisted, skipped, and enqueued items
- run-level errors or warnings

Every imported post/reply should carry provenance data such as:

- `originPlatform = whatsapp`
- `waMessageKey`
- `waThreadKey`
- `relevanceScore`
- `threadConfidence`
- `medicalRisk` (stored as `"low"` by default in V1; classification deferred)

Product behavior:

- show a subtle `WhatsApp archive` badge on imported posts/replies
- expose the same indicator in retrieval citations

This requires explicit provenance fields on `Post` / `Reply` before
implementation. `ImportRun` is complementary run-level audit storage, not a
replacement for row-level provenance.

---

## Phase 8 — Idempotent Seed

The import must be safe to rerun.

Requirements:

- assign an `importRunId` to every execution
- lookup/create pseudonymous users by deterministic username
- lookup existing imported posts/replies by external WhatsApp keys before insert
- skip or upsert already-imported threads instead of duplicating them
- enqueue BullMQ jobs only for newly created or updated rows
- track per-thread progress such as `parsed`, `persisted`, and `enqueued`
- if DB writes succeed but queue enqueue fails, rerun should enqueue the missing
  jobs instead of recreating posts/replies

No blind reruns and no duplicate vector ingestion.

Low-confidence threads should not be written into user-visible `Post` / `Reply`
rows in V1. Keep them in a review artifact first, for example JSON or CSV output
grouped by `importRunId`. A private staging table can be added later if needed.

---

## Phase 9 — Pinecone Ingestion

Reuse the existing BullMQ workers for embedding and upsert, but ensure imported
records carry provenance metadata into Pinecone so retrieval can distinguish
WhatsApp archive content from native platform content.

No separate worker topology is needed for V1.

---

## Initial Test Ranges

Use these `_chat.txt` line ranges as the first import slices before attempting a
full-day run. All ranges below are inclusive and were chosen to align with full
message boundaries in the current export.

Atomic tests:

| Case | Line range | Goal | Expected outcome |
|------|------------|------|------------------|
| 1 | `27-37` | Unanswered symptom question | `1` post, `0` replies |
| 2 | `78-81` | Nutritionist request | `1` post, not merged into nearby side-effect discussion |
| 3 | `98-99` | Short-reply handling | `1` post and `1` short reply (`yes`) |
| 4+5 | `114-161` | Combined Zoladex thread (side effects + weight gain) | `1` post with `10` replies covering side effects, lived experience, doctor advice, and weight-gain subthread |
| 6 | `503-536` | Strong doctor + lived-experience thread | `1` high-confidence post with several replies |

Stress tests:

| Case | Line range | Goal | Expected outcome |
|------|------------|------|------------------|
| 7 | `68-87` | Overlapping thread window | At least `2` threads: Shweta side effects and nutritionist request should not merge |
| 8 | `460-471` | Concurrent-conversation stress test | `1` gym/swelling thread; Amita support chatter should not attach |

Negative-control slices:

| Case | Line range | Goal | Expected outcome |
|------|------------|------|------------------|
| N1 | `19-26` | Promo/ad filtering | No imported posts or replies |
| N2 | `100-106` | Devotional filtering | No imported posts or replies |

Recommended order:

1. Run atomic Cases `1`, `2`, `3`, and `4` first to validate the basic happy path.
2. Run atomic Cases `5` and `6` next to validate drift splitting and confidence scoring.
3. Run stress Cases `7` and `8` after that to validate overlap and concurrent-thread logic.
4. Only after those pass, run the full day of `24/10/25` as the next evaluation batch.

The full-day run is an evaluation step, not the first debugging step.

---

## Verification

1. Parse audit:
   total lines, parsed messages, dropped messages, parse failures
   stop the run if parse failures exceed `1%` of timestamped messages or if
   there are `10` consecutive malformed message starts
2. Data audit:
   created users, posts, replies, and skipped duplicates
3. Spot-check known threads from `_chat.txt`:
   for example the Zoladex discussion should import as one post with multiple
   replies rather than several unrelated posts
4. Score audit:
   review distributions for relevance score, topic overlap, reply counts,
   and thread confidence
5. Rerun the script against the same file and confirm zero duplicate inserts
6. End-to-end retrieval test:
   imported citations should visibly carry the `WhatsApp archive` indicator

---

## Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Input format | `_chat.txt` only | Keep V1 narrow and predictable |
| Attribution | Per-sender pseudonyms | Preserve privacy without collapsing all voices |
| Relevance scoring | Category-based scoring (unique semantic buckets, not unique list terms) | Prevents near-synonym inflation; "chemo" + "chemotherapy" = one signal |
| Scoring thresholds | `< 30` drop, `30-39` no attachment, `40-54` reply only, `>= 55` anchor | Graduated gates keep noise out of thread anchors without over-filtering replies |
| Topic overlap | 60% lexical Jaccard + 40% medical-category Jaccard | Medical synonyms (including romanized Hinglish) boost overlap without Devanagari support |
| Hinglish support | Romanized synonym map only; no Devanagari script in V1 | Sufficient for this group's bilingual chat style; Devanagari deferred |
| Language metadata | Detected via Hinglish marker words; stored in-process only | Useful for QA review and future tuning without a schema change |
| Thread anchors | Require `>= 55` relevance | Prevents low-signal questions from fragmenting the thread space |
| Reply attachment | Require `>= 35` relevance even at high topic overlap | Lowered from 40 to avoid dropping substantive replies that score 35-39 |
| Title generation | Prefer first question sentence; fall back to first clause | Anchor messages are usually questions; extracting the question gives a better title |
| Threading | Heuristic reconstruction with gap + blended topic overlap | Better than splitting on every question mark |
| Thread identity | `waThreadKey = anchor waMessageKey` | Stable reruns even if grouping heuristics evolve |
| Reply cap | Soft cap with stronger overlap requirement after threshold | Prevent oversized, low-cohesion imported threads |
| Confidence scoring | Structural thread-confidence score | Captures grouping quality independently of content safety |
| Medical risk | Deferred to post-V1; default `"low"` stored as placeholder | Scope decision — filtering and threading quality are the V1 priority |
| Provenance storage | Fields on `Post` / `Reply` + `ImportRun` table | Hot-path queries and rerun safety are simpler than a generic side table |
| Unanswered questions | Keep as posts | Valuable user problems should still be searchable |
| Low-confidence handling | Keep out of main forum tables in V1 | Avoid polluting user-visible content with weak reconstructions |
| Timestamps | Preserve original timestamps | Keep chronology and ranking intact |
| Provenance | Visible WhatsApp badge + metadata | Imported archive should not look native |
| Ingestion | Reuse existing BullMQ flow | Minimal new infrastructure |
| Sender-aware threading | +0.12 anchor author, +0.08 recent replier | Captures conversational flow; can't single-handedly push unrelated messages over threshold |
| Middle band tightening | Require extra signal (relevance, shared category, sender, or recency) | Prevents low-overlap messages from drifting into the wrong thread |
| Near-thread relaxation | Score 15-29 can attach within 30min if category match or sender match | Captures conversational replies that score low individually but belong to active discussion |
| Backward pass | Second pass over unattached messages against finalized threads within 3h | Catches delayed responses common in group chats |
| Side-effect density bonus | +6 for 2 hits, +12 for 3+ within side-effect category | Listing multiple symptoms should score higher than listing one |
| Shared medical check | Uses full `TERM_CATEGORIES`, not synonym-only `medicalCategorySet` | Synonym map is too small (10 entries); term categories cover all treatment/symptom terms |
