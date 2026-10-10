import { useState } from 'react';
import type { Scope } from '@kept/shared';
import { DocRows, SCOPE_LABEL, UploadDoc } from '../components/Docs';
import { TopBar } from '../components/ui';
import { useUnlocked } from '../vault';

const HELP: Record<Scope, string> = {
  finance: 'Statements, policies, nomination forms, your property and financial affairs LPA.',
  health: 'Medical letters, care wishes, your health and welfare LPA. Kept apart from finance documents.',
  general: 'Anything else: identity documents, letters of wishes, funeral plans.',
};

export function Documents() {
  const { state } = useUnlocked();
  const [tab, setTab] = useState<Scope>('finance');
  const files = state.files.filter((f) => f.scope === tab).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="app">
      <TopBar back="Vault" backTo="/vault" />
      <div className="stack">
        <h1>Documents</h1>
        <div className="tabs" role="tablist" aria-label="Document groups">
          {(['finance', 'health', 'general'] as Scope[]).map((s) => (
            <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)}>
              {SCOPE_LABEL[s]} ({state.files.filter((f) => f.scope === s).length})
            </button>
          ))}
        </div>
        <p className="small">{HELP[tab]}</p>
        <DocRows files={files} empty="Nothing here yet." />
        <UploadDoc key={tab} scope={tab} defaultCategory={tab === 'health' ? 'medical' : tab === 'finance' ? 'statement' : 'other'} />
      </div>
    </div>
  );
}
