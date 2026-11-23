"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePersistentState } from "@/hooks/usePersistentState";

export default function HomePage() {
	const router = useRouter();
	const { hasSetupBefore } = usePersistentState();

	React.useEffect(() => {
		if (hasSetupBefore === null) return; // still loading
		router.replace(hasSetupBefore ? "/player" : "/setup");
	}, [hasSetupBefore, router]);

	return null;
}
