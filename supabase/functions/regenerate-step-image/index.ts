import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    // Support both flat pages and sectioned content
    const allPages = content?.sections?.flatMap((s: any) => s.pages) || content?.pages || [];
    const page = allPages.find((p: any) => p.pageNumber === pageNumber);
    if (!page) throw new Error("Page not found");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Generate new image
    const prompt = `Create a clean, simple LEGO building instruction diagram for step: "${page.title}" of a "${manual.title}" LEGO set. 
Show the LEGO bricks being assembled: ${page.instructions}
Parts used: ${page.partsNeeded.join(", ")}
Style: Clean technical illustration, isometric view, white background, colorful LEGO bricks, minimal text, similar to official LEGO instruction manuals. Show arrows indicating where pieces connect.`;

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
