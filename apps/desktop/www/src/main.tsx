import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { apiToken } from './api/token'
import { App } from './app/app'
import './styles.css'

apiToken()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
