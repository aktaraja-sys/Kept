import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './styles.css';
import { VaultProvider, useVault } from './vault';
import { ToastProvider } from './components/ui';
import { SignIn, SignUp, Welcome } from './pages/Auth';
import { Home } from './pages/Home';
import { ItemEditor, ItemList } from './pages/Items';
import { LpaPage } from './pages/Lpa';
import { Documents } from './pages/Documents';

function Unlocked({ children }: { children: ReactNode }) {
  const { state } = useVault();
  return state.status === 'unlocked' ? <>{children}</> : <Navigate to="/" replace />;
}
function LockedOnly({ children }: { children: ReactNode }) {
  const { state } = useVault();
  return state.status === 'locked' ? <>{children}</> : <Navigate to="/vault" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LockedOnly><Welcome /></LockedOnly>} />
      <Route path="/signin" element={<LockedOnly><SignIn /></LockedOnly>} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/vault" element={<Unlocked><Home /></Unlocked>} />
      <Route path="/vault/lpa" element={<Unlocked><LpaPage /></Unlocked>} />
      <Route path="/vault/documents" element={<Unlocked><Documents /></Unlocked>} />
      <Route path="/vault/:kind" element={<Unlocked><ItemList /></Unlocked>} />
      <Route path="/vault/:kind/:id" element={<Unlocked><ItemEditor /></Unlocked>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <VaultProvider>
          <App />
        </VaultProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
