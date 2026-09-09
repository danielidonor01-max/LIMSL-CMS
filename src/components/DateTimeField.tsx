// src/components/DateTimeField.tsx
// The branded replacement for <input type="datetime-local">.
//
// A date and a time side by side rather than one control, because that is what
// the value is, and because splitting them means both halves keep the typing
// and keyboard behaviour the single native control never offered consistently.
// The wire format is unchanged: YYYY-MM-DDTHH:MM, exactly what the native input
// produced, so nothing downstream has to know.
"use client";

import DateField from "./DateField";
import TimeField from "./TimeField";

function split(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [d, t] = value.split("T");
  return { date: d ?? "", time: (t ?? "").slice(0, 5) };
}

export default function DateTimeField({
  value,
  onChange,
  min,
  max,
  disabled,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string | null;
  max?: string | null;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { date, time } = split(value);

  // A time with no date is not a moment, so the pair only emits once a date
  // exists. The time defaults to the start of the working day rather than
  // midnight, which is almost never what someone meant.
  const emit = (nextDate: string, nextTime: string) => {
    if (!nextDate) return onChange("");
    onChange(`${nextDate}T${nextTime || "08:00"}`);
  };

  return (
    <div className={`grid grid-cols-[1fr_auto] gap-2 ${className}`}>
      <DateField
        value={date}
        onChange={(d) => emit(d, time)}
        min={min ? min.split("T")[0] : undefined}
        max={max ? max.split("T")[0] : undefined}
        disabled={disabled}
        ariaLabel={ariaLabel ? `${ariaLabel}, date` : "Date"}
      />
      <TimeField
        value={time}
        onChange={(t) => emit(date, t)}
        disabled={disabled}
        className="w-36"
        ariaLabel={ariaLabel ? `${ariaLabel}, time` : "Time"}
      />
    </div>
  );
}
