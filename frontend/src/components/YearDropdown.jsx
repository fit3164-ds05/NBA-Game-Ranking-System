export default function YearDropdown({
  years = [],
  value = "",
  onChange,
  disabled = false,
  loading = false,
  label = "Season",
}) {
  return (
    <div className="w-full max-w-xs">
      <label className="block text-sm mb-1">{label}</label>
      <select
        className="w-full border rounded-lg p-2 disabled:bg-gray-100"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled || loading || years.length === 0}
      >
        <option value="" disabled>
          {loading ? "Loading seasons..." : "Select a season"}
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}