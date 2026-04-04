import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/layout.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));
/* StrictMode disabled: in dev it double-invokes effects and can amplify flicker / stuck loading with the API proxy. */
root.render(<App />);

reportWebVitals();
