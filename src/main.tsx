import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TooltipProvider } from './components/ui/Tooltip'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element was not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
