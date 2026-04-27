/**
 * One-shot batch converter — replace hardcoded dark-mode hex colors
 * across docs components/content with semantic Tailwind tokens.
 *
 * Run: node scripts/convert-docs-tokens.mjs
 */
import fs from 'fs';
import path from 'path';

// Mapping from hardcoded class to semantic token
const REPLACEMENTS = [
  // Surfaces — dark teal panels become semantic cards/muted
  ['bg-[#0d1f1f]', 'bg-muted/40'],
  ['bg-[#0f2424]', 'bg-card'],
  ['bg-[#122c2c]', 'bg-muted'],
  ['hover:bg-[#122c2c]', 'hover:bg-muted/70'],
  ['bg-[#1a3535]', 'bg-muted'],
  ['hover:bg-[#1a3535]', 'hover:bg-muted'],

  // Borders — dark teal borders → semantic
  ['border-[#1e4040]', 'border-border'],
  ['border-[#224040]', 'border-border'],
  ['border-[#2a4a4a]', 'border-border'],
  ['border-t-[#1e4040]', 'border-t-border'],
  ['border-b-[#1e4040]', 'border-b-border'],

  // Text — gray scale → semantic
  ['text-[#6b7280]', 'text-muted-foreground'],
  ['text-[#9ca3af]', 'text-muted-foreground'],
  ['hover:text-[#9ca3af]', 'hover:text-muted-foreground'],
  ['text-[#b0b8c0]', 'text-foreground/80'],
  ['text-[#d1d5db]', 'text-foreground'],
  ['hover:text-[#d1d5db]', 'hover:text-foreground'],
  ['text-[#e5e7eb]', 'text-foreground'],
  ['text-[#f3f4f6]', 'text-foreground'],

  // Emerald accents — dark mode bright cyan-green; in light it's too neon.
  // Use accent token (mid-teal in light, bright cyan in dark).
  ['text-emerald-300', 'text-accent'],
  ['text-emerald-400', 'text-accent'],
  ['text-emerald-300/80', 'text-accent/80'],
  ['text-emerald-300/60', 'text-accent/60'],
  ['border-emerald-500/40', 'border-accent/40'],
  ['hover:border-emerald-500/40', 'hover:border-accent/40'],
  ['bg-emerald-500/10', 'bg-accent/10'],
  ['hover:bg-emerald-500/10', 'hover:bg-accent/10'],
  ['bg-emerald-500/5', 'bg-accent/5'],
  ['ring-emerald-500/30', 'ring-accent/30'],
];

const targets = [
  ...fs.readdirSync('src/components/docs').map(f => path.join('src/components/docs', f)),
  ...fs.readdirSync('src/data/docs').map(f => path.join('src/data/docs', f)),
].filter(p => p.endsWith('.tsx'));

let totalChanges = 0;
for (const file of targets) {
  let src = fs.readFileSync(file, 'utf8');
  let changes = 0;
  for (const [from, to] of REPLACEMENTS) {
    // Use a literal string replacement to avoid regex pitfalls with []
    let next;
    while ((next = src.replace(from, to)) !== src) {
      src = next;
      changes++;
    }
  }
  if (changes > 0) {
    fs.writeFileSync(file, src);
    console.log(`✓ ${file}: ${changes} replacements`);
    totalChanges += changes;
  }
}
console.log(`\nTotal: ${totalChanges} replacements across ${targets.length} files`);
