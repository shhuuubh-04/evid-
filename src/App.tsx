import { useState, useEffect, useCallback, useRef, useMemo } from "preact/hooks";
import type { JSX } from "preact";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Heart, X } from "lucide-preact";
import { Calendar } from "./Calendar";
import { AnniversaryManager, type AnniversaryRecord } from "./AnniversaryManager.tsx";
import { EventsList, type AnniversaryHighlight, type DayEntry, type EntryType } from "./EventsList.tsx";
import "./App.css";

const windowHandle = getCurrentWindow();
const BASE_FOCUSED_SIZE = { width: 500, height: 516 };
const PANEL_OPEN_FOCUSED_SIZE = { width: 1000, height: 516 };
const UNFOCUSED_SIZE = { width: 500, height: 154 };
const CALENDAR_CONTENT_HEIGHT = 484;
const COMPACT_CONTENT_HEIGHT = 146;

const STORAGE_KEY = "evid_calendar_state";

interface CalendarState {
  currentDate: string;
  selectedDate: string;
}

type DayEntriesMap = Record<string, DayEntry[]>;

interface PersistedData {
  entriesByDate: DayEntriesMap;
  anniversaries: AnniversaryRecord[];
}

const loadState = (): CalendarState | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const saveState = (state: CalendarState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const pruneOneOffEntries = (entriesByDate: DayEntriesMap, todayKey: string): DayEntriesMap => {
  const next: DayEntriesMap = {};

  for (const [dateKey, entries] of Object.entries(entriesByDate)) {
    if (dateKey < todayKey) continue;

    const valid = entries.filter((entry) => !entry.done);
    if (valid.length > 0) {
      next[dateKey] = valid;
    }
  }

  return next;
};

const isOneOffDateTimeAllowed = (date: Date, time?: string): boolean => {
  const now = new Date();
  const selectedDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (selectedDayStart.getTime() < todayStart.getTime()) {
    return false;
  }

  if (selectedDayStart.getTime() > todayStart.getTime()) {
    return true;
  }

  if (!time) {
    return false;
  }

  const parts = time.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return false;
  }

  const candidate = new Date(date);
  candidate.setHours(hours, minutes, 59, 999);
  return candidate.getTime() >= now.getTime();
};

const getInitialDates = () => {
  const savedState = loadState();

  if (!savedState) {
    const now = new Date();
    return { currentDate: now, selectedDate: now };
  }

  const currentDate = new Date(savedState.currentDate);
  const selectedDate = new Date(savedState.selectedDate);

  if (Number.isNaN(currentDate.getTime()) || Number.isNaN(selectedDate.getTime())) {
    const now = new Date();
    return { currentDate: now, selectedDate: now };
  }

  return { currentDate, selectedDate };
};

function App() {
  const [isFocused, setIsFocused] = useState(true);
  const [showEventsPanel, setShowEventsPanel] = useState(false);
  const [showAnniversaryManager, setShowAnniversaryManager] = useState(false);
  const initialDates = useMemo(getInitialDates, []);
  const [entriesByDate, setEntriesByDate] = useState<DayEntriesMap>({});
  const [anniversaries, setAnniversaries] = useState<AnniversaryRecord[]>([]);
  const showEventsPanelRef = useRef(false);
  const storageHydratedRef = useRef(false);
  const blurTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const panelVisibilityTimerRef = useRef<number | null>(null);
  const suppressBlurUntilRef = useRef<number>(0);
  const lastAppliedFocusRef = useRef<boolean | null>(null);
  const [currentDate, setCurrentDate] = useState(initialDates.currentDate);
  const [selectedDate, setSelectedDate] = useState(initialDates.selectedDate);

  const applyWindowSize = useCallback(async (focused: boolean, panelOpen: boolean) => {
    const size = focused
      ? panelOpen
        ? PANEL_OPEN_FOCUSED_SIZE
        : BASE_FOCUSED_SIZE
      : UNFOCUSED_SIZE;

    const key = `${focused}:${panelOpen}`;
    if (lastAppliedFocusRef.current === (key as unknown as boolean)) return;
    lastAppliedFocusRef.current = key as unknown as boolean;

    try {
      await windowHandle.setSize(new LogicalSize(size.width, size.height));
    } catch (e) {
      console.error("Resize error:", e);
    }
  }, []);

  const scheduleResize = useCallback(
    (focused: boolean, panelOpen: boolean, delay = 60) => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeTimerRef.current = window.setTimeout(() => {
        void applyWindowSize(focused, panelOpen);
        resizeTimerRef.current = null;
      }, delay);
    },
    [applyWindowSize]
  );

  useEffect(() => {
    showEventsPanelRef.current = showEventsPanel;
  }, [showEventsPanel]);

  const handleFocusChange = useCallback(
    (focused: boolean) => {
      if (focused) {
        if (blurTimerRef.current !== null) {
          window.clearTimeout(blurTimerRef.current);
          blurTimerRef.current = null;
        }

        setIsFocused(true);
        scheduleResize(true, showEventsPanelRef.current);
        return;
      }

      if (Date.now() < suppressBlurUntilRef.current) {
        return;
      }

      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }

      blurTimerRef.current = window.setTimeout(() => {
        setIsFocused(false);
        scheduleResize(false, false);
        blurTimerRef.current = null;
      }, 120);
    },
    [scheduleResize]
  );

  useEffect(() => {
    void applyWindowSize(true, false);

    const setupFocusListener = async () => {
      const unlisten = await windowHandle.onFocusChanged(({ payload: focused }: { payload: boolean }) => {
        handleFocusChange(focused);
      });
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;
    setupFocusListener().then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      if (panelVisibilityTimerRef.current !== null) {
        window.clearTimeout(panelVisibilityTimerRef.current);
      }
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [applyWindowSize, handleFocusChange]);


  const handleClose = async () => {
    try {
      await invoke("hide_to_tray");
    } catch (e) {
      console.error("Hide-to-tray error:", e);
    }
  };

  useEffect(() => {
    saveState({
      currentDate: currentDate.toISOString(),
      selectedDate: selectedDate.toISOString(),
    });
  }, [currentDate, selectedDate]);

  useEffect(() => {
    let active = true;

    const loadPersistedData = async () => {
      try {
        const payload = await invoke<PersistedData>("load_persisted_data");
        if (!active) return;

        const todayKey = toDateKey(new Date());
        const backendEntries = payload.entriesByDate ?? {};
        const sanitized = pruneOneOffEntries(backendEntries, todayKey);

        setEntriesByDate(sanitized);
        setAnniversaries(payload.anniversaries ?? []);
      } catch (e) {
        console.error("Failed to load persisted data:", e);
      } finally {
        if (active) {
          storageHydratedRef.current = true;
        }
      }
    };

    void loadPersistedData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!storageHydratedRef.current) return;

    const todayKey = toDateKey(new Date());
    const sanitized = pruneOneOffEntries(entriesByDate, todayKey);

    void invoke("save_one_off_entries", {
      entriesByDate: sanitized,
      todayKey,
    }).catch((error) => {
      console.error("Failed to save one-off entries:", error);
    });
  }, [entriesByDate]);

  useEffect(() => {
    if (!storageHydratedRef.current) return;

    void invoke("save_anniversaries", {
      anniversaries,
    }).catch((error) => {
      console.error("Failed to save anniversaries:", error);
    });
  }, [anniversaries]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleOpenEventsPanel = useCallback(
    async (date: Date) => {
      setSelectedDate(date);

      if (showEventsPanel) {
        return;
      }

      suppressBlurUntilRef.current = Date.now() + 360;
      showEventsPanelRef.current = true;

      if (!isFocused) {
        setIsFocused(true);
      }

      scheduleResize(true, true, 0);

      if (panelVisibilityTimerRef.current !== null) {
        window.clearTimeout(panelVisibilityTimerRef.current);
      }

      panelVisibilityTimerRef.current = window.setTimeout(() => {
        setShowEventsPanel(true);
        panelVisibilityTimerRef.current = null;
      }, 36);
    },
    [isFocused, scheduleResize, showEventsPanel]
  );

  const handleCloseEventsPanel = useCallback(() => {
    showEventsPanelRef.current = false;
    setShowEventsPanel(false);
    if (isFocused) {
      scheduleResize(true, false, 170);
    }
  }, [isFocused, scheduleResize]);

  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  const anniversariesForDate = useMemo<AnniversaryHighlight[]>(() => {
    const month = selectedDate.getMonth() + 1;
    const day = selectedDate.getDate();
    const year = selectedDate.getFullYear();

    return anniversaries
      .filter((item) => item.month === month && item.day === day)
      .map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        yearsSince:
          typeof item.startYear === "number" && item.startYear > 0 && year >= item.startYear
            ? year - item.startYear
            : undefined,
      }));
  }, [anniversaries, selectedDate]);

  const selectedDateEntries = useMemo(
    () => entriesByDate[selectedDateKey] ?? [],
    [entriesByDate, selectedDateKey]
  );

  const handleAddEntry = useCallback(
    (entry: { type: EntryType; title: string; time?: string; bodyHtml?: string }) => {
      const todayKey = toDateKey(new Date());
      if (!isOneOffDateTimeAllowed(selectedDate, entry.time)) {
        return;
      }

      setEntriesByDate((prev) => {
        const sanitizedPrev = pruneOneOffEntries(prev, todayKey);
        const dayEntries = sanitizedPrev[selectedDateKey] ?? [];
        const nextEntry: DayEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: entry.type,
          title: entry.title,
          time: entry.time,
          bodyHtml: entry.bodyHtml,
          done: false,
        };

        return {
          ...sanitizedPrev,
          [selectedDateKey]: [...dayEntries, nextEntry],
        };
      });
    },
    [selectedDate, selectedDateKey]
  );

  const handleUpdateEntry = useCallback(
    (id: string, entry: { type: EntryType; title: string; time?: string; bodyHtml?: string }) => {
      const todayKey = toDateKey(new Date());
      if (!isOneOffDateTimeAllowed(selectedDate, entry.time)) {
        return;
      }

      setEntriesByDate((prev) => {
        const sanitizedPrev = pruneOneOffEntries(prev, todayKey);
        const dayEntries = sanitizedPrev[selectedDateKey] ?? [];
        if (dayEntries.length === 0) {
          return sanitizedPrev;
        }

        return {
          ...sanitizedPrev,
          [selectedDateKey]: dayEntries.map((current) =>
            current.id === id
              ? {
                  ...current,
                  type: entry.type,
                  title: entry.title,
                  time: entry.time,
                  bodyHtml: entry.bodyHtml,
                }
              : current
          ),
        };
      });
    },
    [selectedDate, selectedDateKey]
  );

  const handleToggleEntry = useCallback(
    (id: string) => {
      setEntriesByDate((prev) => {
        const dayEntries = prev[selectedDateKey] ?? [];
        const nextEntries = dayEntries.filter((entry) => entry.id !== id);

        if (nextEntries.length === 0) {
          const { [selectedDateKey]: _, ...rest } = prev;
          return rest;
        }

        return {
          ...prev,
          [selectedDateKey]: nextEntries,
        };
      });
    },
    [selectedDateKey]
  );

  const contentHeight = isFocused ? CALENDAR_CONTENT_HEIGHT : COMPACT_CONTENT_HEIGHT;

  const handleHeaderMouseDown = useCallback(
    async (event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-drag-handle='true']")) {
        return;
      }

      try {
        await windowHandle.startDragging();
      } catch (e) {
        console.error("Drag error:", e);
      }
    },
    []
  );

  return (
    <div class="flex flex-col" style={{ backgroundColor: "#f5f5f5", overflow: "hidden" }}>
      <div
        onMouseDown={(event) => {
          void handleHeaderMouseDown(event);
        }}
        class="flex-shrink-0 select-none flex items-center justify-between pl-3 pr-1 transition-[height] duration-150 ease-out"
        style={{
          height: isFocused ? "32px" : "8px",
          backgroundColor: "#2a2a2a",
          overflow: "hidden",
        }}
      >
        <div
          class="w-full flex items-center justify-between transition-opacity duration-150 ease-out"
          style={{
            opacity: isFocused ? 1 : 0,
            pointerEvents: isFocused ? "auto" : "none",
          }}
        >
          <div
            data-drag-handle="true"
            class="flex-1 h-full flex items-center"
            style={{ minWidth: 0 }}
          >
            <span class="text-xs font-medium select-none" style={{ color: "#f5f5f5" }}>
              (.evid)
            </span>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button
              data-no-drag="true"
              type="button"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={() => {
                setShowAnniversaryManager(true);
              }}
              class="p-1 hover:opacity-60 transition-opacity"
              style={{ color: "#f5f5f5" }}
            >
              <Heart size={16} strokeWidth={2} />
            </button>
            <button
              data-no-drag="true"
              type="button"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={() => {
                void handleClose();
              }}
              class="p-1 hover:opacity-60 transition-opacity"
              style={{ color: "#f5f5f5" }}
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      <div class="flex-shrink-0 relative" style={{ overflow: "hidden", height: `${contentHeight}px` }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${BASE_FOCUSED_SIZE.width}px`,
            height: "100%",
            transform: "translateX(0)",
            opacity: showEventsPanel ? 0.9 : 1,
            transition: "transform 160ms ease, opacity 160ms ease",
          }}
        >
          <Calendar
            isFocused={isFocused}
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onDateDoubleClick={handleOpenEventsPanel}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${BASE_FOCUSED_SIZE.width}px`,
            width: `${BASE_FOCUSED_SIZE.width}px`,
            height: "100%",
            transform: showEventsPanel ? "scaleX(1)" : "scaleX(0)",
            transformOrigin: "left center",
            opacity: showEventsPanel ? 1 : 0,
            pointerEvents: showEventsPanel ? "auto" : "none",
            transition: "transform 160ms ease, opacity 160ms ease",
            borderLeft: "1px solid #d0d0d0",
            backgroundColor: "#f5f5f5",
          }}
        >
          <EventsList
            selectedDate={selectedDate}
            contentHeight={contentHeight}
            entries={selectedDateEntries}
            anniversariesForDate={anniversariesForDate}
            onClose={handleCloseEventsPanel}
            onAddEntry={handleAddEntry}
            onUpdateEntry={handleUpdateEntry}
            onToggleEntry={handleToggleEntry}
          />
        </div>

      </div>

      {showAnniversaryManager ? (
        <AnniversaryManager
          anniversaries={anniversaries}
          onSave={setAnniversaries}
          onClose={() => setShowAnniversaryManager(false)}
        />
      ) : null}
    </div>
  );
}

export default App;
