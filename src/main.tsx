import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Default to light
if (typeof document !== "undefined") {
  const stored = localStorage.getItem("kismet-theme");
  if (stored === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// Register service worker — but never inside the Lovable preview iframe.
if ("serviceWorker" in navigator) {
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname === "localhost";

  if (isPreviewHost || isInIframe) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
