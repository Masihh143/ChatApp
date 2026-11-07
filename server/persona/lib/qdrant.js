// Qdrant vector-store wrapper (port of feature/Persona_chat/server/lib/qdrant.ts).
// Holds embedded chunks of a persona's historical messages for RAG retrieval.
//
// Collection: "persona_messages" — one collection, filtered by personaId.
// Works with any Qdrant endpoint: local Docker or Qdrant Cloud (set QDRANT_URL,
// and QDRANT_API_KEY for cloud). See server/setup.md.
//
// NOTE: this targets the installed @qdrant/js-client-rest 1.20.x API:
//   - the api-key option is `apiKey` (NOT `apikey` — the old name silently drops
//     the header → every request 403s against a hosted cluster).
//   - `search()` was removed; dense-vector retrieval now goes through `query()`.
import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? '';
export const COLLECTION_NAME = 'persona_messages';
const VECTOR_SIZE = Number(process.env.GEMINI_EMBED_DIM ?? 3072); // gemini-embedding-001

export const qdrant = new QdrantClient({
    url: QDRANT_URL,
    // 1.20.0 reads the key under `apiKey`; passing a string also forces https.
    apiKey: QDRANT_API_KEY || undefined,
    checkCompatibility: false, // skip the extra version-negotiation call on boot
});

/** Read the stored vector dimension from a collection-info object (the shape
 *  varies between server versions). */
function dimOf(info) {
    return info?.config?.vectors?.default?.size
        ?? info?.params?.vectors?.default?.size
        ?? info?.config?.vectors?.size
        ?? null;
}

/** Create the collection + a personaId payload index if missing. If it exists
 *  but with a different vector size, recreate it fresh. */
export async function ensureCollectionExists() {
    let found;
    try {
        const existing = await qdrant.getCollections();
        found = (existing.collections ?? []).find((c) => c.name === COLLECTION_NAME);
    } catch (err) {
        // getCollections can 404 on a brand-new empty cluster — treat as "absent".
        if (String(err?.message || err).includes('404')) found = undefined;
        else throw err;
    }

    if (found) {
        const dim = dimOf(found);
        if (dim && dim !== VECTOR_SIZE) {
            // eslint-disable-next-line no-console
            console.warn(`[qdrant] "${COLLECTION_NAME}" exists with dim ${dim} ≠ ${VECTOR_SIZE} — recreating`);
            await qdrant.deleteCollection(COLLECTION_NAME);
        } else {
            return;
        }
    }

    // Single anonymous named vector ("default"). 1.20.0's createCollection takes
    // `vectors: VectorParams` ({ size, distance }) for the anonymous case.
    await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'personaId',
        field_schema: 'keyword',
    });
    // eslint-disable-next-line no-console
    console.log(`[qdrant] Created collection "${COLLECTION_NAME}" (dim ${VECTOR_SIZE})`);
}

const UPSERT_BATCH = 50;

/** Upsert points (batched to stay under Qdrant's request size limit). */
export async function upsertVectors(points) {
    if (points.length === 0) return;
    for (let i = 0; i < points.length; i += UPSERT_BATCH) {
        const batch = points.slice(i, i + UPSERT_BATCH);
        await qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: batch.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
        });
    }
}

/** Top-k retrieval of a persona's historical chunks for the given query vector.
 *  (1.20.0: `query()` replaces the removed `search()`; the dense vector goes
 *  under the `query` field and the result is `response.points`.) */
export async function searchVectors(personaId, queryVector, topK = 5) {
    const response = await qdrant.query(COLLECTION_NAME, {
        query: queryVector,
        limit: topK,
        filter: { must: [{ key: 'personaId', match: { value: String(personaId) } }] },
        with_payload: true,
    });
    const points = response?.points ?? [];
    return points.map((hit) => ({
        text: hit.payload?.text,
        timestamp: hit.payload?.timestamp,
        score: hit.score,
    }));
}

/**
 * Remove every stored chunk for one persona (used by the cascade delete route).
 * Best-effort: a missing collection (nothing was ever ingested) is not an error.
 * Returns true when the delete was issued, false when there was nothing to clear.
 */
export async function deleteVectorsForPersona(personaId) {
    let hasCollection = false;
    try {
        const existing = await qdrant.getCollections();
        hasCollection = (existing.collections ?? []).some((c) => c.name === COLLECTION_NAME);
    } catch (err) {
        if (String(err?.message || err).includes('404')) return false;
        throw err;
    }
    if (!hasCollection) return false;
    // A filter selector (not a point-id list) matches every chunk with this personaId.
    await qdrant.delete(COLLECTION_NAME, {
        wait: true,
        filter: { must: [{ key: 'personaId', match: { value: String(personaId) } }] },
    });
    return true;
}
