/**
 * screenshot-batch.mjs
 * Logs in once, then visits a list of pages in sequence, screenshotting each.
 * Reuses one browser session to amortize login cost.
 *
 * Usage: node screenshot-batch.mjs <theme> <prefix> [--mobile]
 *   theme:  light | dark | auto
 *   prefix: screenshot label prefix
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
const theme = args[0] || 'light';
const prefix = args[1] || 'page';
const mobile = args.includes('--mobile');

const PAGES = [
  ['/dashboard', 'dashboard-home'],
  ['/dashboard?tab=manual', 'dashboard-manual'],
  ['/dashboard?tab=bulk', 'dashboard-bulk'],
  ['/dashboard?tab=people_enrichment', 'dashboard-people'],
  ['/dashboard?tab=ai_staffing', 'dashboard-ai-staffing'],
  ['/dashboard?tab=recruiting_chat', 'dashboard-recruiting'],
  ['/results', 'results'],
  ['/admin', 'admin'],
  ['/analytics', 'analytics'],
  ['/database', 'database'],
  ['/dev-tools', 'dev-tools'],
  ['/settings', 'settings'],
  ['/docs/overview', 'docs-overview'],
  ['/docs/single-search', 'docs-single-search'],
  ['/docs/bulk-search', 'docs-bulk-search'],
  ['/google-sheets-guide', 'sheets-guide'],
];

const EMAIL = 'pranavshah0907@gmail.com';
const PASSWORD = 'Trial@123';
const BASE = 'http://localhost:8080';

const viewport = mobile
  ? { width: 390, height: 844, deviceScaleFactor: 2 }
  : { width: 1440, height: 900, deviceScaleFactor: 1 };

function nextNum() {
  const existing = fs.readdirSync(outDir).filter(f => /^screenshot-\d+/.test(f));
  const nums = existing.map(f => {
    const m = f.match(/^screenshot-(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }).filter(n => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: puppeteer.executablePath(),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));

  // ── Login once
  console.log(`[batch] logging in (theme=${theme}, viewport=${viewport.width}x${viewport.height})`);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate((t) => localStorage.setItem('bravoro-theme', t), theme);
  await page.waitForFunction(() => document.body.innerHTML.length > 5000, { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

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
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate((t) => localStorage.setItem('bravoro-theme', t), theme);
  console.log(`[batch] logged in, post-login URL: ${page.url()}`);

  // ── Iterate
  for (const [relPath, slug] of PAGES) {
    try {
      console.log(`[batch] → ${relPath}`);
      await page.goto(`${BASE}${relPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // First wait for useThemeSync to finish pulling from Supabase (otherwise
      // it overrides our forced class), then force class right before screenshot.
      await new Promise(r => setTimeout(r, 3500));
      await page.evaluate((t) => {
        const html = document.documentElement;
        html.classList.remove('light', 'dark');
        if (t === 'dark') html.classList.add('dark');
        else if (t === 'light') html.classList.add('light');
        else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          html.classList.add(prefersDark ? 'dark' : 'light');
        }
        localStorage.setItem('bravoro-theme', t);
      }, theme);
      // Brief settle so any class-driven CSS transitions complete
      await new Promise(r => setTimeout(r, 600));

      const num = nextNum();
      const suffix = mobile ? '-mobile' : '';
      const filename = `screenshot-${num}-${prefix}-${slug}${suffix}.png`;
      const outPath = path.join(outDir, filename);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`[batch] ✓ ${filename}`);
    } catch (e) {
      console.log(`[batch] ✗ ${relPath}: ${e.message.slice(0, 100)}`);
    }
  }
} finally {
  await browser.close();
}
