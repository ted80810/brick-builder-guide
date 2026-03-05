// CreateManualForm - standard function component
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, AlertCircle, Loader2 } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import LegoSetSelector from "@/components/LegoSetSelector";
import type { PromptHistoryEntry } from "@/components/PromptHistory";

const DIFFICULTY_LABELS = ["Beginner", "Intermediate", "Advanced"] as const;
const STYLE_PRESETS = [
  { id: "classic", label: "Classic", emoji: "🧱" },
  { id: "retro", label: "Retro", emoji: "📺" },
  { id: "futuristic", label: "Futuristic", emoji: "🚀" },
  { id: "minimalist", label: "Minimalist", emoji: "◻️" },
  { id: "detailed", label: "Detailed", emoji: "🔍" },
  { id: "whimsical", label: "Whimsical", emoji: "🎪" },
] as const;

interface CreateManualFormProps {
  loadedEntry?: PromptHistoryEntry | null;
  onEntryLoaded?: () => void;
}

const CreateManualForm = ({ loadedEntry, onEntryLoaded }: CreateManualFormProps) => {
  const [searchParams] = useSearchParams();
  const remixFrom = searchParams.get("remix");
  const remixTitle = searchParams.get("title") || "";
  const remixDesc = searchParams.get("desc") || "";

  const [idea, setIdea] = useState(remixDesc);
  const [pages, setPages] = useState<string>("5");
  const [title, setTitle] = useState(remixFrom ? `Remix: ${remixTitle}` : "");
  const [difficulty, setDifficulty] = useState(0);
  const [pieceTarget, setPieceTarget] = useState<string>("");
  const [style, setStyle] = useState<string>("classic");
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [allowExtras, setAllowExtras] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (loadedEntry) {
      setTitle(loadedEntry.title);
      setIdea(loadedEntry.description);
      setPages(String(loadedEntry.page_count));
      setDifficulty(DIFFICULTY_LABELS.indexOf(loadedEntry.difficulty as any) ?? 0);
      setPieceTarget(loadedEntry.piece_target ? String(loadedEntry.piece_target) : "");
      setStyle(loadedEntry.style);
      toast({ title: "Prompt loaded", description: "Edit anything and re-generate!" });
      onEntryLoaded?.();
    }
  }, [loadedEntry]);

  const isMaster = subscription.plan === "master";
  const isPro = subscription.plan === "pro";
  const pageCount = pages === "auto" ? 0 : (parseInt(pages) || 0);
  const isFree = !isMaster && !isPro && pageCount <= 10;
  const canGenerate = isMaster || isPro || isFree;

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
      const { data: manual, error: insertError } = await supabase
        .from("manuals")
        .insert({
          user_id: user.id,
          title,
          description: idea,
          page_count: pages === "auto" ? 0 : pageCount,
          is_public: isFree,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const { data, error } = await supabase.functions.invoke("generate-manual", {
        body: {
          manualId: manual.id,
          difficulty: DIFFICULTY_LABELS[difficulty],
          pieceTarget: pieceTarget ? parseInt(pieceTarget) : null,
          style,
          selectedSets: selectedSets.length > 0 ? selectedSets : null,
          allowExtras,
        },
      });

      if (error) throw error;

      // Save to prompt history
      await supabase.from("prompt_history").insert({
        user_id: user.id,
        title,
        description: idea,
        page_count: pageCount,
        difficulty: DIFFICULTY_LABELS[difficulty],
        piece_target: pieceTarget ? parseInt(pieceTarget) : null,
        style,
        manual_id: manual.id,
      } as any);

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
        {/* Title */}
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

        {/* Description */}
        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Describe Your Build Idea
          </label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe what you want to build in detail. Include colors, themes, special features..."
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body resize-none"
            required
          />
        </div>

        {/* LEGO Set Selector */}
        <LegoSetSelector
          selectedSets={selectedSets}
          onSelectionChange={setSelectedSets}
          allowExtras={allowExtras}
          onAllowExtrasChange={setAllowExtras}
        />

        {/* Difficulty Slider */}
        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Difficulty Level
          </label>
          <div className="flex items-center gap-4">
            <Slider
              value={[difficulty]}
              onValueChange={([v]) => setDifficulty(v)}
              max={2}
              step={1}
              className="flex-1"
            />
            <span className={`text-sm font-heading font-semibold px-3 py-1 rounded-full ${
              difficulty === 0 ? "bg-brick-green/20 text-brick-green" :
              difficulty === 1 ? "bg-secondary/30 text-secondary-foreground" :
              "bg-primary/20 text-primary"
            }`}>
              {DIFFICULTY_LABELS[difficulty]}
            </span>
          </div>
        </div>

        {/* Piece Count Target */}
        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Piece Count Target <span className="text-muted-foreground font-normal text-sm">(optional)</span>
          </label>
          <input
            type="number"
            min="10"
            max="5000"
            value={pieceTarget}
            onChange={(e) => setPieceTarget(e.target.value)}
            placeholder="e.g., 200 — leave blank for no limit"
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body"
          />
        </div>

        {/* Style Presets */}
        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Style Preset
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setStyle(preset.id)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm font-heading font-medium ${
                  style === preset.id
                    ? "border-brick-green bg-brick-green/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40"
                }`}
              >
                <span className="text-lg">{preset.emoji}</span>
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Page Count */}
        <div>
          <label className="block font-heading font-semibold text-foreground mb-2">
            Number of Steps
          </label>
          {isMaster ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPages("auto")}
                  className={`flex-1 px-4 py-3 rounded-xl border font-body text-sm transition-all ${
                    pages === "auto"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-input bg-background text-foreground hover:bg-secondary/50"
                  }`}
                >
                  🤖 AI Decides
                </button>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={pages === "auto" ? "" : pages}
                  onChange={(e) => setPages(e.target.value || "auto")}
                  placeholder="Or set manually"
                  className="flex-1 px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body"
                />
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-brick-green/10">
                <Sparkles className="w-5 h-5 text-brick-green flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-heading font-semibold text-foreground text-sm">Master Builder — No Limits</p>
                  <p className="text-muted-foreground text-xs">
                    {pages === "auto"
                      ? "The AI will generate as many comprehensive steps as needed."
                      : "You can set any number of steps, or let the AI decide."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <input
                type="number"
                min="1"
                max="100"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-body"
                required
              />
              <div className={`flex items-start gap-3 p-4 rounded-xl mt-3 ${isFree ? "bg-brick-green/10" : "bg-secondary/50"}`}>
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
