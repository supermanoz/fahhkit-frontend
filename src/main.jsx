import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'aos/dist/aos.css'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { initNativeShell } from './utils/nativeShell.js'
import { removeLegacyReminders } from './utils/legacyReminderCleanup.js'
import { hydrateAuthStorage } from './utils/authStorage.js'
import { startSessionKeeper } from './utils/sessionKeeper.js'
import './utils/appActivity.js'

initNativeShell()
removeLegacyReminders()

// Load the stored session BEFORE the first render, so no route guard / auth
// gate ever decides "signed out" just because the session hasn't loaded yet.
hydrateAuthStorage().finally(() => {
  startSessionKeeper()
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </StrictMode>
  )
})
