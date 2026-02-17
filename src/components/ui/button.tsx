import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold font-heading ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-[2px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-brick hover:shadow-brick-hover hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground shadow-brick hover:shadow-brick-hover",
        outline: "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-brick hover:shadow-brick-hover hover:brightness-105",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-accent text-accent-foreground shadow-brick hover:shadow-brick-hover hover:brightness-110",
        hero: "bg-primary text-primary-foreground shadow-brick hover:shadow-brick-hover text-lg px-8 py-4 rounded-xl hover:brightness-110",
        "hero-secondary": "bg-card text-foreground border-2 border-border shadow-brick hover:shadow-brick-hover text-lg px-8 py-4 rounded-xl hover:border-primary",
        brick: "bg-brick-green text-brick-green-foreground shadow-brick hover:shadow-brick-hover hover:brightness-110 rounded-xl",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
