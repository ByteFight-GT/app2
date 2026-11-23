"use client";

import React from "react";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";


const DEFAULT_CLASSES = "underline";

/** Link that opens in the system default browser */
export const ExternalLink = ({
	href,
	className,
	children,
	onClick,
	...rest
}: React.ComponentProps<"a"> & { href: string }) => {
	const { toastError } = useToast();

	return (
		<a
			href={href}
			className={cn(DEFAULT_CLASSES, className)}
			onClick={(e) => {
				onClick?.(e);
				e.preventDefault();
				window.electron.openExternalUrl(href)
					.then((res) => {
						if (!res.success) toastError("Failed to open link", res.error);
					})
					.catch((err) => toastError("Failed to open link", err));
			}}
			{...rest}
		>
			{children ?? href}
		</a>
	);
};
