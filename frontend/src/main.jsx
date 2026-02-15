import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { CitizenViewPage } from "./app/pages/CitizenViewPage";
import { ForensicLabPage } from "./app/pages/ForensicLabPage";
import { HomePage } from "./app/pages/HomePage";
import "./styles/index.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/citizen-view" element={<CitizenViewPage />} />
        <Route path="/forensic-lab" element={<ForensicLabPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
