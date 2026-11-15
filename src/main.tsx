import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initStore, onSyncError } from "./lib/store";
import { toastError } from "./components/ui";

onSyncError((m) => toastError(`Couldn't save: ${m}`));
void initStore();
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
