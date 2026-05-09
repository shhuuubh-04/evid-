import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ArrowLeft, Heart, Plus, Save, Trash2, X } from "lucide-preact";

export type AnniversaryKind = "birthday" | "relationship" | "milestone" | "custom";

export interface AnniversaryRecord {
  id: string;
  title: string;
  kind: AnniversaryKind;
  month: number;
  day: number;
  startYear?: number;
  notes?: string;
}

interface AnniversaryManagerProps {
  anniversaries: AnniversaryRecord[];
  onClose: () => void;
  onSave: (anniversaries: AnniversaryRecord[]) => void;
}

const kindOptions: AnniversaryKind[] = ["birthday", "relationship", "milestone", "custom"];
type SheetMode = "list" | "create";

const kindLabel = (kind: AnniversaryKind) => kind.charAt(0).toUpperCase() + kind.slice(1);

const truncateText = (value: string, maxChars = 84) => {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
};

export function AnniversaryManager({ anniversaries, onClose, onSave }: AnniversaryManagerProps) {
  const [mode, setMode] = useState<SheetMode>("list");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AnniversaryKind>("birthday");
  const [dateValue, setDateValue] = useState("");
  const [startYear, setStartYear] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const sorted = useMemo(
    () => [...anniversaries].sort((a, b) => a.month - b.month || a.day - b.day || a.title.localeCompare(b.title)),
    [anniversaries]
  );

  const resetForm = () => {
    setTitle("");
    setKind("birthday");
    setDateValue("");
    setStartYear("");
    setNotes("");
    setFormError("");
  };

  const openCreateMode = () => {
    resetForm();
    setMode("create");
  };

  const returnToListMode = () => {
    setMode("list");
    setFormError("");
  };

  const handleAdd = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Title is required.");
      return;
    }

    if (!dateValue) {
      setFormError("Date is required.");
      return;
    }

    const parts = dateValue.split("-");
    if (parts.length !== 3) {
      setFormError("Invalid date value.");
      return;
    }

    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      setFormError("Invalid day or month.");
      return;
    }

    const parsedYear = Number(startYear);
    const next: AnniversaryRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmedTitle,
      kind,
      month,
      day,
      startYear:
        startYear.trim().length > 0 && Number.isFinite(parsedYear) && parsedYear > 1800 && parsedYear < 3000
          ? parsedYear
          : undefined,
      notes: notes.trim() || undefined,
    };

    onSave([...anniversaries, next]);
    resetForm();
    setMode("list");
  };

  const handleDelete = (id: string) => {
    onSave(anniversaries.filter((anniversary) => anniversary.id !== id));
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const requestClose = () => {
    if (isClosing) return;

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 210);
  };

  return (
    <div
      class={`anniversary-sheet-backdrop${isClosing ? " is-closing" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(42, 42, 42, 0.35)",
        zIndex: 30,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 10px 0",
      }}
      onClick={requestClose}
    >
      <div
        class={`anniversary-sheet-panel${isClosing ? " is-closing" : ""}`}
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "88vh",
          border: "1px solid #d0d0d0",
          borderRadius: "20px 20px 0 0",
          backgroundColor: "#f5f5f5",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -8px 28px rgba(0, 0, 0, 0.14)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            paddingTop: "8px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "46px",
              height: "4px",
              borderRadius: "999px",
              backgroundColor: "#c9c9c9",
            }}
          />
        </div>

        {mode === "list" ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderBottom: "1px solid #e0e0e0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#212121" }}>
                <Heart size={16} strokeWidth={2.2} />
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>Anniversaries</div>
                  <div style={{ fontSize: "11px", color: "#757575", marginTop: "2px" }}>
                    {anniversaries.length} saved
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={openCreateMode}
                  class="hover:opacity-80 transition-opacity"
                  style={{
                    border: "1px solid #d0d0d0",
                    borderRadius: "999px",
                    width: "30px",
                    height: "30px",
                    backgroundColor: "#f5f5f5",
                    color: "#212121",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <Plus size={16} strokeWidth={2.4} />
                </button>

                <button
                  type="button"
                  onClick={requestClose}
                  class="hover:opacity-70 transition-opacity"
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
                  }}
                >
                  <X size={16} strokeWidth={2.3} />
                </button>
              </div>
            </div>

            <div
              style={{
                padding: "12px 14px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                minHeight: "220px",
                maxHeight: "70vh",
              }}
            >
              {sorted.length === 0 ? (
                <div
                  style={{
                    color: "#757575",
                    fontSize: "12px",
                    textAlign: "center",
                    marginTop: "8px",
                  }}
                >
                  No anniversaries yet. Tap + to add one.
                </div>
              ) : (
                sorted.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #d0d0d0",
                      borderRadius: "12px",
                      padding: "9px 10px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "8px",
                      alignItems: "center",
                      backgroundColor: "#f5f5f5",
                    }}
                  >
                    <div>
                      <div style={{ color: "#212121", fontSize: "13px", fontWeight: 600 }}>{item.title}</div>
                      <div style={{ color: "#757575", fontSize: "11px", marginTop: "2px" }}>
                        {kindLabel(item.kind)} • {String(item.day).padStart(2, "0")}/{String(item.month).padStart(2, "0")}
                        {item.startYear ? ` • since ${item.startYear}` : ""}
                      </div>
                      {item.notes ? (
                        <div style={{ color: "#6a6a6a", fontSize: "11px", marginTop: "4px" }}>
                          {truncateText(item.notes, 90)}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      class="hover:opacity-70 transition-opacity"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#757575",
                        width: "22px",
                        height: "22px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <Trash2 size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderBottom: "1px solid #e0e0e0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  onClick={returnToListMode}
                  class="hover:opacity-70 transition-opacity"
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
                  }}
                >
                  <ArrowLeft size={16} strokeWidth={2.3} />
                </button>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#212121" }}>Add Anniversary</div>
                  <div style={{ fontSize: "11px", color: "#757575", marginTop: "2px" }}>
                    Birthdays, relationships, milestones
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={requestClose}
                class="hover:opacity-70 transition-opacity"
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
                }}
              >
                <X size={16} strokeWidth={2.3} />
              </button>
            </div>

            <div
              style={{
                padding: "12px 14px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                minHeight: "220px",
                maxHeight: "70vh",
              }}
            >
              <input
                value={title}
                onInput={(event) => {
                  setTitle((event.target as HTMLInputElement).value);
                  if (formError) setFormError("");
                }}
                placeholder="Person/occasion title"
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind((event.target as HTMLSelectElement).value as AnniversaryKind);
                    if (formError) setFormError("");
                  }}
                  style={{
                    border: "1px solid #d0d0d0",
                    borderRadius: "8px",
                    height: "34px",
                    padding: "0 8px",
                    backgroundColor: "#f5f5f5",
                    color: "#212121",
                    minWidth: 0,
                  }}
                >
                  {kindOptions.map((option) => (
                    <option key={option} value={option}>
                      {kindLabel(option)}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={dateValue}
                  onInput={(event) => {
                    setDateValue((event.target as HTMLInputElement).value);
                    if (formError) setFormError("");
                  }}
                  style={{
                    border: "1px solid #d0d0d0",
                    borderRadius: "8px",
                    height: "34px",
                    padding: "0 8px",
                    backgroundColor: "#f5f5f5",
                    color: "#212121",
                    minWidth: 0,
                    width: "100%",
                  }}
                />

                <input
                  value={startYear}
                  onInput={(event) => {
                    setStartYear((event.target as HTMLInputElement).value);
                    if (formError) setFormError("");
                  }}
                  placeholder="Start year"
                  style={{
                    border: "1px solid #d0d0d0",
                    borderRadius: "8px",
                    height: "34px",
                    padding: "0 8px",
                    backgroundColor: "#f5f5f5",
                    color: "#212121",
                    outline: "none",
                    minWidth: 0,
                  }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={returnToListMode}
                    class="hover:opacity-80 transition-opacity"
                    style={{
                      border: "1px solid #d0d0d0",
                      borderRadius: "8px",
                      height: "34px",
                      backgroundColor: "#ececec",
                      color: "#424242",
                      cursor: "pointer",
                      padding: "0 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    class="hover:opacity-80 transition-opacity"
                    style={{
                      border: "1px solid #d0d0d0",
                      borderRadius: "8px",
                      height: "34px",
                      backgroundColor: "#2a2a2a",
                      color: "#f5f5f5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                      cursor: "pointer",
                      padding: "0 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    <Save size={14} strokeWidth={2.2} />
                    Save
                  </button>
                </div>
              </div>

              <textarea
                value={notes}
                onInput={(event) => {
                  setNotes((event.target as HTMLTextAreaElement).value);
                  if (formError) setFormError("");
                }}
                placeholder="Optional notes"
                rows={3}
                style={{
                  border: "1px solid #d0d0d0",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  resize: "vertical",
                  minHeight: "70px",
                  backgroundColor: "#f5f5f5",
                  color: "#212121",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />

              {formError ? <div style={{ color: "#b24b4b", fontSize: "11px" }}>{formError}</div> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
