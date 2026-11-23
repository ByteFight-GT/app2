"use client";

import React from 'react';
import { useUpdater } from '@/hooks/useUpdater';

/** Mount once: does a silent update check shortly after startup (skipped in dev). */
export function UpdateChecker() {
  const { checkForUpdates } = useUpdater();
  const ref = React.useRef(checkForUpdates);
  ref.current = checkForUpdates;

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    const t = setTimeout(() => ref.current(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return null;
}
