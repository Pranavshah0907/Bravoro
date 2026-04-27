/**
 * screenshot-page.mjs
 * Logs into the app, forces a chosen theme via localStorage, navigates to any URL,
 * and screenshots full-page (and optionally above-fold).
 *
 * Usage:
 *   node screenshot-page.mjs <relativePath> [label] [--theme=light|dark|auto] [--mobile] [--no-fullpage]
 *
 * Examples:
 *   node screenshot-page.mjs /dashboard home-light --theme=light
 *   node screenshot-page.mjs /admin admin-light --theme=light
 *   node screenshot-page.mjs /dashboard home-light-mobile --theme=light --mobile
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const puppeteer = require('C:/Users/prana/AppData/Roaming/npm/node_modules/puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));
const relPath = positional[0] || '/dashboard';
const label = positional[1] || '';
const themeFlag = flags.find(f => f.startsWith('--theme=')) || '--theme=light';
const theme = themeFlag.split('=')[1];
const mobile = flags.includes('--mobile');
const fullPage = !flags.includes('--no-fullpage');

const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png'));
const nums = existing.map(f => parseInt(f.replace('screenshot-', '').replace(/[-\w]*\.png$/, ''))).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const filename = label ? `screenshot-${next}-${label}.png` : `screenshot-${next}.png`;
const outPath = path.join(outDir, filename);

const EMAIL = 'pranavshah0907@gmail.com';
const PASSWORD = 'Trial@123';
const BASE = 'http://localhost:8080';

const viewport = mobile
  ? { width: 390, height: 844, deviceScaleFactor: 2 }
  : { width: 1440, height: 900, deviceScaleFactor: 1 };

const browser = await puppeteer.launch({
  headless: true,
  executablePath: puppeteer.executablePath(),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport(viewport);

  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log(`[console.${t}]`, msg.text().slice(0, 200));
  });
  page.on('requestfailed', req => console.log('[reqfail]', req.url().slice(0, 100), req.failure()?.errorText));

  // Always start at base and authenticate first
  console.log(`[nav] going to ${BASE}/`);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log(`[nav] landed on ${page.url()}`);
  await page.evaluate((t) => {
    localStorage.setItem('bravoro-theme', t);
  }, theme);
  // Wait for React to mount substantial content
  await page.waitForFunction(
    () => document.body.innerHTML.length > 5000,
    { timeout: 30000 }
  ).catch(() => console.log('[warn] body did not exceed 5000 chars'));
  await new Promise(r => setTimeout(r, 2000));

  // Detect if there's a login button visible (means we're not authenticated)
  const debug = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return {
      btnCount: buttons.length,
      btnTexts: buttons.map(b => (b.textContent || '').trim().slice(0, 40)),
      hasEmail: !!document.querySelector('input[type="email"]'),
      bodyLen: document.body.innerHTML.length,
      bodyStart: document.body.innerHTML.slice(0, 200),
    };
  });
  console.log(`[debug] btnCount=${debug.btnCount}, btnTexts=${JSON.stringify(debug.btnTexts)}, hasEmail=${debug.hasEmail}, bodyLen=${debug.bodyLen}`);
  const needsLogin = debug.btnTexts.some(t => /login|sign in/i.test(t)) || debug.hasEmail;
  console.log(`[auth] needsLogin=${needsLogin}`);

  if (needsLogin) {
    console.log('[auth] login button detected, signing in');
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = await btn.evaluate(el => el.textContent?.trim() || '');
      if (text.toLowerCase().includes('login') || text.toLowerCase().includes('sign in')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));

    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.type('input[type="email"]', EMAIL, { delay: 30 });
    await page.type('input[type="password"]', PASSWORD, { delay: 30 });

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    else await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3500));
    console.log(`[auth] post-login URL: ${page.url()}`);
  } else {
    console.log('[auth] already authenticated');
  }

  // Re-set theme post-auth (useThemeSync may have pulled from profile)
  await page.evaluate((t) => {
    localStorage.setItem('bravoro-theme', t);
  }, theme);

  // Navigate to target
  console.log(`[nav] going to ${BASE}${relPath}`);
  await page.goto(`${BASE}${relPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log(`[nav] final URL: ${page.url()}`);

  // Force the html class to match desired theme so we don't risk a dark/auto bleed
  await page.evaluate((t) => {
    const html = document.documentElement;
    html.classList.remove('light', 'dark');
    if (t === 'dark') html.classList.add('dark');
    else if (t === 'light') html.classList.add('light');
    else {
      // auto
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.classList.add(prefersDark ? 'dark' : 'light');
    }
    localStorage.setItem('bravoro-theme', t);
  }, theme);
  await new Promise(r => setTimeout(r, 1200));

  await page.screenshot({ path: outPath, fullPage });
  console.log(`Screenshot saved: ${outPath}`);
} catch (err) {
  console.error('Screenshot failed:', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
