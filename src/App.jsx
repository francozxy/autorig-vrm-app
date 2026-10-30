import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AutoRigApp from './AutoRigApp';
import VrmEditorApp from './VrmEditorApp';

// HashRouter es ideal si luego vas a compilar la app a APK (evita fallos de rutas en archivos locales)
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<VrmEditorApp />} />
        <Route path="/rig" element={<AutoRigApp />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
}
