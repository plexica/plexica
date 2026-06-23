// color-picker.tsx
// Simple color picker using native <input type="color"> + hex text input.
// No third-party color library required.

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  id?: string;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function ColorPicker({ value, onChange, label, id }: ColorPickerProps): JSX.Element {
  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value;
    // Only propagate if it's a valid full hex color
    if (HEX_RE.test(v)) onChange(v);
  }

  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && (
        <label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-neutral-300 p-0.5"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={handleTextChange}
          maxLength={7}
          placeholder="#000000"
          className="h-9 w-28 rounded-md border border-neutral-300 px-3 text-sm font-mono text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label={`${label ?? 'Color'} hex value`}
        />
      </div>
    </div>
  );
}
