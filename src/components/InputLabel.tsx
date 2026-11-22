"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"


const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

type InputLabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
  required?: boolean;
}
const InputLabel = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  InputLabelProps
>(({ className, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  >
    {children}
    {props.required && <span title="Field is required" className="text-destructive pl-1">*</span>}
  </LabelPrimitive.Root>
))
InputLabel.displayName = LabelPrimitive.Root.displayName

export { InputLabel }
