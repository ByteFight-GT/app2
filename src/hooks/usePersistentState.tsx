"use client";

import React from 'react';
import { useToast } from '@/hooks/useToast';

export type UsePersistentStateValue = {
  /** `null` until the backend has answered. */
  hasSetupBefore: boolean | null;
  markSetupComplete: () => Promise<void>;
};

const PersistentStateContext = React.createContext<UsePersistentStateValue | undefined>(undefined);

export const PersistentStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasSetupBefore, setHasSetupBefore] = React.useState<boolean | null>(null);
  const { toastError } = useToast();

  React.useEffect(() => {
    window.electron.persistentStateGet()
      .then((state) => setHasSetupBefore(state.hasSetupBefore))
      .catch((err) => {
        toastError("Failed to fetch app state", err);
        setHasSetupBefore(true); // fail open: don't trap the user on /setup
      });
  }, []);

  const markSetupComplete = React.useCallback(async () => {
    try {
      const res = await window.electron.persistentStateSet({ hasSetupBefore: true });
      if (res.success) {
        setHasSetupBefore(res.state.hasSetupBefore);
      } else {
        toastError("Failed to save app state", new Error(res.error));
      }
    } catch (err) {
      toastError("Failed to save app state", err);
    }
  }, [toastError]);

  const value = React.useMemo(
    () => ({ hasSetupBefore, markSetupComplete } satisfies UsePersistentStateValue),
    [hasSetupBefore, markSetupComplete],
  );

  return <PersistentStateContext.Provider value={value}>{children}</PersistentStateContext.Provider>;
};

export function usePersistentState(): UsePersistentStateValue {
  const context = React.useContext(PersistentStateContext);
  if (context === undefined) {
    throw new Error('usePersistentState must be used within an PersistentStateProvider');
  }
  return context;
}
