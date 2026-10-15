import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Note: intentionally not wrapped in <StrictMode>. Cornerstone3D's
// RenderingEngine owns a WebGL context per viewport element; StrictMode's
// dev-only double-invoke of effects (mount -> cleanup -> mount) tears down
// and recreates that context on every page load, which is unnecessary
// churn for a canvas-heavy library like this one.
createRoot(document.getElementById('root')!).render(<App />)
