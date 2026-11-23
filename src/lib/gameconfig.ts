/**
 * Static config for the game this build targets. The same `gameconfig.json`
 * is compiled into the Rust backend (`src-tauri/src/gameconfig.rs`).
 */

import rawGameConfig from '../../gameconfig.json';

export type GameConfig = {
	gameId: string;
	maps: {
		/** whether this game uses maps (map selector, default map seeding) */
		enabled: boolean;
		/** whether the map builder tab is shown */
		builderEnabled: boolean;
		/** game ident used for each match when maps are disabled */
		singletonName: string;
	};
	overviewPage: string; // link
	resourcesPage: string; // link
};

export const gameConfig: GameConfig = rawGameConfig;
