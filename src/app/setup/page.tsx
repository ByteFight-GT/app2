"use client";

import React from 'react';
import { Button, GenericPage } from '@/components';
import { usePersistentState } from '@/hooks/usePersistentState';

const SetupPage = () => {
	const { hasSetupBefore, markSetupComplete } = usePersistentState();

	// visiting this page once is enough to stop it being the default landing page
	React.useEffect(() => {
		if (hasSetupBefore === false) markSetupComplete();
	}, [hasSetupBefore, markSetupComplete]);

	return (
		<GenericPage
			variant="thin"
			titleEle="Setup"
			subtitleEle="Get your environment ready to run matches."
		>
			<section className="mb-8">
				<h2 className="text-2xl font-semibold mb-2">Getting started</h2>
				<p className="text-muted-foreground mb-3">
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
					incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
					exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
				</p>
				<Button onClick={() => { /* TODO: auto-setup */ }}>Run auto-setup</Button>
			</section>

			<section className="mb-8">
				<h2 className="text-2xl font-semibold mb-2">Manual setup</h2>
				<p className="text-muted-foreground">
					Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
					fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
					culpa qui officia deserunt mollit anim id est laborum.
				</p>
			</section>
		</GenericPage>
	);
};

export default SetupPage;
