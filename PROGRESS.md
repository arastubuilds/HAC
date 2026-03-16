# Project Progress – Agentic Cancer Care Companion

This document tracks the development progress of the platform, organized by system components.

---

# 1. Core Backend Infrastructure

## Fastify API Server

* Fastify server initialized with `buildServer`
* Centralized error handler configured
* Modular route registration implemented

Routes currently available:

```
/health
/posts
```

Server capabilities:

* Request validation using **Zod**
* Central error handling
* Modular route architecture

---

# 2. Domain Layer

## Post Domain

Defined domain model for community posts.

```
domain/posts.ts
```

Core structure:

* id
* title
* content
* createdAt

This layer represents the core community knowledge entity.

---

# 3. API Layer

## Controllers

### Posts Controller

Implemented handlers for:

```
POST   /posts
PUT    /posts/:postId
DELETE /posts/:postId
```

Responsibilities:

* Request validation (Zod DTOs)
* Response formatting
* Delegation to services

DTOs defined in:

```
api/dtos/posts.dto.ts
```

---

# 4. Application Services

## Post Service

Handles core application logic for community posts.

Capabilities:

### Create Post

```
createPost()
```

Actions:

* Insert post into database
* Enqueue ingestion job

### Update Post

```
updatePost()
```

Actions:

* Update post in database
* Trigger re-ingestion

### Delete Post

```
deletePost()
```

Actions:

* Delete database record
* Remove vectors from Pinecone

---

# 5. Infrastructure Layer

Infrastructure adapters for external systems.

Location:

```
infra/
```

Implemented modules:

### Database

```
prisma.ts
```

### Redis

```
redis.ts
```

### Pinecone

```
pinecone.ts
```

### Embeddings

```
embeddings.ts
```

Embedding model is used for:

* document ingestion
* query embedding

---

# 6. Queue System

Implemented with **BullMQ**.

Location:

```
queues/postIngest.queue.ts
```

Queue responsibilities:

* asynchronous embedding generation
* retry handling
* exponential backoff
* background ingestion

Job payload:

```
{
  type: "create" | "update" | "delete",
  postId: string
}
```

---

# 7. Background Workers

Location:

```
workers/postIngest.worker.ts
```

Worker responsibilities:

### Create

* fetch post
* generate embeddings
* upsert vectors into Pinecone

### Update

* delete existing vectors
* regenerate embeddings

### Delete

* remove vectors from Pinecone

Concurrency:

```
5 parallel jobs
```

Worker lifecycle logging implemented:

* completed
* failed

---

# 8. Embedding & Ingestion Pipeline

Location:

```
services/ingest.service.ts
```

Pipeline steps:

```
Text
↓
Document splitter
↓
Embedding generation
↓
Vector creation
↓
Pinecone upsert
```

Vector format:

```
id: `${postId}_${chunkIndex}`
metadata:
  source
  postId
  createdAt
  chunkIndex
  text
```

Deletion uses Pinecone metadata filtering:

```
filter: { postId: { $eq: postId } }
```

---

# 9. AI Layer

Location:

```
ai/
```

The AI layer is designed to support **multiple agents in the future**.

Current focus: **retrieval infrastructure**.

---

# 10. Retrieval System

Location:

```
ai/retrieval/
```

Architecture:

```
Query
↓
RetrievalManager
↓
Retrievers
↓
Ranking
↓
Context Builder
↓
LLM
```

---

# 11. Retriever Interface

Defined common interface:

```
Retriever
```

Method:

```
retrieve(query) → RetrievalChunk[]
```

Ensures all knowledge sources follow the same contract.

---

# 12. Community Retriever

File:

```
community.retriever.ts
```

Capabilities:

* query embedding generation
* Pinecone vector search
* metadata sanitization
* conversion to `RetrievalChunk`

Namespace:

```
community
```

---

# 13. Medical Retriever

File:

```
medical.retriever.ts
```

Capabilities:

* vector search against medical namespace
* metadata parsing
* conversion to unified retrieval format

Namespace:

```
medical
```

---

# 14. Retrieval Manager

File:

```
retrieval.manager.ts
```

Responsibilities:

* orchestrate retrievers
* run parallel retrieval
* merge results

Routing options:

```
community
medical
both
```

Parallel retrieval implemented using:

```
Promise.all()
```

---

# 15. Retrieval Types

Defined shared type:

```
RetrievalChunk
```

Structure:

```
text
source
documentId
title
createdAt
chunkIndex
score
metadata
```

This unified structure enables:

* ranking
* context building
* citation generation

---

# 16. Ranking Layer

File:

```
ranking/result.ranker.ts
```

Ranking formula:

```
finalScore =
  similarityScore
  × sourceWeight
  × recencyFactor
```

Source weights:

```
medical   = 1.0
community = 0.85
```

Additional logic:

* community recency decay
* document deduplication
* top-K selection

Result:

```
1 chunk per document
max 8 results
```

---

# 17. Context Builder

File:

```
context/context.builder.ts
```

Responsibilities:

* separate medical vs community sources
* assign citation numbers
* format structured context

Output format:

```
Medical Information
[1] Source
text

Community Experiences
[2] Source
text
```

Returns:

```
{
  context: string
  citations: Citation[]
}
```

---

# 18. Citation System

Defined citation structure:

```
Citation
```

Fields:

```
index
source
documentId
title
```

This enables:

* traceable evidence
* UI source linking
* grounded LLM responses

---

# 19. Current Retrieval Pipeline

```
User Query
↓
Router (planned)
↓
RetrievalManager
↓
CommunityRetriever / MedicalRetriever
↓
ResultRanker
↓
ContextBuilder
↓
LLM
```

---

# 20. Retrieval Module Restructuring

The flat retrieval files (`retrieval.manager.ts`, `retrieval.types.ts`) were deleted and replaced with a proper directory structure:

```
ai/retrieval/
  types/
    retrieval.types.ts    — RetrievalChunk, RetrievalSource, RetrievalRoute
    citation.types.ts     — Citation
    context.types.ts      — RetrievalContext
  retrievers/
    retriever.interface.ts
    community.retriever.ts
    medical.retriever.ts
    retrieval.manager.ts  — orchestrates both retrievers
  ranking/
    result.ranker.ts
  context/
    contexBuilder.ts
  debug/
    retrieval.debug.ts
  utils/
    metadata.ts
```

---

# 21. Agent Graph — Bug Fixes & Consolidation

**File:** `src/ai/agents/query_support/graph.ts`

Fixed the broken method chain and consolidated three separate retrieval nodes (`retrieveCommunity`, `retrieveMedical`, `fanOutRetrieval`) into a single `retrieveContextNode`.

Final graph wiring:

```
START
↓
extractQuery
↓
decideIntent
↓ (conditional)
retrieveContext  ← community_only / medical_only / community_and_medical
generateAnswer   ← no_retrieval (direct)
↓
END
```

Also fixed a stray semicolon in `nodes.ts` that was breaking the `generateAnswerNode`.

---

# 22. `retrieveContextNode` — Full Retrieval Pipeline in One Node

**File:** `src/ai/agents/query_support/nodes.ts`

Implemented `retrieveContextNode` as the single retrieval entry point in the graph. It:

1. Reads `query` and `route` from state
2. Calls `RetrievalManager.retrieve(query, route)`
3. Passes results through `rankChunks()`
4. Builds structured context + citations via `buildContext()`
5. Calls `inspectRetrieval()` for debug logging
6. Returns `retrievedChunks`, `context`, `citations` to state

---

# 23. Context Builder — Conditional Sections

**File:** `src/ai/retrieval/context/contexBuilder.ts`

Built the context builder. Separates chunks by source, assigns sequential citation indices, and formats them into labeled sections. Empty sections are omitted — if only one source type returned results, only that section appears in the prompt.

Output format:

```
Medical Information:

[1] Source Title
chunk text

Community Information:

[2] Source Title
chunk text
```

Returns `{ context: string, citations: Citation[] }`.

---

# 24. Query API — `POST /query`

Wired the agent into the REST API.

**New files:**

```
src/api/dtos/query.dto.ts          — Zod schema: { message: string }
src/api/routes/query.route.ts      — registers POST /query
src/api/controllers/query.controller.ts
```

**Controller behavior:**

* Validates body with `QueryRequestDTO`
* Invokes `cancerSupportAgent.invoke({ messages: [HumanMessage] })`
* Returns `{ answer, citations, riskLevel, llmCalls }`

**`src/server.ts`** updated to register `/query` alongside `/posts` and `/health`.

Routes now available:

```
/health
/posts
/query
```

---

# 26. Auth System — JWT + User Model

Added full email/password authentication with JWT and ownership enforcement on post mutations.

**New files:**

```
src/domain/users.ts                    — User, CreateUserInput types
src/api/dtos/auth.dto.ts              — RegisterDTO, LoginDTO, AuthResponse
src/services/auth.service.ts          — registerUser (bcrypt, 12 rounds), verifyCredentials
src/api/controllers/auth.controller.ts — register → 201/409, login → 200/401
src/api/routes/auth.route.ts          — POST /auth/register, POST /auth/login
src/plugins/jwt.plugin.ts             — @fastify/jwt wrapped with fastify-plugin
src/api/middleware/authenticate.ts    — preHandler: jwtVerify → 401 on failure
src/types/fastify-jwt.d.ts            — JWT payload augmentation { sub, email }
```

**Schema changes (`prisma/schema.prisma`):**

* Added `User` model with `id`, `email`, `passwordHash`, `createdAt`
* Added `userId` (non-nullable FK) to `Post` with `@@index([userId])`
* Migration: `20260313165830_add_user_auth`

**Ownership enforcement:**

* `updatePost` and `deletePost` now fetch `userId` first, throw `FORBIDDEN` if mismatch
* Controller maps `FORBIDDEN` → 403, `POST_NOT_FOUND` → 404

**Route auth matrix:**

```
POST   /auth/register     — public
POST   /auth/login        — public
GET    /posts             — public
GET    /posts/:postId     — public
POST   /posts             — JWT required
PUT    /posts/:postId     — JWT + owner
DELETE /posts/:postId     — JWT + owner
POST   /query             — JWT required
```

---

# 27. Auth Integration Tests — `src/test.ts`

Added a self-contained test script covering the full auth loop using Node's built-in `assert/strict` and Fastify `inject()` (no test framework).

**Run:** `tsx src/test.ts` (requires Postgres; no Redis dependency — inline protected route avoids the posts service import chain)

9 tests:

```
✓ Register success                (201 + token + user.id)
✓ Register duplicate email        (409)
✓ Register duplicate username     (409)
✓ Register invalid input          (400)
✓ Login success                   (200 + token)
✓ Login wrong password            (401)
✓ Login unknown email             (401)
✓ Protected route — no token      (401)
✓ Protected route — valid token   (200)
```

Test user is deleted from the DB after every run.

---

# 28. Query Rewriting — `rewriteQueryNode` Wired Into Graph

**Files:** `src/ai/agents/query_support/graph.ts`, `nodes.ts`

`rewriteQueryNode` was already implemented but never connected. It is now inserted between `extractQuery` and `decideIntent`:

```
extractQuery → rewriteQuery → decideIntent → retrieveContext → generateAnswer
```

`retrieveContextNode` now uses `searchQuery ?? query` for Pinecone lookup — retrieval uses the LLM-optimised search terms while intent classification and answer generation still operate on the original user phrasing.

---

# 29. Citation Title Bug Fix

**Files:** `src/services/ingest.service.ts`, `src/workers/postIngest.worker.ts`

Post titles were embedded inside the ingestion text body but never stored as a separate Pinecone metadata field. At retrieval time `match.metadata?.title` was always `undefined`, causing `contexBuilder.ts` to default `Citation.title` to `""`.

**Fix:** Added `title?: string` to `IngestMetadata` and passed `title: post.title` in the `ingestText()` call. The `...metadata` spread in `ingest.service.ts` automatically writes it to every Pinecone record.

Existing vectors must be re-ingested (trigger an update on each post) to backfill the title metadata.

---

# 30. Reply Pipeline

Added full reply CRUD with async vector ingestion into the `community` Pinecone namespace alongside posts.

**Schema:** `Reply` model in `prisma/schema.prisma` — `id`, `postId` (FK → Post), `userId` (FK → User), `content`, `createdAt`. Index on `postId`.

**New files:**

```
src/domain/replies.ts                  — Reply type
src/api/dtos/replies.dto.ts            — CreateReplyDTO, ListRepliesQuery
src/services/replies.service.ts        — createReply, listReplies, deleteReply
src/api/controllers/replies.controller.ts
src/api/routes/replies.route.ts        — nested under /posts/:postId/replies
src/queues/replyIngest.queue.ts        — BullMQ queue (replyIngest)
src/workers/replyIngest.worker.ts      — create: embed + upsert; delete: filter-delete
```

Routes:

```
POST   /posts/:postId/replies          — JWT required
GET    /posts/:postId/replies          — public (paginated)
DELETE /posts/:postId/replies/:replyId — JWT + owner
```

Pinecone vectors for replies use metadata: `type: "reply"`, `replyId`, `postId`, `content`, `createdAt`. Stored in the `community` namespace.

---

# 31. RetrievalType — Separate Source from Content Type

Introduced `RetrievalType = "post" | "reply"` to decouple content-type from namespace origin.

**Changes:**

- `RetrievalSource` reverted to `"community" | "medical"` — replies are community content, not a separate source
- `RetrievalType` added to `retrieval.types.ts`; `type?: RetrievalType` field on `RetrievalChunk`
- `Citation.source` reverted to `"community" | "medical"`
- `CommunityRetriever` sets `source: "community"` always; `type: isReply ? "reply" : "post"` from Pinecone metadata
- Ranker split into `SOURCE_WEIGHT` (`medical: 1.1`, `community: 1.0`) and `TYPE_WEIGHT` (`post: 0.85`, `reply: 0.90`); type weight only applies to community chunks
- Context builder filter simplified to `chunk.source === "community"` — no `|| "reply"` hack needed

---

# 32. Thread Expansion Pipeline

When the retriever returns reply chunks, the agent now fetches the full thread context from Postgres and rebuilds the context with enriched thread blocks.

**New file:** `src/ai/retrieval/threads/threadFetcher.ts`

`fetchThreads(replyChunks)`:
1. Groups reply chunks by `parentPostId`, tracks matched `replyId`s
2. Sorts by match count desc, caps at 3 threads
3. Parallel Prisma fetch — post + up to 10 replies per thread
4. Returns `ThreadContext[]` with each reply flagged `isMatched: true/false`

**New types** in `retrieval.types.ts`: `ThreadReply`, `ThreadContext`

**New node** in `nodes.ts`: `expandThreadsNode`
- Filters `retrievedChunks` for reply chunks
- If any exist, calls `fetchThreads` then `buildContextWithThreads`
- Overwrites `context` and `citations` in agent state
- No-ops (returns `{}`) when no reply chunks are present

**Graph wiring** (`graph.ts`):
```
extractQuery → rewriteQuery → decideIntent → retrieveContext → expandThreads → generateAnswer
```

**`buildContextWithThreads`** in `contextBuilder.ts`:
- Keeps non-expanded post/reply chunks in regular `SOURCE [N]` blocks
- Adds `THREAD [N]` blocks showing full post content + all replies, with `** MATCHED **` markers on retrieved replies
- Reply chunks whose `parentPostId` was expanded are excluded from the regular section (no duplication)

---

# 33. Citation Metadata Enrichment — Reply Fields in API Response

Enriched the `Citation` type and both context-builder paths so reply-specific data surfaces in the `POST /query` response.

**`src/ai/retrieval/types/citation.types.ts`:**

```ts
type Citation = {
    index: number
    source: "community" | "medical"
    documentId: string
    title?: string
    type?: "post" | "reply"
    snippet?: string          // first 120 chars of chunk text
    parentPostId?: string     // only when type === "reply"
}
```

**`buildSection`** (both `buildContext` and `buildContextWithThreads`): populates `type`, `snippet`, and `parentPostId` for every chunk citation.

**Thread loop in `buildContextWithThreads`**: no longer emits a post-level citation with a nested `matchedReplies` array. Instead, each matched reply inside the thread becomes its own top-level citation (`type: "reply"`, `documentId: replyId`, `parentPostId`, `snippet`). The parent post is already covered by its own chunk citation from the regular section.

**`src/api/dtos/query.dto.ts`**: `QueryResponse.citations` widened to include `type`, `snippet`, `parentPostId`.

---

# 34. SSE Streaming — `POST /query`

**Files:** `src/api/controllers/query.controller.ts`, `src/api/dtos/query.dto.ts`, `src/ai/agents/query_support/nodes.ts`

Replaced the synchronous `cancerSupportAgent.invoke()` response with a full Server-Sent Events stream. The endpoint now hijacks the Fastify reply, sets `Content-Type: text/event-stream`, and streams JSON-encoded events as the agent progresses.

**Stream event types** (defined in `query.dto.ts`):

```ts
{ type: "status"; stage: string }          // pipeline stage progress
{ type: "token";  content: string }        // streamed answer token
{ type: "done";   citations; riskLevel; llmCalls }  // final metadata
{ type: "error";  message: string }        // agent failure
```

**Node-level changes (`nodes.ts`):**

All five nodes now accept `LangGraphRunnableConfig` as a second argument and call `config.writer?.()` to emit status events at the start of each stage:

```
rewriteQuery      → { event: "status", data: { stage: "rewriting" } }
decideIntent      → { event: "status", data: { stage: "deciding_intent" } }
retrieveContext   → { event: "status", data: { stage: "retrieving" } }
expandThreads     → { event: "status", data: { stage: "expanding_threads" } }
generateAnswer    → { event: "status", data: { stage: "generating" } }
```

`generateAnswerNode` switched from `llm.invoke()` to `llm.stream()`, emitting each token as `{ event: "answer_token", data: { token } }`.

**Controller** uses `cancerSupportAgent.stream()` with `streamMode: ["custom", "values"]` — `"custom"` chunks carry node events; `"values"` chunks capture the latest full state. Final `done` event is assembled from `lastState` after the loop.

---

# 35. Error Resilience — try/catch Throughout

All previously unguarded async operations now have explicit error handling with sensible fallbacks so a single failure doesn't crash the request.

| Location | Failure | Fallback |
|---|---|---|
| `rewriteQueryNode` | LLM call | use original `query` as `searchQuery` |
| `decideIntentAndRetrievalNode` | LLM/parse | `route: "both"`, `riskLevel: "low"` |
| `generateAnswerNode` | LLM stream | static sorry message |
| `expandThreadsNode` | DB fetch | return `{}` (no-op) |
| `RetrievalManager.retrieve()` | retriever | return `[]` per source |
| `fetchThreads` | per-thread Prisma | `null` (filtered out) |
| `ingest.service.ts` | split / embed / upsert | distinct error message thrown |
| `ingest.service.ts` (delete) | post/reply filter-delete | distinct error message thrown |

`contextBuilder.ts`: type field now spread conditionally (`...(chunk.type !== undefined && { type: chunk.type })`) to satisfy `exactOptionalPropertyTypes`.

---

# 25. Posts API — Read Endpoints

**Files modified:**

```
src/services/posts.service.ts
src/api/controllers/posts.controller.ts
src/api/routes/posts.route.ts
```

Added:

### `listPosts(page, limit)`

* Fetches paginated posts ordered by `createdAt` desc
* Returns `{ posts, total }`

### `getPost(postId)`

* Fetches single post by ID
* Returns `null` if not found (controller returns 404)

Routes:

```
GET /posts            — paginated list (query params: page, limit)
GET /posts/:postId    — single post by ID
```

---
