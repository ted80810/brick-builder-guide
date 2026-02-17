import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import PricingSection from "@/components/PricingSection";
import CommunityGallery from "@/components/CommunityGallery";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { FileText, Sparkles, Download } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "Describe Your Idea",
    description: "Tell us what you want to build and we'll generate detailed step-by-step instructions.",
  },
  {
    icon: FileText,
    title: "AI Creates the Manual",
    description: "Our AI generates illustrated pages with clear diagrams showing each building step.",
  },
  {
    icon: Download,
    title: "Download as PDF",
    description: "Export your completed manual as a beautiful, print-ready PDF document.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />

      {/* How It Works */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-5xl font-heading font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Three simple steps to your custom instruction manual
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                <div className="flex items-center justify-center mb-3">
                  <span className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground font-heading font-bold text-sm flex items-center justify-center mr-2">
                    {i + 1}
                  </span>
                  <h3 className="font-heading font-bold text-lg text-foreground">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <CommunityGallery />
      <PricingSection />
      <Footer />
    </div>
  );
};

export default Index;
