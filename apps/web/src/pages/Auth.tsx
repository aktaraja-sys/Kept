import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { estimateBits } from '../crypto/sodium';
import { useVault } from '../vault';
import { errorText } from '../components/ui';

function DeviceBanner() {
  const { backendKind } = useVault();
  if (backendKind !== 'device') return null;
  return <p className="banner">Preview: your encrypted vault is stored on this phone only. Uninstalling the app deletes it.</p>;
}

export function Welcome() {
  return (
    <div className="app">
      <div className="bar">
        <span className="brand"><span className="brand-mark" aria-hidden="true" />Kept</span>
      </div>
      <div className="stack" style={{ marginTop: 24 }}>
        <h1>Make life easier for the people you love</h1>
        <p className="sub">Passwords, pensions, insurance and your Lasting Powers of Attorney, in one place. Encrypted on your device, so even Kept can't read it.</p>
        <DeviceBanner />
        <div className="spacer" />
        <Link className="btn acc block" to="/signup">Create your vault</Link>
        <Link className="btn ghost block" to="/signin">I already have a vault</Link>
      </div>
    </div>
  );
}

export function SignIn() {
  const { login } = useVault();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      nav('/vault', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <div className="app">
      <div className="bar"><Link className="back" to="/">‹ Back</Link></div>
      <form className="stack" onSubmit={submit}>
        <h1>Unlock your vault</h1>
        <DeviceBanner />
        <label className="field"><span className="l">Email</span>
          <input className="in" id="signin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field"><span className="l">Master password</span>
          <input className="in" id="signin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn acc block" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
        <p className="small">Your master password never leaves this device. If you've lost it, you'll need your recovery key.</p>
      </form>
    </div>
  );
}

export function SignUp() {
  const { signup } = useVault();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const bits = estimateBits(password);
  const strong = password.length >= 12 && bits >= 60;
  const pct = Math.min(100, Math.round((bits / 90) * 100));
  const colour = bits < 45 ? 'var(--danger)' : bits < 60 ? 'var(--warn)' : 'var(--ok)';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!strong) return setError('Use at least 12 characters. A few unrelated words works well.');
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const { recoveryKey } = await signup(email.trim().toLowerCase(), password);
      setRecovery(recoveryKey);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <div className="app">
        <div className="stack" style={{ marginTop: 24 }}>
          <h1>Save your recovery key</h1>
          <p className="sub">Kept can't reset your master password, because we never see it. This key is the only other way into your vault. Write it down or print it and keep it somewhere safe, such as with your will.</p>
          <div className="recovery" data-testid="recovery-key">{recovery}</div>
          <button className="btn ghost block" type="button" onClick={() => navigator.clipboard?.writeText(recovery).catch(() => undefined)}>Copy</button>
          <label className="check"><input type="checkbox" id="saved-recovery" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I've saved my recovery key somewhere safe</label>
          <button className="btn acc block" disabled={!saved} onClick={() => nav('/vault', { replace: true })}>Go to my vault</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="bar"><Link className="back" to="/">‹ Back</Link></div>
      <form className="stack" onSubmit={submit}>
        <h1>Create your vault</h1>
        <DeviceBanner />
        <label className="field"><span className="l">Email</span>
          <input className="in" id="signup-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field"><span className="l">Master password</span>
          <input className="in" id="signup-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="meter" aria-hidden="true"><div style={{ width: `${pct}%`, background: colour }} /></div>
        <p className="small">{password ? (strong ? 'Strong enough.' : 'Keep going: at least 12 characters, ideally a few unrelated words.') : 'This unlocks everything. Make it long and memorable.'}</p>
        <label className="field"><span className="l">Type it again</span>
          <input className="in" id="signup-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <label className="check"><input type="checkbox" id="signup-understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />I understand Kept can't see or reset my master password.</label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn acc block" disabled={busy || !understood}>{busy ? 'Creating your vault…' : 'Create vault'}</button>
      </form>
    </div>
  );
}
