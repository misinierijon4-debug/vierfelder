import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import { App } from './App'
import { PwaStatus } from './components/PwaStatus'
import { registrierePwa } from './lib/pwa'
import { installAppViewport } from './lib/appViewport'

const disposeViewport = installAppViewport()
if (import.meta.hot) import.meta.hot.dispose(disposeViewport)
registrierePwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
      <PwaStatus />
    </MotionConfig>
  </StrictMode>,
)
