/**
 * Lightweight localStorage history manager.
 */
const HISTORY_KEY = 'bis_search_history';
const MAX_ENTRIES = 50;

export function addHistoryEntry(entry) {
  try {
    const existing = getHistory();
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return newEntry;
  } catch {
    // storage unavailable — silently ignore
    return null;
  }
}

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function deleteHistoryEntry(id) {
  try {
    const updated = getHistory().filter((e) => e.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}
