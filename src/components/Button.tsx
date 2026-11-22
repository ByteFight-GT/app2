"use client";

import React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { LoadingSpinner } from "./LoadingSpinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip"
import styles from "./Button.module.css"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition duration-100 "+
  "[&:not(:disabled)]:cursor-pointer "+
  "disabled:brightness-50 disabled:saturate-80 "+
  styles["dark-on-hover-active"],
  {
    variants: {
      variant: {
        default: 
          styles["button-bevel"] + " bg-primary text-negative-foreground ",
        complementary:
          styles["button-bevel"] + " bg-complementary text-foreground ",
        destructive:
          styles["button-bevel"] + " bg-destructive text-destructive-foreground ",
        success:
          styles["button-bevel"] + " bg-success text-success-foreground ",
        outline:
          "border border-border bg-background text-foreground [&_svg.lucide]:text-muted-foreground",
        secondary:
          "border border-border bg-secondary text-foreground [&_svg.lucide]:text-muted-foreground",
        ghost:
          "bg-transparent text-foreground",
        link:
          "bg-transparent text-muted-foreground underline underline-offset-2 [&_svg.lucide]:text-muted-foreground",
      },
      size: {
        default: "px-3 py-1.5",
        sm: "px-2",
        lg: "px-8 py-3 text-lg font-medium",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps extends 
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	VariantProps<typeof buttonVariants> 
{
  asChild?: boolean;
  loading?: boolean;
  tooltip?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, tooltip, asChild = false, loading = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const innerNode = loading? (
      <Comp
      ref={ref}
      disabled
      className={cn("relative", buttonVariants({ variant, size, className }))}
      {...props}>
        {children}
        <div className="absolute-cover bg-black/30 z-10 flex items-center justify-center" aria-hidden="true">
          <LoadingSpinner className="text-foreground" />
        </div>
      </Comp>
    ) : (
      <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}>
        {children}
      </Comp>
    );

    return tooltip? (
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            {innerNode}
          </TooltipTrigger>
          <TooltipContent>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : innerNode;
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
