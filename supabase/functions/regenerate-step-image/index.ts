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

    const { manualId, pageNumber } = await req.json();
    if (!manualId || !pageNumber) throw new Error("manualId and pageNumber are required");

    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
      .eq("id", manualId)
      .eq("user_id", userData.user.id)
      .single();

    if (manualError || !manual) throw new Error("Manual not found");

    const content = manual.content as any;
    const allPages = content?.sections?.flatMap((s: any) => s.pages) || content?.pages || [];
    const page = allPages.find((p: any) => p.pageNumber === pageNumber);
    if (!page) throw new Error("Page not found");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build cumulative context from all prior steps
    const cumulativeContext = buildCumulativeDescription(allPages, pageNumber);

    const partsStr = Array.isArray(page.partsNeeded)
      ? page.partsNeeded.map((p: any) => typeof p === "string" ? p : `${p.quantity}x ${p.color} ${p.part}`).join(", ")
      : "";

    const prompt = `You are producing one page of an official LEGO instruction manual for "${manual.title}". This is Step ${pageNumber}: "${page.title}".

=== SPATIAL COORDINATE SYSTEM (use this consistently across ALL steps) ===
The build uses a stud grid. Front-left corner = (1,1). Columns run left→right (X axis). Rows run front→back (Y axis). Height runs bottom→up (Z axis). ALWAYS use the same fixed isometric camera angle: slightly above, looking at the front-left corner. Do NOT rotate or shift the viewpoint between steps.

=== WHAT HAS BEEN BUILT SO FAR ===
${cumulativeContext}

=== WHAT TO ADD IN THIS STEP ===
${page.instructions}
New pieces: ${partsStr}

=== ILLUSTRATION RULES ===
- Draw the COMPLETE model as it exists AFTER this step — every piece from every prior step PLUS the new ones
- If a baseplate is mentioned in the build history above, it must remain visible in every image as the permanent foundation — never omit it
- NEW pieces added in this step: draw with a bright yellow outline or highlight so they stand out clearly
- Previously placed pieces: draw in their correct colors, slightly muted compared to the new pieces
- Draw placement arrows pointing to exactly where the new pieces connect on the stud grid
- Isometric 3D view, white background, clean technical style like official LEGO manuals
- NO text, NO step numbers, NO labels inside the image`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Image generation failed");
    }

    const result = await response.json();
    const base64Image = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Image) throw new Error("No image generated");

    // Upload to storage
    const base64Content = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
    const filePath = `${manualId}/step-${pageNumber}.png`;

    const { error: uploadError } = await supabase.storage
      .from("manual-images")
      .upload(filePath, binaryData, { contentType: "image/png", upsert: true });

    if (uploadError) throw new Error("Upload failed");

    const { data: urlData } = supabase.storage.from("manual-images").getPublicUrl(filePath);
    const publicUrl = urlData?.publicUrl;

    // Update the page in the original content structure and save
    const imageUrl = `${publicUrl}?t=${Date.now()}`;
    if (content.sections) {
      for (const section of content.sections) {
        for (let i = 0; i < section.pages.length; i++) {
          if (section.pages[i].pageNumber === pageNumber) {
            section.pages[i].imageUrl = imageUrl;
          }
        }
      }
    } else if (content.pages) {
      for (let i = 0; i < content.pages.length; i++) {
        if (content.pages[i].pageNumber === pageNumber) {
          content.pages[i].imageUrl = imageUrl;
        }
      }
    }
    await supabase.from("manuals").update({ content }).eq("id", manualId);

    return new Response(JSON.stringify({ success: true, imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("regenerate-step-image error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
