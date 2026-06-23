## Plan to stop manual generation failures

### Problem
Recent generated manuals are failing in the backend with:

`Phase 1 design failed validation after retry: piece(s) float without support from the layer below.`

The generation is working far enough to produce a model, but the strict support validator rejects the whole manual when a few decorative/top pieces do not perfectly overlap the layer immediately below.

### Fix
1. **Repair AI designs before failing**
   - In `supabase/functions/generate-manual/index.ts`, add a normalization/repair pass after Phase 1 generation.
   - If a piece is unsupported, automatically move it down to the nearest supported layer where it overlaps another piece.
   - Keep coordinates, colors, part names, and the visual model intact as much as possible.

2. **Relax the final validation path**
   - Keep meaningful checks for missing pieces, bad coordinates, too-flat builds, and empty designs.
   - Treat small support issues as repairable instead of fatal.
   - Only fail if the design is fundamentally unusable after repair.

3. **Improve retry behavior**
   - Increase Phase 1 attempts from 2 to 3.
   - On retry, tell the AI exactly which structural issues remain.

4. **Make failures clearer**
   - Keep writing real failure messages into the manual record.
   - Avoid leaving rows stuck in `generating`.

5. **Deploy and verify**
   - Deploy the updated `generate-manual` backend function.
   - Check function logs after deploy to confirm the previous “float without support” failure path is no longer the likely outcome.

### Technical notes
- This changes only the manual generation backend logic.
- No database schema changes are needed.
- Existing failed rows will remain failed; creating a new manual should use the fixed generation flow.