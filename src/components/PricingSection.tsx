import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useAuth, STRIPE_TIERS } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const tiers = [
  {
    name: "Free Builder",
    price: "$0",
    period: "",
    description: "Perfect for trying small builds",
    features: [
      { text: "2 manuals per month", included: true },
      { text: "Basic illustrations", included: true },
      { text: "Watermarked PDF export", included: true },
      { text: "Shared in community gallery", included: true },
      { text: "Saves & prompt history", included: false },
      { text: "Priority generation", included: false },
    ],
    cta: "Get Started Free",
    variant: "outline" as const,
    highlight: false,
    plan: "free" as const,
  },
  {
    name: "Pro Builder",
    price: "$9",
    period: "/month",
    description: "For serious brick enthusiasts",
    features: [
      { text: "10 manuals per month", included: true },
      { text: "Advanced illustrations", included: true },
      { text: "No watermark PDF export", included: true },
      { text: "Private or public manuals", included: true },
      { text: "Prompt history & saves", included: true },
      { text: "Priority generation", included: true },
    ],
    cta: "Start Pro Plan",
    variant: "default" as const,
    highlight: true,
    plan: "pro" as const,
  },
  {
    name: "Master Builder",
    price: "$29",
    period: "/month",
    description: "Unlimited creativity, no limits",
    features: [
      { text: "Unlimited manuals", included: true },
      { text: "Premium illustrations", included: true },
      { text: "PDF export", included: true },
      { text: "Private or public manuals", included: true },
      { text: "Highest priority generation", included: true },
      { text: "Custom cover pages", included: true },
    ],
    cta: "Go Master",
    variant: "brick" as const,
    highlight: false,
    plan: "master" as const,
  },
];

const PricingSection = () => {
  const { user, subscription } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubscribe = async (plan: "free" | "pro" | "master") => {
    if (plan === "free") {
      navigate("/create");
      return;
    }

    if (!user) {
      toast({ title: "Please sign in first", variant: "destructive" });
      navigate("/auth");
      return;
    }

    try {
      const priceId = STRIPE_TIERS[plan].price_id;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <section id="pricing" className="py-20 bg-muted/40">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-5xl font-heading font-bold text-foreground mb-4">
            Pick Your Plan
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Small manuals are always free. Need more pages? We've got you covered.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((tier, i) => {
            const isCurrentPlan = subscription.plan === tier.plan;
            return (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative bg-card rounded-2xl p-8 shadow-card transition-all hover:shadow-card-hover ${
                  tier.highlight ? "ring-2 ring-primary scale-105" : ""
                } ${isCurrentPlan ? "ring-2 ring-brick-green" : ""}`}
              >
                {tier.highlight && !isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-heading font-bold px-4 py-1 rounded-full shadow-brick">
                    Most Popular
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brick-green text-brick-green-foreground text-xs font-heading font-bold px-4 py-1 rounded-full shadow-brick">
                    Your Plan
                  </div>
                )}
                <h3 className="font-heading font-bold text-xl text-foreground mb-1">{tier.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{tier.description}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-heading font-bold text-foreground">{tier.price}</span>
                  <span className="text-muted-foreground text-sm">{tier.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature.text} className="flex items-center gap-2 text-sm">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-brick-green flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className={feature.included ? "text-foreground" : "text-muted-foreground/50"}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={tier.variant}
                  className="w-full"
                  size="lg"
                  onClick={() => handleSubscribe(tier.plan)}
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan ? "Current Plan" : tier.cta}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
