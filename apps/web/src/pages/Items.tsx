import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ITEM_SCHEMAS, type ItemData } from '@kept/shared';
import { generatePassword } from '../crypto/sodium';
import { FIELDS, TYPE_INFO, defaultsFor, itemSubtitle, itemTitle, itemWarning, type FieldDef } from '../fields';
import { DocRows, UploadDoc } from '../components/Docs';
import { TopBar, errorText, useToast } from '../components/ui';
import { useUnlocked, type VaultItem } from '../vault';

type ListType = keyof typeof TYPE_INFO;
const byPath = (p?: string) => (Object.keys(TYPE_INFO) as ListType[]).find((t) => TYPE_INFO[t].path === p);

export function ItemList() {
  const { kind } = useParams();
  const type = byPath(kind);
  const { state } = useUnlocked();
  if (!type) return <p className="app">Not found</p>;
  const info = TYPE_INFO[type];
  const items = state.items.filter((i) => i.type === type).sort((a, b) => itemTitle(type, a.data).localeCompare(itemTitle(type, b.data)));
  return (
    <div className="app">
      <TopBar back="Vault" backTo="/vault" />
      <div className="stack">
        <h1>{info.plural}</h1>
        {items.length === 0 ? (
          <p className="sub">{info.empty}</p>
        ) : (
          <div className="card list">
            {items.map((i) => {
              const w = itemWarning(i.type, i.data);
              return (
                <Link key={i.id} className="row" to={`/vault/${info.path}/${i.id}`}>
                  <span className="t">
                    <b>{itemTitle(type, i.data)}</b>
                    <span>{itemSubtitle(type, i.data)}</span>
                    {w && <span style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{w}</span>}
                  </span>
                  <span className="chev">›</span>
                </Link>
              );
            })}
          </div>
        )}
        <Link className="btn acc block" to={`/vault/${info.path}/new`}>Add {info.singular === 'login' ? 'a login' : info.singular === 'pension' ? 'a pension' : 'a policy'}</Link>
      </div>
    </div>
  );
}

/** Renders one field from fields.ts. */
export function Field({ def, value, onChange, idPrefix }: { def: FieldDef; value: string; onChange: (v: string) => void; idPrefix: string }) {
  const id = `${idPrefix}-${def.key}`;
  const [show, setShow] = useState(false);
  let control;
  if (def.kind === 'select') {
    control = (
      <select className="in" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {def.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  } else if (def.kind === 'textarea') {
    control = <textarea className="in" id={id} value={value} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />;
  } else if (def.kind === 'password') {
    control = (
      <div className="inrow">
        <input className="in mono" id={id} type={show ? 'text' : 'password'} value={value} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn ghost sm" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
        <button type="button" className="btn ghost sm" onClick={async () => { onChange(await generatePassword()); setShow(true); }}>New</button>
      </div>
    );
  } else {
    const type = def.kind === 'money' ? 'text' : def.kind === 'date' ? 'date' : def.kind === 'url' ? 'url' : 'text';
    control = (
      <input className="in" id={id} type={type} inputMode={def.kind === 'money' ? 'decimal' : undefined} value={value} placeholder={def.placeholder}
        autoComplete="off" onChange={(e) => onChange(def.kind === 'money' ? e.target.value.replace(/[£,\s]/g, '') : e.target.value)} />
    );
  }
  return (
    <label className="field">
      <span className="l">{def.label}</span>
      {control}
      {def.help && <span className="small">{def.help}</span>}
    </label>
  );
}

export function ItemEditor() {
  const { kind, id } = useParams();
  const type = byPath(kind);
  const nav = useNavigate();
  const toast = useToast();
  const { state, saveItem, deleteItem } = useUnlocked();
  const existing = state.items.find((i) => i.id === id && i.type === type) as VaultItem<ListType> | undefined;
  const defaults = type ? defaultsFor(type) : {};
  const [data, setData] = useState<Record<string, string>>(() => ({ ...defaults, ...((existing?.data as Record<string, string>) ?? {}) }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (id !== 'new' && !existing) nav(`/vault/${kind}`, { replace: true });
  }, [id, existing, kind, nav]);
  if (!type) return <p className="app">Not found</p>;
  const info = TYPE_INFO[type];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = ITEM_SCHEMAS[type!].safeParse(data);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form');
    setBusy(true);
    try {
      const saved = await saveItem(type!, parsed.data as ItemData[ListType], existing);
      toast('Saved and encrypted');
      if (!existing) nav(`/vault/${info.path}/${saved.id}`, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const linked = existing ? state.files.filter((f) => f.meta.linkedItemId === existing.id) : [];
  return (
    <div className="app">
      <TopBar back={info.plural} backTo={`/vault/${info.path}`} />
      <form className="stack" onSubmit={submit}>
        <h1>{existing ? itemTitle(type, existing.data) : `New ${info.singular}`}</h1>
        {FIELDS[type].filter((f) => !f.showIf || f.showIf(data)).map((f) => (
          <Field key={f.key} def={f} idPrefix={type} value={data[f.key] ?? ''} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} />
        ))}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn acc block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>

      {existing && type !== 'login' && (
        <div className="stack" style={{ marginTop: 16 }}>
          <h2>Documents</h2>
          <DocRows files={linked} empty={type === 'pension' ? 'Add statements and your nomination form.' : 'Add the policy schedule and any trust deed.'} />
          <UploadDoc scope="finance" linkedItemId={existing.id} lockScope defaultCategory={type === 'pension' ? 'statement' : 'policy'} />
        </div>
      )}

      {existing && (
        <div className="stack" style={{ marginTop: 24 }}>
          {confirmDelete ? (
            <div className="alert"><b>Delete this {info.singular}?</b><span className="small">This can't be undone.</span>
              <div className="inrow">
                <button className="btn danger sm" onClick={async () => { await deleteItem(existing.id); toast('Deleted'); nav(`/vault/${info.path}`); }}>Delete</button>
                <button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          ) : (
            <button className="btn danger block" onClick={() => setConfirmDelete(true)}>Delete {info.singular}</button>
          )}
        </div>
      )}
    </div>
  );
}
