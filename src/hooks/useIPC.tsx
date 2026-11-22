"use client";

import React from 'react';

import { getErrorMessage } from '../../common/utils';
import type { GameResult } from '../../common/types';
import { useToast } from '@/hooks/useToast';
import { useRunner } from '@/hooks/useRunner';

import { GamePGN, useVisualizer } from '@/gamerenderer/competitions/cs6601_fa2026';


/** Handles state/logic for IPC communication with Electron. */
export function useIPC() {
  const { toastError } = useToast();

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

    handleSystemData(data: any) {
      /* temp - no livestreaming for 6601 yet
      if (data.type === 'update' && currentlyVisualizingMatchRef.current?.matchId === currentlyRunningMatchRef.current?.matchId) {
        updateGamePGN(data);
      }
      */
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
  }), [recordMatchError, toastError]);

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
