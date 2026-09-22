import { useEffect, useMemo, useRef, useState } from "react";

/** Order / cycle / trade / command status as a coloured pill. */
export function StatusPill({ value }) {
  if (!value) return null;
  const v = String(value).toUpperCase();
  const tone = ["FILLED", "COMPLETED", "SENT"].includes(v) ? "good"
    : ["REJECTED", "FAILED"].includes(v) ? "bad"
      : ["CANCELED", "PARTIAL", "SKIPPED", "PENDING"].includes(v) ? "warn" : "neutral";
  return <span className={`pill ${tone}`}>{v.replace("_", " ")}</span>;
}

/** Previous / next controls for a server-paged table. */
export function Pager({ page, size, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
      <button className="secondary xs" disabled={page <= 0} onClick={() => onPage(page - 1)}>‹ newer</button>
      <span className="muted" style={{ fontSize: 13 }}>
        {total === 0 ? "nothing yet" : `${page * size + 1}–${Math.min(total, (page + 1) * size)} of ${total.toLocaleString("en-US")}`} · page {page + 1} of {pages}
      </span>
      <button className="secondary xs" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>older ›</button>
    </div>
  );
}

const CHEVRON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const SEARCH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

const norm = (s) => (s || "").toLowerCase();

/**
 * A closed-by-default multi-select: the field shows what's picked as chips (or a placeholder), and opens a
 * searchable popover to change it. Rows group under their `category` when options carry one, each group with
 * its own select-all — the one control this app uses everywhere a list of strategies or symbols is picked.
 */
export function ComboPicker({ options, value, onChange, placeholder = "Nothing picked", emptyHint, maxChips = 6 }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const selected = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  useEffect(() => {
    if (!open) { setQ(""); return undefined; }
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open]);

  const shown = useMemo(() => {
    const needle = norm(q.trim());
    return options.filter((o) => !needle || norm(o.label).includes(needle) || norm(o.category).includes(needle));
  }, [options, q]);

  // Preserve first-seen category order; anything uncategorised goes in one trailing "Other" bucket.
  const groups = useMemo(() => {
    const hasCategories = options.some((o) => o.category);
    if (!hasCategories) return [{ name: null, items: shown }];
    const order = [];
    const byCat = new Map();
    for (const o of shown) {
      const key = o.category || "Other";
      if (!byCat.has(key)) { byCat.set(key, []); order.push(key); }
      byCat.get(key).push(o);
    }
    return order.map((name) => ({ name, items: byCat.get(name) }));
  }, [shown]);

  const toggle = (id) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const setGroup = (items, on) => {
    const ids = items.map((o) => o.id);
    onChange(on ? Array.from(new Set([...value, ...ids])) : value.filter((x) => !ids.includes(x)));
  };
  const clear = (e) => { e.stopPropagation(); onChange([]); };
  const selectAllShown = () => onChange(Array.from(new Set([...value, ...shown.map((o) => o.id)])));

  const chips = value.map((id) => byId.get(id)).filter(Boolean);
  const overflow = chips.length - maxChips;

  return (
    <div className="combo" ref={rootRef}>
      <div className={`combo-trigger${open ? " open" : ""}`} tabIndex={0} role="button" aria-expanded={open}
           onClick={() => setOpen((o) => !o)}
           onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((o) => !o))}>
        <div className="combo-chips">
          {chips.length === 0 && <span className="combo-placeholder">{placeholder}</span>}
          {chips.slice(0, maxChips).map((o) => (
            <span key={o.id} className="tag combo-chip">
              {o.label}
              <span className="combo-chip-x" onClick={(e) => { e.stopPropagation(); toggle(o.id); }} title={`remove ${o.label}`}>✕</span>
            </span>
          ))}
          {overflow > 0 && <span className="tag combo-chip combo-chip-more">+{overflow} more</span>}
        </div>
        <div className="combo-trigger-right">
          {chips.length > 0 && <span className="row-click combo-clear" onClick={clear}>clear</span>}
          <span className="combo-caret">{CHEVRON}</span>
        </div>
      </div>
      {emptyHint && chips.length === 0 && !open && <div className="muted combo-hint">{emptyHint}</div>}

      {open && (
        <div className="combo-popover">
          <div className="combo-search">
            {SEARCH_ICON}
            <input ref={searchRef} placeholder="Search by name or category…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="combo-toolbar">
            <span className="muted">{value.length} selected</span>
            <span className="combo-toolbar-actions">
              <span className="row-click" onClick={selectAllShown}>select {shown.length} shown</span>
              {value.length > 0 && <span className="row-click" onClick={() => onChange([])}>clear all</span>}
            </span>
          </div>
          <div className="combo-list">
            {groups.map((g) => {
              const allOn = g.items.length > 0 && g.items.every((o) => selected.has(o.id));
              const someOn = !allOn && g.items.some((o) => selected.has(o.id));
              return (
                <div key={g.name || "_"} className="combo-group">
                  {g.name && (
                    <div className="combo-group-head">
                      <label className="combo-row-label">
                        <input type="checkbox" checked={allOn} ref={(el) => el && (el.indeterminate = someOn)}
                               onChange={(e) => setGroup(g.items, e.target.checked)} />
                        <span>{g.name}</span>
                      </label>
                      <span className="muted">{g.items.length}</span>
                    </div>
                  )}
                  {g.items.map((o) => (
                    <label key={o.id} className={`combo-row${o.disabled ? " combo-row-disabled" : ""}`} title={o.title}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                      <span className="combo-row-main">{o.label}</span>
                      {o.disabled && <span className="muted combo-row-meta">disabled</span>}
                    </label>
                  ))}
                </div>
              );
            })}
            {shown.length === 0 && <div className="muted" style={{ fontSize: 12, padding: "10px 12px" }}>no match</div>}
          </div>
        </div>
      )}
    </div>
  );
}
