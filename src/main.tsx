import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { PwaStatus } from './components/PwaStatus'
import { registrierePwa } from './lib/pwa'

registrierePwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaStatus />
  </StrictMode>,
)
