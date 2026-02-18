import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CreateManualForm = () => {
  const [idea, setIdea] = useState("");
  const [pages, setPages] = useState<string>("5");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const pageCount = parseInt(pages) || 0;
  const isFree = pageCount <= 10;
  const canGenerate = isFree || subscription.plan !== "free";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({ title: "Please sign in", description: "You need an account to create manuals.", variant: "destructive" });
      navigate("/auth");
      return;
    }

    if (!canGenerate) {
      toast({ title: "Subscription required", description: "Manuals over 10 pages require a Pro or Master plan.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create manual record
      const { data: manual, error: insertError } = await supabase
        .from("manuals")
        .insert({
          user_id: user.id,
          title,
          description: idea,
          page_count: pageCount,
          is_public: isFree,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call generate function
      const { data, error } = await supabase.functions.invoke("generate-manual", {
        body: { manualId: manual.id },
      });

      if (error) throw error;

      toast({ title: "Manual generated!", description: "Your instruction manual is ready to view." });
      navigate(`/manual/${manual.id}`);
    } catch (err: any) {
      console.error("Generation error:", err);
      toast({ title: "Generation failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl p-8 shadow-card space-y-6"
      >
        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Manual Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Medieval Dragon Tower"
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body"
            required
          />
        </div>

        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Describe Your Build Idea
          </label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe what you want to build in detail. Include colors, themes, special features, and any specific LEGO Creator set pieces you'd like to use..."
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body resize-none"
            required
          />
        </div>

        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Number of Pages
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={pages}
            onChange={(e) => setPages(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body"
            required
          />
        </div>

        <div className={`flex items-start gap-3 p-4 rounded-xl ${isFree ? "bg-brick-green/10" : "bg-secondary/50"}`}>
          {isFree ? (
            <>
              <FileText className="w-5 h-5 text-brick-green flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading font-semibold text-foreground text-sm">Free Manual</p>
                <p className="text-muted-foreground text-xs">
                  Manuals with 10 pages or less are free! Your manual will be shared in the community gallery.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-brick-orange flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading font-semibold text-foreground text-sm">
                  {subscription.plan !== "free" ? `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan Active` : "Subscription Required"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {subscription.plan !== "free"
                    ? "You can generate this manual with your current plan."
                    : "Manuals over 10 pages require a Pro ($9/mo) or Master ($29/mo) plan."}
                </p>
              </div>
            </>
          )}
        </div>

        <Button
          type="submit"
          variant="default"
          size="lg"
          className="w-full"
          disabled={isSubmitting || (!canGenerate && !isFree)}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Manual...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Manual
            </>
          )}
        </Button>

        {!user && (
          <p className="text-center text-sm text-muted-foreground">
            You'll need to{" "}
            <a href="/auth" className="text-primary font-semibold hover:underline">sign in</a>
            {" "}to generate manuals.
          </p>
        )}
      </motion.form>
    </div>
  );
};

export default CreateManualForm;
