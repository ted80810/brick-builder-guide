import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, AlertCircle } from "lucide-react";
import { useState } from "react";

const CreateManualForm = () => {
  const [idea, setIdea] = useState("");
  const [pages, setPages] = useState<string>("5");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pageCount = parseInt(pages) || 0;
  const isFree = pageCount <= 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Placeholder - will need backend
    setTimeout(() => setIsSubmitting(false), 2000);
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
                <p className="font-heading font-semibold text-foreground text-sm">Subscription Required</p>
                <p className="text-muted-foreground text-xs">
                  Manuals over 10 pages require a Pro ($9/mo) or Master ($29/mo) plan. 
                  Pro includes 500 pages/month.
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
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            "Generating Manual..."
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Manual
            </>
          )}
        </Button>
      </motion.form>
    </div>
  );
};

export default CreateManualForm;
