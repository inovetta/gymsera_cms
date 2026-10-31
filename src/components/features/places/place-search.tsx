'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { describeRequestError } from '@/lib/api/request-errors'
import { newPlacesSession, placesApi, PlaceDetails, PlaceKind, PlaceSuggestion } from '@/lib/api/places'

export const PLACES_DEBOUNCE_MS = 300
const MIN_CHARS = 2

interface PlaceSearchProps {
  id?: string
  label: string
  kind: PlaceKind
  /** The picked city: an area search needs it; an address search is biased to it. */
  cityId?: number
  value: string
  placeholder?: string
  disabled?: boolean
  onPick: (place: PlaceDetails) => void
  /** Typing changes the text the form keeps (an address the host types by hand stays valid). */
  onTextChange?: (text: string) => void
  /** Shown under the list when the typed text has no Google match (areas: "Use … as the area"). */
  renderNoMatch?: (typed: string, close: () => void) => React.ReactNode
}

/**
 * A city, area or address search on GET /places/autocomplete, then GET /places/details for the pick
 * (mobile places_search_field.dart). Debounced, at least 2 characters, one session token per search.
 */
export function PlaceSearch({ id, label, kind, cityId, value, placeholder, disabled, onPick, onTextChange, renderNoMatch }: PlaceSearchProps) {
  const autoId = useId()
  const inputId = id ?? `place-${kind}-${autoId}`
  const listId = `${inputId}-list`
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const session = useRef<string>(newPlacesSession())
  const typed = useRef(false)
  const request = useRef(0)

  useEffect(() => { if (!typed.current) setText(value) }, [value])

  useEffect(() => {
    if (!typed.current) return
    const input = text.trim()
    if (input.length < MIN_CHARS) {
      setSuggestions([])
      setLoading(false)
      return
    }
    const mine = ++request.current
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await placesApi.autocomplete({ input, kind, sessionToken: session.current, cityId })
        if (mine !== request.current) return
        setSuggestions(res.data?.suggestions ?? [])
        setError(null)
      } catch (err) {
        if (mine !== request.current) return
        setSuggestions([])
        setError(describeRequestError(err, 'Location search is not available right now. Please try again.'))
      } finally {
        if (mine === request.current) setLoading(false)
      }
    }, PLACES_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, kind, cityId])

  const close = () => {
    setOpen(false)
    setSuggestions([])
    typed.current = false
  }

  const pick = async (s: PlaceSuggestion) => {
    setPicking(true)
    setError(null)
    try {
      const res = await placesApi.details(s.placeId, { kind, sessionToken: session.current, cityId })
      const place = res.data
      const shown = kind === 'address' ? place.formattedAddress : kind === 'city' ? place.city?.name : place.area?.name
      setText(shown || s.primaryText)
      close()
      onPick(place)
    } catch (err) {
      setError(describeRequestError(err, 'We could not use that place. Please pick another one.'))
    } finally {
      setPicking(false)
      session.current = newPlacesSession() // the session ends with the details call
    }
  }

  const typedText = text.trim()
  const showList = open && typedText.length >= MIN_CHARS && !loading
  const noMatch = showList && suggestions.length === 0 && !error

  return (
    <div className="relative space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium leading-none">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="pl-9"
          value={text}
          placeholder={placeholder}
          disabled={disabled || picking}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            typed.current = true
            setText(e.target.value)
            setOpen(true)
            onTextChange?.(e.target.value)
          }}
        />
        {(loading || picking) && (
          <Loader2 aria-label="Searching" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {showList && (suggestions.length > 0 || (noMatch && renderNoMatch)) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
            {suggestions.map((s) => (
              <li key={s.placeId} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                >
                  <span className="font-medium">{s.primaryText}</span>
                  {s.secondaryText && <span className="ml-1 text-muted-foreground">{s.secondaryText}</span>}
                </button>
              </li>
            ))}
          </ul>
          {noMatch && renderNoMatch?.(typedText, close)}
        </div>
      )}
      {error && <p role="alert" className={cn('text-xs text-destructive')}>{error}</p>}
    </div>
  )
}
