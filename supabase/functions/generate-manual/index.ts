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
    // Extract base64 content (remove data:image/png;base64, prefix)
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));

    const filePath = `${manualId}/step-${pageNumber}.png`;

    const { error } = await supabase.storage
      .from("manual-images")
      .upload(filePath, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

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

    const { manualId } = await req.json();
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

    // --- Step 1: Generate text instructions ---
    const systemPrompt = `You are a LEGO instruction manual creator. Generate detailed step-by-step building instructions for a LEGO Creator set model.

Your output must be a valid JSON object with this structure:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "Step title",
      "instructions": "Detailed building instructions for this step",
      "partsNeeded": ["list of LEGO parts needed for this step"],
      "tip": "Optional building tip"
    }
  ]
}

Rules:
- Each page represents one building step
- Be specific about brick colors, sizes (e.g., "2x4 red brick", "1x2 blue plate")
- Include helpful tips for tricky steps
- Start with the foundation/base and build upward
- Group related sub-assemblies together
- Make instructions clear enough for a beginner`;

    const userPrompt = `Create a ${manual.page_count}-page LEGO building manual for: "${manual.title}"

Description: ${manual.description}

Generate exactly ${manual.page_count} pages of step-by-step instructions. Return ONLY valid JSON.`;

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
              description: "Create a LEGO instruction manual with step-by-step pages",
              parameters: {
                type: "object",
                properties: {
                  pages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pageNumber: { type: "number" },
                        title: { type: "string" },
                        instructions: { type: "string" },
                        partsNeeded: { type: "array", items: { type: "string" } },
                        tip: { type: "string" },
                      },
                      required: ["pageNumber", "title", "instructions", "partsNeeded"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["pages"],
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
      content = jsonMatch ? JSON.parse(jsonMatch[0]) : { pages: [] };
    }

    // --- Step 2: Generate images for each step ---
    console.log(`Generating images for ${content.pages.length} steps...`);

    for (const page of content.pages) {
      try {
        const base64Image = await generateStepImage(
          page.title,
          page.instructions,
          page.partsNeeded,
          manual.title,
          LOVABLE_API_KEY
        );

        if (base64Image) {
          const publicUrl = await uploadImageToStorage(
            supabase,
            base64Image,
            manualId,
            page.pageNumber
          );
          if (publicUrl) {
            page.imageUrl = publicUrl;
            console.log(`Image generated for step ${page.pageNumber}`);
          }
        }
      } catch (imgError) {
        console.error(`Image generation failed for step ${page.pageNumber}:`, imgError);
        // Continue without image - not critical
      }
    }

    // Update manual with generated content (including image URLs)
    await supabase
      .from("manuals")
      .update({ content, status: "completed" })
      .eq("id", manualId);

    // Update pages used in subscription (best effort)
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
