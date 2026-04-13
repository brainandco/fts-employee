"use client";

import { useState, useRef, useEffect } from "react";

export type SearchableOption = { id: string; label: string; [key: string]: unknown };

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search or select…",
  required,
  className = "",
  listClassName = "max-h-48",
  getOptionLabel = (o: SearchableOption) => o.label,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string, option?: SearchableOption) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  listClassName?: string;
  getOptionLabel?: (o: SearchableOption) => string;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = inputVal.trim().toLowerCase();
  const filtered =
    search.length === 0
      ? options
      : options.filter((o) => getOptionLabel(o).toLowerCase().includes(search));

  useEffect(() => {
    setInputVal(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(option: SearchableOption) {
    const label = getOptionLabel(option);
    onChange(label, option);
    setInputVal(label);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputVal}
        onChange={(e) => {
          setInputVal(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        required={required}
        className={className || "w-full rounded border border-zinc-300 px-3 py-2 text-sm"}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <ul
          className={`absolute z-10 mt-1 w-full overflow-auto rounded border border-zinc-200 bg-white py-1 shadow-lg ${listClassName}`}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">No matches</li>
          ) : (
            filtered.map((option) => {
              const label = getOptionLabel(option);
              return (
                <li
                  key={option.id}
                  role="option"
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-zinc-100"
                  onClick={() => handleSelect(option)}
                >
                  {label}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
