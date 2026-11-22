export type Settings = Record<string, {
	value: any;
	[key: `__${string}`]: any; // for __type, __desc, __placeholder, other meta stuff.
}>; 

export type Team_t = 'a' | 'b';

export type MatchStatus =
	| 'queued' // in queue, stored by frontend
	| 'in-progress' // currently running on the backend
	| 'terminated' // (end state) manually terminated or killed
	| 'errored' // (end state) process error, probably not caused by user
	| 'completed'; // (end state) game finished successfully

/**
 * All information about a match (which can have multiple games),
 * except for the actual game data (like gamestates, moves, etc.).
 *
 * can also be used to represent queued or in-progress matches.
 */
export type MatchMetadata<GamePGN extends {result: string, reason: string}> = {
	matchId: string;
	queuedTimestamp: number; // when the match entered the queue (ms)
	startTimestamp: number | null; // start time (ms) of first game
	finishTimestamp: number | null; // end time (ms) of last game or termination
	notes: string; // user-written notes for their reference!

	// folder where game pgns are stored
	// filenames: <gameIdent>.json. gameIdent is either map name or 0-indexed number
	outputDir: string | null;

	teamA: string; // A bot name
	teamB: string; // B bot name

	// ordered list (in order of earliest start time)
	// of all the games played (their filenames).
	// yes this is redundant with below but whatever.
	gameIdents: string[];

	aWins: {[gameIdent: string]: GameResult<GamePGN>};
	bWins: {[gameIdent: string]: GameResult<GamePGN>};
	draws: {[gameIdent: string]: GameResult<GamePGN>};

	status: MatchStatus;
	error?: string; // first useful process/socket failure, when a match ends unexpectedly
}

export type MapLoc = [number, number];

/**
 * Geneic GameResult info which should work across games.
 * Inner GamePGN just needs to have result and reason fields
 */
export type GameResult<PGN_t extends {result: string, reason: string}> = {
	winner: PGN_t["result"];
	reason: PGN_t["reason"];
	plyCount: number;
}