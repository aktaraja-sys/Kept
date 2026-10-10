import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EMAIL = 'alan.morris@example.com';
const MASTER = 'violet harbour lantern 47 quietly';
const SECRET_PASSWORD = 'S3cret-Unique-Pw-9981!';
const MARKERS = [SECRET_PASSWORD, 'Aviva', 'Legal & General', '7000-1234-5678', 'Anita Shah', 'HEALTH-DOC-MARKER', 'FINANCE-DOC-MARKER'];

function allBytes(dir: string): Buffer {
  const parts: Buffer[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    parts.push(statSync(p).isDirectory() ? allBytes(p) : readFileSync(p));
  }
  return Buffer.concat(parts);
}

async function unlock(page: Page, password = MASTER) {
  await page.goto('/signin');
  await page.fill('#signin-email', EMAIL);
  await page.fill('#signin-password', password);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

test('full vault journey stores only ciphertext on the server', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));

  // Sign up
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your vault' }).click();
  await page.fill('#signup-email', EMAIL);
  await page.fill('#signup-password', MASTER);
  await page.fill('#signup-confirm', MASTER);
  await page.check('#signup-understood');
  await page.getByRole('button', { name: 'Create vault' }).click();
  const key = await page.getByTestId('recovery-key').textContent();
  expect(key).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
  await page.check('#saved-recovery');
  await page.getByRole('button', { name: 'Go to my vault' }).click();
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible();

  // Password
  await page.getByRole('link', { name: /Passwords and logins/ }).click();
  await page.getByRole('link', { name: 'Add a login' }).click();
  await page.fill('#login-title', 'Gmail');
  await page.fill('#login-username', 'alan@example.com');
  await page.fill('#login-password', SECRET_PASSWORD);
  await page.selectOption('#login-onDeath', 'hand_over');
  await page.fill('#login-handOverTo', 'Dev Morris');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved and encrypted')).toBeVisible();
  await page.getByRole('button', { name: /Passwords and logins/ }).click();
  await expect(page.getByRole('link', { name: /Gmail/ })).toBeVisible();
  await page.getByRole('button', { name: /Vault/ }).click();

  // Pension without a nomination is flagged
  await page.getByRole('link', { name: /Pensions/ }).click();
  await page.getByRole('link', { name: 'Add a pension' }).click();
  await page.fill('#pension-provider', 'Aviva');
  await page.fill('#pension-reference', 'AV-5521');
  await page.fill('#pension-approxValue', '£182,000');
  await page.selectOption('#pension-beneficiaryNominated', 'no');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'aviva-statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 FINANCE-DOC-MARKER') });
  await expect(page.getByText('aviva-statement.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pensions' }).click();
  await expect(page.getByText('No beneficiary nomination recorded')).toBeVisible();
  await page.getByRole('button', { name: /Vault/ }).click();

  // Life insurance
  await page.getByRole('link', { name: /Life insurance/ }).click();
  await page.getByRole('link', { name: 'Add a policy' }).click();
  await page.fill('#life_insurance-insurer', 'Legal & General');
  await page.fill('#life_insurance-sumAssured', '250000');
  await page.selectOption('#life_insurance-inTrust', 'yes');
  await page.fill('#life_insurance-trustees', 'Priya Morris');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved and encrypted')).toBeVisible();
  await page.goto('/vault'); // a full reload locks the vault: keys live in memory only
  await expect(page.getByRole('link', { name: 'Create your vault' })).toBeVisible();

  // Unlock again and check everything decrypts
  await unlock(page);
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible();
  await expect(page.getByText('£182,000')).toBeVisible();
  await expect(page.getByText('£250,000')).toBeVisible();

  // LPAs: separate finance and health records, each with its own documents
  await page.getByRole('link', { name: /Property and financial affairs/ }).click();
  const fin = page.locator('section#finance');
  await fin.getByRole('button', { name: 'Add details' }).click();
  await fin.locator('#lpa-finance-status').selectOption('registered');
  await fin.locator('#lpa-finance-opgReference').fill('7000-1234-5678');
  await fin.locator('#lpa-finance-attorneys').fill('Anita Shah\nPriya Morris');
  await fin.getByRole('button', { name: 'Save' }).click();
  await expect(fin.getByText('Registered', { exact: true })).toBeVisible();
  await fin.locator('input[type=file]').setInputFiles({ name: 'lpa-finance.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 FINANCE-DOC-MARKER LPA') });
  await expect(fin.getByText('lpa-finance.pdf', { exact: true })).toBeVisible();

  const health = page.locator('section#health');
  await health.getByRole('button', { name: 'Add details' }).click();
  await health.locator('#lpa-health-status').selectOption('in_progress');
  await health.locator('#lpa-health-lifeSustainingTreatment').selectOption('can_decide');
  await health.getByRole('button', { name: 'Save' }).click();
  await health.locator('input[type=file]').setInputFiles({ name: 'care-wishes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 HEALTH-DOC-MARKER') });
  await expect(health.getByText('care-wishes.pdf', { exact: true })).toBeVisible();

  // Documents are kept apart by scope
  await page.getByRole('button', { name: /Vault/ }).click();
  await page.getByRole('link', { name: /Documents/ }).click();
  await expect(page.getByRole('tab', { name: 'Finance (2)' })).toBeVisible();
  await page.getByRole('tab', { name: 'Health (1)' }).click();
  await expect(page.getByText('care-wishes.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('lpa-finance.pdf', { exact: true })).toHaveCount(0);

  // Opening a document decrypts it back to the original bytes
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Open' }).click();
  const file = await dl;
  const got = readFileSync(await file.path());
  expect(got.toString()).toBe('%PDF-1.4 HEALTH-DOC-MARKER');

  // Lock and check a wrong password is refused
  await page.getByRole('button', { name: 'Lock' }).click();
  await unlock(page, 'not the right password at all');
  await expect(page.getByRole('alert')).toContainText('wrong');

  // The server holds nothing readable
  const stored = allBytes(process.env.E2E_DATA_DIR!);
  for (const m of MARKERS) expect(stored.includes(Buffer.from(m)), `server data contains "${m}"`).toBe(false);

  expect(problems.filter((p) => !/401|Unauthorized/.test(p))).toEqual([]);
});
