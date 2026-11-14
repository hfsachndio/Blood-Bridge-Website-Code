import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { resumePendingReviews } from "./lib/store";

resumePendingReviews();
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
