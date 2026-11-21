import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { initStore, onSyncError } from "./lib/store";
import { toastError } from "./components/ui";

onSyncError((m) => toastError(`Couldn't save: ${m}`));
void initStore();
// Vercel Web Analytics and Speed Insights (free tier, cookie-free; only active on Vercel).
inject();
injectSpeedInsights();
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
