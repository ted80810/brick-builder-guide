import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function detectBaseplate(allPages: any[]): { present: boolean; description: string } {
  const baseplateKeywords = ["baseplate", "base plate", "building plate", "green plate", "flat plate"];
  for (const page of allPages) {
    const text = `${page.title} ${page.instructions} ${JSON.stringify(page.partsNeeded)}`.toLowerCase();
    if (baseplateKeywords.some((kw) => text.includes(kw))) {
      const desc = page.partsNeeded
        ? (Array.isArray(page.partsNeeded)
            ? page.partsNeeded
                .filter((p: any) => {
                  const s = (typeof p === "string" ? p : `${p.color} ${p.part}`).toLowerCase();
                  return baseplateKeywords.some((kw) => s.includes(kw));
                })
                .map((p: any) => (typeof p === "string" ? p : `${p.color} ${p.part}`))
                .join(", ")
            : "")
        : "";
      return { present: true, description: desc || "baseplate" };
    }
  }
  return { present: false, description: "" };
}

function buildCumulativeDescription(allPages: any[], currentPageNumber: number): string {
  const priorSteps = allPages
    .filter((p: any) => p.pageNumber < currentPageNumber)
    .sort((a: any, b: any) => a.pageNumber - b.pageNumber);

  const baseplate = detectBaseplate(allPages);

  if (priorSteps.length === 0) {
    return baseplate.present
      ? `FIRST STEP — the only thing present is the ${baseplate.description}. Nothing else has been placed yet.`
      : "FIRST STEP — nothing has been placed yet. There is no baseplate for this build.";
  }

  const descriptions = priorSteps.map((p: any) => {
    const parts = Array.isArray(p.partsNeeded)
      ? p.partsNeeded.map((pt: any) => typeof pt === "string" ? pt : `${pt.quantity}x ${pt.color} ${pt.part}`).join(", ")
      : "";
    return `Step ${p.pageNumber} ("${p.title}"): ${p.instructions} [Parts placed: ${parts}]`;
  });

  const baseplateNote = baseplate.present
    ? `BASEPLATE: A ${baseplate.description} was introduced in this build and must remain visible in every step image as the permanent foundation.\n\n`
    : "";

  return `${baseplateNote}Steps completed so far (${priorSteps.length} of ${priorSteps.length + 1} total up to this point):\n${descriptions.join("\n")}`;
}

async function generateStepImage(
  title: string,
  instructions: string,
  newPartLabels: string[],
  manualTitle: string,
  apiKey: string,
  stepNumber: number,
  cumulativeContext: string,
  placedPieces: any[],
  newPieces: any[],
  hasBaseplate: boolean,
  baseplateSize: string | null,
): Promise<string | null> {
  try {
    // Build an exact visual description of the current state
    const placedDesc = placedPieces.length > 0
      ? placedPieces.map((p: any) => {
          const loc = p.orientation === "vertical"
            ? `col ${p.col}, rows ${p.row}–${p.row + (p.rowSpan || 1) - 1}, layer ${p.layer}`
            : `row ${p.row}, cols ${p.col}–${p.col + (p.colSpan || 1) - 1}, layer ${p.layer}`;
          return `  • ${p.color} ${p.part} at ${loc}${p.note ? ` (${p.note})` : ""}`;
        }).join("\n")
      : "  (none yet)";

    const newDesc = newPieces.length > 0
      ? newPieces.map((p: any) => {
          const loc = p.orientation === "vertical"
            ? `col ${p.col}, rows ${p.row}–${p.row + (p.rowSpan || 1) - 1}, layer ${p.layer}`
            : `row ${p.row}, cols ${p.col}–${p.col + (p.colSpan || 1) - 1}, layer ${p.layer}`;
          return `  • ${p.color} ${p.part} at ${loc}`;
        }).join("\n")
      : newPartLabels.map((l: string) => `  • ${l}`).join("\n");

    const baseplateNote = hasBaseplate
      ? `A flat ${baseplateSize || "green"} LEGO baseplate covers the entire bottom. It must always be visible beneath all pieces.`
      : "There is no baseplate — pieces sit directly on a flat surface.";

    const prompt = `You are illustrating Step ${stepNumber} ("${title}") of an official LEGO instruction manual for "${manualTitle}".

=== FOUNDATION ===
${baseplateNote}

=== COORDINATE SYSTEM (fixed — never change the camera angle between steps) ===
Stud grid: front-left = col 1, row 1. Columns increase left→right. Rows increase front→back. Layers increase bottom→up. Camera angle: fixed isometric view, slightly above, looking at the front-left corner.

=== ALL PIECES PRESENT AFTER THIS STEP (draw ALL of these) ===
${placedDesc}

=== NEW PIECES ADDED IN THIS STEP (highlight these in yellow) ===
${newDesc}

=== ILLUSTRATION RULES ===
- Draw every piece listed above at its EXACT grid position — do not invent or move any piece
- Each brick's stud count must match its size exactly (e.g. a 2x4 brick has 2 rows × 4 columns of studs)
- Previously placed pieces: draw in their listed colors, slightly muted
- New pieces: draw with a bright yellow outline/glow and placement arrows
- ${hasBaseplate ? "The baseplate must be visible as the bottom layer in every image" : "No baseplate"}
- White background, isometric 3D view, clean official LEGO manual style
- NO text, NO step numbers, NO labels`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error("Image generation failed:", response.status);
      return null;
    }

    const result = await response.json();
    const imageData = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    return imageData || null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}

async function uploadImageToStorage(
  supabase: any,
  base64Data: string,
  manualId: string,
  pageNumber: number
): Promise<string | null> {
  try {
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
    const filePath = `${manualId}/step-${pageNumber}.png`;

    const { error } = await supabase.storage
      .from("manual-images")
      .upload(filePath, binaryData, { contentType: "image/png", upsert: true });

    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("manual-images")
      .getPublicUrl(filePath);

    return urlData?.publicUrl || null;
  } catch (error) {
    console.error("Upload error:", error);
    return null;
  }
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

        const base64Image = await generateStepImage(
          page.title,
          page.instructions,
          newPieces.map((p: any) => `${p.color} ${p.part}`),
          manual.title,
          LOVABLE_API_KEY,
          page.pageNumber,
          buildCumulativeDescription(allPages, page.pageNumber),
          placedPieces,
          newPieces,
          modelDesign.hasBaseplate,
          modelDesign.baseplateSize,
        );

        if (base64Image) {
          const publicUrl = await uploadImageToStorage(supabase, base64Image, manualId, page.pageNumber);
          if (publicUrl) {
            page.imageUrl = publicUrl;
            console.log(`Image generated for step ${page.pageNumber}`);
          }
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
