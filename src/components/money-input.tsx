"use client";

import type { Money } from "@/lib/schema";
import { Select, TextInput } from "./ui";

// Amount + currency + period. Clearing the amount sets the whole value to null.
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: Money | null;
  onChange: (v: Money | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_5.5rem_7rem] gap-2">
      <TextInput
        id={id}
        type="number"
        min={0}
        placeholder={placeholder}
        value={value?.amount ?? ""}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : { currency: "INR", period: "year", ...value, amount: Number(e.target.value) },
          )
        }
      />
      <TextInput
        aria-label="Currency"
        value={value?.currency ?? "INR"}
        disabled={!value}
        onChange={(e) => value && onChange({ ...value, currency: e.target.value.toUpperCase() })}
      />
      <Select
        aria-label="Period"
        value={value?.period ?? "year"}
        disabled={!value}
        onChange={(e) => value && onChange({ ...value, period: e.target.value as Money["period"] })}
      >
        <option value="year">per year</option>
        <option value="month">per month</option>
      </Select>
    </div>
  );
}
