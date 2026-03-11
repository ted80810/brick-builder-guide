import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


// Render a step as an SVG string — fully deterministic, no AI involved
function renderStepSVG(params: {
  placedPieces: any[];
  newPieceIds: number[];
  hasBaseplate: boolean;
  baseplateSize: string | null;
  stepNumber: number;
  stepTitle: string;
}): string {
  const { placedPieces, newPieceIds, hasBaseplate, baseplateSize, stepNumber, stepTitle } = params;

  const W = 640, H = 480;
  const ox = W / 2, oy = H * 0.52;

  const CELL_W = 28, CELL_H = 16, BRICK_H = 24, PLATE_H = 8, STUD_H = 5;

  const LEGO_COLORS: Record<string, { top: string; front: string; side: string; stud: string }> = {
    "Red":           { top: "#C91A09", front: "#9C1408", side: "#720E06", stud: "#A01207" },
    "Blue":          { top: "#0057A6", front: "#004D96", side: "#003F7A", stud: "#004080" },
    "Dark Blue":     { top: "#003152", front: "#002844", side: "#001F36", stud: "#002040" },
    "Yellow":        { top: "#F2CD37", front: "#D4B000", side: "#C4A500", stud: "#B89800" },
    "Green":         { top: "#00852B", front: "#006B22", side: "#005C1E", stud: "#004D18" },
    "Dark Green":    { top: "#184632", front: "#123826", side: "#0D2C1E", stud: "#0A2218" },
    "Orange":        { top: "#FE8A18", front: "#E07500", side: "#CC6A00", stud: "#B85E00" },
    "White":         { top: "#FFFFFF", front: "#D8D8D8", side: "#C0C0C0", stud: "#AAAAAA" },
    "Black":         { top: "#1B2A34", front: "#121E24", side: "#0D151A", stud: "#080E12" },
    "Light Gray":    { top: "#9BA19B", front: "#7D847D", side: "#6C726C", stud: "#5E645E" },
    "Dark Gray":     { top: "#6C6E68", front: "#525450", side: "#3E3F3C", stud: "#323330" },
    "Brown":         { top: "#583927", front: "#4A2F20", side: "#3C261A", stud: "#301A10" },
    "Tan":           { top: "#E4CD9E", front: "#CAAD7A", side: "#B8A06C", stud: "#A08C58" },
    "Reddish Brown": { top: "#82422A", front: "#6E3622", side: "#5A2C1A", stud: "#4A2214" },
    "Lime Green":    { top: "#BBE90B", front: "#A0C800", side: "#8CB000", stud: "#789800" },
    "Sand Green":    { top: "#789B73", front: "#617D5C", side: "#4E6649", stud: "#3E5238" },
    "Coral":         { top: "#FF698F", front: "#E84E74", side: "#CC3D62", stud: "#B83058" },
    "Medium Azure":  { top: "#36AEBF", front: "#2A98A8", side: "#228090", stud: "#1A6870" },
    "Lavender":      { top: "#E1D5ED", front: "#C8B8D8", side: "#B09EC4", stud: "#9080A8" },
    "Dark Purple":   { top: "#3F1F5B", front: "#32184C", side: "#280E3C", stud: "#1E0A2E" },
    "Dark Red":      { top: "#720E0E", front: "#5C0C0C", side: "#4A0808", stud: "#380606" },
  };

  function getColor(name: string) {
    const key = Object.keys(LEGO_COLORS).find((k) => k.toLowerCase() === (name || "").toLowerCase());
    return key ? LEGO_COLORS[key] : LEGO_COLORS["Light Gray"];
  }

  function isPlate(partName: string) {
    const n = (partName || "").toLowerCase();
    return n.includes("plate") || n.includes("tile");
  }

  function iso(col: number, row: number, layer: number, lh: number) {
    return {
      x: (col - row) * (CELL_W / 2),
      y: (col + row) * (CELL_H / 2) - layer * lh,
    };
  }

  function off(p: { x: number; y: number }) {
    return { x: p.x + ox, y: p.y + oy };
  }

  function poly(pts: { x: number; y: number }[], fill: string, stroke = "#00000033", sw = 0.8) {
    return `<polygon points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  function drawBrick(piece: any, isNew: boolean): string {
    const c = getColor(piece.color);
    const cols = piece.colSpan || 1;
    const rows = piece.rowSpan || 1;
    const layer = piece.layer || 1;
    const lh = isPlate(piece.part) ? PLATE_H : BRICK_H;
    const topL = layer + 1;

    const A = off(iso(piece.col, piece.row, topL, lh));
    const B = off(iso(piece.col + cols, piece.row, topL, lh));
    const C = off(iso(piece.col + cols, piece.row + rows, topL, lh));
    const D = off(iso(piece.col, piece.row + rows, topL, lh));
    const E = off(iso(piece.col, piece.row, layer, lh));
    const F = off(iso(piece.col + cols, piece.row, layer, lh));
    const G = off(iso(piece.col + cols, piece.row + rows, layer, lh));
    const H = off(iso(piece.col, piece.row + rows, layer, lh));

    let s = "";
    s += poly([A, D, H, E], c.side);        // left face
    s += poly([B, C, G, F], c.front);       // right face
    s += poly([A, B, C, D], c.top);         // top face

    if (isNew) {
      s += poly([A, B, C, D], "none", "#FFD700", 2.5);
    }

    // Studs
    for (let dc = 0; dc < cols; dc++) {
      for (let dr = 0; dr < rows; dr++) {
        const sc = off(iso(piece.col + dc + 0.5, piece.row + dr + 0.5, topL, lh));
        const rx = (CELL_W / 2) * 0.36, ry = (CELL_H / 2) * 0.36;
        // Stud body
        s += poly(
          [
            { x: sc.x - rx, y: sc.y },
            { x: sc.x + rx, y: sc.y },
            { x: sc.x + rx, y: sc.y - STUD_H },
            { x: sc.x - rx, y: sc.y - STUD_H },
          ],
          c.side, "#00000022"
        );
        // Stud top
        s += `<ellipse cx="${sc.x.toFixed(1)}" cy="${(sc.y - STUD_H).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${c.stud}" stroke="#00000033" stroke-width="0.5"/>`;
        if (isNew) {
          s += `<ellipse cx="${sc.x.toFixed(1)}" cy="${(sc.y - STUD_H).toFixed(1)}" rx="${(rx + 1.5).toFixed(1)}" ry="${(ry + 1).toFixed(1)}" fill="none" stroke="#FFD700" stroke-width="1"/>`;
        }
      }
    }
    return s;
  }

  function drawArrow(piece: any): string {
    const lh = isPlate(piece.part) ? PLATE_H : BRICK_H;
    const cols = piece.colSpan || 1, rows = piece.rowSpan || 1;
    const tip = off(iso(piece.col + cols / 2, piece.row + rows / 2, (piece.layer || 1) + 2, lh));
    return `
      <line x1="${tip.x.toFixed(1)}" y1="${(tip.y - 22).toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${(tip.y - 6).toFixed(1)}" stroke="#FFD700" stroke-width="3" stroke-linecap="round"/>
      <polygon points="${tip.x.toFixed(1)},${(tip.y - 2).toFixed(1)} ${(tip.x - 7).toFixed(1)},${(tip.y - 14).toFixed(1)} ${(tip.x + 7).toFixed(1)},${(tip.y - 14).toFixed(1)}" fill="#FFD700"/>
    `;
  }

  // Parse baseplate size
  let bpCols = 16, bpRows = 16;
  if (baseplateSize) {
    const m = baseplateSize.match(/(\d+)x(\d+)/i);
    if (m) { bpCols = parseInt(m[1]); bpRows = parseInt(m[2]); }
  }

  // Sort pieces back-to-front, bottom-to-top
  const sorted = [...placedPieces].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer - b.layer;
    return (a.col + a.row) - (b.col + b.row);
  });

  let body = "";

  // Baseplate
  if (hasBaseplate) {
    const bc = { top: "#4CAF50", front: "#388E3C", side: "#2E7D32", stud: "#1B5E20" };
    const A = off(iso(1, 1, 0, BRICK_H));
    const B = off(iso(1 + bpCols, 1, 0, BRICK_H));
    const C = off(iso(1 + bpCols, 1 + bpRows, 0, BRICK_H));
    const D = off(iso(1, 1 + bpRows, 0, BRICK_H));
    const E = off(iso(1, 1 + bpRows, -0.4, BRICK_H));
    const F = off(iso(1 + bpCols, 1 + bpRows, -0.4, BRICK_H));
    const G = off(iso(1 + bpCols, 1, -0.4, BRICK_H));

    body += poly([A, B, C, D], bc.top, "#1B5E2055");
    body += poly([D, C, F, E], bc.side, "#1B5E2055");
    body += poly([B, C, F, G], bc.front, "#1B5E2055");

    // Stud grid on baseplate
    for (let dc = 0; dc < bpCols; dc++) {
      for (let dr = 0; dr < bpRows; dr++) {
        const sc = off(iso(1 + dc + 0.5, 1 + dr + 0.5, 0.12, BRICK_H));
        body += `<ellipse cx="${sc.x.toFixed(1)}" cy="${sc.y.toFixed(1)}" rx="3.8" ry="2.2" fill="${bc.stud}" stroke="#1B5E2033" stroke-width="0.3"/>`;
      }
    }
  }

  // Bricks
  for (const piece of sorted) {
    body += drawBrick(piece, newPieceIds.includes(piece.id));
  }

  // Arrows above new pieces
  for (const piece of placedPieces.filter((p) => newPieceIds.includes(p.id))) {
    body += drawArrow(piece);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
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
- The build sits on a baseplate. Front-left stud = column 1, row 1, layer 0 (the baseplate surface).
- Columns increase left→right (X axis). Rows increase front→back (Y axis). Layers increase bottom→up (Z axis, layer 1 = first brick layer on top of baseplate).
- A 2x4 brick placed horizontally at column 3, row 5, layer 1 occupies columns 3–6, row 5, layer 1.
- A 2x4 brick placed VERTICALLY at column 3, row 5, layer 1 occupies column 3, rows 5–8, layer 1.
- Pieces MUST physically connect: every piece must rest on the baseplate (layer 1) or on top of another piece exactly one layer below it. No floating pieces allowed.

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
