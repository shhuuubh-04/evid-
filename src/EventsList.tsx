import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Bold,
  Check,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  PanelRightOpen,
  Pencil,
  Plus,
  Save,
  Underline,
  X,
} from "lucide-preact";

export type EntryType = "Event" | "Occasion" | "Reminder" | "Task" | "Note";

export interface DayEntry {
  id: string;
  type: EntryType;
  title: string;
  time?: string;
  bodyHtml?: string;
  done: boolean;
}

export interface AnniversaryHighlight {
  id: string;
  title: string;
  kind: string;
  yearsSince?: number;
}

interface EventsListProps {
  selectedDate: Date;
  contentHeight: number;
  entries: DayEntry[];
  anniversariesForDate: AnniversaryHighlight[];
  onClose: () => void;
  onAddEntry: (entry: { type: EntryType; title: string; time?: string; bodyHtml?: string }) => void;
  onUpdateEntry: (id: string, entry: { type: EntryType; title: string; time?: string; bodyHtml?: string }) => void;
  onToggleEntry: (id: string) => void;
}

const typeOptions: EntryType[] = ["Event", "Occasion", "Reminder", "Task", "Note"];
type FilterType = "all" | EntryType;

const toPlainText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeBodyHtml = (html: string) => {
  const normalized = html.replace(/<div><br><\/div>/gi, "").trim();
  return toPlainText(normalized) ? normalized : "";
};

const previewFromHtml = (html: string, maxLength = 90) => {
  const plain = toPlainText(html);
  if (!plain) return "";
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}...` : plain;
};

const truncateCardTitle = (title: string, maxChars = 28) => {
  const compact = title.trim().replace(/\s+/g, " ");
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).trimEnd()}....`;
};

const ensureListStyles = (root: HTMLElement | null) => {
  if (!root) return;

  root.querySelectorAll("ul").forEach((node) => {
    const element = node as HTMLUListElement;
    element.style.listStyleType = "disc";
    element.style.paddingLeft = "1.1rem";
    element.style.margin = "0.25rem 0";
  });

  root.querySelectorAll("ol").forEach((node) => {
    const element = node as HTMLOListElement;
    element.style.listStyleType = "decimal";
    element.style.paddingLeft = "1.1rem";
    element.style.margin = "0.25rem 0";
  });

  root.querySelectorAll("li").forEach((node) => {
    const element = node as HTMLLIElement;
    element.style.margin = "0.14rem 0";
  });
};

interface EditorFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unordered: boolean;
  ordered: boolean;
}

const defaultEditorFormats: EditorFormatState = {
  bold: false,
  italic: false,
  underline: false,
  unordered: false,
  ordered: false,
};

export function EventsList({
  selectedDate,
  contentHeight,
  entries,
  anniversariesForDate,
  onClose,
  onAddEntry,
  onUpdateEntry,
  onToggleEntry,
}: EventsListProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState<EntryType>("Task");
  const [draftTime, setDraftTime] = useState("");
  const [draftBodyHtml, setDraftBodyHtml] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [showComposer, setShowComposer] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState("");
  const [openedEntryId, setOpenedEntryId] = useState<string | null>(null);
  const [editorFormats, setEditorFormats] = useState<EditorFormatState>(defaultEditorFormats);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const dateTitle = useMemo(
    () =>
      selectedDate.toLocaleString("default", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [selectedDate]
  );

  const dateSubtitle = useMemo(
    () =>
      selectedDate.toLocaleDateString("default", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [selectedDate]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<EntryType, number> = {
      Event: 0,
      Occasion: 0,
      Reminder: 0,
      Task: 0,
      Note: 0,
    };

    for (const entry of entries) {
      counts[entry.type] += 1;
    }

    return counts;
  }, [entries]);

  const filteredEntries = useMemo(
    () => (activeFilter === "all" ? entries : entries.filter((entry) => entry.type === activeFilter)),
    [activeFilter, entries]
  );

  const openedEntry = useMemo(
    () => entries.find((entry) => entry.id === openedEntryId) ?? null,
    [entries, openedEntryId]
  );

  const refreshEditorFormats = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      setEditorFormats(defaultEditorFormats);
      return;
    }

    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    if (!selection || selection.rangeCount === 0 || !anchorNode || !editor.contains(anchorNode)) {
      setEditorFormats(defaultEditorFormats);
      return;
    }

    const getState = (command: string) => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };

    setEditorFormats({
      bold: getState("bold"),
      italic: getState("italic"),
      underline: getState("underline"),
      unordered: getState("insertUnorderedList"),
      ordered: getState("insertOrderedList"),
    });
  }, []);

  useEffect(() => {
    if (!showComposer || !editorRef.current) return;
    editorRef.current.innerHTML = draftBodyHtml;
    ensureListStyles(editorRef.current);
    refreshEditorFormats();
  }, [editingEntryId, refreshEditorFormats, showComposer]);

  useEffect(() => {
    if (!showComposer) return;

    const handleSelectionChange = () => {
      refreshEditorFormats();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [refreshEditorFormats, showComposer]);

  const filterOptions: FilterType[] = ["all", ...typeOptions];

  const getFilterLabel = (filter: FilterType) => {
    if (filter === "all") return "All";
    return filter.charAt(0).toUpperCase() + filter.slice(1);
  };

  const getFilterCount = (filter: FilterType) => {
    if (filter === "all") return entries.length;
    return typeCounts[filter];
  };

  const validateEntryDateTime = (timeValue: string): string | null => {
    const now = new Date();
    const selectedDayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (selectedDayStart.getTime() < todayStart.getTime()) {
      return "Cannot save one-off entries for past dates.";
    }

    if (selectedDayStart.getTime() > todayStart.getTime()) {
      return null;
    }

    if (!timeValue) {
      return "Pick a time for entries on today.";
    }

    const parts = timeValue.split(":");
    if (parts.length !== 2) {
      return "Invalid time format.";
    }

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return "Invalid time format.";
    }

    const candidate = new Date(selectedDate);
    candidate.setHours(hours, minutes, 59, 999);

    if (candidate.getTime() < now.getTime()) {
      return "Pick a future time for today.";
    }

    return null;
  };

  const resetComposerFields = () => {
    setDraftTitle("");
    setDraftType("Task");
    setDraftTime("");
    setDraftBodyHtml("");
    setEditingEntryId(null);
    setComposerError("");

    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  };

  const closeComposer = () => {
    setShowComposer(false);
    setEditingEntryId(null);
    setComposerError("");
  };

  const openComposerForCreate = () => {
    resetComposerFields();
    setShowComposer(true);
  };

  const openComposerForEdit = (entry: DayEntry) => {
    setDraftTitle(entry.title);
    setDraftType(entry.type);
    setDraftTime(entry.time ?? "");
    setDraftBodyHtml(entry.bodyHtml ?? "");
    setEditingEntryId(entry.id);
    setComposerError("");
    setShowComposer(true);
  };

  const applyEditorCommand = (command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false);
    ensureListStyles(editorRef.current);
    setDraftBodyHtml(editorRef.current.innerHTML);
    refreshEditorFormats();
  };

  const handleSaveEntry = () => {
    const title = draftTitle.trim();
    if (!title) return;

    const dateTimeError = validateEntryDateTime(draftTime);
    if (dateTimeError) {
      setComposerError(dateTimeError);
      return;
    }

    const liveHtml = editorRef.current?.innerHTML ?? draftBodyHtml;
    const normalizedBodyHtml = normalizeBodyHtml(liveHtml);

    const payload = {
      type: draftType,
      title,
      time: draftTime || undefined,
      bodyHtml: normalizedBodyHtml || undefined,
    };

    if (editingEntryId) {
      onUpdateEntry(editingEntryId, payload);
    } else {
      onAddEntry(payload);
    }

    resetComposerFields();
    setShowComposer(false);
  };

  return (
    <div
      style={{
        height: `${contentHeight}px`,
        backgroundColor: "#f5f5f5",
        padding: "16px 18px 12px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#212121", fontSize: "18px", fontWeight: 600, lineHeight: 1.2 }}>
            {dateTitle}
          </div>
          <div style={{ color: "#757575", fontSize: "11px", marginTop: "4px" }}>
            {entries.length} item{entries.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          class="hover:opacity-50 transition-opacity"
          style={{
            color: "#424242",
            border: "none",
            background: "transparent",
            padding: "0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <PanelRightOpen size={22} strokeWidth={1.9} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "2px",
          marginBottom: "12px",
        }}
      >
        {filterOptions.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              class="transition-opacity hover:opacity-80"
              style={{
                border: "1px solid #d0d0d0",
                borderRadius: "999px",
                padding: "6px 10px",
                color: isActive ? "#f5f5f5" : "#424242",
                backgroundColor: isActive ? "#2a2a2a" : "#ececec",
                fontSize: "11px",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {getFilterLabel(filter)} {getFilterCount(filter)}
            </button>
          );
        })}
      </div>

      {anniversariesForDate.length > 0 ? (
        <div
          style={{
            padding: "8px",
            marginBottom: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            backgroundColor: "#f5f5f5",
          }}
        >
          <div style={{ color: "#616161", fontSize: "11px", fontWeight: 600 }}>Anniversaries</div>
          {anniversariesForDate.map((anniversary) => (
            <div
              key={anniversary.id}
              style={{
                border: "1px solid #dfdfdf",
                borderRadius: "8px",
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "#212121",
                    fontSize: "12px",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {anniversary.title}
                </div>
                <div style={{ color: "#757575", fontSize: "10px", marginTop: "2px", textTransform: "capitalize" }}>
                  {anniversary.kind}
                </div>
              </div>
              {typeof anniversary.yearsSince === "number" && anniversary.yearsSince > 0 ? (
                <div style={{ color: "#424242", fontSize: "11px", fontWeight: 600 }}>
                  Year {anniversary.yearsSince}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingRight: "2px",
        }}
      >
        {filteredEntries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#757575",
              fontSize: "12px",
              marginTop: "14px",
            }}
          >
            No entries in this view.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "10px",
              alignItems: "start",
              paddingBottom: "86px",
            }}
          >
            {filteredEntries.map((entry) => (
              <article
                key={entry.id}
                onClick={() => setOpenedEntryId(entry.id)}
                class="transition-opacity hover:opacity-90"
                style={{
                  border: "1px solid #d0d0d0",
                  borderRadius: "16px",
                  minHeight: "130px",
                  padding: "10px 10px 9px",
                  backgroundColor: entry.done ? "#ececec" : "#f5f5f5",
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      color: "#757575",
                      fontSize: "10px",
                      textTransform: "capitalize",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {entry.type}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openComposerForEdit(entry);
                      }}
                      class="hover:opacity-60 transition-opacity"
                      style={{
                        color: "#757575",
                        background: "transparent",
                        border: "none",
                        width: "20px",
                        height: "20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <Pencil size={13} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleEntry(entry.id);
                      }}
                      class="transition-opacity hover:opacity-70"
                      style={{
                        border: "1px solid #bcbcbc",
                        borderRadius: "999px",
                        width: "20px",
                        height: "20px",
                        backgroundColor: entry.done ? "#2a2a2a" : "transparent",
                        color: "#f5f5f5",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {entry.done ? <Check size={12} strokeWidth={2.6} /> : null}
                    </button>
                  </div>
                </div>

                {entry.type === "Note" ? (
                  <>
                    <div
                      style={{
                        color: "#212121",
                        fontSize: "14px",
                        fontWeight: 600,
                        lineHeight: 1.25,
                        marginTop: "8px",
                        textDecoration: entry.done ? "line-through" : "none",
                        opacity: entry.done ? 0.6 : 1,
                        wordBreak: "break-word",
                      }}
                    >
                      {truncateCardTitle(entry.title, 34)}
                    </div>
                    <div
                      style={{
                        color: "#757575",
                        fontSize: "12px",
                        marginTop: "7px",
                        lineHeight: 1.35,
                        maxHeight: "68px",
                        overflow: "hidden",
                        opacity: entry.done ? 0.6 : 1,
                      }}
                    >
                      {previewFromHtml(entry.bodyHtml ?? "") || "No text"}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        color: "#212121",
                        fontSize: "18px",
                        fontWeight: 600,
                        lineHeight: 1.2,
                        marginTop: "8px",
                        textDecoration: entry.done ? "line-through" : "none",
                        opacity: entry.done ? 0.6 : 1,
                        wordBreak: "break-word",
                      }}
                    >
                      {truncateCardTitle(entry.title, 26)}
                    </div>
                  </>
                )}

                <div
                  style={{
                    marginTop: "auto",
                    color: "#757575",
                    fontSize: "11px",
                    paddingTop: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span>{dateSubtitle}</span>
                  {entry.time ? (
                    <span style={{ color: "#616161", fontSize: "12px", fontWeight: 500 }}>{entry.time}</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showComposer ? (
        <div
          style={{
            position: "absolute",
            left: "14px",
            right: "14px",
            bottom: "14px",
            border: "1px solid #d0d0d0",
            borderRadius: "14px",
            backgroundColor: "#f5f5f5",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
            zIndex: 3,
          }}
        >
          <input
            value={draftTitle}
            onInput={(e) => {
              setDraftTitle((e.target as HTMLInputElement).value);
              if (composerError) setComposerError("");
            }}
            placeholder={editingEntryId ? "Edit entry title" : "Write a note title"}
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: "8px",
              height: "34px",
              padding: "0 10px",
              backgroundColor: "#f5f5f5",
              color: "#212121",
              outline: "none",
            }}
          />

          <div
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: "10px",
              backgroundColor: "#f5f5f5",
              padding: "7px",
            }}
          >
            <div style={{ display: "flex", gap: "6px", marginBottom: "7px" }}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyEditorCommand("bold")}
                class="hover:opacity-70 transition-opacity"
                style={{
                  width: "28px",
                  height: "28px",
                  border: editorFormats.bold ? "1px solid #2a2a2a" : "1px solid #d0d0d0",
                  borderRadius: "7px",
                  backgroundColor: editorFormats.bold ? "#2a2a2a" : "#f5f5f5",
                  color: editorFormats.bold ? "#f5f5f5" : "#424242",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Bold size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyEditorCommand("italic")}
                class="hover:opacity-70 transition-opacity"
                style={{
                  width: "28px",
                  height: "28px",
                  border: editorFormats.italic ? "1px solid #2a2a2a" : "1px solid #d0d0d0",
                  borderRadius: "7px",
                  backgroundColor: editorFormats.italic ? "#2a2a2a" : "#f5f5f5",
                  color: editorFormats.italic ? "#f5f5f5" : "#424242",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Italic size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyEditorCommand("underline")}
                class="hover:opacity-70 transition-opacity"
                style={{
                  width: "28px",
                  height: "28px",
                  border: editorFormats.underline ? "1px solid #2a2a2a" : "1px solid #d0d0d0",
                  borderRadius: "7px",
                  backgroundColor: editorFormats.underline ? "#2a2a2a" : "#f5f5f5",
                  color: editorFormats.underline ? "#f5f5f5" : "#424242",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Underline size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyEditorCommand("insertUnorderedList")}
                class="hover:opacity-70 transition-opacity"
                style={{
                  width: "28px",
                  height: "28px",
                  border: editorFormats.unordered ? "1px solid #2a2a2a" : "1px solid #d0d0d0",
                  borderRadius: "7px",
                  backgroundColor: editorFormats.unordered ? "#2a2a2a" : "#f5f5f5",
                  color: editorFormats.unordered ? "#f5f5f5" : "#424242",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <List size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyEditorCommand("insertOrderedList")}
                class="hover:opacity-70 transition-opacity"
                style={{
                  width: "28px",
                  height: "28px",
                  border: editorFormats.ordered ? "1px solid #2a2a2a" : "1px solid #d0d0d0",
                  borderRadius: "7px",
                  backgroundColor: editorFormats.ordered ? "#2a2a2a" : "#f5f5f5",
                  color: editorFormats.ordered ? "#f5f5f5" : "#424242",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <ListOrdered size={14} strokeWidth={2.2} />
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <div
                ref={editorRef}
                class="events-rich-editor"
                contentEditable
                onInput={(e) => {
                  const target = e.target as HTMLDivElement;
                  ensureListStyles(target);
                  setDraftBodyHtml(target.innerHTML);
                  if (composerError) setComposerError("");
                  refreshEditorFormats();
                }}
                onKeyUp={() => {
                  refreshEditorFormats();
                }}
                onMouseUp={() => {
                  refreshEditorFormats();
                }}
                onFocus={() => {
                  refreshEditorFormats();
                }}
                style={{
                  minHeight: "86px",
                  maxHeight: "136px",
                  overflowY: "auto",
                  border: "1px solid #d0d0d0",
                  borderRadius: "8px",
                  padding: "8px",
                  color: "#212121",
                  fontSize: "13px",
                  lineHeight: 1.35,
                  outline: "none",
                  backgroundColor: "#f5f5f5",
                  direction: "ltr",
                  unicodeBidi: "plaintext",
                }}
              />
              {!toPlainText(draftBodyHtml) ? (
                <div
                  style={{
                    position: "absolute",
                    left: "9px",
                    top: "8px",
                    color: "#9a9a9a",
                    fontSize: "13px",
                    pointerEvents: "none",
                  }}
                >
                  Write your note...
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              gap: "8px",
            }}
          >
            <div style={{ position: "relative" }}>
              <select
                value={draftType}
                onChange={(e) => {
                  setDraftType((e.target as HTMLSelectElement).value as EntryType);
                  if (composerError) setComposerError("");
                }}
                style={{
                  border: "1px solid #d0d0d0",
                  borderRadius: "8px",
                  height: "34px",
                  padding: "0 28px 0 8px",
                  backgroundColor: "#f5f5f5",
                  color: "#212121",
                  width: "100%",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  outline: "none",
                }}
              >
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                strokeWidth={2.1}
                style={{
                  position: "absolute",
                  right: "9px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#424242",
                  pointerEvents: "none",
                }}
              />
            </div>

            <input
              type="time"
              value={draftTime}
              onInput={(e) => {
                setDraftTime((e.target as HTMLInputElement).value);
                if (composerError) setComposerError("");
              }}
              style={{
                border: "1px solid #d0d0d0",
                borderRadius: "8px",
                height: "34px",
                padding: "0 8px",
                backgroundColor: "#f5f5f5",
                color: "#212121",
                width: "94px",
                outline: "none",
              }}
            />

            <button
              type="button"
              onClick={handleSaveEntry}
              class="hover:opacity-70 transition-opacity"
              style={{
                border: "1px solid #d0d0d0",
                borderRadius: "8px",
                width: "34px",
                height: "34px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f5f5f5",
                color: "#212121",
                cursor: "pointer",
              }}
            >
              <Save size={16} strokeWidth={2.4} />
            </button>

            <button
              type="button"
              onClick={closeComposer}
              class="hover:opacity-70 transition-opacity"
              style={{
                border: "1px solid #d0d0d0",
                borderRadius: "8px",
                width: "34px",
                height: "34px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ececec",
                color: "#424242",
                cursor: "pointer",
              }}
            >
              <X size={14} strokeWidth={2.3} />
            </button>
          </div>

          {composerError ? (
            <div style={{ color: "#b24b4b", fontSize: "11px", lineHeight: 1.35 }}>{composerError}</div>
          ) : null}
        </div>
      ) : null}

      {openedEntry ? (
        <div
          onClick={() => setOpenedEntryId(null)}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(42, 42, 42, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
            zIndex: 4,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "100%",
              border: "1px solid #d0d0d0",
              borderRadius: "16px",
              backgroundColor: "#f5f5f5",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "start",
                justifyContent: "space-between",
                gap: "10px",
                padding: "12px 12px 10px",
                borderBottom: "1px solid #e0e0e0",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "#212121",
                    fontSize: "15px",
                    fontWeight: 600,
                    lineHeight: 1.25,
                    wordBreak: "break-word",
                  }}
                >
                  {openedEntry.title}
                </div>
                <div style={{ color: "#757575", fontSize: "11px", marginTop: "4px", textTransform: "capitalize" }}>
                  {openedEntry.type}
                  {openedEntry.time ? ` • ${openedEntry.time}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenedEntryId(null)}
                class="hover:opacity-60 transition-opacity"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#424242",
                  cursor: "pointer",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>

            <div
              style={{
                padding: "12px",
                overflowY: "auto",
                color: "#212121",
                fontSize: "13px",
                lineHeight: 1.45,
                minHeight: "112px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {openedEntry.bodyHtml ? (
                <div class="events-rich-body" dangerouslySetInnerHTML={{ __html: openedEntry.bodyHtml }} />
              ) : (
                <div style={{ color: "#757575" }}>No note body for this entry.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (showComposer) {
            closeComposer();
            return;
          }
          openComposerForCreate();
        }}
        class="transition-opacity hover:opacity-85"
        style={{
          position: "absolute",
          right: "18px",
          bottom: "16px",
          border: "1px solid #2a2a2a",
          borderRadius: "999px",
          width: "52px",
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2a2a2a",
          color: "#f5f5f5",
          cursor: "pointer",
          zIndex: 2,
        }}
      >
        <Plus size={24} strokeWidth={2.2} />
      </button>
    </div>
  );
}
