"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type GuarantorRow = { id: string; full_name: string; subtitle: string };

/**
 * Searchable dropdown: type to filter employees in region, click to select.
 */
export function GuarantorCombobox({
  employees,
  loading,
  valueId,
  onChangeId,
}: {
  employees: GuarantorRow[];
  loading: boolean;
  valueId: string;
  onChangeId: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? employees
      : employees.filter(
          (e) =>
            e.full_name.toLowerCase().includes(q) ||
            e.subtitle.toLowerCase().includes(q) ||
            `${e.full_name} ${e.subtitle}`.toLowerCase().includes(q)
        );
    return list.slice(0, 80);
  }, [employees, query]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function select(g: GuarantorRow) {
    onChangeId(g.id);
    setQuery(`${g.full_name}${g.subtitle ? ` — ${g.subtitle}` : ""}`);
    setOpen(false);
  }

  const selected = valueId ? employees.find((e) => e.id === valueId) : undefined;

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor="guarantor-search" className="sr-only">
        Guarantor (search and select)
      </label>
      <input
        id="guarantor-search"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="guarantor-listbox"
        aria-activedescendant={valueId ? `guarantor-opt-${valueId}` : undefined}
        autoComplete="off"
        disabled={loading || employees.length === 0}
        placeholder={loading ? "Loading guarantors…" : "Type name or role to search…"}
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          if (valueId) {
            const label = selected
              ? `${selected.full_name}${selected.subtitle ? ` — ${selected.subtitle}` : ""}`
              : "";
            if (v !== label) onChangeId("");
          }
        }}
        onFocus={() => {
          if (!loading && employees.length > 0) setOpen(true);
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none ring-violet-400/30 placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70"
      />
      {open && !loading && filtered.length > 0 ? (
        <ul
          id="guarantor-listbox"
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((g) => (
            <li key={g.id} role="option" id={`guarantor-opt-${g.id}`} aria-selected={valueId === g.id}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(g)}
              >
                <span className="font-medium">{g.full_name}</span>
                {g.subtitle ? <span className="block text-xs text-zinc-500">{g.subtitle}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && !loading && query.trim() && filtered.length === 0 ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg">
          No match in your region.
        </div>
      ) : null}
    </div>
  );
}
