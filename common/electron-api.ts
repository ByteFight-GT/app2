import type { PersistentState, GameResult, MatchMetadata, Settings } from './types';
import { GamePGN, type GameWinner } from '@/gamerenderer/competitions/cs6601_fa2026';

export type IPCError = {
  success: false;
  error: string;
};

type IPCSuccess<T extends object = Record<never, never>> = {
  success: true;
} & T;

export type IPCResult<T extends object = Record<never, never>> = IPCSuccess<T> | IPCError;

export type SerializedError = {
  error?: string;
  message?: string;
};

export type ProcessClosedEvent = {
  exitCode: number | null;
  TEMP_requestedTermination: boolean;
  finishTimestamp: number;
  result: GameResult<GamePGN> | null;
  outputDir: string;
};

export type ElectronAPI = {
  persistentStateGet: () => Promise<PersistentState>;
  persistentStateSet: (patch: Partial<PersistentState>) => Promise<IPCResult<{ state: PersistentState }>>;

  openExternalUrl: (url: string) => Promise<IPCResult>;

  autosetupGetRequirements: () => Promise<IPCResult<{ requirements: string[] }>>;
  autosetupInstallRequirements: () => Promise<IPCResult<{ stdout: string; stderr: string }>>;

  settingsGet: () => Promise<Settings | null>;
  settingsSet: (settings: Settings) => Promise<IPCResult<{ settings: Settings }>>;
  settingsChooseDir: (appRelativePath?: string) => Promise<{
    success: boolean;
    selectedPath?: string;
  }>;
  settingsOpenExplorer: (appRelativePath: string) => Promise<IPCResult>;
  /** re-merges default settings into the user settings file and returns the result */
  settingsRefresh: () => Promise<IPCResult<{ settings: Settings }> | (IPCError & { settings: Settings | null })>;

  mapsList: () => Promise<IPCResult<{ maps: string[] }>>;
  mapsRead: (mapName: string) => Promise<IPCResult<{ mapData: string }>>;
  mapsImport: () => Promise<IPCResult<{ imported: string[]; invalid?: string[] }>>;
  mapsDelete: (mapNames: string[]) => Promise<{
    success: boolean;
    deleted: string[];
    error?: string;
  }>;
  mapsWrite: (mapName: string, mapData: string) => Promise<IPCResult>;

  botsList: () => Promise<IPCResult<{ bots: string[] }>>;
  botsCopyExample: () => Promise<IPCResult<{ alreadyExisted: boolean }>>;
  botsImport: () => Promise<IPCResult<{ imported: string[]; invalid: string[] }>>;

  matchesReadMany: (start: number, count: number) => Promise<IPCResult<{
    matches: MatchMetadata<GamePGN>[];
    total: number;
    start: number;
    limit: number;
  }>>;
  matchesWrite: (matchData: MatchMetadata<GamePGN>) => Promise<IPCResult>;
  matchesReindex: () => Promise<IPCResult>;
  matchesDelete: (matchIds: string[]) => Promise<{ success: boolean; deleted: string[] }>;
  matchesReadGame: (matchData: MatchMetadata<GamePGN>, gameIdent: string) => Promise<IPCResult<{
    gameData: GamePGN;
  }>>;

  logsWrite: (matchId: string, gameIdent: string, logData: string) => Promise<IPCResult>;
  logsRead: (matchId: string, gameIdent: string) => Promise<IPCResult<{ logData: string | null }>>;
  logsOpen: (matchId: string, gameIdent: string) => Promise<IPCResult>;
  logsDelete: (matchId: string, gameIdent: string) => Promise<IPCResult>;
  /** deletes the given games' logs, or the whole match's logs if gameIdents is omitted/empty */
  logsDeleteMatch: (matchId: string, gameIdents?: string[]) => Promise<IPCResult<{ deleted: number }>>;

  runnerStartMatch: (matchData: MatchMetadata<GamePGN>) => Promise<IPCResult<{
    startTimestamp: number;
  }>>;
  runnerGetCurrent: () => Promise<{
    matchData: MatchMetadata<GamePGN> | null;
  } | null>;
  runnerTerminate: () => Promise<{ success: boolean }>;
  /** drops the engine socket without stopping the process */
  runnerDisconnect: () => Promise<boolean>;

  onGameStdout: (listener: (data: string) => void) => () => void;
  onGameData: (listener: (data: unknown) => void) => () => void;
  onProcessError: (listener: (data: SerializedError) => void) => () => void;
  onProcessClosed: (listener: (data: ProcessClosedEvent) => void) => () => void;
  onSocketError: (listener: (data: SerializedError) => void) => () => void;
};
