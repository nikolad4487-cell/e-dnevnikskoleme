import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Debug listeners
window.addEventListener("beforeunload", () => {
  console.trace("PAGE BEFOREUNLOAD TRIGGERED");
});

document.addEventListener("visibilitychange", () => {
  console.log("VISIBILITY CHANGE", document.visibilityState);
});

window.addEventListener("focus", () => {
  console.log("WINDOW FOCUS");
});

console.log("APP START");

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
