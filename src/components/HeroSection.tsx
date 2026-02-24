import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-lego.jpg";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-brick-pattern">
      <div className="container mx-auto px-4 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-brick-green/15 text-brick-green border border-brick-green/30 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              AI-Powered Manual Creator
            </div>
            <h1 className="text-4xl md:text-6xl font-heading font-bold text-foreground leading-tight mb-6">
              Build Your Dream
              <span className="text-gradient-primary block">Brick Manuals</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-lg">
              Describe your LEGO Creator set idea and get a detailed, step-by-step instruction manual with illustrations — exported as a beautiful PDF.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/create">
                <Button variant="hero">
                  Start Creating
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/gallery">
                <Button variant="hero-secondary">
                  Browse Gallery
                </Button>
              </Link>
            </div>

            <div className="flex items-center gap-6 mt-10 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brick-green" />
                Free small manuals
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                PDF export
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-secondary" />
                Community gallery
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-card">
              <img
                src={heroImage}
                alt="LEGO instruction manual with colorful bricks"
                className="w-full h-auto"
              />
            </div>
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -right-4 bg-brick-green text-brick-green-foreground rounded-xl px-4 py-2 shadow-brick font-heading font-bold text-sm"
            >
              ✨ AI Generated
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
