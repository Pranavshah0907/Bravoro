/**
 * screenshot-dashboard.mjs
 * Logs into the app, navigates to the dashboard, takes a screenshot.
 * Usage: node screenshot-dashboard.mjs [label]
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

const label = process.argv[2] || '';
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png'));
const nums = existing.map(f => parseInt(f.replace('screenshot-', '').replace(/[-\w]*\.png$/, ''))).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const filename = label ? `screenshot-${next}-${label}.png` : `screenshot-${next}.png`;
const outPath = path.join(outDir, filename);

const EMAIL = 'pranavshah0907@gmail.com';
const PASSWORD = 'Trial@123';
const BASE = 'http://localhost:8080';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: puppeteer.executablePath(),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Go to landing/auth page
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));

// Click "Login to Platform" button to reveal the login form
const allButtons = await page.$$('button');
for (const btn of allButtons) {
  const text = await btn.evaluate(el => el.textContent?.trim() || '');
  if (text.toLowerCase().includes('login') || text.toLowerCase().includes('sign in')) {
    await btn.click();
    break;
  }
}
await new Promise(r => setTimeout(r, 1500));

// Fill login form
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.type('input[type="email"]', EMAIL, { delay: 40 });
await page.type('input[type="password"]', PASSWORD, { delay: 40 });

// Submit
const submitBtn = await page.$('button[type="submit"]');
if (submitBtn) await submitBtn.click();
else await page.keyboard.press('Enter');

// Wait for redirect to dashboard
await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2500));

// Click "Single Search" card to go to tiles+form view
// Cards on home view are divs (SpotlightCard), not buttons
await page.evaluate(() => {
  const allEls = document.querySelectorAll('*');
  for (const el of allEls) {
    if (el.childElementCount === 0 && el.textContent?.trim() === 'Single Search') {
      // Walk up to find the clickable ancestor
      let target = el;
      while (target && target !== document.body) {
        if (target.getAttribute('onclick') || target.onclick ||
            (target.getAttribute('class') || '').includes('cursor-pointer') ||
            target.tagName === 'BUTTON') {
          target.click();
          return;
        }
        target = target.parentElement;
      }
      el.click();
      return;
    }
  }
});
await new Promise(r => setTimeout(r, 1500));

await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log(`Screenshot saved: ${outPath}`);
