"use client";

import React from 'react';
import { Settings } from '../../common/types';
import { useToast } from '@/hooks/useToast';
import { useLoadings } from './useLoadings';

export type UseSettingsValue = {
  settings: Settings;
  fetchSettings: () => void;
  saveSettings: (draftSettings: Settings) => Promise<boolean>;
  openExplorerChooser: () => Promise<string | null>;
  openAppRelativePathInExplorer: (appRelativePath: string) => void;
};

const SettingsContext = React.createContext<UseSettingsValue | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = React.useState<Settings>({});
  const {loadings, toggleLoading} = useLoadings();
  const {toastError} = useToast();

  // >>> HANDLERS

  const fetchSettings = React.useCallback(() => {
    if (loadings.fetchSettings) return;
    
    toggleLoading('fetchSettings', true);

    window.electron.settingsGet()
    .then((settings) => {
      setSettings(settings ?? {});
    })
    .catch((err: any) => {
      toastError("Failed to fetch settings", err);
    })
    .finally(() => {
      toggleLoading('fetchSettings', false);
    });
  }, [loadings.fetchSettings, toggleLoading, toastError]);

  const saveSettings = React.useCallback(async (draftSettings: Settings) => {
    if (loadings.saveSettings) return false;
    toggleLoading('saveSettings', true);

		try {
      const res = await window.electron.settingsSet(draftSettings);
      if (res.success) {
        setSettings(res.settings); 
        return true;
      } else {
        toastError("Failed to save settings", res.error);
        return false;
      }
    } catch (err) {
      toastError("Failed to save settings", err);
      return false;
    } finally {
      toggleLoading('saveSettings', false);
    }
  }, [loadings.saveSettings, toggleLoading, toastError]);

  const openExplorerChooser = React.useCallback(async (maybeAppRelativePath?: string) => {
    try {
      const res = await window.electron.settingsChooseDir(maybeAppRelativePath);
      if (res.success) {
        return res.selectedPath ?? null;
      } // else: probably user-canceled
    } catch (err) {
      toastError("Failed to open directory chooser", err);
    }

    return null;
  }, [toastError]);

  const openAppRelativePathInExplorer = React.useCallback((maybeAppRelativePath: string) => {
    if (loadings.openExplorer) return;
    toggleLoading('openExplorer', true);

    window.electron.settingsOpenExplorer(maybeAppRelativePath)
    .then((res) => {
      if (!res.success) {
        toastError("Failed to open explorer", new Error(res.error));
      }
    })
    .catch((err) => {
      toastError("Failed to open explorer", err);
    })
    .finally(() => {
      toggleLoading('openExplorer', false);
    });
  }, [loadings.openExplorer, toggleLoading, toastError]);


  // >>> INITIAL SETUP

  React.useEffect(() => {
    fetchSettings();
  }, []);

  const value = React.useMemo(() => ({
    settings,
    fetchSettings,
    saveSettings,
    openExplorerChooser,
    openAppRelativePathInExplorer,
  } satisfies UseSettingsValue), [
    settings, 
    fetchSettings,
    saveSettings,
    openExplorerChooser,
    openAppRelativePathInExplorer,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): UseSettingsValue {
  const context = React.useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
