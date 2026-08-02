'use client';

/**
 * Labelled form controls.
 *
 * Every one wraps its input in its own `<label>`, so the accessible name comes
 * from the markup rather than from a `title` a screen reader may not announce -
 * and so a harness can find a field by the text a person reads.
 */

export function LabeledInput({
  label,
  onChange,
  placeholder,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** See `ActionButton`: labels are not unique across panels. */
  testId?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <input
        className="min-h-10 rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition placeholder:text-amber-100/30 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

export function NumberInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <input
        className="min-h-10 w-full rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25 sm:w-24"
        onChange={(event) =>
          onChange(Number.parseInt(event.target.value, 10) || 0)
        }
        type="number"
        value={value}
      />
    </label>
  );
}

export function SelectField({
  label,
  onChange,
  options,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
  /** See `ActionButton`: labels are not unique across panels. */
  testId?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <select
        className="min-h-10 rounded-xl border border-amber-300/20 bg-[#1d140f] px-3 py-2 text-amber-50 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-amber-100/85">
      <input
        checked={checked}
        className="accent-amber-500"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

export function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <textarea
        className="min-h-24 rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition placeholder:text-amber-100/30 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
