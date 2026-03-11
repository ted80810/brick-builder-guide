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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) throw new Error("Not authenticated");

    const { manualId, difficulty, pieceTarget, style, selectedSets, allowExtras } = await req.json();
    if (!manualId) throw new Error("manualId is required");

    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
      .eq("id", manualId)
      .eq("user_id", userData.user.id)
      .single();

    if (manualError || !manual) throw new Error("Manual not found");

    await supabase.from("manuals").update({ status: "generating" }).eq("id", manualId);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const difficultyLevel = difficulty || "Beginner";
    const stylePreset = style || "classic";
    const pieceConstraint = pieceTarget ? `\nIMPORTANT: The total build should use approximately ${pieceTarget} pieces or fewer. Keep the parts list realistic and shoppable.` : "";

    // LEGO set constraint
    const legoSetNames: Record<string, string> = {
      "10698": "Classic Large Creative Brick Box (10698)", "11717": "Bricks Bricks Plates (11717)",
      "10696": "Medium Creative Brick Box (10696)", "11013": "Creative Transparent Bricks (11013)",
      "11014": "Bricks and Wheels (11014)", "11030": "Lots of Bricks (11030)",
      "31058": "Creator Mighty Dinosaurs (31058)", "31109": "Creator Pirate Ship (31109)",
      "31120": "Creator Medieval Castle (31120)", "31139": "Creator Cozy House (31139)",
      "31145": "Creator Red Dragon (31145)", "31150": "Creator Wild Safari Animals (31150)",
      "31152": "Creator Space Astronaut (31152)", "31153": "Creator Modern House (31153)",
      "42151": "Technic Bugatti Bolide (42151)", "42115": "Technic Lamborghini Sián (42115)",
      "60349": "City Lunar Space Station (60349)", "60337": "City Express Passenger Train (60337)",
      "21054": "Architecture The White House (21054)", "21060": "Architecture Himeji Castle (21060)",
      "75192": "Star Wars Millennium Falcon (75192)", "75375": "Star Wars Millennium Falcon 2024 (75375)",
    };

    let setConstraintPrompt = "";
    if (selectedSets && selectedSets.length > 0) {
      const setDescriptions = selectedSets.map((id: string) => legoSetNames[id] || `LEGO Set ${id}`).join(", ");
      if (allowExtras) {
        setConstraintPrompt = `\n\nLEGO SET CONSTRAINT: The user owns these LEGO sets: ${setDescriptions}. 
PREFER pieces from these sets. If a piece is NOT available in any of the selected sets, you MAY still use it but you MUST mark it as an extra piece. 
For each extra piece, add a field "isExtra": true and "sourceNote": "Not in selected sets — available in [suggest a real LEGO set where this piece can be found]" to the partsNeeded entry.
Do NOT suggest pieces that don't exist in any real LEGO set.`;
      } else {
        setConstraintPrompt = `\n\nLEGO SET CONSTRAINT (STRICT): The user owns these LEGO sets: ${setDescriptions}.
ONLY use pieces that are actually found in these sets. Do NOT use any piece that is not included in one of these sets.
If you cannot complete the build with only these pieces, simplify the design to work within the available pieces.
Every piece in partsNeeded must exist in at least one of the selected sets.`;
      }
    }

    const styleDescriptions: Record<string, string> = {
      classic: "Traditional LEGO style with bright primary colors",
      retro: "Vintage/retro aesthetic with muted tones and nostalgic feel",
      futuristic: "Sleek sci-fi design with metallic and neon accents",
      minimalist: "Clean and simple design using minimal pieces and colors",
      detailed: "Highly detailed and intricate design with lots of fine details",
      whimsical: "Playful and imaginative design with unexpected elements",
    };

    // ─────────────────────────────────────────────────────────────────
    // PHASE 1: Design the complete finished model
    // The AI lays out every piece at exact grid coordinates BEFORE
    // deciding how to split things into steps. This guarantees the
    // final model is physically valid and all piece positions are known.
    // ─────────────────────────────────────────────────────────────────

    const REAL_LEGO_PARTS = `VALID LEGO PIECE CATALOG (only use pieces from this list):
Bricks: 1x1, 1x2, 1x3, 1x4, 1x6, 1x8, 2x2, 2x3, 2x4, 2x6, 2x8, 2x10
Plates: 1x1 plate, 1x2 plate, 1x4 plate, 1x6 plate, 1x8 plate, 2x2 plate, 2x4 plate, 2x6 plate, 2x8 plate, 4x4 plate, 6x6 plate, 8x8 plate, 16x16 baseplate, 32x32 baseplate
Slopes: 1x1 slope 30°, 1x2 slope 30°, 1x2 slope 45°, 2x2 slope 45°, 1x2 inverted slope, 2x2 inverted slope
Tiles: 1x1 tile, 1x2 tile, 1x4 tile, 2x2 tile, 2x4 tile
Special: 1x1 round brick, 1x1 round plate, 2x2 round brick, 1x2 jumper plate, 1x2x2 window frame, 1x4x3 window frame, 1x1x3 pillar, 2x2 corner brick

VALID COLORS: Red, Blue, Yellow, Green, Orange, White, Black, Light Gray, Dark Gray, Brown, Dark Brown, Tan, Dark Tan, Sand Green, Sand Blue, Dark Blue, Dark Red, Lime Green, Dark Green, Medium Azure, Coral, Lavender, Dark Purple, Reddish Brown, Transparent Clear, Transparent Red, Transparent Blue, Transparent Yellow, Transparent Green`;

    const phase1SystemPrompt = `You are a LEGO set designer. Your job is to design a complete, finished LEGO model by laying out every single piece at exact stud-grid coordinates.

${REAL_LEGO_PARTS}

COORDINATE SYSTEM:
- The build sits on a baseplate. Front-left stud = column 1, row 1. Columns increase left→right (X). Rows increase front→back (Y). Layers increase bottom→up (Z). Layer 1 = first brick layer on top of baseplate surface.
- A 2x4 brick placed horizontally at col 3, row 5, layer 1 occupies cols 3–6, row 5 (colSpan=4, rowSpan=2). Wait — a 2x4 is 2 studs wide × 4 studs long. If horizontal (long axis = columns), colSpan=4, rowSpan=2. If vertical (long axis = rows), colSpan=2, rowSpan=4.
- A 1x2 plate placed vertically at col 4, row 2 occupies col 4, rows 2–3 (colSpan=1, rowSpan=2).
- Pieces MUST physically connect: every piece at layer N must have a piece directly below it at layer N-1 (or the baseplate at layer 0). No floating pieces.

CRITICAL — USE THE FULL GRID, NOT JUST THE CENTRE:
- For a 16×16 baseplate, use columns 1–16 and rows 1–16 fully. Do not cluster all pieces in one corner.
- Centre your build. A shape that is 10 studs wide should start around column 3–4 to centre on a 16×16 plate.
- For geographic/map builds (e.g. "Map of New Jersey", "Map of Texas"): think about the silhouette of the region. Use plates to trace the outline before stacking bricks on top. Lay pieces flat (layer 1) to cover the correct geographic footprint first.

PIECE SIZING — CRITICAL:
- A "2x4 Brick" has 2 rows × 4 columns of studs. colSpan must match the stud count.
- A "1x2 plate" has 1 row × 2 columns (colSpan=2, rowSpan=1 if horizontal; colSpan=1, rowSpan=2 if vertical).
- NEVER set colSpan or rowSpan to 0. Minimum is 1.

Style: ${styleDescriptions[stylePreset] || styleDescriptions.classic}
Difficulty: ${difficultyLevel}
${pieceConstraint}
${setConstraintPrompt}

Return a JSON object describing the COMPLETE finished model. Every piece must be listed with exact position.`;

    const phase1UserPrompt = `Design a complete LEGO model for: "${manual.title}"
Description: ${manual.description}

Return ONLY a JSON object with this structure:
{
  "modelDescription": "Brief description of the finished model",
  "hasBaseplate": true or false,
  "baseplateSize": "16x16" or "32x32" or null,
  "estimatedPieceCount": <number>,
  "pieces": [
    {
      "id": 1,
      "part": "2x4 Brick",
      "color": "Red",
      "col": 3,
      "row": 5,
      "layer": 1,
      "orientation": "horizontal",
      "colSpan": 4,
      "rowSpan": 2,
      "note": "optional context like 'south wall base'"
    }
  ],
  "partsList": [
    {"part": "2x4 Brick", "color": "Red", "quantity": 4}
  ]
}

Orientation must be "horizontal" (long axis runs left-right, colSpan > rowSpan) or "vertical" (long axis runs front-back, rowSpan > colSpan). For square pieces (1x1, 2x2 etc) use "horizontal".
Think carefully about the physical structure. No piece may float.`;

    const phase1Response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: phase1SystemPrompt },
          { role: "user", content: phase1UserPrompt },
        ],
      }),
    });

    if (!phase1Response.ok) {
      const errText = await phase1Response.text();
      console.error("Phase 1 AI error:", phase1Response.status, errText);
      if (phase1Response.status === 429) {
        await supabase.from("manuals").update({ status: "failed" }).eq("id", manualId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (phase1Response.status === 402) {
        await supabase.from("manuals").update({ status: "failed" }).eq("id", manualId);
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Phase 1 AI generation failed");
    }

    const phase1Result = await phase1Response.json();
    const phase1Text = phase1Result.choices?.[0]?.message?.content || "";
    const phase1JsonMatch = phase1Text.match(/\{[\s\S]*\}/);
    let modelDesign: any;
    try {
      modelDesign = phase1JsonMatch ? JSON.parse(phase1JsonMatch[0]) : null;
    } catch {
      throw new Error("Phase 1 returned invalid JSON");
    }
    if (!modelDesign?.pieces?.length) throw new Error("Phase 1 returned no pieces");

    console.log(`Phase 1 complete: ${modelDesign.pieces.length} pieces designed`);

    // ─────────────────────────────────────────────────────────────────
    // PHASE 2: Decompose the finished model into ordered build steps
    // The AI knows exactly what the final model looks like and works
    // backwards to create a logical, layer-by-layer build sequence.
    // ─────────────────────────────────────────────────────────────────

    const aiDecides = manual.page_count === 0;
    const stepCountInstruction = aiDecides
      ? "Generate as many steps as needed — typically one step per 1-2 pieces."
      : `Generate exactly ${manual.page_count} steps total.`;

    const phase2SystemPrompt = `You are a LEGO instruction manual writer. You have been given a complete, finished model design with every piece at exact coordinates. Your job is to decompose it into a logical step-by-step build sequence.

RULES FOR STEP ORDERING:
- Always start with the baseplate (if present), then layer 1 pieces (bottom-most), then layer 2, etc.
- Within each layer, work from back-left to front-right so earlier pieces support later ones.
- Never introduce a piece that would require moving or lifting a piece placed in an earlier step.
- Each step = 1 to 2 pieces maximum for Beginner, 1 to 3 for Intermediate/Advanced.
- ${stepCountInstruction}
- Group steps into named sections (e.g., "Base Layer", "Walls", "Roof", "Details").

INSTRUCTION WRITING RULES:
- Reference pieces by their ID from the model design (e.g., "piece #12").
- Describe placement using the exact col/row/layer from the model design.
- Use language like: "Place a Red 2x4 Brick horizontally at row 5, columns 3–6, layer 1, directly on the baseplate."
- If placing on top of another piece: "Place on top of piece #5 (the Blue 2x4 Brick at row 3, columns 1–4)."
- Never use vague terms like "to the left" without a coordinate. Always give the exact position.`;

    const phase2UserPrompt = `Here is the complete finished model for "${manual.title}":

${JSON.stringify(modelDesign, null, 2)}

Decompose this into step-by-step build instructions. Return ONLY a JSON object with this structure:
{
  "difficulty": "${difficultyLevel}",
  "style": "${stylePreset}",
  "estimatedPieceCount": ${modelDesign.estimatedPieceCount || modelDesign.pieces.length},
  "hasBaseplate": ${modelDesign.hasBaseplate},
  "finishedModel": ${JSON.stringify(modelDesign.pieces)},
  "sections": [
    {
      "sectionTitle": "Base Layer",
      "pages": [
        {
          "pageNumber": 1,
          "title": "Step title",
          "instructions": "Exact placement instructions referencing col/row/layer",
          "pieceIds": [1, 2],
          "partsNeeded": [{"part": "2x4 Brick", "color": "Red", "quantity": 1}],
          "tip": "Optional tip"
        }
      ]
    }
  ],
  "partsList": ${JSON.stringify(modelDesign.partsList)}
}`;

    const phase2Response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: phase2SystemPrompt },
          { role: "user", content: phase2UserPrompt },
        ],
      }),
    });

    if (!phase2Response.ok) {
      const errText = await phase2Response.text();
      console.error("Phase 2 AI error:", phase2Response.status, errText);
      throw new Error("Phase 2 AI generation failed");
    }

    const phase2Result = await phase2Response.json();
    const phase2Text = phase2Result.choices?.[0]?.message?.content || "";
    const phase2JsonMatch = phase2Text.match(/\{[\s\S]*\}/);
    let content: any;
    try {
      content = phase2JsonMatch ? JSON.parse(phase2JsonMatch[0]) : null;
    } catch {
      throw new Error("Phase 2 returned invalid JSON");
    }
    if (!content?.sections?.length) throw new Error("Phase 2 returned no sections");

    console.log(`Phase 2 complete: steps generated across ${content.sections.length} sections`);

    // Flatten all pages and sort by pageNumber
    const allPages = (content.sections?.flatMap((s: any) => s.pages) || [])
      .sort((a: any, b: any) => a.pageNumber - b.pageNumber);

    // The finished model pieces — used to render each step image
    const finishedPieces: any[] = content.finishedModel || modelDesign.pieces || [];

    console.log(`Generating images for ${allPages.length} steps...`);

    // Build a lookup of which piece IDs have been placed after each step
    // so the image prompt knows exactly what to draw
    const placedPieceIdsByStep: number[][] = [];
    let runningIds: number[] = [];
    for (const page of allPages) {
      const ids: number[] = Array.isArray(page.pieceIds) ? page.pieceIds : [];
      runningIds = [...runningIds, ...ids];
      placedPieceIdsByStep.push([...runningIds]);
    }

    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      try {
        // Pieces placed in THIS step
        const newPieceIds: number[] = Array.isArray(page.pieceIds) ? page.pieceIds : [];
        const newPieces = finishedPieces.filter((p: any) => newPieceIds.includes(p.id));

        // All pieces placed so far (including this step)
        const placedIds = placedPieceIdsByStep[i] || [];
        const placedPieces = finishedPieces.filter((p: any) => placedIds.includes(p.id));

        // Render deterministically — no AI involved
        const svgString = renderStepSVG({
          placedPieces,
          newPieceIds,
          hasBaseplate: modelDesign.hasBaseplate,
          baseplateSize: modelDesign.baseplateSize,
          stepNumber: page.pageNumber,
          stepTitle: page.title,
        });

        // Upload SVG to storage
        const svgBytes = new TextEncoder().encode(svgString);
        const filePath = `${manualId}/step-${page.pageNumber}.svg`;
        const { error: uploadErr } = await supabase.storage
          .from("manual-images")
          .upload(filePath, svgBytes, { contentType: "image/svg+xml", upsert: true });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("manual-images").getPublicUrl(filePath);
          if (urlData?.publicUrl) {
            page.imageUrl = urlData.publicUrl;
            console.log(`SVG rendered for step ${page.pageNumber}`);
          }
        } else {
          console.error(`SVG upload failed for step ${page.pageNumber}:`, uploadErr);
        }
      } catch (imgError) {
        console.error(`Image generation failed for step ${page.pageNumber}:`, imgError);
      }
    }

    await supabase
      .from("manuals")
      .update({ content, status: "completed" })
      .eq("id", manualId);

    // Update pages used (best effort)
    try {
      const { error: rpcError } = await supabase.rpc("increment_pages_used", {
        p_user_id: userData.user.id,
        p_pages: manual.page_count,
      });
      if (rpcError) console.log("increment_pages_used RPC not available:", rpcError.message);
    } catch {
      console.log("increment_pages_used RPC not available");
    }

    return new Response(JSON.stringify({ success: true, content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-manual error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
