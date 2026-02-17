import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CommunityGallery from "@/components/CommunityGallery";
import { motion } from "framer-motion";

const Gallery = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl md:text-5xl font-heading font-bold text-foreground mb-4">
              Community Gallery
            </h1>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Browse free manuals created by the community. All manuals under 10 pages are shared here!
            </p>
          </motion.div>
        </div>
        <CommunityGallery showAll />
      </main>
      <Footer />
    </div>
  );
};

export default Gallery;
