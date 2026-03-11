import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateStepImage(
  title: string,
  instructions: string,
  partsNeeded: string[],
  manualTitle: string,
  apiKey: string
): Promise<string | null> {
  try {
    const prompt = `Create a clean, simple LEGO building instruction diagram for step: "${title}" of a "${manualTitle}" LEGO set. 
Show the LEGO bricks being assembled: ${instructions}
Parts used: ${partsNeeded.join(", ")}
Style: Clean technical illustration, isometric view, white background, colorful LEGO bricks, minimal text, similar to official LEGO instruction manuals. Show arrows indicating where pieces connect.`;

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

    const systemPrompt = `You are a LEGO instruction manual creator. Generate detailed step-by-step building instructions for a LEGO Creator set model.

Difficulty level: ${difficultyLevel}
Style: ${styleDescriptions[stylePreset] || styleDescriptions.classic}
${pieceConstraint}
${setConstraintPrompt}

Your output must be a valid JSON object with this structure:
{
  "difficulty": "${difficultyLevel}",
  "style": "${stylePreset}",
  "estimatedPieceCount": <number>,
  "sections": [
    {
      "sectionTitle": "Section name (e.g., Base, Walls, Roof)",
      "pages": [
        {
          "pageNumber": 1,
          "title": "Step title",
          "instructions": "Detailed building instructions for this step",
          "partsNeeded": [{"part": "2x4 Brick", "color": "Red", "quantity": 3}],
          "tip": "Optional building tip"
        }
      ]
    }
  ],
  "partsList": [
    {"part": "2x4 Brick", "color": "Red", "quantity": 8}
  ]
}

Rules:
- Each page represents one building step — ONE step = placing 1-3 pieces MAXIMUM
- NEVER skip steps. If a step says "place 4 bricks", break it into multiple steps (one per brick or pair)
- Each step's instructions must describe EXACTLY where to place each piece relative to previously placed pieces (e.g., "Place a red 2x4 brick on top of the blue brick from Step 2, aligned to the left edge")
- Use precise positional language: "on top of", "to the left of", "flush with the right edge", "centered on studs 3-6", "perpendicular to"
- Reference previous steps by number so the builder can orient themselves
- Group steps into logical sections (base, walls, roof, details, etc.) like official LEGO manuals
- Be specific about brick colors, sizes (e.g., "2x4 red brick", "1x2 blue plate")
- Include helpful tips for tricky steps or alignment
- Start with the foundation/base and build upward
- Group related sub-assemblies together
- Make instructions clear enough for a ${difficultyLevel.toLowerCase()} builder
- ${difficultyLevel === "Beginner" ? "Keep steps very simple with 1-2 pieces per step. Be extra verbose about placement." : difficultyLevel === "Advanced" ? "Can include 2-3 pieces per step with complex techniques" : "Use 1-3 pieces per step, balance detail with clarity"}
- Include a complete parts list at the end with totals
- partsNeeded should use the structured format with part, color, and quantity
- CRITICAL: Think through the entire build physically. Each step must logically follow the previous one. No piece should "float" — every piece must connect to an existing structure or the baseplate.`;

    const aiDecides = manual.page_count === 0;
    const userPrompt = aiDecides
      ? `Create a comprehensive LEGO building manual for: "${manual.title}"

Description: ${manual.description}

Generate as many steps as needed for a complete, detailed build. Do NOT skip steps. Every single piece placement should be documented. Return ONLY valid JSON.`
      : `Create a ${manual.page_count}-page LEGO building manual for: "${manual.title}"

Description: ${manual.description}

Generate exactly ${manual.page_count} pages of step-by-step instructions, organized into logical sections. Return ONLY valid JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_manual",
              description: "Create a LEGO instruction manual with sections and step-by-step pages",
              parameters: {
                type: "object",
                properties: {
                  difficulty: { type: "string" },
                  style: { type: "string" },
                  estimatedPieceCount: { type: "number" },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sectionTitle: { type: "string" },
                        pages: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              pageNumber: { type: "number" },
                              title: { type: "string" },
                              instructions: { type: "string" },
                              partsNeeded: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    part: { type: "string" },
                                    color: { type: "string" },
                                    quantity: { type: "number" },
                                    isExtra: { type: "boolean" },
                                    sourceNote: { type: "string" },
                                  },
                                  required: ["part", "color", "quantity"],
                                  additionalProperties: false,
                                },
                              },
                              tip: { type: "string" },
                            },
                            required: ["pageNumber", "title", "instructions", "partsNeeded"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["sectionTitle", "pages"],
                      additionalProperties: false,
                    },
                  },
                  partsList: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        part: { type: "string" },
                        color: { type: "string" },
                        quantity: { type: "number" },
                      },
                      required: ["part", "color", "quantity"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["difficulty", "style", "estimatedPieceCount", "sections", "partsList"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_manual" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        await supabase.from("manuals").update({ status: "failed" }).eq("id", manualId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await supabase.from("manuals").update({ status: "failed" }).eq("id", manualId);
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("AI generation failed");
    }

    const aiResult = await response.json();
    let content;

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      content = JSON.parse(toolCall.function.arguments);
    } else {
      const text = aiResult.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      content = jsonMatch ? JSON.parse(jsonMatch[0]) : { sections: [], partsList: [] };
    }

    // Flatten pages for image generation
    const allPages = content.sections?.flatMap((s: any) => s.pages) || content.pages || [];

    console.log(`Generating images for ${allPages.length} steps...`);

    for (const page of allPages) {
      try {
        const partsStr = Array.isArray(page.partsNeeded)
          ? page.partsNeeded.map((p: any) => typeof p === "string" ? p : `${p.quantity}x ${p.color} ${p.part}`).join(", ")
          : "";

        const base64Image = await generateStepImage(
          page.title,
          page.instructions,
          [partsStr],
          manual.title,
          LOVABLE_API_KEY
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
