"use client";

import { useSyncExternalStore } from "react";
import type { AssistantAnswer } from "@/components/agendamiento/query-result";

/**
 * Question history for the assistant, kept in this browser's localStorage.
 * Shared by the sidebar (list) and the assistant (writes and reopens entries).
 */
export interface HistoryItem {
  id: string;
  pregunta: string;
  createdAt: number;
  answer?: AssistantAnswer;
  error?: string;
}

const KEY = "agendamiento:historial:v1";
const MAX_ITEMS = 40;
// Rows kept per answer so the history fits in localStorage (~5 MB).
const MAX_ROWS = 300;

const EMPTY: HistoryItem[] = [];
let cache: HistoryItem[] | null = null;
const listeners = new Set<() => void>();

function read(): HistoryItem[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: HistoryItem[]) {
  cache = items;
  // Drop the oldest entries until it fits.
  for (let list = items; list.length; list = list.slice(0, -1)) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      break;
    } catch {
      /* quota exceeded or storage blocked */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function newHistoryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function saveHistoryItem(item: HistoryItem) {
  const stored: HistoryItem = item.answer
    ? {
        ...item,
        answer: {
          ...item.answer,
          result: item.answer.result.slice(0, MAX_ROWS),
          truncated: item.answer.truncated || item.answer.result.length > MAX_ROWS,
        },
      }
    : item;
  write([stored, ...read().filter((h) => h.id !== item.id)].slice(0, MAX_ITEMS));
}

export function getHistoryItem(id: string) {
  return read().find((h) => h.id === id);
}

export function removeHistoryItem(id: string) {
  write(read().filter((h) => h.id !== id));
}

export function clearHistory() {
  write([]);
}

export function useHistory() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** "hace 5 min", "ayer", "3 nov" */
export function relativeTime(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "ayer";
  return new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
