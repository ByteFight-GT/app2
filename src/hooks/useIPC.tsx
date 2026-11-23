"use client";

import React from 'react';

import { getErrorMessage } from '../../common/utils';
import type { GameResult } from '../../common/types';
import { useToast } from '@/hooks/useToast';
import { useRunner } from '@/hooks/useRunner';

import { GamePGN, GamePGNFrame, useVisualizer } from '@/gamerenderer/competitions/cs6601_fa2026';

/** `update` message streamed by the engine (see engine/local_server.py). */
type EngineFrameUpdate = {
  type: 'update';
  index: number;
  frame: Partial<GamePGNFrame>;
};

function isFrameUpdate(data: unknown): data is EngineFrameUpdate {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === 'update'
    && typeof msg.index === 'number'
    && typeof msg.frame === 'object' && msg.frame !== null;
}


/** Handles state/logic for IPC communication with Electron. */
export function useIPC() {
  const { toastError } = useToast();
  const { applyLiveFrame } = useVisualizer();

  const {
    currentlyRunningMatch,
    currentlyVisualizingMatch,
    stdOutChunksRef,
    handleMatchEnd,
    recordMatchError,
  } = useRunner();

  const currentlyRunningMatchRef = React.useRef(currentlyRunningMatch);
  const currentlyVisualizingMatchRef = React.useRef(currentlyVisualizingMatch);
  const handleMatchEndRef = React.useRef(handleMatchEnd);

  React.useEffect(() => {
    currentlyRunningMatchRef.current = currentlyRunningMatch;
  }, [currentlyRunningMatch]);
  React.useEffect(() => {
    currentlyVisualizingMatchRef.current = currentlyVisualizingMatch;
  }, [currentlyVisualizingMatch]);
  React.useEffect(() => {
    handleMatchEndRef.current = handleMatchEnd;
  }, [handleMatchEnd]);

  const ipcConnectionHandlers = React.useMemo(() => ({
    handleStdOut(chunk: string) {
      stdOutChunksRef.current.push(chunk);
    },

    handleSystemData(data: unknown) {
      // other message types (game_complete, terminated, unparsed) are handled
      // via process-closed, so only frames matter here
      if (!isFrameUpdate(data)) return;
      const running = currentlyRunningMatchRef.current;
      // only draw if the user is watching the running match, not a replay
      if (running && currentlyVisualizingMatchRef.current?.matchId === running.matchId) {
        applyLiveFrame(data.index, data.frame);
      }
    },

    handleProcessError(error: unknown) {
      const message = getErrorMessage(error);
      recordMatchError(message);
      toastError("Python process error", message);
    },

    handleProcessClosed(data: {
      exitCode: number | null;
      TEMP_requestedTermination: boolean;
      finishTimestamp: number;
      result: GameResult<GamePGN> | null;
      outputDir: string;
    }) {
      handleMatchEndRef.current(data);
    },

    handleSocketError(error: unknown) {
      recordMatchError(`Socket error: ${getErrorMessage(error)}`);
    },
  }), [recordMatchError, toastError, applyLiveFrame]);

  React.useEffect(() => {
    console.log("[useIPC] >>> registering ipc handlers");
    const cleanupFns = [
      window.electron.onGameStdout(ipcConnectionHandlers.handleStdOut),
      window.electron.onGameData(ipcConnectionHandlers.handleSystemData),
      window.electron.onProcessError(ipcConnectionHandlers.handleProcessError),
      window.electron.onProcessClosed(ipcConnectionHandlers.handleProcessClosed),
      window.electron.onSocketError(ipcConnectionHandlers.handleSocketError),
    ];

    return () => {
      console.log("[useIPC] <<< unregistering ipc handlers");
      cleanupFns.forEach(cleanup => cleanup());
    };
  }, [ipcConnectionHandlers]);
}
