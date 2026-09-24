/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { FaChevronDown, FaSearch, FaTimes } from 'react-icons/fa'
import { emptyFilterValues, hasActiveFilters } from '../utils/searchFilters'
import './SearchFilters.css'

// Reusable grid of search/filter boxes. Pages describe their filters as a
// `fields` config and own the `values` state, so the same component works for
// any list (registrants, athletes, events...).
//
// field: {
//   key, label,
//   type: 'text' | 'tel' | 'email' | 'select' | 'date',   (default 'text')
//   placeholder?, icon? (react-icon component),
//   options?: [{ value, label }]  — for 'select'; value '' means "any"
// }
//
// Values are always strings, with '' meaning "not filtering on this" — see
// utils/searchFilters for the empty/active helpers.
//
// quickField: optional key of a text field that stays visible as a plain
// search bar under the collapsed mobile toggle (e.g. 'name'), so the most
// common search doesn't need the panel opened first.
export default function SearchFilters({
  fields,
  values,
  onChange,
  title = 'Find someone',
  idPrefix = 'search-filter',
  quickField,
}) {
  const active = hasActiveFilters(values)
  const activeCount = Object.values(values).filter(
    (v) => String(v ?? '').trim() !== ''
  ).length
  // Mobile only: the boxes stay tucked behind the toggle button until tapped.
  // On desktop the CSS ignores this and always shows the grid.
  const [open, setOpen] = useState(false)
  const gridId = `${idPrefix}-grid`
  const quick = quickField && fields.find((f) => f.key === quickField)
  const quickValue = quick ? (values[quick.key] ?? '') : ''

  function setField(key, value) {
    onChange({ ...values, [key]: value })
  }

  return (
    <section
      className={`search-filters glass-card${open ? ' is-open' : ''}`}
      aria-label={title}
    >
      <div className="search-filters-head">
        <h2>
          <FaSearch aria-hidden="true" /> {title}
        </h2>
        <button
          type="button"
          className="search-filters-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={gridId}
        >
          <span className="search-filters-toggle-icon" aria-hidden="true">
            <FaSearch />
          </span>
          <span className="search-filters-toggle-label">{title}</span>
          {activeCount > 0 && (
            <span className="search-filters-count">{activeCount}</span>
          )}
          <FaChevronDown
            className="search-filters-chevron"
            aria-hidden="true"
          />
        </button>
        {active && (
          <button
            type="button"
            className="search-filters-clear"
            onClick={() => onChange(emptyFilterValues(fields))}
          >
            <FaTimes aria-hidden="true" /> Clear all
          </button>
        )}
      </div>

      {quick && !open && (
        <div className="search-filters-quick">
          <FaSearch className="search-filter-icon" aria-hidden="true" />
          <input
            type="search"
            value={quickValue}
            placeholder={`Search by ${quick.label.toLowerCase()}`}
            aria-label={`Search by ${quick.label.toLowerCase()}`}
            onChange={(e) => setField(quick.key, e.target.value)}
          />
          {String(quickValue).trim() !== '' && (
            <button
              type="button"
              className="search-filter-reset"
              onClick={() => setField(quick.key, '')}
              aria-label={`Clear ${quick.label}`}
            >
              <FaTimes />
            </button>
          )}
        </div>
      )}

      <div className="search-filters-grid" id={gridId}>
        {fields.map((field) => {
          const id = `${idPrefix}-${field.key}`
          const value = values[field.key] ?? ''
          const Icon = field.icon
          const filled = String(value).trim() !== ''
          return (
            <div
              key={field.key}
              className={`search-filter-box${filled ? ' is-filled' : ''}`}
            >
              <label htmlFor={id}>{field.label}</label>
              <div className="search-filter-control">
                {Icon && (
                  <Icon className="search-filter-icon" aria-hidden="true" />
                )}
                {field.type === 'select' ? (
                  <select
                    id={id}
                    value={value}
                    onChange={(e) => setField(field.key, e.target.value)}
                  >
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={field.type || 'text'}
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                )}
                {filled && field.type !== 'select' && (
                  <button
                    type="button"
                    className="search-filter-reset"
                    onClick={() => setField(field.key, '')}
                    aria-label={`Clear ${field.label}`}
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
