import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startBoot } from './boot/boot'
import { apiSource } from './data/api'
import { fixtureSource } from './data/fixtures'
import { DataContext } from './data/useData'
import { Router } from './router'
import './theme.css'

// The adapter is picked here and nowhere else (AC3). Builds read the core API;
// dev and tests use fixtures unless VITE_NEST_SOURCE=api.
const live = import.meta.env.PROD || import.meta.env.VITE_NEST_SOURCE === 'api'
const source = live ? apiSource() : fixtureSource()

// Trace boot on the first Home load of a session; ?boot=1 replays it.
startBoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataContext.Provider value={source}>
      <Router>
        <App />
      </Router>
    </DataContext.Provider>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
