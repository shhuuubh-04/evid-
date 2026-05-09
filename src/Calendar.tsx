import { useMemo } from "preact/hooks";
import { ChevronLeft, ChevronRight } from "lucide-preact";

interface CalendarProps {
  isFocused: boolean;
  currentDate: Date;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onDateDoubleClick?: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

interface CalendarDay {
  key: string;
  date: Date;
  label: number;
  inCurrentMonth: boolean;
}

const dayLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const createDay = (date: Date, inCurrentMonth: boolean): CalendarDay => ({
  key: `${date.getTime()}-${inCurrentMonth ? "cur" : "adj"}`,
  date,
  label: date.getDate(),
  inCurrentMonth,
});

const buildCalendarDays = (referenceDate: Date) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const totalSlots = 42; // fixed six-row grid for focused mode

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const currentMonthDays = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();

  const days: CalendarDay[] = [];

  for (let i = firstDayIndex; i > 0; i--) {
    const day = previousMonthDays - i + 1;
    days.push(createDay(new Date(year, month - 1, day), false));
  }

  for (let day = 1; day <= currentMonthDays; day++) {
    days.push(createDay(new Date(year, month, day), true));
  }

  while (days.length < totalSlots) {
    const nextDay = days.length - (firstDayIndex + currentMonthDays) + 1;
    days.push(createDay(new Date(year, month + 1, nextDay), false));
  }

  return days;
};

export function Calendar({
  isFocused,
  currentDate,
  selectedDate,
  onDateSelect,
  onDateDoubleClick,
  onPrevMonth,
  onNextMonth,
}: CalendarProps) {
  const days = useMemo(() => buildCalendarDays(currentDate), [currentDate]);
  const visibleDays = useMemo(
    () => (isFocused ? days : days.slice(0, 7)),
    [days, isFocused]
  );
  const today = new Date();

  const monthYear = useMemo(
    () =>
      currentDate.toLocaleString("default", {
        month: "long",
        year: "numeric",
      }),
    [currentDate]
  );

  const navButtonSize = isFocused ? 32 : 24;
  const contentHeight = isFocused ? 484 : 146;

  return (
    <div
      style={{
        backgroundColor: "#f5f5f5",
        padding: isFocused ? "16px 22px 10px" : "10px 22px 8px",
        display: "flex",
        flexDirection: "column",
        height: `${contentHeight}px`,
        boxSizing: "border-box",
        overflow: "hidden",
        transition: "padding 160ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: isFocused ? "16px" : "11px",
          transition: "margin-bottom 160ms ease",
        }}
      >
        <span
          style={{
            color: "#212121",
            fontSize: isFocused ? "17px" : "14px",
            fontWeight: 600,
            lineHeight: 1,
            transition: "font-size 160ms ease",
          }}
        >
          {monthYear}
        </span>
        <div style={{ display: "flex", gap: "4px" }}>
          {[{ icon: <ChevronLeft size={12} strokeWidth={2.5} />, handler: onPrevMonth }, { icon: <ChevronRight size={12} strokeWidth={2.5} />, handler: onNextMonth }].map(
            ({ icon, handler }, index) => (
              <button
                key={index}
                onClick={handler}
                style={{
                  width: `${navButtonSize}px`,
                  height: `${navButtonSize}px`,
                  borderRadius: "999px",
                  border: "1px solid #d0d0d0",
                  backgroundColor: "#f5f5f5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "width 160ms ease, height 160ms ease",
                }}
              >
                {icon}
              </button>
            )
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          columnGap: isFocused ? "12px" : "8px",
          marginBottom: isFocused ? "10px" : "7px",
          transition: "column-gap 160ms ease, margin-bottom 160ms ease",
        }}
      >
        {dayLabels.map((label) => (
          <div
            key={label}
            style={{
              textAlign: "center",
              color: "#757575",
              fontSize: isFocused ? "12px" : "10px",
              letterSpacing: "0.04em",
              fontWeight: 600,
              lineHeight: 1,
              transition: "font-size 160ms ease",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: `repeat(${isFocused ? 6 : 1}, minmax(0, 1fr))`,
          columnGap: isFocused ? "12px" : "8px",
          rowGap: isFocused ? "10px" : "0px",
        }}
      >
        {visibleDays.map((day) => {
          const selected = isSameDay(day.date, selectedDate);
          const todayMatch = isSameDay(day.date, today);

          return (
            <button
              key={day.key}
              onClick={() => onDateSelect(day.date)}
              onDblClick={() => {
                if (onDateDoubleClick) {
                  onDateDoubleClick(day.date);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                borderRadius: isFocused ? "8px" : "6px",
                fontSize: isFocused ? "15px" : "13px",
                fontWeight: 600,
                backgroundColor: selected ? "#424242" : "transparent",
                color: selected
                  ? "#f5f5f5"
                  : day.inCurrentMonth
                  ? "#212121"
                  : "#9e9e9e",
                border: todayMatch ? "1px solid #757575" : "1px solid transparent",
                cursor: "pointer",
                transition: "background-color 0.2s ease, color 0.2s ease",
                padding: 0,
              }}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          width: isFocused ? "48px" : "38px",
          height: "4px",
          borderRadius: "999px",
          backgroundColor: "#d0d0d0",
          margin: isFocused ? "8px auto 0" : "6px auto 0",
          transition: "width 160ms ease, margin 160ms ease",
        }}
      />
    </div>
  );
}
