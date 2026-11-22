"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const tooltipContentVariants = cva(
  "z-50 overflow-hidden px-3 py-1.5 text-xs animate-in fade-in-0 zoom-in-95 duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-negative-foreground font-semibold",
        secondary:
          "border border-border bg-secondary text-foreground hover:border-muted-foreground [&_svg.lucide]:text-muted-foreground",
        outline: "border border-border bg-background hover:border-muted-foreground text-foreground [&_svg.lucide]:text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

type TooltipContentProps =
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> &
  VariantProps<typeof tooltipContentVariants>

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, variant, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(tooltipContentVariants({ variant }), className)}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

/** easy-use wrapper to tooltip something, bundles all the provider/content/trigger stuff */
type TooltippedProps = {
  tooltip: React.ReactNode | null
  delayDuration?: number
} & TooltipContentProps

const Tooltipped = React.forwardRef<HTMLButtonElement, TooltippedProps>(
  ({ tooltip, children, delayDuration, variant = "default", ...props }, ref) => {

    if (!tooltip) {
      return children; // do nothing if no tooltip
    }

    return (
      <TooltipProvider delayDuration={delayDuration}>
        <Tooltip>
          <TooltipTrigger asChild ref={ref}>
            {children}
          </TooltipTrigger>
          <TooltipContent variant={variant} {...props}>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
)
Tooltipped.displayName = "Tooltipped"

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Tooltipped,
}
