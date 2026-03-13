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
