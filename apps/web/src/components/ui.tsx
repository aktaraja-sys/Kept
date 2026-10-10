import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useVault } from '../vault';

export function Brand() {
  return (
    <Link to="/vault" className="brand" aria-label="Kept home">
      <span className="brand-mark" aria-hidden="true" />
      Kept
    </Link>
  );
}

export function TopBar({ back, backTo }: { back?: string; backTo?: string }) {
  const { lock, state } = useVault();
  const nav = useNavigate();
  return (
    <div className="bar">
      {back ? (
        <button className="back" onClick={() => (backTo ? nav(backTo) : nav(-1))}>
          <span aria-hidden="true">‹</span> {back}
        </button>
      ) : (
        <Brand />
      )}
      {state.status === 'unlocked' && (
        <button className="btn ghost sm" onClick={() => lock().then(() => nav('/'))}>
          Lock
        </button>
      )}
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong';
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
