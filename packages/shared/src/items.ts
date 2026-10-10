import { z } from 'zod';
import type { ItemType, Scope } from './api';

/*
 * Plaintext shapes of vault items. These only ever exist on the user's device; the server sees
 * the encrypted form. Every field is optional except the one that names the record, so people can
 * save what they know now and fill in the rest later.
 */

const text = (max = 500) => z.string().trim().max(max).optional().default('');
const yesNoUnsure = z.enum(['yes', 'no', 'unsure']).optional().default('unsure');
const money = z.string().trim().max(20).regex(/^\d*(\.\d{0,2})?$/, 'Use numbers only, like 25000').optional().default('');
const isoDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use a date').optional().default('');

export const LoginItem = z.object({
  title: z.string().trim().min(1, 'Give it a name').max(120),
  url: text(300),
  username: text(200),
  password: z.string().max(500).optional().default(''),
  onDeath: z.enum(['memorialise', 'close', 'hand_over', 'download_then_close', 'other']).optional().default('close'),
  handOverTo: text(120),
  notes: text(2000),
});

export const PensionItem = z.object({
  provider: z.string().trim().min(1, 'Who provides it?').max(120),
  schemeName: text(160),
  kind: z.enum(['workplace_dc', 'workplace_db', 'personal', 'sipp', 'state', 'annuity', 'other']).optional().default('workplace_dc'),
  reference: text(80),
  approxValue: money,
  valuationDate: isoDate,
  beneficiaryNominated: yesNoUnsure,
  beneficiaries: text(500),
  contact: text(300),
  notes: text(2000),
});

export const LifeInsuranceItem = z.object({
  insurer: z.string().trim().min(1, 'Who is the insurer?').max(120),
  policyNumber: text(80),
  kind: z.enum(['term', 'whole_of_life', 'death_in_service', 'critical_illness', 'mortgage_protection', 'other']).optional().default('term'),
  sumAssured: money,
  inTrust: yesNoUnsure,
  trustees: text(500),
  beneficiaries: text(500),
  premium: money,
  premiumFrequency: z.enum(['monthly', 'annually', 'single', 'paid_by_employer']).optional().default('monthly'),
  endDate: isoDate,
  contact: text(300),
  notes: text(2000),
});

export const LpaItem = z.object({
  lpaType: z.enum(['property_finance', 'health_welfare']),
  status: z.enum(['not_made', 'in_progress', 'signed', 'registered']).optional().default('not_made'),
  opgReference: text(40),
  registeredOn: isoDate,
  attorneys: text(500),
  replacementAttorneys: text(500),
  decisions: z.enum(['jointly', 'jointly_and_severally', 'mixed', 'single']).optional().default('jointly_and_severally'),
  lifeSustainingTreatment: z.enum(['can_decide', 'cannot_decide', 'not_applicable']).optional().default('not_applicable'),
  whereOriginal: text(300),
  notes: text(2000),
});

export const ITEM_SCHEMAS = {
  login: LoginItem,
  pension: PensionItem,
  life_insurance: LifeInsuranceItem,
  lpa: LpaItem,
} as const;

export type ItemData = {
  login: z.infer<typeof LoginItem>;
  pension: z.infer<typeof PensionItem>;
  life_insurance: z.infer<typeof LifeInsuranceItem>;
  lpa: z.infer<typeof LpaItem>;
};

/** Which release scope an item belongs to. LPA scope follows the LPA type. */
export function scopeFor<T extends ItemType>(type: T, data: ItemData[T]): Scope {
  if (type === 'login') return 'general';
  if (type === 'lpa') return (data as ItemData['lpa']).lpaType === 'health_welfare' ? 'health' : 'finance';
  return 'finance';
}

export const DOC_CATEGORIES = ['statement', 'policy', 'lpa', 'nomination', 'medical', 'identity', 'other'] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

/** Encrypted metadata stored with each file. */
export const FileMeta = z.object({
  name: z.string().max(255),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
  category: z.enum(DOC_CATEGORIES),
  linkedItemId: z.string().max(64).optional(),
  fileKey: z.string(), // base64 per-file key
});
export type FileMeta = z.infer<typeof FileMeta>;
