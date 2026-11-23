"use client";

import React from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

import { ToastAction } from '@/components/ui/toast';
import { toast, toastError } from '@/hooks/useToast';
import { useRunner } from '@/hooks/useRunner';
import { getErrorMessage } from '../../common/utils';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Checks GitHub releases (see plugins.updater in tauri.conf.json) for a newer version.
 * Never installs or restarts on its own: the user clicks "Install & restart" in a toast.
 */
export function useUpdater() {
  const { currentlyRunningMatch } = useRunner();

  // read inside the toast's click handler, which outlives the render that created it
  const matchRunningRef = React.useRef(false);
  React.useEffect(() => {
    matchRunningRef.current = currentlyRunningMatch !== null;
  }, [currentlyRunningMatch]);

  const installing = React.useRef(false);

  const install = React.useCallback(async (update: Update) => {
    if (installing.current) return;
    if (matchRunningRef.current) {
      toast({
        toastTitle: "Can't update during a match",
        toastDescription: "Finish or terminate the running match, then try again from Settings.",
      });
      return;
    }
    installing.current = true;

    const progress = toast({
      toastTitle: `Downloading v${update.version}...`,
      duration: Infinity,
    });

    try {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength;
          if (total > 0) {
            progress.update({
              id: progress.id,
              toastDescription: `${Math.min(100, Math.round((received / total) * 100))}%`,
            });
          }
        } else if (event.event === 'Finished') {
          progress.update({ id: progress.id, toastTitle: "Installing...", toastDescription: undefined });
        }
      });
      await relaunch();
    } catch (e) {
      installing.current = false;
      progress.dismiss();
      toastError("Update failed", getErrorMessage(e));
    }
  }, []);

  /** @param manual true when the user asked (shows "up to date"/errors); false for the silent startup check. */
  const checkForUpdates = React.useCallback(async (manual = false) => {
    if (!isTauri()) return;
    try {
      const update = await check();
      if (!update) {
        if (manual) toast({ toastTitle: "You're up to date" });
        return;
      }
      toast({
        toastTitle: `Update available: v${update.version}`,
        toastDescription: "Install it now, or later from Settings. The app restarts after installing.",
        duration: Infinity,
        action: (
          <ToastAction altText="Install update and restart" onClick={() => install(update)}>
            Install &amp; restart
          </ToastAction>
        ),
      });
    } catch (e) {
      // offline, no releases yet, etc: only bother the user if they asked
      console.warn('[updater] check failed:', e);
      if (manual) toastError("Couldn't check for updates", getErrorMessage(e));
    }
  }, [install]);

  return { checkForUpdates };
}
