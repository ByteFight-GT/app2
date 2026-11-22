"use client"

import React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"

import { cn } from "@/lib/utils"
import { PlusIcon } from "lucide-react"

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
  className={cn(
    "grid place-content-center h-4 w-4 shrink-0 border border-muted-foreground cursor-default",
    "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-negative-foreground",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  ref={ref}
  {...props} >

    <CheckboxPrimitive.Indicator
      className={cn("grid place-content-center text-current")}
    >
      <PlusIcon className="text-[0.8em]" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
