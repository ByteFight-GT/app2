"use client";

import React from 'react';
import '@/lib/backend'; // installs window.electron (Tauri backend)
import { gameConfig } from '@/lib/gameconfig';
import { BotsProvider } from './useBots';
import { MapsProvider } from './useMaps';
import { PersistentStateProvider } from './usePersistentState';
import { SettingsProvider } from './useSettings';
import { MatchesProvider } from './useMatches';
import { LoadingsProvider } from './useLoadings';
import { RunnerProvider } from './useRunner';
import { VisualizerProvider } from '@/gamerenderer/competitions/cs6601_fa2026';

/**
 * Combined provider that wraps all app-wide state providers.
 * Use this at the toplevel of the app, then everything should be able to access states n stuff
 */
export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  
  // keep LoadingsProvider on top cuz other things depend on its value.
  // also might wanna do settings next cuz other things might depend on settings (eg. maps/bots dir)
  const inner = (
    <VisualizerProvider>
      <MatchesProvider>
        <RunnerProvider>
          {children}
        </RunnerProvider>
      </MatchesProvider>
    </VisualizerProvider>
  );

  return (
    <LoadingsProvider>
      <SettingsProvider>
        <PersistentStateProvider>
        <BotsProvider>
          {gameConfig.maps.enabled ? <MapsProvider>{inner}</MapsProvider> : inner}
        </BotsProvider>
        </PersistentStateProvider>
      </SettingsProvider>
    </LoadingsProvider>
  );
};
