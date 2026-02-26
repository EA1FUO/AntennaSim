import { Routes, Route } from "react-router-dom";
import { SimulatorPage } from "./pages/SimulatorPage";
import { EditorPage } from "./pages/EditorPage";
import { AboutPage } from "./pages/AboutPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SimulatorPage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
