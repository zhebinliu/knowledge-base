const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://kb.liii.in';
const OUT = path.join(__dirname, '..', 'screenshots');

const pages = [
  { name: 'login',       path: '/login',       auth: false },
  { name: 'dashboard',   path: '/',             auth: true },
  { name: 'projects',    path: '/projects',     auth: true },
  { name: 'documents',   path: '/documents',    auth: true },
  { name: 'chunks',      path: '/chunks',       auth: true },
  { name: 'qa',          path: '/qa',           auth: true },
  { name: 'challenge',   path: '/challenge',    auth: true },
  { name: 'settings',    path: '/settings',     auth: true },
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Login
  console.log('Logging in...');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"], input[placeholder*="用户"]', 'admin');
  await page.fill('input[type="password"]', 'ChangeMe123!');
  await page.screenshot({ path: path.join(OUT, 'login.png') });
  console.log('  login.png');

  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForURL(/\/(?!login)/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // If forced to change password, skip
  if (page.url().includes('change-password')) {
    console.log('  Skipping change-password page');
    // Just screenshot it
    await page.screenshot({ path: path.join(OUT, 'change-password.png') });
    console.log('  change-password.png');
  }

  // Screenshot each authenticated page
  for (const p of pages) {
    if (!p.auth) continue;
    try {
      console.log(`Navigating to ${p.path}...`);
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, p.name + '.png') });
      console.log(`  ${p.name}.png`);
    } catch (e) {
      console.log(`  FAILED ${p.name}: ${e.message}`);
    }
  }

  // Documents - click on a document to show chunks drawer
  try {
    console.log('Opening document drawer...');
    await page.goto(BASE + '/documents', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    // Click on first document row "查看" button
    const viewBtn = page.locator('button:has-text("查看"), button:has-text("切片")').first();
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, 'documents-drawer.png') });
      console.log('  documents-drawer.png');
    }
  } catch (e) {
    console.log('  FAILED documents-drawer:', e.message);
  }

  // Chunks page - expand a chunk
  try {
    console.log('Expanding a chunk...');
    await page.goto(BASE + '/chunks', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    const chunkCard = page.locator('.bg-white.border').first();
    if (await chunkCard.isVisible()) {
      await chunkCard.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, 'chunks-expanded.png') });
      console.log('  chunks-expanded.png');
    }
  } catch (e) {
    console.log('  FAILED chunks-expanded:', e.message);
  }

  await browser.close();
  console.log('Done!');
})();
