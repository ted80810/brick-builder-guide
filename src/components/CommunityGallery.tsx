import { motion } from "framer-motion";
import { Eye, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import sampleManual1 from "@/assets/sample-manual-1.jpg";
import sampleManual2 from "@/assets/sample-manual-2.jpg";
import sampleManual3 from "@/assets/sample-manual-3.jpg";

const projects = [
  {
    id: 1,
    title: "Enchanted Castle",
    author: "BrickMaster42",
    pages: 8,
    image: sampleManual1,
    likes: 142,
  },
  {
    id: 2,
    title: "Galaxy Cruiser",
    author: "SpaceFan99",
    pages: 6,
    image: sampleManual2,
    likes: 98,
  },
  {
    id: 3,
    title: "Mech Warrior Bot",
    author: "RoboBuilder",
    pages: 9,
    image: sampleManual3,
    likes: 215,
  },
];

const CommunityGallery = ({ showAll = false }: { showAll?: boolean }) => {
  const displayed = showAll ? projects : projects;

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
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm text-foreground text-xs font-heading font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {project.pages} pages
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-heading font-bold text-lg text-foreground mb-1">{project.title}</h3>
                <p className="text-muted-foreground text-sm mb-3">by {project.author}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    ❤️ {project.likes}
                  </span>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Eye className="w-4 h-4" />
                    View Manual
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

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
