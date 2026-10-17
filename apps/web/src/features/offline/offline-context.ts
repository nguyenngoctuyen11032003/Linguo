import { createContext, useContext } from 'react';
import type { PackMeta } from './content-store';
import type { DownloadResult } from './pack-service';

export type DownloadKind = 'unit' | 'program' | 'path' | 'next' | 'lessons';

/** How a finished download ended. */
export type DownloadOutcome = 'done' | 'partial' | 'offline' | 'quota' | 'rate_limited' | 'cancelled' | 'error';

export interface DownloadJob {
  /** Increases with every job so the UI can tell a new one from the previous one. */
  id: number;
  kind: DownloadKind;
  /** Which button started it (`path`, `unit:<id>`, ...), so only that control shows the progress. */
  scope?: string;
  /** Started by the automatic caching, not by the learner. */
  auto: boolean;
  running: boolean;
  total: number;
  done: number;
  failed: number;
  bytes: number;
  /** Set when the job finished. */
  outcome?: DownloadOutcome;
}

export interface DownloadRequest {
  kind: DownloadKind;
  /** Echoed on the job (see DownloadJob.scope). */
  scope?: string;
  lessonIds: readonly string[];
  /** Defaults to the current path. */
  pathId?: string;
}

export interface OfflineContentValue {
  /** The device store has been read; `downloaded` is meaningful. */
  ready: boolean;
  /** False when nothing can be kept across a reload (IndexedDB unavailable): downloads would only last for this visit. */
  persistent: boolean;
  /** Packs stored on this device, by lesson id. */
  downloaded: ReadonlyMap<string, PackMeta>;
  /** The lesson can be opened and graded with no network (pack and keys are stored). */
  isDownloaded: (lessonId: string) => boolean;
  /** Bytes of the stored packs (text and keys). */
  usageBytes: number;
  /** Rough size of downloading `count` more lessons. */
  estimateBytes: (count: number) => number;
  job: DownloadJob | null;
  download: (request: DownloadRequest) => Promise<DownloadResult | null>;
  cancel: () => void;
  /** Removes packs (never one with an unsynced run). Returns how many were removed. */
  remove: (lessonIds: readonly string[]) => Promise<number>;
  /** Removes every pack that has no unsynced run, and the downloaded media. */
  removeAll: () => Promise<void>;
  autoDownload: boolean;
  setAutoDownload: (on: boolean) => void;
  /** Download automatically only on an unmetered connection (where the browser can tell). */
  wifiOnly: boolean;
  setWifiOnly: (on: boolean) => void;
  /** The browser exposes the connection type, so "Wi-Fi only" can be honoured. */
  wifiOnlySupported: boolean;
  refresh: () => Promise<void>;
}

/** What screens see without a provider (tests, logged-out areas): nothing is downloaded and nothing can be. */
export const INERT_OFFLINE_CONTENT: OfflineContentValue = {
  ready: false,
  persistent: false,
  downloaded: new Map(),
  isDownloaded: () => false,
  usageBytes: 0,
  estimateBytes: () => 0,
  job: null,
  download: async () => null,
  cancel: () => undefined,
  remove: async () => 0,
  removeAll: async () => undefined,
  autoDownload: false,
  setAutoDownload: () => undefined,
  wifiOnly: false,
  setWifiOnly: () => undefined,
  wifiOnlySupported: false,
  refresh: async () => undefined,
};

export const OfflineContentContext = createContext<OfflineContentValue>(INERT_OFFLINE_CONTENT);

export function useOfflineContent(): OfflineContentValue {
  return useContext(OfflineContentContext);
}
