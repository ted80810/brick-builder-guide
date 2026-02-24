import { motion } from "framer-motion";
import { Eye, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import sampleManual1 from "@/assets/sample-manual-1.jpg";
import sampleManual2 from "@/assets/sample-manual-2.jpg";
import sampleManual3 from "@/assets/sample-manual-3.jpg";

const sampleImages = [sampleManual1, sampleManual2, sampleManual3];

interface Manual {
  id: string;
  title: string;
  description: string;
  page_count: number;
  created_at: string;
  profiles?: { display_name: string | null } | null;
}

const CommunityGallery = ({ showAll = false }: { showAll?: boolean }) => {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchManuals = async () => {
      const query = supabase
        .from("manuals")
        .select("id, title, description, page_count, created_at")
        .eq("is_public", true)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (!showAll) {
        query.limit(6);
      }

      const { data, error } = await query;
      if (!error && data) {
        setManuals(data);
      }
      setLoading(false);
    };

    fetchManuals();
  }, [showAll]);

  // If no real manuals yet, show placeholder data
  const placeholderManuals = [
    { id: "demo-1", title: "Enchanted Castle", description: "A magical castle", page_count: 8, created_at: "", author: "BrickMaster42" },
    { id: "demo-2", title: "Galaxy Cruiser", description: "Space ship", page_count: 6, created_at: "", author: "SpaceFan99" },
    { id: "demo-3", title: "Mech Warrior Bot", description: "Robot mech", page_count: 9, created_at: "", author: "RoboBuilder" },
  ];

  const displayed = manuals.length > 0 ? manuals : placeholderManuals;

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        {!showAll && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-5xl font-heading font-bold text-foreground mb-4">
              Community Creations
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Check out what other builders have created — all free manuals are shared with the community!
            </p>
          </motion.div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading community manuals...</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {displayed.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group bg-card rounded-2xl overflow-hidden shadow-card transition-all hover:shadow-card-hover"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                  <img
                    src={sampleImages[i % sampleImages.length]}
                    alt={project.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-3 right-3 bg-brick-green/90 backdrop-blur-sm text-brick-green-foreground text-xs font-heading font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {project.page_count} pages
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-heading font-bold text-lg text-foreground mb-1">{project.title}</h3>
                  <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{project.description}</p>
                  <div className="flex items-center justify-end">
                    {project.id.startsWith("demo-") ? (
                      <Button variant="ghost" size="sm" className="gap-1" disabled>
                        <Eye className="w-4 h-4" />
                        Demo
                      </Button>
                    ) : (
                      <Link to={`/manual/${project.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="w-4 h-4" />
                          View Manual
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!showAll && (
          <div className="text-center mt-10">
            <Link to="/gallery">
              <Button variant="outline" size="lg">
                View All Community Manuals
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default CommunityGallery;
