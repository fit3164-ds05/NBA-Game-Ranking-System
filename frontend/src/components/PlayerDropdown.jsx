import { useEffect, useRef, useState } from "react";
import { searchPlayers } from "../lib/api"; // your axios helper

export default function PlayerDropdown({
  season = "2024-25",
  onSelect,              
  placeholder = "Search player...",
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchPlayers(query, season);
        setItems(res);
        setOpen(true);
        setHighlight(res.length ? 0 : -1);
      } catch (e) {
        setItems([]);
        setOpen(true);
        setHighlight(-1);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, season]);

  // Keyboard controls
  function onKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (highlight >= 0 && items[highlight]) {
        e.preventDefault();
        choose(items[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function choose(player) {
    setQuery(player.name);
    setOpen(false);
    onSelect?.(player);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <input
        className="w-full border rounded-lg p-2 outline-none focus:ring focus:ring-blue-200"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="player-typeahead-list"
        role="combobox"
      />

      {open && (
        <div
          id="player-typeahead-list"
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-72 overflow-auto"
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
          )}

          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No results</div>
          )}

          {!loading &&
            items.map((p, i) => (
              <button
                key={p.playerId}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()} // keep focus on input
                onClick={() => choose(p)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  i === highlight ? "bg-blue-50" : "bg-white"
                } hover:bg-blue-50`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-gray-500 text-xs">
                  {p.team || "-"}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}