const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'https://kb.liii.in';
const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Debug login
  console.log('Navigating to login...');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // List all interactive elements
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    const type = await btn.getAttribute('type');
    console.log(`  button: text="${text?.trim()}" type=${type}`);
  }

  // Fill and submit
  await page.locator('input').first().fill('admin');
  await page.locator('input[type="password"]').first().fill('Welcome123');

  // Listen for network responses
  page.on('response', resp => {
    if (resp.url().includes('/api/auth/login')) {
      console.log(`  LOGIN RESPONSE: ${resp.status()}`);
      resp.body().then(b => console.log(`  BODY: ${b.toString().substring(0, 200)}`)).catch(() => {});
    }
  });

  // Click the login button
  const loginBtn = page.locator('button:has-text("登录"), button:has-text("Sign"), button:has-text("Login")').first();
  console.log('  Login button found:', await loginBtn.count());
  await loginBtn.click();
  await page.waitForTimeout(5000);
  console.log('  URL after login:', page.url());

  // If still on login, try direct API call to check
  if (page.url().includes('/login')) {
    console.log('  Login via UI failed, trying API...');
    const resp = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'Welcome123' }),
        });
        return { status: r.status, body: await r.text() };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('  API login:', JSON.stringify(resp));

    if (resp.status === 200) {
      // Parse token and set it
      const data = JSON.parse(resp.body);
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
      }, data.access_token || data.token);
      console.log('  Token set via API');

      // Navigate to dashboard
      await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
      console.log('  Dashboard URL:', page.url());
    }
  }

  // Save login screenshot
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'login.png') });
  console.log('  Saved login.png');

  // Go to dashboard
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'dashboard.png') });
  console.log('  Saved dashboard.png');

  // Screenshot each page
  const pages = [
    { name: 'projects', path: '/projects' },
    { name: 'documents', path: '/documents' },
    { name: 'chunks', path: '/chunks' },
    { name: 'qa', path: '/qa' },
    { name: 'challenge', path: '/challenge' },
    { name: 'settings', path: '/settings' },
  ];

  for (const p of pages) {
    try {
      console.log(`Screenshotting ${p.name}...`);
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);

      if (page.url().includes('/login')) {
        console.log(`  Redirected to login, re-injecting token...`);
        // Re-inject token
        const loginResp = await page.evaluate(async () => {
          const r = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'Welcome123' }),
          });
          const data = await r.json();
          localStorage.setItem('token', data.access_token || data.token);
          return r.status;
        });
        console.log(`  Re-login status: ${loginResp}`);
        await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);
      }

      await page.screenshot({ path: path.join(OUT, p.name + '.png') });
      console.log(`  Saved ${p.name}.png`);
    } catch (e) {
      console.log(`  FAILED: ${e.message}`);
    }
  }

  await browser.close();
  console.log('Done!');
})();
