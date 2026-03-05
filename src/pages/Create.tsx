import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CreateManualForm from "@/components/CreateManualForm";
import PromptHistory from "@/components/PromptHistory";
import { motion } from "framer-motion";
import { useState, useRef } from "react";
import type { PromptHistoryEntry } from "@/components/PromptHistory";

const Create = () => {
  const formRef = useRef<{ loadFromHistory: (entry: PromptHistoryEntry) => void }>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 py-12 bg-brick-pattern">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl md:text-5xl font-heading font-bold text-foreground mb-4">
              Create Your Manual
            </h1>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Describe your build and we'll generate a detailed instruction manual with illustrations.
            </p>
          </motion.div>
          <PromptHistory onLoad={(entry) => formRef.current?.loadFromHistory(entry)} />
          <CreateManualForm ref={formRef} />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Create;
