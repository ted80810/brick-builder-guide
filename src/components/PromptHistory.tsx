import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export interface PromptHistoryEntry {
  id: string;
  title: string;
  description: string;
  page_count: number;
  difficulty: string;
  piece_target: number | null;
  style: string;
  manual_id: string | null;
  created_at: string;
}

interface PromptHistoryProps {
  onLoad: (entry: PromptHistoryEntry) => void;
}

const PromptHistory = ({ onLoad }: PromptHistoryProps) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PromptHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    const { data } = await supabase
      .from("prompt_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setEntries((data as PromptHistoryEntry[]) || []);
    setLoading(false);
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("prompt_history").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  if (!user || loading) return null;
  if (entries.length === 0) return null;

  return (
    <div className="max-w-2xl mx-auto mb-6">
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors font-heading font-semibold text-sm select-none">
          <Clock className="w-4 h-4" />
          Prompt History ({entries.length})
        </summary>
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
          <AnimatePresence>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-semibold text-foreground text-sm truncate">
                    {entry.title}
                  </p>
                  <p className="text-muted-foreground text-xs truncate">
                    {entry.difficulty} · {entry.style} · {entry.page_count}p
                    {entry.piece_target ? ` · ~${entry.piece_target} pcs` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-shrink-0"
                  onClick={() => onLoad(entry)}
                  title="Re-use this prompt"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-shrink-0 text-destructive hover:text-destructive"
                  onClick={() => deleteEntry(entry.id)}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </details>
    </div>
  );
};

export default PromptHistory;
