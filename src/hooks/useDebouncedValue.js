import { useEffect, useState } from 'react'

// Returns `value` once it has stopped changing for `delay` ms — handy for
// search boxes so we're not firing a request on every keystroke.
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
