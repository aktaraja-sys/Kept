import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { LpaItem, type ItemData } from '@kept/shared';
import { FIELDS, defaultsFor } from '../fields';
import { DocRows, UploadDoc } from '../components/Docs';
import { TopBar, errorText, useToast } from '../components/ui';
import { Field } from './Items';
import { useUnlocked, type VaultItem } from '../vault';

type Kind = ItemData['lpa']['lpaType'];
const COPY: Record<Kind, { title: string; anchor: string; scope: 'finance' | 'health'; what: string; when: string }> = {
  property_finance: {
    title: 'Property and financial affairs', anchor: 'finance', scope: 'finance',
    what: 'Lets your attorneys manage your bank accounts, bills, pensions and property.',
    when: 'Can be used as soon as it is registered, with your permission, even while you can still decide for yourself.',
  },
  health_welfare: {
    title: 'Health and welfare', anchor: 'health', scope: 'health',
    what: 'Lets your attorneys decide about your care, medical treatment and where you live.',
    when: 'Can only be used once you can no longer make these decisions yourself.',
  },
};
const STATUS_TAG: Record<ItemData['lpa']['status'], [string, string]> = {
  not_made: ['Not made', 'acc'], in_progress: ['Being prepared', 'warn'], signed: ['Signed', 'warn'], registered: ['Registered', 'ok'],
};

function LpaCard({ kind }: { kind: Kind }) {
  const { state, saveItem } = useUnlocked();
  const toast = useToast();
  const c = COPY[kind];
  const existing = state.items.find((i) => i.type === 'lpa' && (i.data as ItemData['lpa']).lpaType === kind) as VaultItem<'lpa'> | undefined;
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<Record<string, string>>(() => ({ ...defaultsFor('lpa'), lpaType: kind, ...((existing?.data as Record<string, string>) ?? {}) }));
  const [error, setError] = useState('');
  const status = (existing?.data.status ?? 'not_made') as ItemData['lpa']['status'];
  const docs = existing ? state.files.filter((f) => f.meta.linkedItemId === existing.id) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = LpaItem.safeParse({ ...data, lpaType: kind });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form');
    try {
      await saveItem('lpa', parsed.data, existing);
      setEditing(false);
      toast('Saved and encrypted');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section id={c.anchor} className="card pad stack" aria-labelledby={`${c.anchor}-h`}>
      <div className="inrow" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 id={`${c.anchor}-h`} style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)' }}>{c.title}</h3>
        <span className={`tag ${STATUS_TAG[status][1]}`}>{STATUS_TAG[status][0]}</span>
      </div>
      <p className="small">{c.what} {c.when}</p>

      {existing && !editing && (
        <div className="list" style={{ borderTop: '1px solid var(--line2)' }}>
          {existing.data.opgReference && <div className="row" style={{ paddingInline: 0 }}><span className="t"><span>OPG reference</span><b className="mono">{existing.data.opgReference}</b></span></div>}
          {existing.data.attorneys && <div className="row" style={{ paddingInline: 0 }}><span className="t"><span>Attorneys</span><b style={{ whiteSpace: 'pre-line' }}>{existing.data.attorneys}</b></span></div>}
          {existing.data.whereOriginal && <div className="row" style={{ paddingInline: 0 }}><span className="t"><span>Original kept</span><b>{existing.data.whereOriginal}</b></span></div>}
        </div>
      )}

      {editing ? (
        <form className="stack" onSubmit={submit}>
          {FIELDS.lpa.filter((f) => !f.showIf || f.showIf({ ...data, lpaType: kind })).map((f) => (
            <Field key={f.key} def={f} idPrefix={`lpa-${c.anchor}`} value={data[f.key] ?? ''} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} />
          ))}
          {error && <p className="err" role="alert">{error}</p>}
          <div className="inrow"><button className="btn acc">Save</button><button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
        </form>
      ) : (
        <button className="btn ghost block" onClick={() => setEditing(true)}>{existing ? 'Edit details' : 'Add details'}</button>
      )}

      {status !== 'registered' && (
        <div className="alert warn">
          <b>{status === 'not_made' ? 'How to make this LPA' : 'What happens next'}</b>
          <ol className="steps">
            <li>Choose attorneys you trust, aged 18 or over.</li>
            <li>Prepare the LPA. Kept can prepare it from your vault and a solicitor certifies it: £150, or £250 for both LPAs.</li>
            <li>Sign it, with a witness, after the certificate is signed.</li>
            <li>Register it with the Office of the Public Guardian (£92). It can't be used until it is registered.</li>
          </ol>
        </div>
      )}

      <h2 style={{ marginTop: 4 }}>{c.title} documents</h2>
      <DocRows files={docs} empty={existing ? 'Add the signed LPA and the OPG registration letter.' : undefined} />
      {existing ? (
        <UploadDoc scope={c.scope} linkedItemId={existing.id} lockScope defaultCategory="lpa" label={`Add a ${c.anchor} document`} />
      ) : (
        <p className="small">Save the details first, then you can add documents.</p>
      )}
      <p className="small">Filed under {c.scope === 'health' ? 'Health' : 'Finance'}, apart from your {c.scope === 'health' ? 'finance' : 'health'} documents. When attorney access arrives, only {c.scope === 'health' ? 'health and welfare' : 'property and financial affairs'} attorneys will be able to see them.</p>
    </section>
  );
}

export function LpaPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
  return (
    <div className="app">
      <TopBar back="Vault" backTo="/vault" />
      <div className="stack">
        <h1>Lasting Powers of Attorney</h1>
        <p className="sub">There are two kinds, and they're kept separate. Each has its own attorneys and its own documents.</p>
        <LpaCard kind="property_finance" />
        <LpaCard kind="health_welfare" />
      </div>
    </div>
  );
}
