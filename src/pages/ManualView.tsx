import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Loader2, RefreshCw, Share2, Shuffle, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface PartItem {
  part: string;
  color: string;
  quantity: number;
}

interface ManualPage {
  pageNumber: number;
  title: string;
  instructions: string;
  partsNeeded: PartItem[] | string[];
  tip?: string;
  imageUrl?: string;
}

interface ManualSection {
  sectionTitle: string;
  pages: ManualPage[];
}

interface ManualContent {
  difficulty?: string;
  style?: string;
  estimatedPieceCount?: number;
  sections?: ManualSection[];
  pages?: ManualPage[]; // legacy flat format
  partsList?: PartItem[];
}

interface Manual {
  id: string;
  title: string;
  description: string;
  page_count: number;
  status: string;
  content: ManualContent | null;
  created_at: string;
  is_public: boolean;
}

const ManualView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [manual, setManual] = useState<Manual | null>(null);
  const [loading, setLoading] = useState(true);
  const [regeneratingPage, setRegeneratingPage] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchManual = async () => {
      if (!id) return;
      const { data, error } = await supabase
        .from("manuals")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) console.error("Error fetching manual:", error);
      setManual(data as unknown as Manual | null);
      setLoading(false);
    };
    fetchManual();
  }, [id]);

  const handleRegenerateImage = async (pageNumber: number) => {
    if (!manual) return;
    setRegeneratingPage(pageNumber);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "Please log in to regenerate images.", variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("regenerate-step-image", {
        body: { manualId: manual.id, pageNumber },
      });
      if (error) throw error;
      if (data?.imageUrl) {
        setManual(prev => {
          if (!prev?.content) return prev;
          const updatePages = (pages: ManualPage[]) =>
            pages.map(p => p.pageNumber === pageNumber ? { ...p, imageUrl: data.imageUrl } : p);

          if (prev.content.sections) {
            return {
              ...prev,
              content: {
                ...prev.content,
                sections: prev.content.sections.map(s => ({ ...s, pages: updatePages(s.pages) })),
              },
            };
          }
          if (prev.content.pages) {
            return { ...prev, content: { ...prev.content, pages: updatePages(prev.content.pages) } };
          }
          return prev;
        });
        toast({ title: "Image regenerated!", description: `Step ${pageNumber} image has been updated.` });
      }
    } catch (err: any) {
      console.error("Regenerate error:", err);
      toast({ title: "Regeneration failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setRegeneratingPage(null);
    }
  };

  const handleRemix = () => {
    if (!manual) return;
    const params = new URLSearchParams({
      remix: manual.id,
      title: manual.title,
      desc: manual.description,
    });
    navigate(`/create?${params.toString()}`);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!", description: "Share this URL with anyone." });
    } catch {
      toast({ title: "Copy failed", description: "Please copy the URL manually.", variant: "destructive" });
    }
  };

  const handleDownloadPDF = () => {
    if (!manual?.content) return;
    const allPages = getAllPages();
    const partsList = manual.content.partsList || [];

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${manual.title} - BrickBooks Manual</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&family=Inter:wght@400;500&display=swap');
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #1a1a2e; }
          h1 { font-family: 'Fredoka', sans-serif; color: #d32f2f; text-align: center; font-size: 2em; margin-bottom: 0.25em; }
          .subtitle { text-align: center; color: #666; margin-bottom: 0.5em; }
          .meta { text-align: center; margin-bottom: 2em; display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
          .meta-badge { background: #f0f0f0; padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-family: 'Fredoka', sans-serif; }
          .section-title { font-family: 'Fredoka', sans-serif; font-size: 1.5em; color: #2e7d32; margin: 1.5em 0 0.5em; border-bottom: 2px solid #2e7d32; padding-bottom: 4px; }
          .page { page-break-after: always; padding: 20px; margin-bottom: 20px; border: 2px solid #eee; border-radius: 12px; }
          .page:last-child { page-break-after: auto; }
          .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
          .step-number { background: #2e7d32; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Fredoka', sans-serif; font-weight: 700; font-size: 1.2em; }
          .page-title { font-family: 'Fredoka', sans-serif; font-size: 1.4em; font-weight: 600; }
          .instructions { line-height: 1.8; margin: 16px 0; font-size: 1em; }
          .parts { background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
          .parts h4 { font-family: 'Fredoka', sans-serif; margin: 0 0 8px 0; color: #333; }
          .parts ul { margin: 0; padding-left: 20px; }
          .parts li { margin: 4px 0; }
          .tip { background: #fff8e1; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-top: 12px; font-style: italic; }
          .parts-list-page { page-break-before: always; }
          .parts-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          .parts-table th, .parts-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
          .parts-table th { background: #2e7d32; color: white; font-family: 'Fredoka', sans-serif; }
          .parts-table tr:nth-child(even) { background: #f9f9f9; }
          .footer { text-align: center; color: #999; font-size: 0.8em; margin-top: 2em; }
          @media print { .page { border: none; } }
        </style>
      </head>
      <body>
        <h1>🧱 ${manual.title}</h1>
        <p class="subtitle">${manual.description}</p>
        <div class="meta">
          ${manual.content.difficulty ? `<span class="meta-badge">⚡ ${manual.content.difficulty}</span>` : ""}
          ${manual.content.estimatedPieceCount ? `<span class="meta-badge">🧩 ~${manual.content.estimatedPieceCount} pieces</span>` : ""}
          ${manual.content.style ? `<span class="meta-badge">🎨 ${manual.content.style}</span>` : ""}
          <span class="meta-badge">📄 ${manual.page_count} steps</span>
        </div>
        ${allPages.map(page => `
          <div class="page">
            <div class="page-header">
              <div class="step-number">${page.pageNumber}</div>
              <div class="page-title">${page.title}</div>
            </div>
            ${page.imageUrl ? `<div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden;"><img src="${page.imageUrl}" alt="Step ${page.pageNumber}" style="width: 100%; height: auto;" /></div>` : ''}
            <div class="instructions">${page.instructions}</div>
            <div class="parts">
              <h4>🔧 Parts Needed:</h4>
              <ul>
                ${renderPartsList(page.partsNeeded)}
              </ul>
            </div>
            ${page.tip ? `<div class="tip">💡 Tip: ${page.tip}</div>` : ''}
          </div>
        `).join('')}
        ${partsList.length > 0 ? `
          <div class="parts-list-page">
            <h2 class="section-title">📋 Complete Parts List</h2>
            <table class="parts-table">
              <thead><tr><th>Part</th><th>Color</th><th>Qty</th></tr></thead>
              <tbody>
                ${partsList.map(p => `<tr><td>${p.part}</td><td>${p.color}</td><td>${p.quantity}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
        <div class="footer">Generated by BrickBooks — AI-Powered LEGO Manual Creator</div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
    toast({ title: "PDF Ready", description: "Use your browser's Print dialog to save as PDF." });
  };

  const getAllPages = (): ManualPage[] => {
    if (!manual?.content) return [];
    if (manual.content.sections) {
      return manual.content.sections.flatMap(s => s.pages);
    }
    return manual.content.pages || [];
  };

  const renderPartsList = (parts: PartItem[] | string[]): string => {
    if (!parts || parts.length === 0) return "";
    if (typeof parts[0] === "string") {
      return (parts as string[]).map(p => `<li>${p}</li>`).join("");
    }
    return (parts as PartItem[]).map(p => `<li>${p.quantity}x ${p.color} ${p.part}</li>`).join("");
  };

  const renderPartsUI = (parts: PartItem[] | string[]) => {
    if (!parts || parts.length === 0) return null;
    if (typeof parts[0] === "string") {
      return (parts as string[]).map((p, i) => <li key={i}>{p}</li>);
    }
    return (parts as PartItem[]).map((p, i) => (
      <li key={i}>{p.quantity}x {p.color} {p.part}</li>
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!manual) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center flex-col gap-4">
          <h1 className="text-2xl font-heading font-bold text-foreground">Manual Not Found</h1>
          <Link to="/gallery">
            <Button variant="outline">Back to Gallery</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const allPages = getAllPages();
  const sections = manual.content?.sections;
  const partsList = manual.content?.partsList || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-2">
            <Link to="/gallery">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div className="flex gap-2">
              {manual.is_public && (
                <Button variant="outline" size="sm" onClick={handleRemix} className="gap-1">
                  <Shuffle className="w-4 h-4" />
                  Remix
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleShare} className="gap-1">
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {copied ? "Copied!" : "Share"}
              </Button>
              {manual.status === "completed" && allPages.length > 0 && (
                <Button size="sm" onClick={handleDownloadPDF} className="gap-1">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              )}
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Cover / header */}
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-2">
              {manual.title}
            </h1>
            <p className="text-muted-foreground mb-4">{manual.description}</p>

            {/* Meta badges */}
            {manual.content && (
              <div className="flex flex-wrap gap-2 mb-8">
                {manual.content.difficulty && (
                  <span className={`text-xs font-heading font-semibold px-3 py-1 rounded-full ${
                    manual.content.difficulty === "Beginner" ? "bg-brick-green/20 text-brick-green" :
                    manual.content.difficulty === "Intermediate" ? "bg-secondary/30 text-secondary-foreground" :
                    "bg-primary/20 text-primary"
                  }`}>
                    ⚡ {manual.content.difficulty}
                  </span>
                )}
                {manual.content.estimatedPieceCount && (
                  <span className="text-xs font-heading font-semibold px-3 py-1 rounded-full bg-accent/20 text-accent">
                    🧩 ~{manual.content.estimatedPieceCount} pieces
                  </span>
                )}
                {manual.content.style && (
                  <span className="text-xs font-heading font-semibold px-3 py-1 rounded-full bg-muted text-muted-foreground">
                    🎨 {manual.content.style}
                  </span>
                )}
                <span className="text-xs font-heading font-semibold px-3 py-1 rounded-full bg-brick-green/20 text-brick-green">
                  📄 {allPages.length} steps
                </span>
              </div>
            )}

            {manual.status === "generating" && (
              <div className="bg-card rounded-2xl p-12 shadow-card text-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                <p className="font-heading font-semibold text-foreground">Generating your manual...</p>
                <p className="text-muted-foreground text-sm mt-1">This may take a minute.</p>
              </div>
            )}

            {manual.status === "failed" && (
              <div className="bg-destructive/10 rounded-2xl p-8 text-center">
                <p className="font-heading font-semibold text-destructive">Generation failed</p>
                <p className="text-muted-foreground text-sm mt-1">Please try creating a new manual.</p>
              </div>
            )}

            {manual.status === "completed" && allPages.length > 0 && (
              <div className="space-y-8">
                {/* Render by sections if available, otherwise flat */}
                {sections ? sections.map((section, si) => (
                  <div key={si}>
                    <h2 className="text-xl md:text-2xl font-heading font-bold text-brick-green mb-4 border-b-2 border-brick-green/30 pb-2">
                      {section.sectionTitle}
                    </h2>
                    <div className="space-y-6">
                      {section.pages.map((page) => renderPage(page))}
                    </div>
                  </div>
                )) : (
                  <div className="space-y-6">
                    {allPages.map((page) => renderPage(page))}
                  </div>
                )}

                {/* Parts List Page */}
                {partsList.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-2xl p-6 shadow-card"
                  >
                    <h2 className="text-xl md:text-2xl font-heading font-bold text-brick-green mb-4">
                      📋 Complete Parts List
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-brick-green/30">
                            <th className="text-left py-2 px-3 font-heading font-semibold text-foreground">Part</th>
                            <th className="text-left py-2 px-3 font-heading font-semibold text-foreground">Color</th>
                            <th className="text-right py-2 px-3 font-heading font-semibold text-foreground">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partsList.map((p, i) => (
                            <tr key={i} className="border-b border-border">
                              <td className="py-2 px-3 text-foreground">{p.part}</td>
                              <td className="py-2 px-3 text-muted-foreground">{p.color}</td>
                              <td className="py-2 px-3 text-right font-semibold text-foreground">{p.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Total: ~{partsList.reduce((sum, p) => sum + p.quantity, 0)} pieces
                    </p>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );

  function renderPage(page: ManualPage) {
    return (
      <motion.div
        key={page.pageNumber}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: page.pageNumber * 0.03 }}
        className="bg-card rounded-2xl p-6 shadow-card"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-brick-green flex items-center justify-center">
            <span className="text-brick-green-foreground font-heading font-bold">
              {page.pageNumber}
            </span>
          </div>
          <h3 className="font-heading font-bold text-xl text-foreground">{page.title}</h3>
        </div>

        {page.imageUrl && (
          <div className="mb-4 rounded-xl overflow-hidden border border-border relative group">
            <img
              src={page.imageUrl}
              alt={`Step ${page.pageNumber}: ${page.title}`}
              className="w-full h-auto"
              loading="lazy"
            />
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity gap-1"
              onClick={() => handleRegenerateImage(page.pageNumber)}
              disabled={regeneratingPage === page.pageNumber}
            >
              <RefreshCw className={`w-3 h-3 ${regeneratingPage === page.pageNumber ? 'animate-spin' : ''}`} />
              {regeneratingPage === page.pageNumber ? "Regenerating..." : "Regenerate"}
            </Button>
          </div>
        )}

        {!page.imageUrl && (
          <Button
            size="sm"
            variant="outline"
            className="mb-4 gap-1"
            onClick={() => handleRegenerateImage(page.pageNumber)}
            disabled={regeneratingPage === page.pageNumber}
          >
            <RefreshCw className={`w-3 h-3 ${regeneratingPage === page.pageNumber ? 'animate-spin' : ''}`} />
            {regeneratingPage === page.pageNumber ? "Generating..." : "Generate Image"}
          </Button>
        )}

        <p className="text-foreground leading-relaxed mb-4">{page.instructions}</p>

        <div className="bg-muted rounded-xl p-4 mb-3">
          <h4 className="font-heading font-semibold text-sm text-foreground mb-2">🔧 Parts Needed:</h4>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {renderPartsUI(page.partsNeeded)}
          </ul>
        </div>

        {page.tip && (
          <div className="bg-secondary/20 border-l-4 border-secondary rounded-r-xl p-3">
            <p className="text-sm text-foreground">💡 <strong>Tip:</strong> {page.tip}</p>
          </div>
        )}
      </motion.div>
    );
  }
};

export default ManualView;
