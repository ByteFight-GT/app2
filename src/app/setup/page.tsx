"use client";

import React from 'react';
import { Button, GenericPage, Input } from '@/components';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/hooks/useToast';
import { gameConfig } from '@/lib/gameconfig';
import Link from 'next/link';

/** A header + a single text setting with a save button. */
const SettingStep = (props: {
	title: string;
	settingKey: string;
	placeholder?: string;
	children?: React.ReactNode;
}) => {
	const { settings, saveSettings } = useSettings();
	const [draft, setDraft] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);

	const savedValue: string = settings[props.settingKey]?.value ?? '';
	const value = draft ?? savedValue;

	const save = async () => {
		setSaving(true);
		const ok = await saveSettings({
			...settings,
			[props.settingKey]: { ...settings[props.settingKey], value },
		});
		if (ok) setDraft(null);
		setSaving(false);
	};

	return (
		<section className="mb-10 space-y-4">
			<h3 className="text-xl font-semibold">{props.title}</h3>
			{props.children}
			<div className="flex gap-2">
				<Input
					value={value}
					placeholder={props.placeholder}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
				/>
				<Button onClick={save} loading={saving} disabled={value === savedValue}>
					Save
				</Button>
			</div>
		</section>
	);
};

const InstallDepsStep = () => {
	const { toastError } = useToast();
	const [installing, setInstalling] = React.useState(false);
	const [output, setOutput] = React.useState<{ ok: boolean; text: string } | null>(null);
	const [requirements, setRequirements] = React.useState<string[] | null>(null);
	const [requirementsError, setRequirementsError] = React.useState<string | null>(null);

	React.useEffect(() => {
		window.electron.autosetupGetRequirements()
			.then((res) => {
				if (res.success) setRequirements(res.requirements);
				else setRequirementsError(res.error);
			})
			.catch((err) => setRequirementsError(String(err)));
	}, []);

	const install = async () => {
		setInstalling(true);
		setOutput(null);
		try {
			const res = await window.electron.autosetupInstallRequirements();
			setOutput(res.success
				? { ok: true, text: [res.stdout, res.stderr].filter(Boolean).join('\n') }
				: { ok: false, text: res.error });
		} catch (err) {
			toastError("Failed to install dependencies", err);
		} finally {
			setInstalling(false);
		}
	};

	return (
		<section className="mb-10 space-y-3">
			<h3 className="text-xl font-semibold">3. Install Dependencies</h3>
			<p className="text-muted-foreground">
				Will install the below packages to the python executable you specified above:
			</p>
			{requirements && (
				<pre className={`p-3 max-h-80 overflow-auto text-xs whitespace-pre-wrap border border-border bg-secondary`}>
					{requirements}
				</pre>
			)}
			{requirementsError && (
				<p className="text-sm text-destructiveBright">
					Couldn't read the requirements list: {requirementsError}
				</p>
			)}
			<Button onClick={install} loading={installing}>Install dependencies</Button>
			{output && (
				<pre className={`p-3 max-h-80 overflow-auto text-xs whitespace-pre-wrap border border-border bg-secondary ${output.ok ? '' : 'text-destructiveBright'}`}>
					{output.ok ? (output.text || 'Done.') : output.text}
				</pre>
			)}
			{output?.ok && (
				<p className="text-sm font-medium text-success">
					Successfully installed dependencies.
				</p>
			)}
		</section>
	);
};

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
		subtitleEle="Get started running matches locally!">

			<h2 className="text-3xl font-bold mb-4">Environment Setup</h2>

			<SettingStep
			title="1. Python executable"
			settingKey="Python Path"
			placeholder="e.g. python3">
				<p className="text-muted-foreground mb-3">
					The Python executable used for running the engine.
					<br /><br />
					If you have python on path, you can just use the
					command <code>python</code> or <code>python3</code>. 
					
					If you want to use a custom installation or virtual environment,
					specify the full path to the executable, e.g. <code>/usr/bin/python3</code>.
					<br /><br />
					Note the minimum version allowed is 3.12.
				</p>
			</SettingStep>


			<SettingStep
			title="2. Bots Directory"
			settingKey="Bots Directory"
			placeholder="Default: $/bots">
				<p className="text-muted-foreground mb-3">
					Where your bot folders are stored.
					<br /><br />
					This should not be the folder for just a single bot, but instead
					a parent folder containing bot folders.
					<br /><br />
					It is recommended you point this to the folder where you are
					developing to avoid having to import them each time you have
					a new version.
				</p>
			</SettingStep>


			<InstallDepsStep />


			<h2 className="text-3xl font-bold mb-4">Getting Started</h2>
			<p className="text-muted-foreground">
				TODO
			</p>
		</GenericPage>
	);
};

export default SetupPage;
