import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { OperationsAuthProvider } from "./components/dataOperations/OperationsAuth";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <OperationsAuthProvider><App /></OperationsAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
