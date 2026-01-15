import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/index.css';

import { SocketProvider } from './contexts/SocketContext';
import { TooltipProvider } from './components/ui/tooltip';
import { WorkspacePage } from './pages/WorkspacePage';

function App() {
  return (
    <SocketProvider>
      <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WorkspacePage />} />
          {/* Legacy routes redirect to workspace */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/session/:sessionId" element={<Navigate to="/" replace />} />
          <Route path="/session" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </TooltipProvider>
    </SocketProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
