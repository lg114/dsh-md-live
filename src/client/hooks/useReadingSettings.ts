import { useCallback, useEffect, useRef, useState } from 'react';
import type { Translate } from '../locales';
import { FOLLOW_STORAGE_KEY } from '../utils/agent-writes';
import {
  DEFAULT_READING,
  READING_STORAGE_KEY,
  TOC_STORAGE_KEY,
  type ReadingSettings,
  loadReading,
  readStored,
  writeStored,
} from '../types';

export function useReadingSettings(t: Translate) {
  const [reading, setReading] = useState<ReadingSettings>(() => loadReading());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState<boolean>(
    () => readStored<unknown>(TOC_STORAGE_KEY) === true,
  );
  const [followWrites, setFollowWrites] = useState<boolean>(
    () => readStored<unknown>(FOLLOW_STORAGE_KEY) === true,
  );

  const updateReading = useCallback((patch: Partial<ReadingSettings>) => {
    setReading((prev) => {
      const next = { ...prev, ...patch };
      writeStored(READING_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleToc = useCallback(() => {
    setTocCollapsed((prev) => {
      const next = !prev;
      writeStored(TOC_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleFollowWrites = useCallback((next: boolean) => {
    setFollowWrites(next);
    writeStored(FOLLOW_STORAGE_KEY, next);
  }, []);

  return {
    reading,
    settingsOpen,
    setSettingsOpen,
    tocCollapsed,
    followWrites,
    setFollowWrites: handleFollowWrites,
    updateReading,
    toggleToc,
  };
}
