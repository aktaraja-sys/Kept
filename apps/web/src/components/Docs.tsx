import { useRef, useState } from 'react';
import { DOC_CATEGORIES, MAX_FILE_BYTES, type DocCategory, type Scope } from '@kept/shared';
import { CATEGORY_LABEL, itemTitle } from '../fields';
import { deliverBlob } from '../files';
import { useUnlocked, type VaultFile } from '../vault';
import { errorText, formatBytes, useToast } from './ui';

export const SCOPE_LABEL: Record<Scope, string> = { finance: 'Finance', health: 'Health', general: 'Other' };

/** Upload control. Files are encrypted on this device before they are stored. */
export function UploadDoc({ scope, linkedItemId, defaultCategory = 'other', lockScope = false, label = 'Add a document' }: {
  scope: Scope; linkedItemId?: string; defaultCategory?: DocCategory; lockScope?: boolean; label?: string;
}) {
  const { uploadFile } = useUnlocked();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<DocCategory>(defaultCategory);
  const [sc, setSc] = useState<Scope>(scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idBase = `up-${linkedItemId ?? 'docs'}-${scope}`;

  async function onPick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setError('');
    if (f.size > MAX_FILE_BYTES) return setError('That file is over 25 MB. Try a smaller scan or PDF.');
    setBusy(true);
    try {
      await uploadFile(f, { scope: lockScope ? scope : sc, category: cat, linkedItemId });
      toast(`${f.name} encrypted and saved`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="card pad stack">
      <div className={lockScope ? '' : 'grid2'}>
        {!lockScope && (
          <label className="field"><span className="l">File it under</span>
            <select className="in" id={`${idBase}-scope`} value={sc} onChange={(e) => setSc(e.target.value as Scope)}>
              <option value="finance">Finance</option>
              <option value="health">Health</option>
              <option value="general">Other</option>
            </select>
          </label>
        )}
        <label className="field"><span className="l">Type of document</span>
          <select className="in" id={`${idBase}-cat`} value={cat} onChange={(e) => setCat(e.target.value as DocCategory)}>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>
      <input ref={input} id={`${idBase}-file`} type="file" className="sr" accept="application/pdf,image/*,.doc,.docx" onChange={(e) => onPick(e.target.files)} />
      <button type="button" className="btn ghost block" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Encrypting…' : label}
      </button>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

export function DocRows({ files, empty }: { files: VaultFile[]; empty?: string }) {
  const { openFile, deleteFile, state } = useUnlocked();
  const toast = useToast();
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!files.length) return empty ? <p className="small">{empty}</p> : null;
  const titleFor = (id?: string) => {
    const it = id ? state.items.find((i) => i.id === id) : undefined;
    return it ? itemTitle(it.type, it.data) : null;
  };
  return (
    <div className="card list">
      {files.map((f) => (
        <div className="row" key={f.id}>
          <span className="t">
            <b>{f.meta.name}</b>
            <span>{[CATEGORY_LABEL[f.meta.category], formatBytes(f.meta.size), titleFor(f.meta.linkedItemId)].filter(Boolean).join(' · ')}</span>
          </span>
          {confirming === f.id ? (
            <span className="inrow">
              <button className="btn danger sm" onClick={async () => { await deleteFile(f.id); setConfirming(null); toast('Document deleted'); }}>Delete</button>
              <button className="btn ghost sm" onClick={() => setConfirming(null)}>Keep</button>
            </span>
          ) : (
            <span className="inrow">
              <button className="btn ghost sm" onClick={async () => { try { await deliverBlob(await openFile(f), f.meta.name); } catch (e) { toast(errorText(e)); } }}>Open</button>
              <button className="btn ghost sm" aria-label={`Delete ${f.meta.name}`} onClick={() => setConfirming(f.id)}>✕</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
