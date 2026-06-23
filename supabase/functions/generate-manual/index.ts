import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────────
// Isometric LEGO brick SVG renderer — v4
// Key fixes vs v3:
//   • Face-level depth sort (painter's algorithm applied per-face, not per-brick)
//     This eliminates "missing sides" caused by adjacent bricks occluding each other
//   • Correct depth formula: left face uses back-col edge, right face uses front-col edge
//   • Layer multiplier 1000 ensures layer always beats col+row depth
//   • Auto-fit bounding box centres and scales ALL pieces into the canvas
//   • Realistic cylindrical studs with highlight crescent
// ─────────────────────────────────────────────────────────────────────────────
function renderStepSVG(params: {
  placedPieces: any[];
  newPieceIds: number[];
  hasBaseplate: boolean;
  baseplateSize: string | null;
  stepNumber: number;
  stepTitle: string;
}): string {
  const { placedPieces, newPieceIds, hasBaseplate, baseplateSize } = params;

  // ── Constants ────────────────────────────────────────────────────────────
  const CW = 32;          // iso x spread per stud column
  const CH = 18;          // iso y spread per stud row
  const BRICK_Z = 28;     // screen px per full brick layer
  const PLATE_Z = 10;     // screen px per plate layer
  const STUD_CY_H = 6;    // stud cylinder height px
  const STUD_RX = 5.5;    // stud ellipse x-radius
  const STUD_RY = 3.2;    // stud ellipse y-radius

  // ── Colour palette ───────────────────────────────────────────────────────
  // [top, left-face, right-face, stud-top, stud-ring]
  const PALETTE: Record<string, [string,string,string,string,string]> = {
    "Red":           ["#C91A09","#8B1107","#A01208","#C91A09","#7A0F06"],
    "Blue":          ["#0057A6","#003A70","#004A8C","#0057A6","#002E58"],
    "Dark Blue":     ["#003152","#001830","#002440","#003152","#001020"],
    "Yellow":        ["#F2CD37","#B09010","#C8A820","#F2CD37","#907800"],
    "Green":         ["#00852B","#005018","#006822","#00852B","#003810"],
    "Dark Green":    ["#184632","#0A2818","#122E20","#184632","#081810"],
    "Orange":        ["#FE8A18","#C06000","#D87000","#FE8A18","#A05000"],
    "White":         ["#F8F8F8","#B8B8B8","#D0D0D0","#F8F8F8","#909090"],
    "Black":         ["#2A3A44","#10181E","#1A2830","#2A3A44","#080C10"],
    "Light Gray":    ["#9BA19B","#606660","#787E78","#9BA19B","#484C48"],
    "Dark Gray":     ["#6C6E68","#3A3C38","#505250","#6C6E68","#282A28"],
    "Brown":         ["#6B4226","#3C2010","#522E18","#6B4226","#2A1408"],
    "Tan":           ["#E4CD9E","#A8945C","#C0A870","#E4CD9E","#887040"],
    "Reddish Brown": ["#82422A","#501C0C","#682E18","#82422A","#380C04"],
    "Lime Green":    ["#BBE90B","#7AA000","#98C000","#BBE90B","#587800"],
    "Sand Green":    ["#789B73","#485E44","#607858","#789B73","#344030"],
    "Coral":         ["#FF698F","#C02858","#E04070","#FF698F","#981840"],
    "Medium Azure":  ["#36AEBF","#186878","#228898","#36AEBF","#104858"],
    "Lavender":      ["#E1D5ED","#A090B8","#C0A8D0","#E1D5ED","#806890"],
    "Dark Purple":   ["#3F1F5B","#200A30","#301448","#3F1F5B","#140620"],
    "Dark Red":      ["#720E0E","#400404","#580808","#720E0E","#280202"],
    "Trans Blue":    ["#5B9BDACC","#2A5888CC","#3A72AACC","#5B9BDACC","#1A3870CC"],
    "Transparent Blue": ["#5B9BDACC","#2A5888CC","#3A72AACC","#5B9BDACC","#1A3870CC"],
  };

  function getColor(name: string): [string,string,string,string,string] {
    if (!name) return PALETTE["Light Gray"];
    const k = Object.keys(PALETTE).find(k => k.toLowerCase() === name.toLowerCase());
    return k ? PALETTE[k] : PALETTE["Light Gray"];
  }

  function lhOf(part: string): number {
    const p = (part||"").toLowerCase();
    return (p.includes("plate") || p.includes("tile")) ? PLATE_Z : BRICK_Z;
  }
  function isTile(part: string): boolean { return (part||"").toLowerCase().includes("tile"); }
  function isRound(part: string): boolean { return (part||"").toLowerCase().includes("round"); }

  // ── Raw isometric projection (no canvas offset) ──────────────────────────
  function isoRaw(col: number, row: number, layer: number, lh: number) {
    return { x: (col - row) * CW, y: (col + row) * CH - layer * lh };
  }

  // ── SVG primitives ───────────────────────────────────────────────────────
  function fmt(n: number) { return n.toFixed(1); }
  function polygon(pts: {x:number;y:number}[], fill: string, stroke="none", sw=0) {
    return `<polygon points="${pts.map(p=>`${fmt(p.x)},${fmt(p.y)}`).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }
  function ellipse(cx:number,cy:number,rx:number,ry:number,fill:string,stroke="none",sw=0) {
    return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  function lineEl(x1:number,y1:number,x2:number,y2:number,stroke:string,sw:number) {
    return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }

  // ── Auto-fit: compute bounding box of all geometry ───────────────────────
  const W = 700, H = 540, PAD = 44;
  const allRaw: {x:number;y:number}[] = [];

  function addBox(col:number, row:number, layer:number, lh:number, cs:number, rs:number) {
    for (const [dc,dr] of [[0,0],[cs,0],[cs,rs],[0,rs]] as const) {
      const p = isoRaw(col+dc, row+dr, layer, lh);
      allRaw.push(p, {x:p.x, y:p.y+lh});
    }
    // account for stud height above top face
    const top = isoRaw(col+cs/2, row+rs/2, layer, lh);
    allRaw.push({x:top.x, y:top.y - STUD_CY_H - 4});
  }

  // Parse baseplate
  let bpCols = 16, bpRows = 16;
  if (baseplateSize) {
    const m = baseplateSize.match(/(\d+)\s*x\s*(\d+)/i);
    if (m) { bpCols = parseInt(m[1]); bpRows = parseInt(m[2]); }
  }

  if (hasBaseplate) addBox(1, 1, 0, BRICK_Z, bpCols, bpRows);
  for (const p of placedPieces) addBox(p.col||1, p.row||1, p.layer||1, lhOf(p.part), p.colSpan||1, p.rowSpan||1);

  if (allRaw.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/></svg>`;
  }

  const rawMinX = Math.min(...allRaw.map(p=>p.x));
  const rawMaxX = Math.max(...allRaw.map(p=>p.x));
  const rawMinY = Math.min(...allRaw.map(p=>p.y));
  const rawMaxY = Math.max(...allRaw.map(p=>p.y));
  const rawW = rawMaxX - rawMinX || 1;
  const rawH = rawMaxY - rawMinY || 1;
  const scale = Math.min((W-PAD*2)/rawW, (H-PAD*2)/rawH, 1.8);
  const ox = PAD + (W-PAD*2 - rawW*scale)/2 - rawMinX*scale;
  const oy = PAD + (H-PAD*2 - rawH*scale)/2 - rawMinY*scale;

  function isoS(col:number, row:number, layer:number, lh:number) {
    const r = isoRaw(col, row, layer, lh);
    return { x: r.x*scale + ox, y: r.y*scale + oy };
  }

  // ── Draw list: collect all faces + studs with depth values ───────────────
  // Depth formula: layer * 1000 ensures layer beats col+row.
  // Within a layer, we use the col+row of the relevant face's centroid.
  // Left face  → centroid at (col,          row+rows/2) → depth = col + row+rows/2
  // Right face → centroid at (col+cols,      row+rows/2) → depth = col+cols + row+rows/2
  // Top face   → centroid at (col+cols/2,    row+rows/2) → depth = col+cols/2 + row+rows/2 + 0.5
  // Studs      → same as top + tiny epsilon to appear above top face
  interface DrawItem { depth: number; svg: string; }
  const items: DrawItem[] = [];

  function add(depth:number, svg:string) { items.push({depth, svg}); }

  // ── Baseplate ────────────────────────────────────────────────────────────
  if (hasBaseplate) {
    const BC: [string,string,string,string,string] = ["#5DC85D","#2E7D32","#388E3C","#4CAF50","#1B5E20"];
    const tl = isoS(1,        1,        0, BRICK_Z);
    const tr = isoS(1+bpCols, 1,        0, BRICK_Z);
    const tf = isoS(1+bpCols, 1+bpRows, 0, BRICK_Z);
    const tfl= isoS(1,        1+bpRows, 0, BRICK_Z);
    const edgePx = 3 * scale;
    const bl={x:tl.x,y:tl.y+edgePx}, br={x:tr.x,y:tr.y+edgePx};
    const bf={x:tf.x,y:tf.y+edgePx}, bfl={x:tfl.x,y:tfl.y+edgePx};
    // Draw baseplate at depth=-9999 so it's always behind everything
    add(-9999, polygon([tl,tfl,bfl,bl], BC[2], "#1B5E2040", 0.6));
    add(-9998, polygon([tr,tf,bf,br],   BC[1], "#1B5E2040", 0.6));
    add(-9997, polygon([tl,tr,tf,tfl],  BC[0], "#1B5E2040", 0.9));
    // Stud grid
    if (scale >= 0.45) {
      for (let dc=0; dc<bpCols; dc++) {
        for (let dr=0; dr<bpRows; dr++) {
          const sc = isoS(1+dc+0.5, 1+dr+0.5, 0.08, BRICK_Z);
          add(-9996 + dc*0.01 + dr*0.0001,
            ellipse(sc.x, sc.y, 3.2*scale, 1.8*scale, BC[4], "#1B5E2040", 0.3));
        }
      }
    }
  }

  // ── Brick faces ──────────────────────────────────────────────────────────
  for (const piece of placedPieces) {
    const col2 = getColor(piece.color);
    const cols = piece.colSpan || 1;
    const rows = piece.rowSpan || 1;
    const layer = piece.layer || 1;
    const lh = lhOf(piece.part);
    const tile = isTile(piece.part);
    const round = isRound(piece.part);
    const isNew = newPieceIds.includes(piece.id);
    const lhS = lh * scale;
    const L = layer * 1000; // layer multiplier

    const tl  = isoS(piece.col,       piece.row,       layer, lh);
    const tr  = isoS(piece.col+cols,  piece.row,       layer, lh);
    const tf  = isoS(piece.col+cols,  piece.row+rows,  layer, lh);
    const tfl = isoS(piece.col,       piece.row+rows,  layer, lh);
    const bl  = {x:tl.x,  y:tl.y+lhS};
    const br  = {x:tr.x,  y:tr.y+lhS};
    const bf  = {x:tf.x,  y:tf.y+lhS};
    const bfl = {x:tfl.x, y:tfl.y+lhS};

    if (round && cols===1 && rows===1) {
      // Round bricks: cylinder approximation
      const cx=(tl.x+tr.x+tf.x+tfl.x)/4, cy=(tl.y+tfl.y)/2;
      const rx=CW*scale*0.5, ry=CH*scale*0.5;
      const cDepth = L + piece.col + piece.row + 0.5;
      add(cDepth-0.3, polygon([{x:cx-rx,y:cy},{x:cx+rx,y:cy},{x:cx+rx,y:cy+lhS},{x:cx-rx,y:cy+lhS}], col2[1], "#00000030", 0.5));
      add(cDepth-0.1, ellipse(cx, cy+lhS, rx, ry, col2[2], "#00000030", 0.5));
      add(cDepth,     ellipse(cx, cy,     rx, ry, col2[0], "#00000040", 0.8));
      add(cDepth+0.1, ellipse(cx-rx*0.2, cy-ry*0.25, rx*0.5, ry*0.5, "rgba(255,255,255,0.3)"));
      if (isNew) add(cDepth+0.2, ellipse(cx, cy, rx+2, ry+1.5, "none", "#FFD700", 2));
      continue;
    }

    // Left face: spans col=piece.col edge, rows piece.row..piece.row+rows
    // centroid col+row = piece.col + (piece.row + rows/2)
    const leftDepth  = L + piece.col           + piece.row + rows/2;
    // Right face: spans col=piece.col+cols edge
    const rightDepth = L + piece.col + cols     + piece.row + rows/2;
    // Top face: centroid
    const topDepth   = L + piece.col + cols/2  + piece.row + rows/2 + 0.5;

    add(leftDepth,  polygon([tl,tfl,bfl,bl], col2[1], "#00000020", 0.5));
    add(rightDepth, polygon([tr,tf,bf,br],   col2[2], "#00000020", 0.5));

    let topSvg = polygon([tl,tr,tf,tfl], col2[0], "#00000030", 0.7);
    // Subtle edge highlight
    topSvg += `<polyline points="${fmt(tl.x)},${fmt(tl.y)} ${fmt(tr.x)},${fmt(tr.y)} ${fmt(tf.x)},${fmt(tf.y)}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.8"/>`;
    if (isNew) topSvg += polygon([tl,tr,tf,tfl], "none", "#FFD700", 2.5);
    add(topDepth, topSvg);

    // Studs
    if (!tile && scale >= 0.35) {
      for (let dc=0; dc<cols; dc++) {
        for (let dr=0; dr<rows; dr++) {
          const sc = isoS(piece.col+dc+0.5, piece.row+dr+0.5, layer, lh);
          const rx = STUD_RX*scale, ry = STUD_RY*scale, sh = STUD_CY_H*scale;
          const sDepth = L + piece.col+dc+0.5 + piece.row+dr+0.5 + 1.5;
          let sv = "";
          // Cylinder side strip
          sv += polygon([{x:sc.x-rx,y:sc.y},{x:sc.x+rx,y:sc.y},{x:sc.x+rx,y:sc.y-sh},{x:sc.x-rx,y:sc.y-sh}], col2[1], "#00000020", 0.3);
          // Bottom rim
          sv += ellipse(sc.x, sc.y, rx, ry, col2[2], "#00000020", 0.3);
          // Top cap
          sv += ellipse(sc.x, sc.y-sh, rx, ry, col2[3], "#00000030", 0.5);
          // Specular highlight
          sv += ellipse(sc.x-rx*0.25, sc.y-sh-ry*0.2, rx*0.45, ry*0.45, "rgba(255,255,255,0.35)");
          if (isNew) sv += ellipse(sc.x, sc.y-sh, rx+1.5, ry+1, "none", "#FFD700", 1.2);
          add(sDepth + dc*0.01 + dr*0.001, sv);
        }
      }
    }
  }

  // ── Sort by depth (ascending = back/bottom drawn first) ──────────────────
  items.sort((a,b) => a.depth - b.depth);

  // ── Arrows for new pieces (always on top) ────────────────────────────────
  const newPiecesSvg: string[] = [];
  for (const piece of placedPieces.filter(p => newPieceIds.includes(p.id))) {
    const lh = lhOf(piece.part);
    const cols = piece.colSpan||1, rows = piece.rowSpan||1;
    const sc = isoS(piece.col+cols/2, piece.row+rows/2, piece.layer||1, lh);
    const cx = sc.x, cy = sc.y - STUD_CY_H*scale - 6;
    newPiecesSvg.push(lineEl(cx, cy-22, cx, cy-10, "#FFD700", 3));
    newPiecesSvg.push(`<polygon points="${fmt(cx)},${fmt(cy)} ${fmt(cx-8)},${fmt(cy-10)} ${fmt(cx+8)},${fmt(cy-10)}" fill="#FFD700"/>`);
  }

  const body = items.map(i=>i.svg).join("") + newPiecesSvg.join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FAFAFA"/>
  ${body}
</svg>`;
}

class GeminiApiError extends Error {
  status: number;
  details: string;

  constructor(message: string, status: number, details: string) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.details = details;
  }
}

function extractGeminiText(result: any): string {
  const parts = result?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function extractBalancedJson(rawText: string): string | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.search(/[\[{]/);
  if (start === -1) return null;

  const opening = cleaned[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opening) depth++;
    if (char === closing) depth--;

    if (depth === 0) {
      return cleaned.slice(start, i + 1);
    }
  }

  return null;
}

async function generateStructuredJson(params: {
  apiKey: string;
  phaseName: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}) {
  const retryInstructions = [
    "",
    "CRITICAL: Return only one valid JSON object. No markdown, no code fences, no explanations, no trailing text, and ensure every string is properly escaped.",
  ];
  const modelCandidates = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  for (let attempt = 0; attempt < retryInstructions.length; attempt++) {
    let lastGeminiError: GeminiApiError | null = null;

    for (const modelName of modelCandidates) {
      let response: Response | null = null;
      let rawBody = "";
      const MAX_RETRIES = 3;

      for (let apiRetry = 0; apiRetry < MAX_RETRIES; apiRetry++) {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${params.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              role: "system",
              parts: [{ text: `${params.systemPrompt}\n\n${retryInstructions[attempt]}`.trim() }],
            },
            contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
            generationConfig: {
              maxOutputTokens: attempt === 0 ? params.maxOutputTokens : Math.min(params.maxOutputTokens * 2, 32768),
              temperature: 0.15,
              responseMimeType: "application/json",
            },
          }),
        });

        rawBody = await response.text();

        if (response.status === 429 || response.status === 503) {
          if (apiRetry < MAX_RETRIES - 1) {
            const waitMs = Math.min(2000 * Math.pow(2, apiRetry), 16000);
            console.warn(`${params.phaseName} using ${modelName} got ${response.status}, retrying in ${waitMs}ms (attempt ${apiRetry + 1}/${MAX_RETRIES})`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          lastGeminiError = new GeminiApiError(`${params.phaseName} AI generation failed`, response.status, rawBody);
          console.warn(`${params.phaseName} switching models after ${response.status} from ${modelName}`);
        }

        break;
      }

      if (!response) continue;

      let result: any = null;

      try {
        result = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        console.error(`${params.phaseName} raw API response from ${modelName} was not JSON:`, rawBody.slice(0, 800));
        throw new GeminiApiError(`${params.phaseName} AI generation failed`, response.status, rawBody);
      }

      if (!response.ok) {
        console.error(`${params.phaseName} AI error from ${modelName}:`, response.status, rawBody.slice(0, 800));

        if ((response.status === 429 || response.status === 503) && modelName !== modelCandidates[modelCandidates.length - 1]) {
          lastGeminiError = new GeminiApiError(`${params.phaseName} AI generation failed`, response.status, rawBody);
          continue;
        }

        throw new GeminiApiError(`${params.phaseName} AI generation failed`, response.status, rawBody);
      }

      const responseText = extractGeminiText(result);
      const jsonText = extractBalancedJson(responseText);

      if (jsonText) {
        try {
          return JSON.parse(jsonText);
        } catch (parseError) {
          console.error(`${params.phaseName} JSON parse failed on attempt ${attempt + 1} with ${modelName}:`, parseError);
        }
      }

      console.error(`${params.phaseName} invalid JSON attempt ${attempt + 1} with ${modelName}:`, {
        finishReason: result?.candidates?.[0]?.finishReason,
        preview: responseText.slice(0, 500),
        tail: responseText.slice(-200),
      });
    }

    if (lastGeminiError) {
      throw lastGeminiError;
    }
  }

  throw new Error(`${params.phaseName} returned invalid JSON`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation: programmatic checks on the Phase 1 design
// ─────────────────────────────────────────────────────────────────────────────
function validateDesign(design: any, opts: { isVehicle: boolean; isAnimal: boolean }): string[] {
  const errors: string[] = [];
  const pieces = Array.isArray(design?.pieces) ? design.pieces : [];

  if (pieces.length === 0) {
    errors.push("Design has no pieces.");
    return errors;
  }

  // Per-piece sanity
  for (const p of pieces) {
    if (typeof p.id !== "number") errors.push(`Piece missing numeric id: ${JSON.stringify(p).slice(0, 80)}`);
    if (!p.part || typeof p.part !== "string") errors.push(`Piece ${p.id} missing 'part'`);
    if (!p.color || typeof p.color !== "string") errors.push(`Piece ${p.id} missing 'color'`);
    const cs = Number(p.colSpan), rs = Number(p.rowSpan);
    if (!Number.isFinite(cs) || cs < 1) errors.push(`Piece ${p.id} has invalid colSpan=${p.colSpan}`);
    if (!Number.isFinite(rs) || rs < 1) errors.push(`Piece ${p.id} has invalid rowSpan=${p.rowSpan}`);
    if (!Number.isFinite(Number(p.col)) || p.col < 1) errors.push(`Piece ${p.id} has invalid col=${p.col}`);
    if (!Number.isFinite(Number(p.row)) || p.row < 1) errors.push(`Piece ${p.id} has invalid row=${p.row}`);
    if (!Number.isFinite(Number(p.layer)) || p.layer < 1) errors.push(`Piece ${p.id} has invalid layer=${p.layer}`);
  }

  // Spatial extent
  const rows = new Set<number>();
  const cols = new Set<number>();
  let maxLayer = 0;
  for (const p of pieces) {
    for (let dr = 0; dr < (p.rowSpan || 1); dr++) rows.add((p.row || 1) + dr);
    for (let dc = 0; dc < (p.colSpan || 1); dc++) cols.add((p.col || 1) + dc);
    if ((p.layer || 1) > maxLayer) maxLayer = p.layer || 1;
  }

  const minDistinct = opts.isVehicle || opts.isAnimal ? 4 : 6;
  if (rows.size < minDistinct) errors.push(`Build spans only ${rows.size} distinct rows; need ≥ ${minDistinct}. Add depth front-to-back.`);
  if (cols.size < minDistinct) errors.push(`Build spans only ${cols.size} distinct cols; need ≥ ${minDistinct}. Widen the build.`);
  if (maxLayer < 3) errors.push(`Build is only ${maxLayer} layer(s) tall; need ≥ 3. Add height.`);

  // Floating pieces are auto-repaired before validation runs (see repairFloaters),
  // so we don't fail the build for them here.
  return errors;
}

// Move unsupported pieces down to the lowest layer where they overlap another
// piece (or to layer 1). Returns how many were moved and how many remain unsupported.
function repairFloaters(design: any): { moved: number; remaining: number } {
  const pieces = Array.isArray(design?.pieces) ? design.pieces : [];
  if (pieces.length === 0) return { moved: 0, remaining: 0 };

  function overlaps(a: any, b: any) {
    const ax1 = a.col, ax2 = a.col + (a.colSpan || 1);
    const ay1 = a.row, ay2 = a.row + (a.rowSpan || 1);
    const bx1 = b.col, bx2 = b.col + (b.colSpan || 1);
    const by1 = b.row, by2 = b.row + (b.rowSpan || 1);
    return ax1 < bx2 && bx1 < ax2 && ay1 < by2 && by1 < ay2;
  }

  pieces.sort((a: any, b: any) => (a.layer || 1) - (b.layer || 1));

  let moved = 0;
  let remaining = 0;
  for (const p of pieces) {
    const origLayer = p.layer || 1;
    if (origLayer <= 1) continue;
    const others = pieces.filter((q: any) => q !== p);
    const below = others.filter((q: any) => (q.layer || 1) === origLayer - 1);
    if (below.some((q: any) => overlaps(p, q))) continue;

    let target = origLayer;
    for (let L = origLayer - 1; L >= 2; L--) {
      const supportLayer = others.filter((q: any) => (q.layer || 1) === L - 1);
      if (supportLayer.some((q: any) => overlaps(p, q))) { target = L; break; }
      if (L === 2) target = 1; // fall to baseplate
    }
    if (target === origLayer) {
      // couldn't find support anywhere; drop to layer 1 (baseplate / table)
      p.layer = 1;
      moved++;
    } else if (target !== origLayer) {
      p.layer = target;
      moved++;
    } else {
      remaining++;
    }
  }

  return { moved, remaining };
}

// Simple concurrency limiter for image uploads
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      try {
        results[idx] = await tasks[idx]();
      } catch (e) {
        // @ts-ignore — store error inline so caller can inspect
        results[idx] = e as T;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

// Style palette hints fed into Phase 1
const STYLE_PALETTES: Record<string, string> = {
  classic: "Bright primary colors: Red, Blue, Yellow, Green, White, Black.",
  retro: "Muted vintage palette: Tan, Brown, Reddish Brown, Sand Green, Dark Red, Dark Tan.",
  futuristic: "Sleek sci-fi palette: Light Gray, Dark Gray, Medium Azure, White, Black, Transparent Blue.",
  minimalist: "Limited palette: White, Light Gray, one accent color only.",
  detailed: "Wide palette with realistic colors matching the subject.",
  whimsical: "Playful unexpected palette: Coral, Lavender, Lime Green, Medium Azure, Yellow.",
};

// Minimal piece inventory hints per known set — gives Gemini a realistic constraint
const SET_INVENTORY: Record<string, string> = {
  "10698": "Classic Large Brick Box: 1x1–2x4 bricks/plates in all bright colors, slopes, basic tiles, a 16x16 and 8x16 baseplate. NO Technic, NO large windows.",
  "10696": "Medium Brick Box: 1x1–2x4 bricks/plates in bright colors, a few slopes and tiles. NO Technic.",
  "11717": "Bricks Bricks Plates: 1x1–2x4 bricks and plates only, bright + tan + brown.",
  "11013": "Creative Transparent Bricks: transparent 1x1–2x4 bricks/plates only.",
  "11014": "Bricks and Wheels: standard bricks plus several wheels, axles, plates.",
  "11030": "Lots of Bricks: 1x1–2x4 bricks in many colors, basic plates.",
};

interface RunArgs {
  supabase: any;
  manualId: string;
  manual: any;
  difficulty: string;
  pieceTarget: number | null;
  style: string;
  selectedSets: string[] | null;
  allowExtras: boolean;
  apiKey: string;
}

async function markFailed(supabase: any, manualId: string, message: string) {
  await supabase
    .from("manuals")
    .update({ status: "failed", content: { error: message } })
    .eq("id", manualId);
}

async function runPipeline(args: RunArgs) {
  const { supabase, manualId, manual, difficulty, pieceTarget, style, selectedSets, allowExtras, apiKey } = args;

  const difficultyLevel = difficulty || "Beginner";
  const stylePreset = style || "classic";
  const pieceConstraint = pieceTarget
    ? `\nIMPORTANT: The total build should use approximately ${pieceTarget} pieces or fewer. Keep the parts list realistic and shoppable.`
    : "";

  const stylePalette = STYLE_PALETTES[stylePreset] || STYLE_PALETTES.classic;

  const difficultyHints: Record<string, string> = {
    Beginner: "Use only basic bricks, plates, and tiles. No slopes, no special pieces. Aim for 20–60 pieces.",
    Intermediate: "Use bricks, plates, tiles, and slopes. A few special pieces (windows, rounds) allowed. Aim for 60–200 pieces.",
    Advanced: "Use the full piece catalog including slopes, jumpers, pillars, and special pieces. Complex layered designs.",
  };
  const difficultyHint = difficultyHints[difficultyLevel] || difficultyHints.Beginner;

  // LEGO set constraint
  let setConstraintPrompt = "";
  if (selectedSets && selectedSets.length > 0) {
    const inventoryLines = selectedSets
      .map((id) => SET_INVENTORY[id])
      .filter(Boolean)
      .join("\n");
    const inventoryBlock = inventoryLines ? `\nSet inventories:\n${inventoryLines}` : "";
    if (allowExtras) {
      setConstraintPrompt = `\n\nLEGO SET CONSTRAINT: The user owns these LEGO sets (ids: ${selectedSets.join(", ")}).${inventoryBlock}
PREFER pieces from these sets. If a piece is NOT in any selected set, mark it with "isExtra": true and "sourceNote": "Available in [real LEGO set name]".`;
    } else {
      setConstraintPrompt = `\n\nLEGO SET CONSTRAINT (STRICT): The user owns these LEGO sets (ids: ${selectedSets.join(", ")}).${inventoryBlock}
ONLY use pieces that exist in those sets. Simplify the design if you cannot fit it within the available pieces.`;
    }
  }

  // Detect archetype from both title AND description
  const haystack = `${manual.title || ""} ${manual.description || ""}`.toLowerCase();
  const isEnclosedStructure = /house|home|building|tower|castle|store|shop|barn|cabin|church|school|office|hotel|warehouse|cottage|hut|temple|pyramid|fort/.test(haystack);
  const isVehicle = /car|truck|train|plane|ship|boat|rocket|bus|tank|jet|helicopter|submarine|spaceship/.test(haystack);
  const isAnimal = /dog|cat|horse|dragon|bird|fish|lion|bear|elephant|wolf|tiger|fox|rabbit|owl|whale|shark/.test(haystack);

  let structuralTemplate = "";
  if (isEnclosedStructure) {
    structuralTemplate = `
STRUCTURAL TEMPLATE — ENCLOSED BUILDING:
You are designing a 3D enclosed structure with four walls AND a roof, on a 16x16 baseplate.
  • Back wall:      row 4,  cols 4–13, layers 1 to N   (rowSpan=2)
  • Front wall:     row 12, cols 4–13, layers 1 to N   (rowSpan=2)
  • Left side wall: col 4,  rows 4–13, layers 1 to N   (colSpan=2)
  • Right side wall:col 12, rows 4–13, layers 1 to N   (colSpan=2)
  • Door gap:       front wall cols 8–9 at layer 1 only
  • Roof:           spans full footprint at layer N+1
Span rows 4–13 and cols 4–13. Two-story = layers 1–5 minimum. Tower = layers 6+.`;
  } else if (isVehicle) {
    structuralTemplate = `
STRUCTURAL TEMPLATE — VEHICLE:
3D vehicle body: col span ≥ 8, row span ≥ 4, layers ≥ 3. Centre on baseplate. Dark wheels, bright body.`;
  } else if (isAnimal) {
    structuralTemplate = `
STRUCTURAL TEMPLATE — ANIMAL:
3D sculpted animal: at least 6 cols × 4 rows × 3 layers. Body in tan/brown, features darker. Legs at corners.`;
  }

  const REAL_LEGO_PARTS = `VALID LEGO PIECE CATALOG (only use pieces from this list):
Bricks: 1x1, 1x2, 1x3, 1x4, 1x6, 1x8, 2x2, 2x3, 2x4, 2x6, 2x8, 2x10
Plates: 1x1 plate, 1x2 plate, 1x4 plate, 1x6 plate, 1x8 plate, 2x2 plate, 2x4 plate, 2x6 plate, 2x8 plate, 4x4 plate, 6x6 plate, 8x8 plate, 16x16 baseplate, 32x32 baseplate
Slopes: 1x1 slope 30°, 1x2 slope 30°, 1x2 slope 45°, 2x2 slope 45°, 1x2 inverted slope, 2x2 inverted slope
Tiles: 1x1 tile, 1x2 tile, 1x4 tile, 2x2 tile, 2x4 tile
Special: 1x1 round brick, 1x1 round plate, 2x2 round brick, 1x2 jumper plate, 1x2x2 window frame, 1x4x3 window frame, 1x1x3 pillar, 2x2 corner brick

VALID COLORS: Red, Blue, Yellow, Green, Orange, White, Black, Light Gray, Dark Gray, Brown, Dark Brown, Tan, Dark Tan, Sand Green, Sand Blue, Dark Blue, Dark Red, Lime Green, Dark Green, Medium Azure, Coral, Lavender, Dark Purple, Reddish Brown, Transparent Clear, Transparent Red, Transparent Blue, Transparent Yellow, Transparent Green`;

  // ───────────────── PHASE 1 with validation retry ─────────────────
  const phase1BaseSystemPrompt = `You are a LEGO set designer. Design a complete, finished LEGO model by laying out every piece at exact stud-grid coordinates.

${REAL_LEGO_PARTS}

COORDINATE SYSTEM:
- Build sits on a baseplate. Front-left stud = column 1, row 1. Columns increase left→right (X). Rows increase front→back (Y). Layers increase bottom→up (Z). Layer 1 = first brick layer on top of baseplate.
- A 2x4 brick placed horizontally at col 3, row 5, layer 1 occupies cols 3–6, rows 5–6 (colSpan=4, rowSpan=2).
- A 2x4 brick placed VERTICALLY at col 3, row 5 occupies cols 3–4, rows 5–8 (colSpan=2, rowSpan=4).
- Pieces MUST physically connect: every piece at layer N must overlap a piece at layer N-1 (or the baseplate). No floating pieces.

CRITICAL — 3D DEPTH REQUIRED:
- Use ≥ 6 distinct row values and ≥ 6 distinct col values (4 for vehicles/animals).
- max(layer) ≥ 3.
- A flat facade is WRONG.
${structuralTemplate}

PIECE SIZING:
- colSpan = studs in column (X) direction. rowSpan = studs in row (Y) direction.
- "2x4 Brick": first number = rows (2), second = columns (4). Horizontal: colSpan=4, rowSpan=2.
- colSpan and rowSpan are integers ≥ 1.

Style: ${stylePreset} — ${stylePalette}
Difficulty: ${difficultyLevel} — ${difficultyHint}
${pieceConstraint}
${setConstraintPrompt}

Return ONE JSON object describing the COMPLETE finished model. Every piece listed with exact position.`;

  const phase1UserPrompt = `Design a complete LEGO model for: "${manual.title}"
Description: ${manual.description}

Return ONLY a JSON object with this structure:
{
  "modelDescription": "Brief description",
  "hasBaseplate": true,
  "baseplateSize": "16x16",
  "estimatedPieceCount": 80,
  "pieces": [
    {"id": 1, "part": "2x4 Brick", "color": "Red", "col": 3, "row": 5, "layer": 1, "orientation": "horizontal", "colSpan": 4, "rowSpan": 2, "note": "south wall base"}
  ],
  "partsList": [{"part": "2x4 Brick", "color": "Red", "quantity": 4}]
}

orientation = "horizontal" if colSpan > rowSpan, "vertical" if rowSpan > colSpan, "horizontal" for square pieces.`;

  let modelDesign: any = null;
  let validationErrors: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const sysPrompt = attempt === 0
      ? phase1BaseSystemPrompt
      : `${phase1BaseSystemPrompt}\n\nYOUR PREVIOUS DESIGN FAILED THESE CHECKS:\n${validationErrors.map((e) => `- ${e}`).join("\n")}\nFix every issue. Spread pieces across more rows/cols/layers and ensure each piece is supported.`;

    modelDesign = await generateStructuredJson({
      apiKey,
      phaseName: `Phase 1${attempt > 0 ? ` (retry ${attempt})` : ""}`,
      systemPrompt: sysPrompt,
      userPrompt: phase1UserPrompt,
      maxOutputTokens: 16384,
    });

    // Auto-repair floating pieces before validating
    const repair = repairFloaters(modelDesign);
    if (repair.moved > 0) {
      console.log(`Phase 1 attempt ${attempt + 1}: auto-repaired ${repair.moved} floating piece(s)`);
    }

    validationErrors = validateDesign(modelDesign, { isVehicle, isAnimal });
    console.log(`Phase 1 attempt ${attempt + 1}: ${modelDesign?.pieces?.length || 0} pieces, ${validationErrors.length} validation errors`);
    if (validationErrors.length === 0) break;
  }

  if (validationErrors.length > 0) {
    throw new Error(`Phase 1 design failed validation after retry: ${validationErrors.slice(0, 3).join("; ")}`);
  }

  // ───────────────── PHASE 2: slim payload ─────────────────
  const aiDecides = manual.page_count === 0;
  const stepCountInstruction = aiDecides
    ? "Generate as many steps as needed — typically 1–2 pieces per step."
    : `Generate exactly ${manual.page_count} steps total.`;

  // Only send minimal piece info to Phase 2
  const slimPieces = modelDesign.pieces.map((p: any) => ({ id: p.id, part: p.part, color: p.color, layer: p.layer }));

  const phase2SystemPrompt = `You write LEGO instruction manual steps. You receive a list of pieces (id, part, color, layer) and must order them into build steps.

ORDERING RULES:
- Baseplate first (if any), then layer 1, layer 2, ..., topmost layer last.
- Within a layer, group nearby/related pieces together.
- ${stepCountInstruction}
- Beginner = 1–2 pieces per step. Intermediate = 1–3. Advanced = 2–4.
- Group consecutive steps into named sections ("Base Layer", "Walls", "Roof", "Details").

Reference pieces by id only. Do NOT echo positions — the renderer already has them.`;

  const phase2UserPrompt = `Model "${manual.title}" — ${modelDesign.pieces.length} pieces:
${JSON.stringify(slimPieces)}

Return ONLY this JSON (no finishedModel, no partsList — those are added server-side):
{
  "difficulty": "${difficultyLevel}",
  "style": "${stylePreset}",
  "sections": [
    {
      "sectionTitle": "Base Layer",
      "pages": [
        {
          "pageNumber": 1,
          "title": "Step title",
          "instructions": "What the builder does this step",
          "pieceIds": [1, 2],
          "tip": "Optional"
        }
      ]
    }
  ]
}`;

  const phase2Raw: any = await generateStructuredJson({
    apiKey,
    phaseName: "Phase 2",
    systemPrompt: phase2SystemPrompt,
    userPrompt: phase2UserPrompt,
    maxOutputTokens: 16384,
  });

  if (!phase2Raw?.sections?.length) throw new Error("Phase 2 returned no sections");

  // Reattach finishedModel + partsList server-side, plus per-page partsNeeded from pieceIds
  const pieceById = new Map<number, any>(modelDesign.pieces.map((p: any) => [p.id, p]));
  for (const section of phase2Raw.sections) {
    for (const page of section.pages || []) {
      const ids: number[] = Array.isArray(page.pieceIds) ? page.pieceIds : [];
      const tally = new Map<string, { part: string; color: string; quantity: number }>();
      for (const id of ids) {
        const p = pieceById.get(id);
        if (!p) continue;
        const key = `${p.part}|${p.color}`;
        const existing = tally.get(key);
        if (existing) existing.quantity += 1;
        else tally.set(key, { part: p.part, color: p.color, quantity: 1 });
      }
      page.partsNeeded = Array.from(tally.values());
    }
  }

  const content: any = {
    ...phase2Raw,
    estimatedPieceCount: modelDesign.estimatedPieceCount || modelDesign.pieces.length,
    hasBaseplate: modelDesign.hasBaseplate,
    finishedModel: modelDesign.pieces,
    partsList: modelDesign.partsList || [],
  };

  console.log(`Phase 2 complete: ${content.sections.length} sections`);

  // ───────────────── Image rendering (parallel) ─────────────────
  const allPages: any[] = (content.sections?.flatMap((s: any) => s.pages) || [])
    .sort((a: any, b: any) => a.pageNumber - b.pageNumber);

  const finishedPieces: any[] = content.finishedModel || modelDesign.pieces || [];

  // Cumulative placed-ids per step
  const placedIdsByStep: number[][] = [];
  let running: number[] = [];
  for (const page of allPages) {
    const ids: number[] = Array.isArray(page.pieceIds) ? page.pieceIds : [];
    running = [...running, ...ids];
    placedIdsByStep.push([...running]);
  }

  const uploadTasks = allPages.map((page, i) => async () => {
    const newPieceIds: number[] = Array.isArray(page.pieceIds) ? page.pieceIds : [];
    const placedIds = placedIdsByStep[i] || [];
    const placedPieces = finishedPieces.filter((p: any) => placedIds.includes(p.id));

    const svgString = renderStepSVG({
      placedPieces,
      newPieceIds,
      hasBaseplate: modelDesign.hasBaseplate,
      baseplateSize: modelDesign.baseplateSize,
      stepNumber: page.pageNumber,
      stepTitle: page.title,
    });

    const svgBytes = new TextEncoder().encode(svgString);
    const filePath = `${manualId}/step-${page.pageNumber}.svg`;
    const { error: uploadErr } = await supabase.storage
      .from("manual-images")
      .upload(filePath, svgBytes, { contentType: "image/svg+xml", upsert: true });

    if (uploadErr) {
      console.error(`SVG upload failed for step ${page.pageNumber}:`, uploadErr);
      return;
    }
    const { data: urlData } = supabase.storage.from("manual-images").getPublicUrl(filePath);
    if (urlData?.publicUrl) page.imageUrl = urlData.publicUrl;
  });

  await runWithConcurrency(uploadTasks, 8);
  console.log(`Rendered ${allPages.length} step images`);

  await supabase
    .from("manuals")
    .update({ content, status: "completed" })
    .eq("id", manualId);

  // Best-effort usage increment
  try {
    await supabase.rpc("increment_pages_used", {
      p_user_id: manual.user_id,
      p_pages: manual.page_count,
    });
  } catch (_) { /* ignore */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let manualIdForFailure: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) throw new Error("Not authenticated");

    const { manualId, difficulty, pieceTarget, style, selectedSets, allowExtras } = await req.json();
    if (!manualId) throw new Error("manualId is required");
    manualIdForFailure = manualId;

    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
      .eq("id", manualId)
      .eq("user_id", userData.user.id)
      .single();

    if (manualError || !manual) throw new Error("Manual not found");

    await supabase.from("manuals").update({ status: "generating" }).eq("id", manualId);

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not configured");

    // Background job — return 202 immediately so the client doesn't time out.
    const job = (async () => {
      try {
        await runPipeline({
          supabase,
          manualId,
          manual,
          difficulty,
          pieceTarget,
          style,
          selectedSets,
          allowExtras,
          apiKey: GOOGLE_AI_API_KEY,
        });
      } catch (err) {
        const message = err instanceof GeminiApiError
          ? `${err.message} (status ${err.status})`
          : err instanceof Error
            ? err.message
            : "Unknown error";
        console.error("Pipeline failure:", message);
        await markFailed(supabase, manualId, message);
      }
    })();

    // @ts-ignore — EdgeRuntime is available in Supabase edge functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(job);
    }

    return new Response(JSON.stringify({ accepted: true, manualId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("generate-manual handler error:", message);
    if (manualIdForFailure) await markFailed(supabase, manualIdForFailure, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
