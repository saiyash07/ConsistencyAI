import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import NewAnalysis from "./pages/NewAnalysis";
import Comparison from "./pages/Comparison";
import SettingsPage from "./pages/Settings";
import Reports from "./pages/Reports";
import Demo from "./pages/Demo";

const Results = lazy(() => import("./pages/Results"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analyze" element={<NewAnalysis />} />
        <Route path="/results/:id" element={<Suspense fallback={<p className="muted">Loading results…</p>}><Results /></Suspense>} />
        <Route path="/compare" element={<Comparison />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<div className="card">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
