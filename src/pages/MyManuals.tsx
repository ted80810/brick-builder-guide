import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Loader2, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface Manual {
  id: string;
  title: string;
  description: string;
  page_count: number;
  status: string;
  is_public: boolean;
  created_at: string;
}

const MyManuals = () => {
  const { user, loading: authLoading } = useAuth();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user) fetchManuals();
  }, [user, authLoading]);

  const fetchManuals = async () => {
    const { data, error } = await supabase
      .from("manuals")
      .select("id, title, description, page_count, status, is_public, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (!error && data) setManuals(data);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("manuals").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting manual", variant: "destructive" });
    } else {
      setManuals((prev) => prev.filter((m) => m.id !== id));
      toast({ title: "Manual deleted" });
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-brick-green/20 text-brick-green",
      generating: "bg-secondary/40 text-secondary-foreground",
      pending: "bg-muted text-muted-foreground",
      failed: "bg-destructive/20 text-destructive",
    };
    return (
      <span className={`text-xs font-heading font-semibold px-2 py-1 rounded-full ${styles[status] || styles.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 py-12 bg-brick-pattern">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">My Manuals</h1>
              <p className="text-muted-foreground text-sm mt-1">All your generated instruction manuals</p>
            </div>
            <Link to="/create">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Manual
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            </div>
          ) : manuals.length === 0 ? (
            <div className="bg-card rounded-2xl p-12 shadow-card text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-heading font-bold text-xl text-foreground mb-2">No manuals yet</h2>
              <p className="text-muted-foreground mb-6">Create your first LEGO instruction manual!</p>
              <Link to="/create">
                <Button>Create Manual</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {manuals.map((manual, i) => (
                <motion.div
                  key={manual.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-xl p-5 shadow-card flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading font-bold text-foreground truncate">{manual.title}</h3>
                      {statusBadge(manual.status)}
                      {manual.is_public && (
                        <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-heading">Public</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{manual.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{manual.page_count} pages · {new Date(manual.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {manual.status === "completed" && (
                      <Link to={`/manual/${manual.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(manual.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default MyManuals;
