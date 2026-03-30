# WhatsApp Chat Ingestion Pipeline

## Overview

One-off import of the HAC WhatsApp support group export (`_chat.txt`) into the
platform's post/reply model. The goal is to preserve high-signal support
conversations, protect participant identities, and clearly label imported
content as coming from WhatsApp.

Script location: `server/src/scripts/ingestWhatsApp.ts`
Run with: `pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts`

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
- Social media reel/link forwards (Instagram, YouTube, Facebook, Twitter) where
  the caption contains no medical terms — these are typically motivational or
  art-sharing posts that score misleadingly high on embedding cosine similarity
  to emotional support topics despite having no medical content

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
- store the numeric relevance score and `categoryHits` for later QA and provenance

Medical terms are grouped into semantic categories (treatment, scans, side
effects, symptoms, care, logistics, remedies). Scoring counts unique categories
hit, not unique list entries, so "chemo" and "chemotherapy" in the same message
count as one signal, not two.

**Word-boundary matching:** all medical term checks use `\b` word boundaries
(`matchesMedTerm`), not bare `includes()`. This prevents false positives such as
`"pain"` matching `"paintings"` or `"ache"` matching `"reached"`, which would
otherwise inflate `categoryHits` and push unrelated messages above the anchor
threshold.

**Supplementary embedding score:** cosine similarity against five reference
medical topics using the embeddings model. Adds up to 15 points for messages
that are semantically relevant but use no mapped keywords (e.g. Hinglish
messages with no synonymized terms). This is a supplementary signal only — it
cannot qualify a 0-reply post for auto-publish on its own; `categoryHits >= 1`
is required for that gate.

**Adaptive thresholds:** thresholds are computed per-run from the score
distribution of that day's messages (P40, P50, P60, P75 percentiles). This
prevents a low-activity day from using the same bars as a dense medical discussion
day, and avoids over-filtering quiet days or under-filtering noisy ones.

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

Goal: convert chat into forum-shaped threads using a hybrid of cheap heuristics
and selective LLM calls.

The LLM (Gemini 2.5 Flash) is used only in ambiguous overlap bands — it is never
called for clear attach or clear split decisions. Use `--no-llm` to disable LLM
calls and fall back to heuristic-only logic (useful for testing and when the
Gemini free-tier daily quota is exhausted).

**Rate limiting:** the Gemini free tier allows 5 RPM. A sliding-window rate
limiter tracks the last 5 call timestamps and waits before firing the next call
if the window hasn't cleared. Cache hits (same anchor + message body) bypass the
limiter entirely.

### Thread anchors

- medically relevant question-like messages
- support-seeking requests
- unanswered single-message questions, which still become posts

### Topic overlap

Compare each new message against the thread anchor and recent substantive replies
using a blended signal:

- **60% embedding cosine** (normalized from the `[0.75, 1.0]` range of
  `e5-base-v2` / `multilingual-e5-base`) — or lexical Jaccard fallback when
  embeddings are unavailable
- **40% medical-category Jaccard** — canonical medical terms matched via a
  synonym map that covers romanized Hinglish variants (e.g. `kimo` → `chemo`,
  `dard` → `pain`). Devanagari script is not supported in V1.

Hinglish detection shifts weights to 40% embedding / 60% medical Jaccard for
messages with Hinglish marker words, because `e5-base-v2` embeds transliterated
Hindi poorly.

### Overlap thresholds (adaptive)

- `>= 0.35` effective overlap: attach unconditionally (ATTACH)
- `< 0.20` effective overlap: split or discard (SPLIT)
- `0.20–0.35`: middle band — use LLM or additional heuristics

### SPLIT branch — pre-split LLM checks

The SPLIT threshold fires before the LLM path. Two categories of message are
routed through the LLM instead of auto-splitting, because the overlap metric
structurally fails them:

1. **Q-A back-references** — messages opening with `"I also had the same issue"`,
   `"same problem"`, etc. arrive with near-zero token overlap against a question
   they are directly answering. A heuristic fast-path detects these openers and
   attaches without an LLM call when the active thread has a recent open question.
   Remaining ambiguous answers to open questions go to the LLM.

2. **Deictic follow-ups** — short questions containing only deictic pronouns
   (`"How often this should be done?"`, `"Can Murabba be consumed??"`) carry no
   topic keywords of their own and always score near-zero overlap. If a recent
   active thread exists and the message has no independent medical terms, route
   through the LLM before splitting.

### Middle band

In the middle band (`0.20–0.35`):

- Gap > `GAP_NEW_THREAD_MS` + can anchor + independent → new thread
- Strong anchor candidate (score high, can anchor) → prefer new thread (A+E rule)
- Otherwise: doctor/sender fast-path if `bestEffective > 0.05` → attach directly
  (requires minimum overlap to prevent zero-overlap doctor messages from attaching
  across unrelated topics). Below that threshold → LLM.
- LLM pre-filter: skip the LLM for messages with no medical/care/remedy terms.

### Near-thread relaxation (RELAX path)

Messages below `MIN_RELEVANCE` can still attach to a very recently active thread
via any of: shared medical category, related medical category, or doctor sender.

Sender match alone attaches only when `score >= MIN_RELEVANCE`. This prevents
pure emotional filler (`"Everything will be fine"`) from attaching via authorship,
while still allowing a same-sender continuation that reaches the relevance floor.

### Multiple active threads

- Allow 2–3 active candidate threads in the same time window
- Attach a reply to the highest-overlap eligible thread
- Evict the weakest thread when the active pool is full

### Reply cap

- Soft cap of roughly 15 substantive replies per imported thread
- After the cap, only append replies with strong topic overlap (`>= 0.5` raw)
- Prevents one active WhatsApp day from collapsing into one oversized post

### Thread age

- Hard maximum reply window: 5 hours
- After 2 hours, a fresh question defaults to a new thread unless overlap is very strong

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

Thread confidence scoring determines structural publishability.

Confidence inputs:

- anchor relevance score (35%)
- average reply relevance score (25%)
- average topic overlap across replies (25%)
- substantive reply ratio (15%)
- +10 bonus if any reply is doctor-authored

**Publish gate:**

- `>= AUTO_PUBLISH_CONF`: auto-publish
- `>= QA_CONF`: import with manual QA flag
- `< QA_CONF`: skip

Both thresholds are adaptive (derived from the same per-day percentile
distribution as the relevance thresholds).

**0-reply exception:** unanswered questions auto-publish if:
- `anchor.relevanceScore >= ANCHOR_EXPERIENTIAL_SCORE`, AND
- `anchor.categoryHits >= 1` (at least one genuine keyword-matched medical
  category hit)

The `categoryHits` requirement guards against embedding-only anchors — art
appreciation comments, motivational quotes, and social forwards that score well
on cosine similarity to "emotional support" topics but contain no medical
terminology.

Medical risk classification is out of scope for V1. All imported posts and replies
carry `medicalRisk = "low"` as a default placeholder.

Title generation:

- remove greetings such as `Hello friends`
- if the anchor message contains a `?`, use the first question sentence as the title
- otherwise fall back to the first sentence or clause
- cap length at roughly 80 characters

Examples:

- `Hello friends ... loose motion after treatment?` →
  `Loose motion after treatment?`
- `is anyone on zoladex ... what are the side effects?` →
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

## Embeddings Model

Current: `intfloat/e5-base-v2` (English-only, 768 dims)

**Planned upgrade: `intfloat/multilingual-e5-base`**

- Same architecture and `"passage: "` / `"query: "` prefix convention — zero
  code changes except the model name in `server/src/infra/embeddings.ts`
- 768 dims — Pinecone index is compatible
- Confirmed on HuggingFace Inference API
- Materially better for transliterated Hindi / Hinglish messages

`e5-base-v2` is English-only and embeds Hinglish poorly, which weakens the 60%
embedding component of `topicOverlap` for mixed-language messages. The Hinglish
weight shift (40% embedding / 60% medical Jaccard) in `topicOverlap` is a
compensating heuristic, not a fix.

**Further upgrade (if available on HF Inference API):**
`l3cube-pune/hing-roberta-mixed` — trained on 52M sentences of real WhatsApp /
Twitter Hinglish, 768 dims, 12–15% F1 improvement on code-mixed tasks over
generic multilingual models.

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
| 4 | `114-143` | Clean Zoladex side-effects thread | `1` high-confidence post with multiple replies |
| 5 | `144-161` | Same-topic but distinct subthread | New post for Zoladex weight gain, separate from Case 4 |
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

Day-level tests completed:

| Date | Notes |
|------|-------|
| `03/11/25` | Mouth-care thread. Art message from Dr. Vineeta (`"Excellent Art really helps"`) was incorrectly attaching to mouth-care thread — fixed by requiring `bestEffective > 0.05` for doctor fast-path. |
| `06/11/25` | Exemestane/blood pressure thread. Dr. Arshi's answer was splitting into its own thread due to near-zero Q-A overlap — fixed by back-reference heuristic + LLM in SPLIT branch. Art/social messages (`07/11/25` art day) were anchoring via embedding-only score — fixed by word-boundary matching and `categoryHits >= 1` gate. |
| `07/11/25` | Art appreciation day. Both spurious threads eliminated by word-boundary fix and social URL filter. |
| `09/11/25` | High-density fasting + dry-mouth day. Deictic follow-up `"How often this should be done?"` was splitting into its own thread — fixed by `isDeictic` + LLM in SPLIT branch. Gemini free-tier daily quota (20 req/day) was exhausted; all LLM calls after that fell back to NO. |

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

## Known Issues / Deferred

**Duplicate resent messages:** WhatsApp users sometimes re-paste the same message
when it goes unnoticed. The first occurrence becomes a thread anchor; the second
(same sender + body, hours later) gets attached as a reply via `ov ≈ 0.6` with
itself. Fix when needed: add a post-filter dedup step after `filterNoise` that
drops same-sender + same-body messages within a ~3hr window (match on
`normalizedBody`, not `waMessageKey` which includes the timestamp).

**Gemini free-tier daily quota:** the free tier allows 20 requests/day total.
A dense day like `09/11/25` (70 messages) exhausts this quickly, causing all
subsequent LLM calls to fall back to NO. Use `--no-llm` when quota is low or
upgrade to a paid tier before full-day runs.

---

## Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Input format | `_chat.txt` only | Keep V1 narrow and predictable |
| Attribution | Per-sender pseudonyms | Preserve privacy without collapsing all voices |
| Relevance scoring | Category-based scoring (unique semantic buckets, not unique list terms) | Prevents near-synonym inflation; "chemo" + "chemotherapy" = one signal |
| Medical term matching | Word-boundary regex (`\bterm\b`) via `matchesMedTerm` | Bare `includes()` caused false positives — `"pain"` matched `"paintings"`, inflating `categoryHits` and pushing art messages above anchor threshold |
| Scoring thresholds | Adaptive per-day from P40/P50/P60/P75 | Fixed thresholds over-filter quiet days and under-filter dense ones |
| Topic overlap | 60% embedding cosine + 40% medical-category Jaccard | Blended signal handles keyword-sparse messages; Hinglish messages shift to 40/60 because e5-base-v2 embeds transliterated Hindi poorly |
| Embeddings model | `intfloat/e5-base-v2` → upgrade to `multilingual-e5-base` planned | Current model is English-only; multilingual-e5-base is a zero-friction upgrade (same dims, same prefix convention) with native Hindi support |
| Hinglish support | Romanized synonym map only; no Devanagari script in V1 | Sufficient for this group's bilingual chat style; Devanagari deferred |
| Language metadata | Detected via Hinglish marker words; stored in-process only | Useful for QA review and future tuning without a schema change |
| Thread reconstruction | Hybrid: cheap heuristics first, selective LLM for ambiguous band | Pure heuristics fail Q-A pairs and deictic references; LLM-first is too slow and burns rate-limited quota |
| LLM rate limiting | Sliding-window 5 RPM limiter (free tier constraint) | Prevents `429` errors mid-run; cache hits bypass the limiter |
| Doctor fast-path | Requires `bestEffective > 0.05` to skip LLM | Zero-overlap doctor messages (e.g. art comment inside a mouth-care thread) were attaching solely on sender prefix |
| Q-A back-reference heuristic | Detect openers like `"I also had same issue"` + recency → free attach | Q-A pairs have near-zero token overlap; LLM call is unnecessary when the back-reference pattern is unambiguous |
| Deictic follow-up detection | Short questions with `"this/it/that"` + no medical terms + recent thread → LLM | `"How often this should be done?"` has zero overlap with the fasting thread it follows; heuristic can't resolve it, LLM can |
| Social URL filter | Drop Instagram/YouTube/Facebook forwards with no medical caption content | Motivational reels and art-sharing links scored high on emotional support embedding similarity but had zero medical relevance |
| 0-reply publish gate | Require `categoryHits >= 1` for unanswered questions | Embedding-only anchors (art, motivational quotes) were auto-publishing via the 0-reply exception despite having no medical terminology |
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
