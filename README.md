## Zagoal Recommendation Backend

Node.js + TypeScript + NestJS backend for a vendor recommendation system, with Prisma + Postgres, vector-style embeddings, and a hybrid recommendation engine (content-based + behavior).

This backend is designed to power a future Expo mobile app.

---

## Stack & Architecture

- **Runtime**: Node 20, TypeScript, NestJS.
- **Database**: Postgres via Docker (`postgres:15-alpine`) and Prisma ORM.
- **Embeddings**:
  - In Docker: **mock, deterministic embeddings** (no heavy ML download).
  - Locally (optional): real `sentence-transformers` (`all-MiniLM-L6-v2`) via Python helper.
- **Validation**: Zod (for request DTOs).
- **Docs**: Swagger UI at `http://localhost:3000/api`.

Code is modular:

- `src/vendors` – Vendor CRUD + embedding generation.
- `src/users` – User CRUD, traits, behaviorPreferences, embeddings.
- `src/interactions` – Likes/dislikes between users and vendors.
- `src/recommendations` – Recommendation engine + debug endpoints.
- `embeddings/generate_embedding.py` – Python helper for embeddings (mock + real modes).

---

## Running the Project (Docker)

Requirements:

- Docker Desktop running (on Windows/macOS).

Commands (from repo root):

```bash
docker compose up --build
```

What this does:

1. Builds the `backend` image.
2. Starts Postgres (`db` service).
3. In `backend`:
   - Runs `npx prisma migrate deploy`.
   - Runs `npx prisma db seed` (creates sample vendors, users, interactions, embeddings).
   - Starts the NestJS app (`node dist/main.js`).

Key URLs:

- API base: `http://localhost:3000`
- Swagger docs: `http://localhost:3000/api`

> Note: In Docker, embeddings run in **mock mode** (controlled via `EMBEDDINGS_MODE=mock`) to keep images light and startup fast.

---

## Data Models (Prisma)

### Vendor

Key fields:

- `id`, `name`, `description`.
- **Service traits** (1–5):
  - `serviceQuality`, `interactionStyle`, `serviceConduct`, `expertise`,
  - `environment`, `atmosphere`, `design`, `hospitality`,
  - `outcomeQuality`, `waitingTime`, `physicalElements`, `experienceTone`.
- `embedding: Float[]` – vector representation of this vendor.
- `interactions: Interaction[]`.

### User

Key fields:

- `id`, `name`.
- **Personality traits** (1–5):
  - `adventurous`, `decisive`, `eccentric`, `flexible`,
  - `loyal`, `optimistic`, `patient`, `perfectionist`, `punctual`.
- `embedding: Float[]`.
- `behaviorPreferences: Json?` – structured behavior model:
  - `notes?: string`
  - `recentPattern?: string`
  - `vendorTraitWeights?: { serviceQuality?: number; waitingTime?: number; ... }` (0–1 weights per vendor trait).
- `isTestUser: boolean` – special user for behavior/trait experiments.
- `interactions: Interaction[]`.

### Interaction

- `userId`, `vendorId`.
- `liked: boolean` – like / dislike.
- `score?: number` – optional 1–5 strength/rating.
- Unique per pair: `@@unique([userId, vendorId])`.

---

## Embeddings: How They Work

Embeddings are how we turn **traits + behavior preferences** into a numeric vector so we can compare users and vendors.

### 1. Embedding generation flow

#### Vendors

When you `POST /vendors`, the backend:

1. Validates traits with Zod.
2. Constructs a descriptive prompt:

   ```text
   Vendor: Luminous Lounge
   Description: Sample vendor...
   Traits:
   Service Quality: 4
   Interaction Style: 3
   ...
   ```

3. Calls `EmbeddingsService.generateEmbedding(prompt)`.
4. Saves `embedding` (numeric array) into the `Vendor.embedding` field.

#### Users

When you `POST /users` or update traits/behavior:

1. Builds a prompt:

   ```text
   User: Adventurous Alex
   Personality traits:
   Adventurous: 5
   Decisive: 4
   ...
   Behavior preferences: { "likesAdventurousVendors": true }
   ```

2. Calls `EmbeddingsService.generateEmbedding(prompt)`.
3. Saves `User.embedding`.

When you **update only behaviorPreferences** via `PATCH /users/:id/behavior`, the prompt is rebuilt **keeping traits constant** but with the new behavior preferences, and the embedding is recomputed.

### 2. Mock vs real embeddings

The Python helper is `embeddings/generate_embedding.py`.

- It reads raw text from stdin.
- Checks `EMBEDDINGS_MODE`:

  - `mock` (default in Docker):
    - Uses a **hash-based mock**:
      - SHA-256 of the text.
      - Expands/trims to a fixed dimension (32).
      - Normalizes bytes to [0, 1].
    - Deterministic – same input, same vector.
    - Very fast, no external downloads.

  - `real` (optional, local dev):
    - Imports `sentence_transformers.SentenceTransformer`.
    - Loads model `"all-MiniLM-L6-v2"`.
    - Calls `model.encode(text, normalize_embeddings=True)`.
    - Produces a higher-dimensional semantic embedding.

If real mode fails (missing libs), the script falls back to the mock embedding so the system remains robust.

### 3. Cosine similarity

We compare two vectors `a` and `b` using cosine similarity:

\[
\text{cosineSimilarity}(a, b) = \frac{a \cdot b}{\|a\| \cdot \|b\|}
\]

This is implemented in `src/common/vector.utils.ts` and is used to compute:

- **embeddingScore**: similarity between user and vendor embeddings.
- **traitScore**: similarity between normalized user trait vector and vendor trait vector.

---

## Recommendation Engine – Detailed

Endpoint:

- `GET /recommendations/:userId`
  - Query:
    - `testMode?: boolean` (`true` / `false`)
    - `adjustments?: string` (JSON-encoded).

Debug endpoint:

- `GET /debug/recommendations/:userId`
  - Same query, but returns extra debug info (trait vectors, embedding length, adjustments).

### 1. Inputs and adjustments

For a given `userId`:

1. Load the user with interactions.
2. Optionally parse `adjustments` (Zod schema), supporting:

   - **Personality overrides** (capitalized keys):

     ```json
     {
       "Adventurous": 5,
       "Decisive": 4,
       "Eccentric": 2,
       "Flexible": 4,
       "Loyal": 3,
       "Optimistic": 5,
       "Patient": 3,
       "Perfectionist": 1,
       "Punctual": 4
     }
     ```

   - **Weight tuning**:

     ```json
     {
       "embeddingWeight": 0.6,
       "traitWeight": 0.2,
       "behaviorWeight": 0.2
     }
     ```

   - **Behavior preferences override**:

     ```json
     {
       "behaviorPreferences": {
         "notes": "Temporary scenario",
         "vendorTraitWeights": {
           "waitingTime": 1.0,
           "serviceQuality": 0.9
         }
       }
     }
     ```

3. Build **effective traits**:

   ```ts
   const traits = {
     adventurous: adjustments?.Adventurous ?? user.adventurous,
     decisive: adjustments?.Decisive ?? user.decisive,
     ...
   };
   ```

4. Build **weights** and normalize:

   ```ts
   const weights = {
     embedding: adjustments?.embeddingWeight ?? 0.5,
     traits: adjustments?.traitWeight ?? 0.3,
     behavior: adjustments?.behaviorWeight ?? 0.2,
   };

   const sum = weights.embedding + weights.traits + weights.behavior || 1;
   const normalized = {
     embedding: weights.embedding / sum,
     traits: weights.traits / sum,
     behavior: weights.behavior / sum,
   };
   ```

5. Determine **behaviorPreferences** for this call:

   ```ts
   const behaviorPreferences = adjustments?.behaviorPreferences ?? user.behaviorPreferences ?? undefined;
   ```

### 2. User embedding (testMode vs baseline)

- By default, we start from the saved `user.embedding`.
- If `testMode === true` **or** adjustments are provided:
  - We rebuild the user prompt from **adjusted traits + behaviorPreferences**.
  - Generate a **new embedding** via the embedding service.
  - That embedding is used only for this recommendations call.

This enables interactive “what if I changed my personality/behavior” experiments without mutating the DB.

### 3. Trait vectors

- **User trait vector** (9D):

  \[
  [\text{adventurous}, \text{decisive}, \text{eccentric}, \text{flexible}, \text{loyal}, \text{optimistic}, \text{patient}, \text{perfectionist}, \text{punctual}]
  \]

- **Vendor trait vector** (12D):

  \[
  [\text{serviceQuality}, \text{interactionStyle}, \text{serviceConduct}, \text{expertise}, \text{environment}, \text{atmosphere}, \text{design}, \text{hospitality}, \text{outcomeQuality}, \text{waitingTime}, \text{physicalElements}, \text{experienceTone}]
  \]

Trait similarity:

1. Normalize each vector by its max value (so scores are in [0, 1]).
2. Use cosine similarity:

   \[
   \text{traitScore} = \cos(\text{normalizedUserTraits}, \text{normalizedVendorTraits})
   \]

### 4. Behavior-based score (collaborative filtering–style)

We look at:

- The user’s **own interactions**: list of `(vendorId, liked, score?)`.
- **Vendors they liked**: subset of those with `liked = true`.
- For each candidate vendor:

1. **Direct interaction**:

   ```ts
   const interaction = userInteractions.find(i => i.vendorId === vendor.id);
   let directScore = 0;
   if (interaction) {
     directScore = interaction.liked ? 1 : 0;
   }
   ```

2. **Similarity to liked vendors**:

   ```ts
   const likedVendors = userInteractions.filter(i => i.liked);
   let similarityAggregate = 0;
   if (likedVendors.length > 0) {
     let total = 0;
     for (const liked of likedVendors) {
       const likedVector = likedVendorsTraitMap.get(liked.vendorId);
       if (!likedVector) continue;
       total += computeTraitSimilarity(vendorTraitVector, likedVector);
     }
     similarityAggregate = total / likedVendors.length;
   }
   ```

3. **Behavior score**:

   ```ts
   const behaviorScore = 0.6 * directScore + 0.4 * similarityAggregate;
   ```

Interpretation:

- **Direct preferences** dominate (60% of behaviorScore).
- We add a softer term (40%) for “looks like things you liked,” which approximates collaborative filtering using traits.

### 5. Final score

For each vendor:

1. Compute:

   ```ts
   const embeddingScore = cosineSimilarity(userEmbedding, vendor.embedding);
   const traitScore = computeTraitSimilarity(userTraitVector, vendorTraitVector);
   const behaviorScore = computeBehaviorScoreForVendor(...);
   ```

2. Weighted sum:

   \[
   \text{finalScore} =
   w_{\text{embedding}} \cdot \text{embeddingScore} +
   w_{\text{traits}} \cdot \text{traitScore} +
   w_{\text{behavior}} \cdot \text{behaviorScore}
   \]

3. Sort vendors by `finalScore` descending and return:

   ```json
   {
     "user": {
       "id": 10,
       "name": "Test Toggle User",
       "traits": { ... effective traits ... },
       "behaviorPreferences": { ... },
       "weights": { "embedding": 0.5, "traits": 0.3, "behavior": 0.2 },
       "testMode": false | true
     },
     "recommendations": [
       {
         "vendor": { ... full vendor data ... },
         "scores": {
           "embeddingScore": 0.68,
           "traitScore": 0.12,
           "behaviorScore": 0.95,
           "finalScore": 0.63
         }
       },
       ...
     ]
   }
   ```

In debug mode (`GET /debug/recommendations/:id`), you also get:

- `user.debug.userTraitVector`
- `user.debug.userEmbeddingLength`
- `recommendations[i].debug.vendorTraitVector`
- Parsed `adjustments` for transparency.

### 6. Intuition & worked example (Adventurous Alex)

This section explains the same logic with a real example from the seeded data.

#### Example user: Adventurous Alex (user id 6)

Traits:

```json
{
  "adventurous": 5,
  "decisive": 4,
  "eccentric": 3,
  "flexible": 4,
  "loyal": 3,
  "optimistic": 5,
  "patient": 2,
  "perfectionist": 2,
  "punctual": 3
}
```

Trait vector:

```text
[5, 4, 3, 4, 3, 5, 2, 2, 3]
```

Behavior preferences:

```json
{ "likesAdventurousVendors": true }
```

He has interactions like:

```json
[
  { "userId": 6, "vendorId": 11, "liked": true,  "score": 5 },
  { "userId": 6, "vendorId": 14, "liked": true,  "score": 4 },
  { "userId": 6, "vendorId": 16, "liked": false, "score": 2 }
]
```

#### Example vendor: Artisan Hub (vendor id 14)

Traits:

```json
{
  "serviceQuality": 2,
  "interactionStyle": 1,
  "serviceConduct": 3,
  "expertise": 4,
  "environment": 2,
  "atmosphere": 2,
  "design": 3,
  "hospitality": 5,
  "outcomeQuality": 2,
  "waitingTime": 2,
  "physicalElements": 2,
  "experienceTone": 5
}
```

Vendor trait vector:

```text
[2, 1, 3, 4, 2, 2, 3, 5, 2, 2, 2, 5]
```

#### User & vendor prompts used for embeddings (debug)

In `GET /debug/recommendations/6`, you can see the actual prompts:

- User prompt (simplified):

  ```text
  User: Adventurous Alex
  Personality traits:
  Adventurous: 5
  Decisive: 4
  Eccentric: 3
  Flexible: 4
  Loyal: 3
  Optimistic: 5
  Patient: 2
  Perfectionist: 2
  Punctual: 3
  Behavior preferences: {"likesAdventurousVendors":true}
  ```

- Vendor prompt:

  ```text
  Vendor: Artisan Hub
  Description: Sample vendor with varied service traits.
  Traits:
  Service Quality: 2
  Interaction Style: 1
  Service Conduct: 3
  Expertise: 4
  Environment: 2
  Atmosphere: 2
  Design: 3
  Hospitality: 5
  Outcome Quality: 2
  Waiting Time: 2
  Physical Elements: 2
  Experience Tone: 5
  ```

These prompts are what the embedding script receives as input.

#### The scores the engine computes (real values)

For user 6 and vendor 14, from debug:

```json
"scores": {
  "embeddingScore": 0.8564239081429189,
  "traitScore": 0,
  "behaviorScore": 0.9769492547847165,
  "finalScore": 0.6236018050284028
}
```

How these are built:

- **Embedding score (0.8564)**:
  - Compare `user.embedding` vs `vendor.embedding` using cosine similarity.
  - This reflects overall semantic match between “Adventurous Alex + likes adventurous vendors” and “Artisan Hub’s traits”.
- **Trait score (0)**:
  - Compare user trait vector vs vendor trait vector after normalization.
  - In this particular pair, this contribution is extremely small / negligible, so it shows as 0.
- **Behavior score (≈ 0.977)**:
  - Alex has `liked: true` for vendor 14, so `directScore = 1`.
  - Vendor 14 also looks similar (by traits) to other vendors Alex liked.
  - Combine those into `behaviorScore = 0.6 * directScore + 0.4 * similarityToLiked`.

Then we combine:

```text
finalScore
  = 0.5 * embeddingScore
  + 0.3 * traitScore
  + 0.2 * behaviorScore

≈ 0.5 * 0.8564
  + 0.3 * 0
  + 0.2 * 0.9769

≈ 0.6236
```

So “Artisan Hub” floats to the top of Alex’s recommendation list because:

- The embedding system thinks the user and vendor descriptions “feel” similar.
- Alex explicitly liked this vendor, and it resembles other things he liked.
- Even though raw trait similarity (as we’ve currently defined it) doesn’t add much for this pair, embeddings + behavior carry it.

### 7. How user and vendor embeddings live in the same space

Even though users and vendors are described with **different traits**, they are turned into text and fed into the **same embedding function**:

- User text: includes “Personality traits”, “Behavior preferences”, etc.
- Vendor text: includes “Traits: Service Quality, Atmosphere, Waiting Time…”

The embedding model (in `EMBEDDINGS_MODE=real`) is a pre-trained sentence-transformer (e.g. `all-MiniLM-L6-v2`) that has been trained on huge text corpora to place **semantically related sentences near each other**. Over training:

- It sees combinations like “adventurous, spontaneous, likes excitement” near “high-energy, lively atmosphere, exciting experiences”.
- It learns to represent those as nearby points in vector space.

As a result:

- A user prompt describing an adventurous, high-energy person, and
- A vendor prompt describing a lively, adventurous experience

end up with embeddings that are close enough that cosine similarity is a meaningful measure of user–vendor match.

In Docker, `EMBEDDINGS_MODE=mock` uses a deterministic hash-based embedding that keeps the mechanics (same dimension, same function for user and vendor) without the semantic richness, but the pipeline and scoring stay identical. You can switch to real embeddings locally by installing the Python deps and setting `EMBEDDINGS_MODE=real`.

---

## API Endpoints Overview

### Vendors

- **POST `/vendors`**

  Create a vendor with traits and auto-generated embedding.

  Body:

  ```json
  {
    "name": "Sample Vendor",
    "description": "Optional description",
    "traits": {
      "serviceQuality": 4,
      "interactionStyle": 3,
      "serviceConduct": 5,
      "expertise": 4,
      "environment": 3,
      "atmosphere": 4,
      "design": 4,
      "hospitality": 5,
      "outcomeQuality": 5,
      "waitingTime": 2,
      "physicalElements": 4,
      "experienceTone": 4
    }
  }
  ```

- **GET `/vendors`**

  List all vendors.

- **GET `/vendors/:id`**

  Fetch a single vendor by ID.

### Users

- **POST `/users`**

  Create a user with personality traits and optional behavior preferences.

  ```json
  {
    "name": "Behavior Test User",
    "traits": {
      "adventurous": 4,
      "decisive": 3,
      "eccentric": 2,
      "flexible": 4,
      "loyal": 3,
      "optimistic": 4,
      "patient": 3,
      "perfectionist": 2,
      "punctual": 4
    },
    "behaviorPreferences": {
      "notes": "Loves great atmosphere and design",
      "recentPattern": "Often chooses stylish, social places",
      "vendorTraitWeights": {
        "atmosphere": 0.9,
        "design": 0.8
      }
    },
    "isTestUser": false
  }
  ```

- **GET `/users`**

  List all users.

- **GET `/users/:id`**

  Get a user with interactions.

- **PATCH `/users/:id`**

  Update one or more traits (and optionally behaviorPreferences), and recompute embedding.

  ```json
  {
    "traits": {
      "adventurous": 5,
      "perfectionist": 1
    },
    "behaviorPreferences": {
      "notes": "Recently more spontaneous"
    }
  }
  ```

- **PATCH `/users/:id/behavior`**

  Update only behaviorPreferences and recompute embedding:

  ```json
  {
    "behaviorPreferences": {
      "notes": "Now prefers quiet, short-wait venues",
      "recentPattern": "Frequently abandons long-wait places",
      "vendorTraitWeights": {
        "waitingTime": 1.0,
        "environment": 0.7
      }
    }
  }
  ```

### Interactions (behavior simulation)

- **POST `/interactions`**

  Like/dislike a vendor for a user (upsert):

  ```json
  {
    "userId": 10,
    "vendorId": 11,
    "liked": true,
    "score": 5
  }
  ```

- **GET `/interactions/user/:userId`**

  List all interactions for a user, including vendor details.

### Recommendations

- **GET `/recommendations/:userId`**

  Get ordered recommendations for a user. Optional:

  - `testMode=true`
  - `adjustments={...}` (JSON-encoded in query, use URL-encoding).

  Example (PowerShell):

  ```powershell
  $adj = '{"Adventurous":5,"Perfectionist":1}'
  $enc = [System.Uri]::EscapeDataString($adj)
  curl "http://localhost:3000/recommendations/10?testMode=true&adjustments=$enc"
  ```

- **GET `/debug/recommendations/:userId`**

  Same as above but includes debug vectors and adjustments, useful for inspecting how final scores were computed.

---

## Notes & Next Steps

- In Docker, embeddings are **mocked** by default (deterministic, hash-based). For production-quality semantics, run the backend locally with proper Python dependencies and set `EMBEDDINGS_MODE=real`.
- The engine is intentionally transparent:
  - All key scores (embedding, trait, behavior, final) are returned per vendor.
  - Debug endpoints expose the underlying vectors for deeper analysis or visualization.

You can now plug the Expo mobile app directly into these endpoints to run interactive recommendation experiments, tune weights, and visualize how user behavior and personality shifts change the ranking. 


