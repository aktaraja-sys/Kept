import { Link } from 'react-router-dom';
import type { ItemData } from '@kept/shared';
import { TopBar } from '../components/ui';
import { itemWarning } from '../fields';
import { useUnlocked } from '../vault';

const LPA_STATUS: Record<ItemData['lpa']['status'], string> = { not_made: 'Not made', in_progress: 'Being prepared', signed: 'Signed', registered: 'Registered' };

export function Home() {
  const { state, backendKind } = useUnlocked();
  const count = (t: string) => state.items.filter((i) => i.type === t).length;
  const total = (t: 'pension' | 'life_insurance') =>
    state.items
      .filter((i) => i.type === t)
      .reduce((s, i) => {
        const v = t === 'pension' ? (i.data as ItemData['pension']).approxValue : (i.data as ItemData['life_insurance']).sumAssured;
        return s + (Number(v) || 0);
      }, 0);
  const lpa = (kind: 'property_finance' | 'health_welfare') => {
    const it = state.items.find((i) => i.type === 'lpa' && (i.data as ItemData['lpa']).lpaType === kind);
    return it ? LPA_STATUS[(it.data as ItemData['lpa']).status] : 'Not added';
  };
  const warnings = state.items.map((i) => itemWarning(i.type, i.data)).filter(Boolean).length;
  const docs = (s: string) => state.files.filter((f) => f.scope === s).length;
  const gbp = (n: number) => (n ? `£${Math.round(n).toLocaleString('en-GB')}` : '—');

  return (
    <div className="app">
      <TopBar />
      <div className="stack">
        <h1>Your vault</h1>
        <p className="sub">Signed in as {state.email}. Everything here is encrypted on this device before it's saved.</p>
        {backendKind === 'device' && <p className="banner">Preview: stored on this phone only.</p>}
        {warnings > 0 && (
          <div className="alert warn"><b>{warnings} thing{warnings > 1 ? 's' : ''} to check</b><span className="small">Pensions without a beneficiary nomination, or policies not written in trust, are flagged in each list.</span></div>
        )}
        <div className="grid2">
          <Link className="tile" to="/vault/logins"><b>Passwords and logins</b><span className="n">{count('login')}</span><span>with instructions</span></Link>
          <Link className="tile" to="/vault/pensions"><b>Pensions</b><span className="n">{gbp(total('pension'))}</span><span>{count('pension')} recorded</span></Link>
          <Link className="tile" to="/vault/insurance"><b>Life insurance</b><span className="n">{gbp(total('life_insurance'))}</span><span>{count('life_insurance')} polic{count('life_insurance') === 1 ? 'y' : 'ies'}</span></Link>
          <Link className="tile" to="/vault/documents"><b>Documents</b><span className="n">{state.files.length}</span><span>{docs('finance')} finance · {docs('health')} health</span></Link>
        </div>
        <h2>Lasting Powers of Attorney</h2>
        <div className="card list">
          <Link className="row" to="/vault/lpa#finance"><span className="t"><b>Property and financial affairs</b><span>{lpa('property_finance')}</span></span><span className="chev">›</span></Link>
          <Link className="row" to="/vault/lpa#health"><span className="t"><b>Health and welfare</b><span>{lpa('health_welfare')}</span></span><span className="chev">›</span></Link>
        </div>
      </div>
    </div>
  );
}
