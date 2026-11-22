"use client";

import React from 'react';
import { useToast } from '@/hooks/useToast';
import { useLoadings } from './useLoadings';
import { word } from '../../common/utils';
import { useSettings } from './useSettings';

export type UseBotsValue = {
  bots: string[];
  fetchBotList: () => void;
  handleImportBots: () => void;
};

const BotsContext = React.createContext<UseBotsValue | undefined>(undefined);

export const BotsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bots, setBots] = React.useState<string[]>([]);
  const {loadings, toggleLoading} = useLoadings();
  const {toast, toastError} = useToast();

  // for refreshing bot list when bots dir changes
  const { settings } = useSettings();
  const botsDir = settings["Bots Directory"]?.value;

  // >>> HANDLERS

  const fetchBotList = React.useCallback(() => {
    if (loadings['fetchBotList']) return;

    toggleLoading('fetchBotList', true);

    window.electron.botsList()
    .then(res => {
      if (res.success) {
        setBots(res.bots);
      } else {
        toastError("Failed to fetch bot list", res.error);
      }
    })
    .catch((err: any) => {
      toastError("Failed to fetch bot list", err);
    })
    .finally(() => {
      toggleLoading('fetchBotList', false);
    });
  }, [loadings, toggleLoading, toastError]);

  const handleImportBots = React.useCallback(() => {
    window.electron.botsImport()
    .then((res) => {
      if (res.success) {
        setBots(prev => [...prev, ...res.imported]);
        toast({
          toastTitle: "Bots Imported",
          toastDescription: 
            ((res.invalid?.length ?? 0) > 0)?
              <p>
                Successfully imported {word(res.imported.length, 'bot', 'bots')},
                and the following were invalid and not imported: <span className="text-destructiveBright">{res.invalid.join(', ')}</span>
              </p>
            : 
              `Successfully imported ${word(res.imported.length, 'bot', 'bots')}!`,
        });
      } else {
        toastError("Failed to import bots", res.error);
      }
    })
    .catch((err: any) => {
      toastError("Failed to import bots", err);
    });
  }, [toastError]);

  // >>> INITIAL SETUP

  React.useEffect(() => {
    if (botsDir === undefined) return;
    fetchBotList();
  }, [botsDir]);

  const value = React.useMemo(() => ({
    bots,
    fetchBotList,
    handleImportBots,
  } satisfies UseBotsValue), [
    bots, 
    fetchBotList, 
    handleImportBots
  ]);

  return (
    <BotsContext.Provider value={value}>
      {children}
    </BotsContext.Provider>
  );
};

export function useBots(): UseBotsValue {
  const context = React.useContext(BotsContext);
  if (context === undefined) {
    throw new Error('useBots must be used within a BotsProvider');
  }
  return context;
}
