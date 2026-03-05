import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type SubscriptionPlan = "free" | "pro" | "master";

interface SubscriptionInfo {
  plan: SubscriptionPlan;
  pagesUsed: number;
  pagesLimit: number;
  subscriptionEnd?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscription: SubscriptionInfo;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
}

const defaultSubscription: SubscriptionInfo = {
  plan: "free",
  pagesUsed: 0,
  pagesLimit: 10,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  subscription: defaultSubscription,
  refreshSubscription: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Stripe product/price mapping
export const STRIPE_TIERS = {
  pro: {
    price_id: "price_1T24peDyJMUkaMcJZgxKCUm3",
    product_id: "prod_U04zzR3sEsekYN",
  },
  master: {
    price_id: "price_1T24pjDyJMUkaMcJJadBVkq7",
    product_id: "prod_U04ziq03ZKomOa",
  },
} as const;

function getplanFromProductId(productId: string | null): SubscriptionPlan {
  if (productId === STRIPE_TIERS.pro.product_id) return "pro";
  if (productId === STRIPE_TIERS.master.product_id) return "master";
  return "free";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(defaultSubscription);

  const refreshSubscription = async () => {
    if (!session) {
      setSubscription(defaultSubscription);
      return;
    }

    try {
      // Check Stripe subscription
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;

      if (data?.subscribed) {
        const plan = getplanFromProductId(data.product_id);
        setSubscription({
          plan,
          pagesUsed: 0,
          pagesLimit: plan === "master" ? 999999 : 500,
          subscriptionEnd: data.subscription_end,
        });
      } else {
        // Check local subscription table for page usage
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        const dbPlan = (subData?.plan as SubscriptionPlan) || "free";
        setSubscription({
          plan: dbPlan,
          pagesUsed: subData?.pages_used ?? 0,
          pagesLimit: dbPlan === "master" ? 999999 : dbPlan === "pro" ? 500 : 10,
        });
      }
    } catch (err) {
      console.error("Failed to check subscription:", err);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSubscription(defaultSubscription);
  };

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => authSub.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      refreshSubscription();
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ user, session, loading, subscription, refreshSubscription, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
