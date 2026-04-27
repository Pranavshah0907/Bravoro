/**
 * Batch converter for the dashboard form components.
 * Maps the dark-teal-first hardcoded palette to semantic tokens.
 *
 * Run: node scripts/convert-form-tokens.mjs
 */
import fs from 'fs';

// Pattern → replacement (literal string match, applied in order)
// Order matters: longer/more-specific entries first.
const REPLACEMENTS = [
  // ── Backgrounds: dark teal panels → semantic ────────────────────────────
  ['bg-[#060c0c]', 'bg-card'],
  ['bg-[#060e0e]', 'bg-card'],
  ['bg-[#080f0f]', 'bg-card'],
  ['bg-[#091616]', 'bg-card'],
  ['bg-[#0a1818]', 'bg-muted/40'],
  ['bg-[#0c1d1d]', 'bg-card'],
  ['bg-[#0d2020]', 'bg-muted'],
  ['bg-[#1a3535]', 'bg-muted'],
  ['bg-[#1e3d3d]', 'bg-muted/60'],
  ['bg-[#1e4040]', 'bg-muted'],
  ['bg-[#254848]', 'bg-muted'],

  ['hover:bg-[#0c1d1d]', 'hover:bg-card'],
  ['hover:bg-[#1a3535]', 'hover:bg-muted'],
  ['hover:bg-[#1e4040]', 'hover:bg-muted'],
  ['hover:bg-[#254848]', 'hover:bg-muted/80'],
  ['hover:bg-[#2e5252]', 'hover:bg-muted/80'],
  ['hover:bg-[#2e5555]', 'hover:bg-muted/80'],
  ['hover:bg-[#2e5c5c]', 'hover:bg-muted/80'],

  // ── Borders: dark teal → semantic ────────────────────────────────────────
  ['border-[#1a3535]', 'border-border'],
  ['border-[#1e3d3d]', 'border-border'],
  ['border-[#1e4040]', 'border-border'],
  ['border-[#254848]', 'border-border'],
  ['border-[#2e5252]', 'border-border'],
  ['border-[#2e5555]', 'border-border'],
  ['border-[#2e5c5c]', 'border-border'],
  ['border-[#3a6060]', 'border-border'],
  ['border-[#3d6060]', 'border-border'],
  ['border-[#3d6464]', 'border-border'],
  ['border-[#3d6868]', 'border-border'],

  ['hover:border-[#2e5252]', 'hover:border-accent/30'],
  ['hover:border-[#2e5555]', 'hover:border-accent/30'],
  ['hover:border-[#2e5c5c]', 'hover:border-accent/30'],
  ['hover:border-[#3a6060]', 'hover:border-accent/40'],
  ['hover:border-[#3d6060]', 'hover:border-accent/40'],
  ['hover:border-[#3d6464]', 'hover:border-accent/40'],
  ['focus:border-[#3d6464]', 'focus:border-accent/50'],
  ['focus:border-[#3d6868]', 'focus:border-accent/50'],
  ['focus-within:border-[#3d6868]', 'focus-within:border-accent/50'],

  // ── Text: muted teal → semantic ─────────────────────────────────────────
  ['text-[#3d7070]', 'text-muted-foreground'],
  ['text-[#3d8080]', 'text-muted-foreground'],
  ['text-[#4d8080]', 'text-muted-foreground'],
  ['text-[#5a9090]', 'text-muted-foreground'],
  ['text-[#5a9898]', 'text-muted-foreground'],
  ['text-[#5e9898]', 'text-muted-foreground'],
  ['text-[#6aacac]', 'text-muted-foreground'],
  ['text-[#7ab8b8]', 'text-muted-foreground'],
  ['text-[#7ababa]', 'text-muted-foreground'],
  ['text-[#88c0c0]', 'text-foreground/70'],
  ['text-[#8ac8c8]', 'text-foreground/80'],
  ['text-[#9dd4d4]', 'text-foreground/85'],
  ['text-[#a8e0e0]', 'text-foreground/90'],
  ['text-[#b0d8d8]', 'text-foreground/85'],

  ['hover:text-[#3d8080]', 'hover:text-foreground'],
  ['hover:text-[#5a9090]', 'hover:text-foreground'],
  ['hover:text-[#5a9898]', 'hover:text-foreground'],
  ['hover:text-[#6aacac]', 'hover:text-foreground'],
  ['hover:text-[#7ab8b8]', 'hover:text-foreground'],
  ['hover:text-[#7ababa]', 'hover:text-foreground'],
  ['hover:text-[#88c0c0]', 'hover:text-foreground'],
  ['hover:text-[#9dd4d4]', 'hover:text-foreground'],

  // ── Brand teal — keep as accent/primary ──────────────────────────────────
  ['text-[#009da5]', 'text-primary'],
  ['text-[#00b2ba]', 'text-accent'],
  ['text-[#00c8d2]', 'text-accent'],
  ['text-[#58dddd]', 'text-accent'],
  ['text-[#70e8e8]', 'text-accent'],
  ['hover:text-[#00b2ba]', 'hover:text-accent'],
  ['hover:text-[#58dddd]', 'hover:text-accent'],
  ['hover:text-[#70e8e8]', 'hover:text-accent'],

  ['bg-[#009da5]', 'bg-primary'],
  ['bg-[#00b2ba]', 'bg-accent'],
  ['bg-[#58dddd]', 'bg-accent'],
  ['hover:bg-[#00b2ba]', 'hover:bg-accent'],
  ['hover:bg-[#58dddd]', 'hover:bg-accent'],
  ['border-[#009da5]', 'border-primary'],
  ['border-[#58dddd]', 'border-accent'],
  ['from-[#009da5]', 'from-primary'],
  ['to-[#009da5]', 'to-primary'],
  ['from-[#58dddd]', 'from-accent'],
  ['to-[#58dddd]', 'to-accent'],
  ['from-[#00b2ba]', 'from-accent'],
  ['to-[#00b2ba]', 'to-accent'],

  // ── Purple AI/recruiting accents — keep purple as visual marker ─────────
  // These don't need semantic conversion — they're domain-specific badges.
  // (Leaving in place; they'll render fine on cream too.)
];

const targets = [
  'src/components/ManualForm.tsx',
  'src/components/ExcelUpload.tsx',
  'src/components/BulkPeopleEnrichment.tsx',
  'src/components/SpreadsheetGrid.tsx',
  'src/components/SheetsManager.tsx',
  'src/components/PESheetsManager.tsx',
  'src/components/PeopleEnrichmentGrid.tsx',
  'src/components/CompanyBrowserDialog.tsx',
  'src/components/MasterDatabaseTab.tsx',
  'src/components/WorkspaceSearches.tsx',
  'src/components/ProcessingStatus.tsx',
];

let totalChanges = 0;
let totalFiles = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.log(`(skip) ${file} not found`);
    continue;
  }
  let src = fs.readFileSync(file, 'utf8');
  let changes = 0;
  for (const [from, to] of REPLACEMENTS) {
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
    totalFiles++;
  } else {
    console.log(`  ${file}: no matches`);
  }
}
console.log(`\nTotal: ${totalChanges} replacements across ${totalFiles} files`);
