"use client";

import React from 'react';
import { gameConfig } from '@/lib/gameconfig';
import { Button } from '@/components';
import { useToast } from '@/hooks/useToast';
import { useLoadings } from './useLoadings';
import { GameResult, MatchMetadata } from '../../common/types';
import { useMatches } from './useMatches';
import { generateMatchId, getErrorMessage } from '../../common/utils';
import { EMPTY_GAME_PGN, GamePGN, useVisualizer } from '@/gamerenderer/competitions/cs6601_fa2026';


type QueueNewMatchParams = {
  selectedTeamA: string;
  selectedTeamB: string;
};

export type UseRunnerValue = {
  /** match that is RUNNING, could be in the background */
  currentlyRunningMatch: MatchMetadata<GamePGN> | null;

  /**
   * match that is being shown. Could be different from currentlyRunningMatch,
   * if, for example, you select a match from history while a match is running.
   */
  currentlyVisualizingMatch: MatchMetadata<GamePGN> | null;

  queuedMatches: MatchMetadata<GamePGN>[];
  stdOutChunksRef: React.RefObject<string[]>;
  recentBots: {
    a: string[];
    b: string[];
  }
  lastRunnerSetup: QueueNewMatchParams | null;
  debugIPCEventLog: string[]; // for debugging - logs the ipc events received from electron
  setDebugIPCEventLog: React.Dispatch<React.SetStateAction<string[]>>;
  queueNewMatch: (params: QueueNewMatchParams) => boolean;
  dequeueMatch: (index: number) => void;
  moveWithinQueue: (index1: number, index2: number) => void;
  clearAllQueued: () => void;
  startMatch: (matchData: MatchMetadata<GamePGN>) => Promise<boolean>;
	startNextInQueue: () => void;
  terminateRunningMatch: () => void;
  handleMatchEnd: (data: {
    exitCode: number | null,
    TEMP_requestedTermination: boolean,
    finishTimestamp: number, 
    result: GameResult<GamePGN> | null,
    outputDir: string
  }) => void;
  updateRecentBots: (aBot: string, bBot: string) => void;
  saveLastRunnerSetup: (setup: QueueNewMatchParams) => void;
  loadGameIntoPlayer: (matchData: MatchMetadata<GamePGN>, gameIdent: string) => Promise<boolean>;
  recordMatchError: (error: unknown) => void;
};

const RunnerContext = React.createContext<UseRunnerValue | undefined>(undefined);

/**
 * Handles logic relating to running games and communicating with the python process thru electron
 */
export const RunnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {toast, toastError} = useToast();
  const {loadings, toggleLoading} = useLoadings();
  const {addMatchToCompletedHistory} = useMatches();
  const {setVisualizerState, setAutoAdvance} = useVisualizer();

  const [currentlyRunningMatch, setCurrentlyRunningMatch] = React.useState<MatchMetadata<GamePGN> | null>(null);
  const [currentlyVisualizingMatch, setCurrentlyVisualizingMatch] = React.useState<MatchMetadata<GamePGN> | null>(null);

  /** 
   * queued matches. These will NOT be saved when the app is closed. 
   * FRONT OF QUEUE IS AT INDEX 0!!
   */
  const [queuedMatches, setQueuedMatches] = React.useState<MatchMetadata<GamePGN>[]>([]);

  const stdOutChunksRef = React.useRef<string[]>([]);
  const matchErrorRef = React.useRef<string | null>(null);

  const recordMatchError = React.useCallback((error: unknown) => {
    const message = getErrorMessage(error).trim();
    if (message && !matchErrorRef.current) {
      matchErrorRef.current = message;
    }
  }, []);

  /** recent bots: stores the last 2 unique bots used */
  const [recentBots, setRecentBots] = React.useState<UseRunnerValue['recentBots']>({
    a: [],
    b: []
  });

  /** stores the previous bots and maps used */
  const [lastRunnerSetup, setLastRunnerSetup] = React.useState<QueueNewMatchParams | null>(null);

  const [debugIPCEventLog, setDebugIPCEventLog] = React.useState<string[]>([]);

  // >>> HANDLERS

  /** handles calling electron to begin match/game loops and listeners. */
  const startMatch = React.useCallback(async (matchData: MatchMetadata<GamePGN>) => {
    if (loadings.startMatch) {
      return false;
    }
    toggleLoading("startMatch", true);

    if (currentlyRunningMatch) {
			console.log(`[startMatch] Attempted to start match ${matchData.matchId} while ${currentlyRunningMatch.matchId} is running.`);
      toastError(
        "Failed to start match", 
        `A match is already running (between ${currentlyRunningMatch.teamA} and ${currentlyRunningMatch.teamB}). Please wait for it to finish or terminate it before starting a new one.`
      );
      toggleLoading("startMatch", false);
      return false;
    }

    //setDebugIPCEventLog(prev => [...prev, `--- starting match ${matchData.matchId} ---`]);

    try {
      matchErrorRef.current = null;
      const res = await window.electron.runnerStartMatch(matchData);
      if (res.success) {

        // yay!!!
        const startedMatchData = {
          ...matchData,
          startTimestamp: res.startTimestamp,
          status: 'in-progress'
        } satisfies MatchMetadata<GamePGN>;
              
        stdOutChunksRef.current.length = 0; // clear terminal buffers
        setCurrentlyRunningMatch(startedMatchData);
        setVisualizerState(EMPTY_GAME_PGN);
        setCurrentlyVisualizingMatch(startedMatchData);
        setAutoAdvance(false); // TEMP: we want autoadvance during games, but useGame currently handles it differently SPECIFICALLY for live games 

        toast({
					toastTitle: "Match started",
					toastDescription: (
            <p>
              Started <span className='text-[hsl(var(--team-a-color))]'>{matchData.teamA}</span>
              {' '}vs.{' '}
              <span className='text-[hsl(var(--team-b-color))]'>{matchData.teamB}</span>
            </p>
          )
				});

        return true;

      } else {
        toastError("Failed to start match", res.error);
      }
    } catch (err: any) {
      toastError("Failed to start match", err);
    } finally {
      toggleLoading("startMatch", false);
    }

    return false;
  }, [currentlyRunningMatch, loadings.startMatch]);

  /**
   * Create a new match object and updates state/storage so it shows up
   * in history/queue. used by the run match flow when starting a new match.
   * 
   * Does NOT handle actually starting the processes to run the games - this
   * solely handles creating and saving metadata.
   * 
   * Returns whether startMatch was called (ie. can be started immediately)
   */
  const queueNewMatch = React.useCallback((params: QueueNewMatchParams) => {
    const queuedTime = new Date();
    const matchId = generateMatchId(queuedTime.getTime());
    const matchData = {
      matchId: matchId,
      queuedTimestamp: queuedTime.getTime(),
      startTimestamp: null,
      finishTimestamp: null,
      notes: "",
      outputDir: null,
      teamA: params.selectedTeamA,
      teamB: params.selectedTeamB,
      // TODO(maps): when gameConfig.maps.enabled, use the selected maps here
      gameIdents: [gameConfig.maps.singletonName], // only one game per match rn
      aWins: {},
      bWins: {},
      draws: {},
      status: 'queued',
    } as MatchMetadata<GamePGN>;

    if (!currentlyRunningMatch) {
      startMatch(matchData);
      return true;
    } else {
      // no error, there just happens to be another match running. just add to queue
      setQueuedMatches(prev => [...prev, matchData]);
      toast({
        toastTitle: "Match queued",
        toastDescription: (
          <p>
            Queued <span className='text-[hsl(var(--team-a-color))]'>{matchData.teamA}</span>
            {' '}vs.{' '}
            <span className='text-[hsl(var(--team-b-color))]'>{matchData.teamB}</span>!
            <br />
            Queue Position: <span className='text-primary'>{queuedMatches.length + 1}</span>
          </p>
        )
      });
    }
    return false;
  }, [currentlyRunningMatch, queuedMatches, startMatch]);

  /** Remove a match from queue, for any reason, like cancelling or it getting started */
  const dequeueMatch = React.useCallback((index: number) => {
		console.log(`[dequeueMatch] Dequeuing match at index ${index}`);
    setQueuedMatches(prev => {
      const newQueue = [...prev];
      newQueue.splice(index, 1);
      return newQueue;
    });
  }, []);

	/** 
	 * handles propagating the queue forward when the current match ends.
	 * DOES NOT PERFORM CHECKS (whether queue is nonempty), caller must handle
	 */
	const startNextInQueue = React.useCallback(() => {
		const nextMatch = queuedMatches[0];
		startMatch(nextMatch).then(success => {
			if (success) {
				dequeueMatch(0);
			}
		});
	}, [queuedMatches, startMatch, dequeueMatch]);

  /** inserts the match at `srcIdx` -> `dstIdx`, shifting matches backward */
  const moveWithinQueue = React.useCallback((srcIdx: number, dstIdx: number) => {
    setQueuedMatches(prev => {
      const newQueue = [...prev];
      const temp = newQueue[srcIdx];
      newQueue.splice(srcIdx, 1);
      newQueue.splice(dstIdx, 0, temp);
      return newQueue;
    });
  }, []);

  const clearAllQueued = React.useCallback(() => {
    setQueuedMatches([]);
  }, []);

  const terminateRunningMatch = React.useCallback(() => {
    if (loadings.terminateMatch) return;
    if (!currentlyRunningMatch) {
      toastError("No match running", "No request was sent - no match to terminate");
      return;
    }
    toggleLoading("terminateMatch", true);

    window.electron.runnerTerminate()
    .catch((err: any) => {
      toastError("Failed to stop match", err);
    })
    .finally(() => {
      toggleLoading("terminateMatch", false);
    });
  }, [currentlyRunningMatch, loadings.terminateMatch]);

  /** handles cleanup/takedown when a match completes for any reason (finished/termination),
   * and checks if we can move on to the next match in the queue.
   */
  const handleMatchEnd = React.useCallback(async (data: {
    exitCode: number | null,
    TEMP_requestedTermination: boolean,
    finishTimestamp: number,
    result: GameResult<GamePGN> | null,
    outputDir: string
  }) => {
    console.log(`[handleMatchEnd] handling end of match ${currentlyRunningMatch?.matchId}, data=`, data);
    if (!currentlyRunningMatch) {
      console.warn("[handleMatchEnd] Received match end event but no match was running?");
      return;
    }

    const matchError = !data.TEMP_requestedTermination && data.exitCode !== 0
      ? matchErrorRef.current ?? data.result?.reason ?? `Python process exited with code ${data.exitCode ?? 'unknown'}.`
      : undefined;

    const updatedMatchData = {
      ...currentlyRunningMatch,
      finishTimestamp: data.finishTimestamp,
      outputDir: data.outputDir,
      error: matchError,
      status: 
        data.TEMP_requestedTermination? 
          'terminated' 
        : data.exitCode === 0?
          'completed' 
        :// else:
          'errored'
    } satisfies MatchMetadata<GamePGN>;

    // TEMP again because we only have 1 game per match
    // defintely "temporary" yes...
    const gameIdent = updatedMatchData.gameIdents[0] ?? "0";
    updatedMatchData.gameIdents = [gameIdent];

    // TEMP - apply results
    switch (data.result?.winner) {
      case 'BLACK_WIN':
        updatedMatchData.aWins[gameIdent] = data.result;
        break;
      case 'WHITE_WIN':
        updatedMatchData.bWins[gameIdent] = data.result;
        break;
      case 'DRAW':
        updatedMatchData.draws[gameIdent] = data.result;
        break;
    }

    let matchWriteRes;
    try {
      matchWriteRes = await window.electron.matchesWrite(updatedMatchData);
    } catch (error) {
      matchWriteRes = {success: false, error};
      console.error("[handleMatchEnd] Failed to write match data for match", updatedMatchData.matchId, error);
    }

    // TEMP - only need to write logs for first map rn since we only have 1 game per
    const compiledLogs = stdOutChunksRef.current.join('');
    let logWriteRes;
    try {
      logWriteRes = await window.electron.logsWrite(updatedMatchData.matchId, gameIdent, compiledLogs);
    } catch (error) {
      logWriteRes = {success: false, error};
      console.error("[handleMatchEnd] Failed to write logs for match", updatedMatchData.matchId, error);
    }

    if (matchWriteRes.success) {
      addMatchToCompletedHistory(updatedMatchData);     
      toast({
        toastTitle: `Match finished!`,
        toastDescription: <p>
          Match between
          <span className='text-[hsl(var(--team-a-color))]'> {updatedMatchData.teamA} </span>
          and
          <span className='text-[hsl(var(--team-b-color))]'> {updatedMatchData.teamB} </span>
          on <span className='text-foreground'>{updatedMatchData.gameIdents.join(', ')}</span> finished {data.exitCode === 0? 'successfully' : 'with exit code ' + data.exitCode}!
          {matchError && <><br /><span className='text-destructive'>{matchError}</span></>}
        </p>
      });
		} else {
      toastError(
        "Failed to save match data",
        <p>
          An error occured while saving match to storage. Please report this!
          <Button onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(updatedMatchData, null, 2))
            .then(() => {
              toast({
                toastTitle: "Match data copied",
                toastDescription: "Match data copied to clipboard. Please share this with the developers to help debug this issue. Thanks!"
              });
            })
            .catch((err) => {
              toastError("Failed to copy match data!", err);
            });
          }}>Copy match data</Button>
        </p>
      )
    }

    if (!logWriteRes.success) {
      toastError(
        "Failed to save match logs",
        <p>
          An error occured while saving match logs to storage: {logWriteRes.error}. Please report this!
          <Button onClick={() => {
            navigator.clipboard.writeText(compiledLogs)
            .then(() => {
              toast({
                toastTitle: "Match logs copied",
                toastDescription: "Logs copied to clipboard. Please share this with the developers to help debug this issue. Thanks!"
              });
            }).catch((err) => {
              toastError("Failed to copy match logs!", err);
            });
          }}>Copy logs</Button>
        </p>
      )
    }

    setAutoAdvance(false);
    setCurrentlyRunningMatch(null);

  }, [currentlyRunningMatch, toggleLoading, toastError]);

  const updateRecentBots = React.useCallback((aBot: string, bBot: string) => {
    setRecentBots(prev => ({
      a: [aBot, ...prev.a.filter(bot => bot !== aBot)].slice(0, 2),
      b: [bBot, ...prev.b.filter(bot => bot !== bBot)].slice(0, 2)
    }));
  }, []);

  const saveLastRunnerSetup = React.useCallback((setup: QueueNewMatchParams) => {
    setLastRunnerSetup(setup);
  }, []);

  const loadGameIntoPlayer = React.useCallback(async (matchData: MatchMetadata<GamePGN>, gameIdent: string) => {
    if (loadings.loadGameIntoPlayer) return false;
    toggleLoading("loadGameIntoPlayer", true);

    try {
      const res = await window.electron.matchesReadGame(matchData, gameIdent);
      if (res.success) {
        const {gameData} = res;
        setVisualizerState(gameData);
        setCurrentlyVisualizingMatch(matchData);

          // load logs too
        try {
          const res = await window.electron.logsRead(matchData.matchId, gameIdent);
          if (res.success) {
            const logData = res.logData;
            if (logData) {
              stdOutChunksRef.current = logData.split('\n');
            } else {
              stdOutChunksRef.current = [];
            }
          } else {
            toastError("Failed to load game logs", `Match data loaded successfully, but an error encountered when fetching logs: ${res.error}`);
            stdOutChunksRef.current = [];
          }
        } catch (err: any) {
          toastError("Failed to load game logs", `Match data loaded successfully, but an error encountered when fetching logs: ${err.message}`);
          stdOutChunksRef.current = [];
        }

        return true;
      } else {
        toastError("Failed to load game replay", res.error);
        return false;
      }
    } catch (err: any) {
      toastError("Failed to load game replay", err);
      return false;
    } finally {
      toggleLoading("loadGameIntoPlayer", false);
    }
  }, [toastError]);


	// EFFECTS

	// start next in queue when current match is gone (is null)
	React.useEffect(() => {
		if (!currentlyRunningMatch && queuedMatches.length > 0) {
			startNextInQueue();
		}
	}, [currentlyRunningMatch, queuedMatches, startNextInQueue]);

  // on init, check electron to see if theres anythign running
  // this fixes things breaking if they somehow refresh the frontend lol
  React.useEffect(() => {
    window.electron.runnerGetCurrent()
    .then((res) => {
      if (res) {
        const matchData = res.matchData as MatchMetadata<GamePGN>;
        setCurrentlyRunningMatch(matchData);
        // TODO - see runner.ts: need some way to get full pgn. altho this is an edge case so low prio
        setVisualizerState(EMPTY_GAME_PGN);
        setCurrentlyVisualizingMatch(matchData);
      };
    })
    .catch((err) => {
      console.error("Failed to get current match data from electron on init", err);
    });
  }, [setVisualizerState, setAutoAdvance]);


  const value = React.useMemo(() => ({
    currentlyRunningMatch,
    currentlyVisualizingMatch,
    queuedMatches,
    stdOutChunksRef,
    recentBots,
    lastRunnerSetup,
    debugIPCEventLog,
    queueNewMatch,
    dequeueMatch,
    moveWithinQueue,
    clearAllQueued,
    startMatch,
		startNextInQueue,
    terminateRunningMatch,
    handleMatchEnd,
    updateRecentBots,
    saveLastRunnerSetup,
    setDebugIPCEventLog,
    loadGameIntoPlayer,
    recordMatchError,
  } satisfies UseRunnerValue), [
    currentlyRunningMatch,
    currentlyVisualizingMatch,
    queuedMatches,
    recentBots,
    lastRunnerSetup,
    debugIPCEventLog,
    queueNewMatch,
    dequeueMatch,
    moveWithinQueue,
    clearAllQueued,
    startMatch,
		startNextInQueue,
    terminateRunningMatch,
    handleMatchEnd,
    updateRecentBots,
    saveLastRunnerSetup,
    setDebugIPCEventLog,
    loadGameIntoPlayer,
    recordMatchError,
  ]);

  return (
    <RunnerContext.Provider value={value}>
      {children}
    </RunnerContext.Provider>
  );
};

export function useRunner(): UseRunnerValue {
  const context = React.useContext(RunnerContext);
  if (context === undefined) {
    throw new Error('useRunner must be used within a RunnerProvider');
  }
  return context;
}
