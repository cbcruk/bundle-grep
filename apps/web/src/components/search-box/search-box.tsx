import { TextInput } from '@astryxdesign/core/TextInput'
import { parseQuery } from '@bundle-grep/core/query'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { WireError } from '../../api/api.types'
import { applySuggestion, suggest, wordAt } from '../../lib/complete'
import type { Suggestion } from '../../lib/complete.types'
import { QueryError } from '../query-error/query-error'
import './search-box.css'
import type { SearchBoxProps } from './search-box.types'

/**
 * The query input, with qualifier completion.
 *
 * A query that does not parse is not searched; the box shows what is wrong
 * with it instead. `Tab` takes the highlighted suggestion, or the first;
 * `Enter` takes one only once the arrow keys or the mouse have picked it, and
 * searches otherwise, so a word such as `use` can be searched as typed.
 */
export function SearchBox({ query, sources, onSearch, inputRef }: SearchBoxProps): React.JSX.Element {
  const [value, setValue] = useState(query)
  const [caret, setCaret] = useState(query.length)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState(false)
  const [error, setError] = useState<{ query: string; error: WireError }>()
  const pendingCaret = useRef<number | undefined>(undefined)

  useEffect(() => {
    setValue(query)
    setCaret(query.length)
    setError(undefined)
  }, [query])

  useEffect(() => {
    if (inputRef.current) inputRef.current.spellcheck = false
  }, [inputRef])

  useEffect(() => {
    if (pendingCaret.current === undefined) return
    inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = undefined
  })

  const word = wordAt(value, caret)
  const suggestions = word ? suggest(word, sources) : []
  const showing = open && suggestions.length > 0

  const accept = (suggestion: Suggestion): void => {
    if (!word) return
    const next = applySuggestion(value, word, suggestion)
    setValue(next.query)
    setCaret(next.caret)
    setActive(0)
    setPicked(false)
    pendingCaret.current = next.caret
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setOpen(false)
    const parsed = parseQuery(value)
    if (parsed.isErr() && value.trim() !== '') {
      setError({ query: value, error: { _tag: parsed.error._tag, message: parsed.error.message, span: parsed.error.span } })
      return
    }
    setError(undefined)
    onSearch(value.trim())
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      if (showing) setOpen(false)
      else inputRef.current?.blur()
      return
    }
    if (!showing || event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive(index => (picked ? (index + step + suggestions.length) % suggestions.length : step > 0 ? 0 : suggestions.length - 1))
      setPicked(true)
    } else if (event.key === 'Tab' || (event.key === 'Enter' && picked)) {
      event.preventDefault()
      const chosen = suggestions[Math.min(active, suggestions.length - 1)]
      if (chosen) accept(chosen)
    }
  }

  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <TextInput
        ref={inputRef}
        label="Search query"
        isLabelHidden
        value={value}
        placeholder="Search code, e.g. useState language:typescript"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls="search-suggestions"
        autoComplete="off"
        hasAutoFocus
        width="100%"
        onChange={(next, event) => {
          setValue(next)
          setCaret(event.target.selectionStart ?? next.length)
          setActive(0)
          setPicked(false)
          setOpen(true)
        }}
        onSelect={() => setCaret(inputRef.current?.selectionStart ?? 0)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
      {showing && (
        <ul className="search-box-popup search-box-suggestions" id="search-suggestions" role="listbox" aria-label="Suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.insert}
              role="option"
              aria-selected={picked && index === active}
              onMouseDown={event => {
                event.preventDefault()
                accept(suggestion)
              }}
              onMouseEnter={() => {
                setActive(index)
                setPicked(true)
              }}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="search-box-popup">
          <QueryError query={error.query} error={error.error} isFloating />
        </div>
      )}
    </form>
  )
}
