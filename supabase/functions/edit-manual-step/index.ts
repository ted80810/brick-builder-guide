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

    const { manualId, action, pageNumber, editPrompt, sectionIndex } = await req.json();
    if (!manualId) throw new Error("manualId is required");

    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
      .eq("id", manualId)
      .eq("user_id", userData.user.id)
      .single();

    if (manualError || !manual) throw new Error("Manual not found");

    const content = manual.content as any;
    if (!content) throw new Error("Manual has no content");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const allPages = content.sections?.flatMap((s: any) => s.pages) || content.pages || [];
    const currentPage = allPages.find((p: any) => p.pageNumber === pageNumber);

    if (action === "delete" && currentPage) {
      // Remove the step
      if (content.sections) {
        for (const section of content.sections) {
          section.pages = section.pages.filter((p: any) => p.pageNumber !== pageNumber);
        }
        // Remove empty sections
        content.sections = content.sections.filter((s: any) => s.pages.length > 0);
        // Renumber
        let num = 1;
        for (const section of content.sections) {
          for (const page of section.pages) {
            page.pageNumber = num++;
          }
        }
      } else if (content.pages) {
        content.pages = content.pages.filter((p: any) => p.pageNumber !== pageNumber);
        content.pages.forEach((p: any, i: number) => { p.pageNumber = i + 1; });
      }

      await supabase.from("manuals").update({ content }).eq("id", manualId);
      return new Response(JSON.stringify({ success: true, content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "edit" && currentPage && editPrompt) {
      const systemPrompt = `You are editing a single step in a LEGO building manual titled "${manual.title}".
Current step ${pageNumber}: "${currentPage.title}"
Instructions: ${currentPage.instructions}
Parts needed: ${JSON.stringify(currentPage.partsNeeded)}
${currentPage.tip ? `Tip: ${currentPage.tip}` : ""}

The user wants to modify this step. Return the updated step as JSON.`;

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
            { role: "user", content: editPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "update_step",
              description: "Update a LEGO building step",
              parameters: {
                type: "object",
                properties: {
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
                      },
                      required: ["part", "color", "quantity"],
                      additionalProperties: false,
                    },
                  },
                  tip: { type: "string" },
                },
                required: ["title", "instructions", "partsNeeded"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "update_step" } },
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
        throw new Error("AI generation failed");
      }

      const aiResult = await response.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      let updatedStep;
      if (toolCall) {
        updatedStep = JSON.parse(toolCall.function.arguments);
      } else {
        const text = aiResult.choices?.[0]?.message?.content || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        updatedStep = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      }

      if (!updatedStep) throw new Error("Failed to parse AI response");

      // Apply the update
      if (content.sections) {
        for (const section of content.sections) {
          for (let i = 0; i < section.pages.length; i++) {
            if (section.pages[i].pageNumber === pageNumber) {
              section.pages[i] = { ...section.pages[i], ...updatedStep, pageNumber };
            }
          }
        }
      } else if (content.pages) {
        for (let i = 0; i < content.pages.length; i++) {
          if (content.pages[i].pageNumber === pageNumber) {
            content.pages[i] = { ...content.pages[i], ...updatedStep, pageNumber };
          }
        }
      }

      await supabase.from("manuals").update({ content }).eq("id", manualId);
      return new Response(JSON.stringify({ success: true, content, updatedStep }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add" && editPrompt) {
      // Add a new step after the specified page number (or at end)
      const insertAfter = pageNumber || allPages.length;

      const systemPrompt = `You are adding a new step to a LEGO building manual titled "${manual.title}".
Description: ${manual.description}
This step will be inserted after step ${insertAfter} of ${allPages.length} total steps.
${insertAfter > 0 && allPages[insertAfter - 1] ? `Previous step: "${allPages[insertAfter - 1].title}" - ${allPages[insertAfter - 1].instructions}` : ""}
${insertAfter < allPages.length && allPages[insertAfter] ? `Next step: "${allPages[insertAfter].title}" - ${allPages[insertAfter].instructions}` : ""}

The user wants: ${editPrompt}

Create a new building step that fits logically between the previous and next steps.`;

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
            { role: "user", content: editPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "create_step",
              description: "Create a new LEGO building step",
              parameters: {
                type: "object",
                properties: {
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
                      },
                      required: ["part", "color", "quantity"],
                      additionalProperties: false,
                    },
                  },
                  tip: { type: "string" },
                },
                required: ["title", "instructions", "partsNeeded"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "create_step" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("AI generation failed");
      }

      const aiResult = await response.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      let newStep;
      if (toolCall) {
        newStep = JSON.parse(toolCall.function.arguments);
      } else {
        const text = aiResult.choices?.[0]?.message?.content || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        newStep = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      }

      if (!newStep) throw new Error("Failed to parse AI response");

      newStep.pageNumber = insertAfter + 1;

      // Insert into sections or flat pages
      if (content.sections) {
        // Find which section to insert into based on insertAfter
        let found = false;
        let cumulative = 0;
        for (const section of content.sections) {
          if (cumulative + section.pages.length >= insertAfter) {
            const localIdx = insertAfter - cumulative;
            section.pages.splice(localIdx, 0, newStep);
            found = true;
            break;
          }
          cumulative += section.pages.length;
        }
        if (!found && content.sections.length > 0) {
          content.sections[content.sections.length - 1].pages.push(newStep);
        }
        // Renumber all
        let num = 1;
        for (const section of content.sections) {
          for (const page of section.pages) {
            page.pageNumber = num++;
          }
        }
      } else if (content.pages) {
        content.pages.splice(insertAfter, 0, newStep);
        content.pages.forEach((p: any, i: number) => { p.pageNumber = i + 1; });
      }

      await supabase.from("manuals").update({ content }).eq("id", manualId);
      return new Response(JSON.stringify({ success: true, content, newStep }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("edit-manual-step error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
