import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './lib/registerBuiltinExtras' // side-effect: auto-registers patterns/extras/*
import App from './App.jsx'

// DEV-ONLY material-calibration harness (?calibration=<materialId>&scene=<envId>).
// `import.meta.env.DEV` is statically false in production builds, so this branch —
// and the dynamically-imported dev chunk — are dropped from shipped bundles.
// See src/dev/CalibrationRoot.jsx + scripts/calibration-capture.mjs.
const calibrationId = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('calibration')
  : null

if (calibrationId) {
  const sceneId = new URLSearchParams(window.location.search).get('scene') || 'studio'
  import('./dev/CalibrationRoot.jsx').then((mod) => {
    createRoot(document.getElementById('root')).render(
      createElement(mod.default, { materialId: calibrationId, sceneId })
    )
  })
} else {
  createRoot(document.getElementById('root')).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}
