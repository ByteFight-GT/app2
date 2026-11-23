"use client";

/**
 * Tauri implementation of the backend contract in `common/electron-api.ts`.
 * Importing this module (done once from `hooks/provider.tsx`) installs it on
 * `window.electron`, so the hooks don't need to know which shell they run in.
 *
 * Commands live in `src-tauri/src/*.rs`; Tauri maps the camelCase arg names
 * below onto the snake_case Rust parameters.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ElectronAPI, ProcessClosedEvent, SerializedError } from '../../common/electron-api';

/**
 * Subscribes to a backend event and returns a *synchronous* cleanup function
 * (what the hooks expect). `listen()` resolves asynchronously, so if cleanup
 * runs first (e.g. React StrictMode mount/unmount), unlisten once it resolves.
 */
function on<T>(event: string, listener: (data: T) => void): () => void {
	let unlisten: UnlistenFn | null = null;
	let disposed = false;

	listen<T>(event, (e) => {
		if (!disposed) listener(e.payload);
	}).then((fn) => {
		if (disposed) fn();
		else unlisten = fn;
	}).catch((err) => {
		console.error(`[backend] failed to listen for ${event}:`, err);
	});

	return () => {
		disposed = true;
		unlisten?.();
	};
}

export const backend: ElectronAPI = {
	persistentStateGet: () => invoke('persistent_state_get'),
	persistentStateSet: (patch) => invoke('persistent_state_set', { patch }),

	openExternalUrl: (url) => invoke('open_external_url', { url }),

	autosetupGetRequirements: () => invoke('autosetup_get_requirements'),
	autosetupInstallRequirements: () => invoke('autosetup_install_requirements'),

	settingsGet: () => invoke('settings_get'),
	settingsSet: (settings) => invoke('settings_set', { settings }),
	settingsRefresh: () => invoke('settings_refresh'),
	settingsChooseDir: (appRelativePath) => invoke('settings_choose_dir', { appRelativePath }),
	settingsOpenExplorer: (appRelativePath) => invoke('settings_open_explorer', { appRelativePath }),

	mapsList: () => invoke('maps_list'),
	mapsRead: (mapName) => invoke('maps_read', { mapName }),
	mapsImport: () => invoke('maps_import'),
	mapsDelete: (mapNames) => invoke('maps_delete', { mapNames }),
	mapsWrite: (mapName, mapData) => invoke('maps_write', { mapName, mapData }),

	botsList: () => invoke('bots_list'),
	botsCopyExample: () => invoke('bots_copy_example'),
	botsImport: () => invoke('bots_import'),

	matchesReindex: () => invoke('matches_reindex'),
	matchesReadMany: (start, count) => invoke('matches_readmany', { start, limit: count }),
	matchesWrite: (matchData) => invoke('matches_write', { matchData }),
	matchesDelete: (matchIds) => invoke('matches_delete', { fileNames: matchIds }),
	matchesReadGame: (matchData, gameIdent) => invoke('matches_readgame', { matchData, gameIdent }),

	logsWrite: (matchId, gameIdent, logData) => invoke('logs_write', { matchId, gameIdent, logData }),
	logsRead: (matchId, gameIdent) => invoke('logs_read', { matchId, gameIdent }),
	logsOpen: (matchId, gameIdent) => invoke('logs_open', { matchId, gameIdent }),
	logsDelete: (matchId, gameIdent) => invoke('logs_delete', { matchId, gameIdent }),
	logsDeleteMatch: (matchId, gameIdents) => invoke('logs_deletematch', { matchId, gameIdents }),

	runnerStartMatch: (matchData) => invoke('runner_start_match', { matchData }),
	runnerGetCurrent: () => invoke('runner_getcurrent'),
	runnerTerminate: () => invoke('runner_terminate'),
	runnerDisconnect: () => invoke('runner_disconnect'),

	onGameStdout: (listener) => on<string>('game-usr:stdout', listener),
	onGameData: (listener) => on<unknown>('game-sys:data', listener),
	onProcessError: (listener) => on<SerializedError>('game-sys:process-error', listener),
	onProcessClosed: (listener) => on<ProcessClosedEvent>('game-sys:process-closed', listener),
	onSocketError: (listener) => on<SerializedError>('game-sys:socket-error', listener),
};

// Static export prerenders client modules on the server too, where there's no window.
if (typeof window !== 'undefined') {
	window.electron = backend;
}
