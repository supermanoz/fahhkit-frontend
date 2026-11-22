import { useSyncExternalStore } from 'react'
import { isAppActive, onAppActivityChange } from '../utils/appActivity'

// true while the app/tab is in the foreground (see utils/appActivity.js).
export function useAppActive() {
  return useSyncExternalStore(onAppActivityChange, isAppActive, () => true)
}
