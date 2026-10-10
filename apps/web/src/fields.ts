import { z } from 'zod';
import { ITEM_SCHEMAS, type DocCategory, type ItemData, type ItemType } from '@kept/shared';

/** Default values for a new record, read from the schema's `.default()`s. */
export function defaultsFor(type: ItemType): Record<string, string> {
  const shape = (ITEM_SCHEMAS[type] as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(shape)) {
    let cur: z.ZodTypeAny = s;
    while (cur instanceof z.ZodOptional) cur = cur.unwrap();
    out[k] = cur instanceof z.ZodDefault ? String(cur._def.defaultValue()) : '';
  }
  return out;
}

export type FieldKind = 'text' | 'textarea' | 'select' | 'password' | 'money' | 'date' | 'url';
export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: [string, string][];
  help?: string;
  placeholder?: string;
  showIf?: (d: Record<string, string>) => boolean;
};

const YNU: [string, string][] = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];

export const FIELDS: Record<Exclude<ItemType, 'lpa'>, FieldDef[]> & { lpa: FieldDef[] } = {
  login: [
    { key: 'title', label: 'Name', kind: 'text', placeholder: 'e.g. Gmail, Barclays app, Netflix' },
    { key: 'url', label: 'Website', kind: 'url', placeholder: 'https://' },
    { key: 'username', label: 'Username or email', kind: 'text' },
    { key: 'password', label: 'Password', kind: 'password' },
    {
      key: 'onDeath', label: 'What should happen after I die?', kind: 'select',
      options: [['close', 'Close the account'], ['memorialise', 'Memorialise it'], ['hand_over', 'Hand it over to someone'], ['download_then_close', 'Download photos and files, then close'], ['other', 'Something else (see notes)']],
    },
    { key: 'handOverTo', label: 'Hand over to', kind: 'text', showIf: (d) => d.onDeath === 'hand_over' },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
  ],
  pension: [
    { key: 'provider', label: 'Provider', kind: 'text', placeholder: 'e.g. Aviva, Nest, Scottish Widows' },
    { key: 'schemeName', label: 'Scheme or plan name', kind: 'text' },
    {
      key: 'kind', label: 'Type', kind: 'select',
      options: [['workplace_dc', 'Workplace (defined contribution)'], ['workplace_db', 'Workplace (final salary)'], ['personal', 'Personal pension'], ['sipp', 'SIPP'], ['state', 'State Pension'], ['annuity', 'Annuity'], ['other', 'Other']],
    },
    { key: 'reference', label: 'Member or policy number', kind: 'text' },
    { key: 'approxValue', label: 'Approximate value (£)', kind: 'money' },
    { key: 'valuationDate', label: 'Value as at', kind: 'date' },
    {
      key: 'beneficiaryNominated', label: 'Have you filled in a beneficiary nomination?', kind: 'select', options: YNU,
      help: 'Pensions usually pass by nomination, not by your will.',
    },
    { key: 'beneficiaries', label: 'Nominated beneficiaries', kind: 'textarea', showIf: (d) => d.beneficiaryNominated === 'yes' },
    { key: 'contact', label: 'Provider contact', kind: 'text', placeholder: 'Phone, email or website' },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
  ],
  life_insurance: [
    { key: 'insurer', label: 'Insurer', kind: 'text', placeholder: 'e.g. Legal & General, Aviva' },
    { key: 'policyNumber', label: 'Policy number', kind: 'text' },
    {
      key: 'kind', label: 'Type of cover', kind: 'select',
      options: [['term', 'Term life'], ['whole_of_life', 'Whole of life'], ['death_in_service', 'Death in service (from work)'], ['critical_illness', 'Critical illness'], ['mortgage_protection', 'Mortgage protection'], ['other', 'Other']],
    },
    { key: 'sumAssured', label: 'Amount paid out (£)', kind: 'money' },
    {
      key: 'inTrust', label: 'Is it written in trust?', kind: 'select', options: YNU,
      help: 'A policy in trust usually pays out faster and outside your estate for inheritance tax.',
    },
    { key: 'trustees', label: 'Trustees', kind: 'textarea', showIf: (d) => d.inTrust === 'yes' },
    { key: 'beneficiaries', label: 'Beneficiaries', kind: 'textarea' },
    { key: 'premium', label: 'Premium (£)', kind: 'money' },
    { key: 'premiumFrequency', label: 'Paid', kind: 'select', options: [['monthly', 'Monthly'], ['annually', 'Annually'], ['single', 'Single premium'], ['paid_by_employer', 'Paid by employer']] },
    { key: 'endDate', label: 'Cover ends', kind: 'date' },
    { key: 'contact', label: 'Insurer contact', kind: 'text' },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
  ],
  lpa: [
    { key: 'status', label: 'Status', kind: 'select', options: [['not_made', 'Not made yet'], ['in_progress', 'Being prepared'], ['signed', 'Signed, waiting to register'], ['registered', 'Registered with the OPG']] },
    { key: 'opgReference', label: 'OPG reference', kind: 'text', placeholder: 'e.g. 7000-1234-5678', showIf: (d) => d.status === 'registered' || d.status === 'signed' },
    { key: 'registeredOn', label: 'Registered on', kind: 'date', showIf: (d) => d.status === 'registered' },
    { key: 'attorneys', label: 'Attorneys', kind: 'textarea', placeholder: 'One per line' },
    { key: 'replacementAttorneys', label: 'Replacement attorneys', kind: 'textarea', placeholder: 'One per line' },
    { key: 'decisions', label: 'How attorneys make decisions', kind: 'select', options: [['jointly_and_severally', 'Together or on their own'], ['jointly', 'Always together'], ['mixed', 'Together for some decisions'], ['single', 'Only one attorney']] },
    {
      key: 'lifeSustainingTreatment', label: 'Life-sustaining treatment', kind: 'select',
      options: [['can_decide', 'Attorneys can decide'], ['cannot_decide', 'Attorneys cannot decide'], ['not_applicable', 'Not recorded']],
      showIf: (d) => d.lpaType === 'health_welfare',
    },
    { key: 'whereOriginal', label: 'Where the original is kept', kind: 'text' },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
  ],
};

export const TYPE_INFO = {
  login: { plural: 'Passwords and logins', singular: 'login', path: 'logins', empty: 'Add the accounts your family would need: email, banking apps, social media, subscriptions.' },
  pension: { plural: 'Pensions', singular: 'pension', path: 'pensions', empty: 'Add every pension, including old workplace ones and your State Pension.' },
  life_insurance: { plural: 'Life insurance', singular: 'policy', path: 'insurance', empty: 'Add life cover, death in service from work, and mortgage protection.' },
} as const;

export function itemTitle(type: ItemType, d: ItemData[ItemType]): string {
  if (type === 'login') return (d as ItemData['login']).title;
  if (type === 'pension') return (d as ItemData['pension']).provider;
  if (type === 'life_insurance') return (d as ItemData['life_insurance']).insurer;
  return (d as ItemData['lpa']).lpaType === 'health_welfare' ? 'Health and welfare LPA' : 'Property and financial affairs LPA';
}

export function itemSubtitle(type: ItemType, d: ItemData[ItemType]): string {
  if (type === 'login') { const x = d as ItemData['login']; return x.username || x.url || ''; }
  if (type === 'pension') { const x = d as ItemData['pension']; return [x.schemeName, x.approxValue && `£${Number(x.approxValue).toLocaleString('en-GB')}`].filter(Boolean).join(' · '); }
  if (type === 'life_insurance') { const x = d as ItemData['life_insurance']; return [x.policyNumber, x.sumAssured && `£${Number(x.sumAssured).toLocaleString('en-GB')} cover`].filter(Boolean).join(' · '); }
  return '';
}

/** Gaps worth flagging to the user. */
export function itemWarning(type: ItemType, d: ItemData[ItemType]): string | null {
  if (type === 'pension') {
    const x = d as ItemData['pension'];
    if (x.kind !== 'state' && x.beneficiaryNominated !== 'yes') return 'No beneficiary nomination recorded';
  }
  if (type === 'life_insurance' && (d as ItemData['life_insurance']).inTrust !== 'yes') return 'Not recorded as written in trust';
  return null;
}

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  statement: 'Statement', policy: 'Policy document', lpa: 'Lasting Power of Attorney', nomination: 'Nomination form',
  medical: 'Medical', identity: 'Identity', other: 'Other',
};
