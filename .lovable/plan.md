## Review: what's going wrong

Looking at `supabase/functions/generate-manual/index.ts` and the `manuals` table, the most telling signal is the data: **6 of the last 12 manuals are stuck in `status = "generating"`** (Apr 2026 attempts all stuck, several Mar 2026 too). That's not Gemini being slow — that's the function dying mid-flight without anyone marking the row as failed.

Five concrete problems explain both the failures and the variable quality:

### 1. Wall‑clock timeouts — the silent killer
The handler runs end-to-end synchronously while the client waits:
- Phase 1 Gemini call (often 10–30s, with up to 3×16s retries + model fallback)
- Phase 2 Gemini call with the *entire* Phase 1 JSON re-embedded in the prompt
- A **sequential `for`-loop** of N step renders + storage uploads (lines 780–820)

A 30-step manual = 30 serialized `supabase.storage.upload` round-trips. Edge functions cap around ~150s; the browser fetch will give up well before that. The function probably finishes some runs, but the client sees a timeout error and the row stays `generating` forever.

### 2. The catch-all never marks the manual failed
Only the explicit 429/402/503 branches in Phase 1 set `status: "failed"`. Every other thrown error (Phase 2 failure, JSON parse failure after retries, storage failure, auth failure) falls into the outer `catch` at line 841, which returns 500 but leaves the row as `generating`. That's why the UI has zombie manuals.

### 3. Phase 1 quality is enforced by prose, not code
The system prompt tells the model to self-check 6+ distinct rows/cols, layer ≥ 3, no floaters (lines 599–603). There is **zero programmatic validation** of the returned design. Flat facades, floating pieces, zero spans, and missing `partsList` entries all silently pass through and produce the bad-looking SVGs the user has been seeing.

### 4. Phase 2 prompt is bloated and brittle
`phase2UserPrompt` re-serializes the entire `modelDesign` (every piece, every coordinate) and asks Gemini to echo `finishedModel` back verbatim plus build sections plus parts list. For a 200-piece build this blows past 16k output tokens — that's the original "Phase 1 returned invalid JSON" / truncation class of error reappearing in Phase 2. The fix is to *not* round-trip pieces through the model.

### 5. Prompts have a few quality leaks
- Structural template only triggers on English keywords in the title (`/house|tower|.../`) — a French or creative title gets no template.
- `STYLE_PRESETS` colors are described as "bright primary" / "metallic neon" but Phase 1 isn't told to bias the palette accordingly, so style barely affects output.
- Difficulty only changes step grouping in Phase 2, not piece complexity in Phase 1.
- `selectedSets` constraint references piece *categories* that don't exist in those real sets (e.g. 10696 has no 2x10 bricks) — model often hallucinates availability.

## Plan of changes

All edits scoped to `supabase/functions/generate-manual/index.ts` (no schema or UI changes needed).

### A. Switch to background processing
Return `202 Accepted` immediately after creating the job, then do Phase 1 / Phase 2 / image rendering inside `EdgeRuntime.waitUntil(...)`. The frontend already polls `manuals.status` via the existing select on `/manual/:id` so no client change is needed beyond surfacing `generating | completed | failed`. This alone eliminates the "stuck generating" class of bugs caused by client-side timeout.

### B. Robust status bookkeeping
Wrap the entire background job in `try/catch/finally`. The `finally` block reads the current row and, if still `generating`, flips it to `failed` with a stored `error_message` (add this as a JSONB field inside the existing `content` column — no migration). Every early-return error path goes through the same helper.

### C. Programmatic Phase 1 validation + 1 retry
After Phase 1 returns, run a `validateDesign(modelDesign)` function that checks:
- `pieces.length > 0`, every piece has positive `colSpan`/`rowSpan`/`layer`
- Distinct row count ≥ 6 AND distinct col count ≥ 6 (or proportionally lower for vehicles/animals)
- `max(layer) ≥ 3`
- Every layer-N piece has a layer-(N-1) piece (or baseplate) overlapping its footprint — no floaters
- `partsList` quantities reconcile with `pieces`

If validation fails, re-call Phase 1 once with the validation report appended to the system prompt ("Your previous design failed these checks: ..."). If it fails twice, mark the manual failed with a clear message instead of producing garbage SVGs.

### D. Slim Phase 2
Stop echoing pieces back through the model. Phase 2's user prompt sends only `{id, part, color, layer}` per piece (drop coords — Phase 2 doesn't need them to decide ordering) and asks only for `sections[].pages[]` with `pieceIds`. The function re-attaches `finishedModel` from Phase 1 server-side. This roughly halves Phase 2 token usage and removes the truncation risk.

### E. Parallel image uploads
Replace the sequential `for` loop with `Promise.all(allPages.map(renderAndUpload))` capped at a concurrency of ~8 via a small `pLimit`-style helper. For a 30-step manual this drops wall time from ~30× upload latency to ~4×.

### F. Prompt tightening
- Detect structural archetype from the *description* too, not just the title.
- Inject style preset color palette into Phase 1 ("Style 'retro' → prefer Tan, Brown, Dark Red, Sand Green").
- Pass `difficulty` into Phase 1 so Beginner gets simpler pieces (no slopes/special) and lower piece counts.
- Trim the LEGO set constraint to the realistic piece inventory per set (a small static table) instead of letting Gemini guess.

### G. Better error surfacing
Return the underlying Gemini status + a short reason from the function, and surface it in `CreateManualForm` toast instead of the generic "Generation failed".

## Validation after the change

1. `supabase--curl_edge_functions` POST to `/generate-manual` with a small medieval castle prompt → expect 202 + `manualId` immediately.
2. `supabase--read_query` poll `manuals.status` for that id → should flip `generating` → `completed` within ~60s.
3. Re-run a known-bad prompt ("Create map of NJ") → expect either a valid design or a `failed` row with `content.error_message`, never a stuck `generating`.
4. `supabase--edge_function_logs generate-manual` → confirm Phase 1 validation report + parallel-upload log lines.

## Technical details (for the implementer)

- File: `supabase/functions/generate-manual/index.ts`
- New helpers (same file, above `serve`): `validateDesign`, `markManualFailed`, `withConcurrency`
- Background entrypoint pattern:
  ```ts
  serve(async (req) => {
    // auth + parse + insert "generating" + immediate 202 response
    const job = runPipeline({ supabase, manualId, ... });
    // @ts-ignore Deno edge runtime
    EdgeRuntime.waitUntil(job);
    return new Response(JSON.stringify({ accepted: true, manualId }), { status: 202, headers: ... });
  });
  ```
- Schema: no migration. Persist error messages inside the existing `manuals.content` jsonb.
- Frontend: `CreateManualForm.handleSubmit` already navigates to `/manual/:id`; that page polls `manuals` and will show `generating` → `completed`/`failed`. Add a `useEffect` polling interval there if not already present.
