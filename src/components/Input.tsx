"use client";

import React from "react"

import { cn } from "@/lib/utils";
import { InputLabel } from "./InputLabel";

export interface InputProps extends React.ComponentProps<"input"> {
	dontSelectNumbersOnFocus?: boolean;
	label?: string;
}

const COMMON_INPUT_CLASSES = "w-full border border-border bg-secondary text-sm px-3 py-1.5 transition-all duration-100 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:font-medium file:text-foreground";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
	className = "", 
	onFocus, 
	label,
	name,
	required,
	dontSelectNumbersOnFocus = false,
	...rest
}, ref) => {
		const uniqueName = React.useId(); // used to link label to input if no name provided

		// all other (non-file) types
		const inputEle = (
			<input
			onFocus={e => {
				if (rest.type === 'number' && !dontSelectNumbersOnFocus) {
					// full-select by default since number input is annoying lol
					e.currentTarget.select();
				}
				onFocus?.(e);
			}}
			className={cn(COMMON_INPUT_CLASSES, className)}
			id={name || uniqueName}
			name={name || uniqueName}
			required={required}
			ref={ref}
			{...rest} />
		);

		if (label) {
      return (
        <div className="flex flex-col gap-2">
          <InputLabel required={required} htmlFor={name || uniqueName}>
            {label}
          </InputLabel>
          {inputEle}
        </div>
      )
    } else {
      return inputEle;
    }
	}
)
Input.displayName = "Input";
