import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export async function exportEnrichmentPdf(
  searchId: string,
  results: { result_type?: string; contact_data: any[] }[],
  search: { company_name?: string | null; excel_file_name?: string | null } | null | undefined
): Promise<void> {
  const companyResults = results.filter(r => r.result_type !== 'missing_company');
  const allContacts = companyResults.flatMap(r => r.contact_data);
  if (allContacts.length === 0) return;

  // ── Colour palette — light/white theme ──────────────────────────────────
  const C = {
    white:      [255, 255, 255] as [number,number,number],
    pageBg:     [250, 251, 251] as [number,number,number],
    accent:     [0,  160, 125]  as [number,number,number],  // brand teal
    accentDark: [0,  110,  88]  as [number,number,number],
    accentPale: [220, 245, 240] as [number,number,number],
    headerBg:   [15,  60,  55]  as [number,number,number],  // deep teal header
    text:       [30,  40,  38]  as [number,number,number],  // near-black text
    textMid:    [80,  95,  92]  as [number,number,number],  // secondary text
    textLight:  [140,155,152]   as [number,number,number],  // muted text
    rowAlt:     [244,250,248]   as [number,number,number],  // very light teal tint
    border:     [210,230,226]   as [number,number,number],
    totalRow:   [230, 245, 240] as [number,number,number],
  };

  // Portrait A4
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const ML = 15; // margin left
  const MR = 15; // margin right
  const TW = PW - ML - MR; // table width = 180

  // ── Header band ─────────────────────────────────────────────────────────
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PW, 28, "F");
  // Accent left stripe
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, 5, 28, "F");

  // "BRAVORO" brand
  doc.setTextColor(...C.accent);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("BRAVORO", ML + 4, 13);

  // Report subtitle
  doc.setTextColor(200, 230, 226);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Enrichment Report", ML + 4, 21);

  // Company / search label (right-aligned)
  const label = search?.company_name
    ? search.company_name
    : search?.excel_file_name
      ? search.excel_file_name
      : `ID: ${searchId.slice(0, 8)}`;
  doc.setTextColor(160, 200, 195);
  doc.setFontSize(8);
  doc.text(label, PW - MR, 13, { align: "right" });
  doc.text(
    new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    PW - MR, 21, { align: "right" }
  );

  let cursorY = 36;

  // ── Section heading helper ────────────────────────────────────────────────
  const sectionHeading = (title: string, y: number) => {
    doc.setFillColor(...C.accentPale);
    doc.rect(ML, y - 4, TW, 7, "F");
    doc.setFillColor(...C.accent);
    doc.rect(ML, y - 4, 3, 7, "F");
    doc.setTextColor(...C.accentDark);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), ML + 6, y + 0.5);
  };

  // ── TABLE 1: Contacts ────────────────────────────────────────────────────
  sectionHeading("Contact Details", cursorY);
  cursorY += 5;

  // Cost-per-credit rates for per-contact cost calculation
  const CONTACT_COST_RATES: Record<string, number> = {
    cognism: 0.76,
    apollo:  0.01975,
    aleads:  0.00683,
    lusha:   0.087416,
  };

  const NO_COST_PROVIDERS: Record<string, string> = {
    master_database: "Master DB",
    client_database: "Client DB",
  };

  const contactRows = allContacts.map(c => {
    const name = [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || "—";
    const phones = [c.Phone_Number_1, c.Phone_Number_2].filter(p => p && String(p).trim());
    const phoneStr = phones.length ? phones.join("  ·  ") : "—";

    const searchBy = (c.People_Search_By || "—").trim();
    const enrichBy = (c.Provider || "—").trim();
    const providerLower = enrichBy.toLowerCase();

    let costLines: string;
    if (NO_COST_PROVIDERS[providerLower]) {
      costLines = [
        `Search: ${searchBy}`,
        `Source: ${NO_COST_PROVIDERS[providerLower]}`,
        `Cost: € 0.00`,
      ].join("\n");
    } else {
      const cognismCr = Number(c.CognismCreditsUsed) || 0;
      const lushaCr   = Number(c.lushaCreditsUsed) || 0;
      const aleadsCr  = Number(c.aLeadscreditsUsed) || 0;
      const apolloCr  = Number(c.apolloCreditsUsed) || 0;
      const contactCost =
        cognismCr * CONTACT_COST_RATES.cognism +
        lushaCr   * CONTACT_COST_RATES.lusha +
        aleadsCr  * CONTACT_COST_RATES.aleads +
        apolloCr  * CONTACT_COST_RATES.apollo;

      costLines = [
        `Search: ${searchBy}`,
        `Enrich: ${enrichBy}`,
        `Cost: € ${contactCost.toFixed(2)}`,
      ].join("\n");
    }

    return [name, c.Organization || "—", c.Title || "—", phoneStr, costLines];
  });

  autoTable(doc, {
    startY: cursorY,
    head: [["Name", "Organisation", "Title", "Phone", "Cost"]],
    body: contactRows,
    margin: { left: ML, right: MR },
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: C.text,
      lineColor: C.border,
      lineWidth: 0.15,
      fillColor: C.white,
      font: "helvetica",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: C.headerBg,
      textColor: [200, 230, 226] as [number,number,number],
      fontStyle: "bold",
      fontSize: 7.5,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 32 },
      2: { cellWidth: 42 },
      3: { cellWidth: 38 },
      4: { cellWidth: 38 },
    },
  });

  // ── Provider statistics — only count contacts where a phone was found ──────
  const providerMap: Record<string, number> = {};
  allContacts.forEach(c => {
    const hasPhone = [c.Phone_Number_1, c.Phone_Number_2].some(p => p && String(p).trim());
    if (!hasPhone) return;
    const provider = (c.Provider || "Unknown").trim();
    providerMap[provider] = (providerMap[provider] || 0) + 1;
  });
  const total = Object.values(providerMap).reduce((a, b) => a + b, 0);
  const providerEntries = Object.entries(providerMap).sort((a, b) => b[1] - a[1]);

  const tableEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
  const statsBlockH = 10 + (providerEntries.length + 1) * 8 + 14 + providerEntries.length * 9 + 10;
  if (tableEndY + statsBlockH + 10 > PH - 14) {
    doc.addPage();
    cursorY = 20;
  } else {
    cursorY = tableEndY + 10;
  }

  // ── TABLE 2: Provider Summary ─────────────────────────────────────────────
  sectionHeading("Provider Summary", cursorY);
  cursorY += 5;

  const statsRows = providerEntries.map(([prov, count]) => [
    prov,
    String(count),
    `${((count / total) * 100).toFixed(1)}%`,
  ]);
  statsRows.push(["Total", String(total), "100%"]);

  autoTable(doc, {
    startY: cursorY,
    head: [["Provider", "Contacts Found", "Share"]],
    body: statsRows,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: {
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      textColor: C.text,
      lineColor: C.border,
      lineWidth: 0.15,
      fillColor: C.white,
    },
    headStyles: {
      fillColor: C.headerBg,
      textColor: [200, 230, 226] as [number,number,number],
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: C.rowAlt },
    didParseCell: (data) => {
      if (data.row.index === statsRows.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = C.accentDark;
        data.cell.styles.fillColor = C.totalRow;
      }
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 50, halign: "center" },
      2: { cellWidth: 36, halign: "center" },
    },
  });

  // ── Pie chart: "Provider Breakdown" ──────────────────────────────────────
  const statsEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
  cursorY = statsEndY + 10;

  // Section mini-label
  doc.setTextColor(...C.accentDark);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("PROVIDER BREAKDOWN", ML, cursorY);
  cursorY += 5;

  const pieColors: [number,number,number][] = [
    [0,  160, 125],
    [230, 90,  60],
    [60, 130, 200],
    [200,160,  30],
    [140, 80, 200],
    [40, 190, 155],
  ];

  // Helper: draw a filled pie slice using raw PDF path commands
  const sf = doc.internal.scaleFactor;
  const pageH = doc.internal.pageSize.getHeight();
  const drawPieSlice = (cx: number, cy: number, r: number, startAng: number, endAng: number, color: [number,number,number]) => {
    if (Math.abs(endAng - startAng) < 0.0001) return;
    doc.setFillColor(...color);
    const steps = 48;
    const toX = (x: number) => (x * sf).toFixed(3);
    const toY = (y: number) => ((pageH - y) * sf).toFixed(3);
    const parts: string[] = [];
    parts.push(`${toX(cx)} ${toY(cy)} m`);
    for (let s = 0; s <= steps; s++) {
      const a = startAng + (endAng - startAng) * s / steps;
      parts.push(`${toX(cx + r * Math.cos(a))} ${toY(cy + r * Math.sin(a))} l`);
    }
    parts.push(`${toX(cx)} ${toY(cy)} l f`);
    (doc.internal as any).out(parts.join(" "));
  };

  // Pie layout constants — smaller chart, legend beside it
  const r   = 16;              // radius mm (compact)
  const cx  = ML + r + 4;     // centre x — snug to left margin
  const chartTopY = cursorY;
  const cy  = chartTopY + r;  // centre y

  // Draw slices
  let angle = -Math.PI / 2;   // start from 12-o'clock
  providerEntries.forEach(([, count], i) => {
    const sweep = (count / total) * 2 * Math.PI;
    const color = pieColors[i % pieColors.length];
    drawPieSlice(cx, cy, r, angle, angle + sweep - 0.03, color);
    angle += sweep;
  });

  // Outer white ring for clean slice edges
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, r, "S");

  // Donut hole
  doc.setFillColor(...C.white);
  doc.circle(cx, cy, r * 0.44, "F");
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  doc.circle(cx, cy, r * 0.44, "S");

  // ── Legend — vertically centred beside the chart ──────────────────────────
  const legendX      = cx + r + 10;         // starts just right of the pie
  const rowH         = 7;                    // mm per legend row
  const legendH      = providerEntries.length * rowH;
  const legendStartY = cy - legendH / 2 + rowH * 0.5; // vertically centred

  // Right-aligned % column: fixed from legendX
  const pctX = ML + TW;                     // flush to right margin

  providerEntries.forEach(([prov, count], i) => {
    const pct   = ((count / total) * 100).toFixed(1);
    const ly    = legendStartY + i * rowH;
    const color = pieColors[i % pieColors.length];

    // Colour swatch — circle dot style
    doc.setFillColor(...color);
    doc.circle(legendX + 1.8, ly - 1.5, 2.2, "F");

    // Provider name
    doc.setTextColor(...C.text);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(prov, legendX + 7, ly);

    // Percentage right-aligned
    doc.setTextColor(...C.textMid);
    doc.setFont("helvetica", "bold");
    doc.text(`${pct}%`, pctX, ly, { align: "right" });

    // Thin dotted leader line between name and %
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    const nameEndX = legendX + 7 + doc.getStringUnitWidth(prov) * 8.5 / doc.internal.scaleFactor / (72 / 25.4) + 2;
    doc.setLineDashPattern([0.8, 1.2], 0);
    doc.line(nameEndX, ly - 1, pctX - doc.getStringUnitWidth(`${pct}%`) * 8.5 / doc.internal.scaleFactor / (72 / 25.4) - 3, ly - 1);
    doc.setLineDashPattern([], 0);
  });

  // ── TABLE 3: Cost Breakdown ────────────────────────────────────────────
  const COST_PER_CREDIT: Record<string, number> = {
    cognism:    0.76,
    apollo:     0.01975,
    aleads:     0.00683,
    lusha:      0.087416,
    theirstack: 0.0326,
  };

  const PLATFORM_LABELS: Record<string, string> = {
    cognism:    "Cognism",
    apollo:     "Apollo",
    aleads:     "A-Leads",
    lusha:      "Lusha",
    theirstack: "Theirstack",
  };

  // Fetch credit usage for this search
  const { data: creditRow } = await supabase
    .from("credit_usage")
    .select("cognism_credits, apollo_credits, aleads_credits, lusha_credits, theirstack_credits, mobile_phone_credits, direct_phone_credits, email_only_credits, jobs_credits, grand_total_credits")
    .eq("search_id", searchId)
    .maybeSingle();

  if (creditRow) {
    const creditFields: { key: string; dbField: keyof typeof creditRow }[] = [
      { key: "cognism",    dbField: "cognism_credits" },
      { key: "apollo",     dbField: "apollo_credits" },
      { key: "aleads",     dbField: "aleads_credits" },
      { key: "lusha",      dbField: "lusha_credits" },
      { key: "theirstack", dbField: "theirstack_credits" },
    ];

    const costRows: string[][] = [];
    let grandTotal = 0;

    creditFields.forEach(({ key, dbField }) => {
      const credits = Number(creditRow[dbField]) || 0;
      if (credits <= 0) return;
      const rate = COST_PER_CREDIT[key];
      const lineCost = credits * rate;
      grandTotal += lineCost;
      costRows.push([
        PLATFORM_LABELS[key],
        String(credits),
        `€ ${rate.toFixed(4)}`,
        `€ ${lineCost.toFixed(2)}`,
      ]);
    });

    if (costRows.length > 0) {
      // Add grand total row
      costRows.push(["Total", "", "", `€ ${grandTotal.toFixed(2)}`]);

      // Page-break check
      const pieBottomY = cy + r + 6;
      const costBlockH = 12 + costRows.length * 8 + 10;
      if (pieBottomY + costBlockH + 14 > PH - 14) {
        doc.addPage();
        cursorY = 20;
      } else {
        cursorY = pieBottomY + 6;
      }

      sectionHeading("Cost Breakdown", cursorY);
      cursorY += 5;

      autoTable(doc, {
        startY: cursorY,
        head: [["Platform", "Credits Used", "Cost / Credit", "Total Cost"]],
        body: costRows,
        margin: { left: ML, right: MR },
        tableWidth: TW,
        styles: {
          fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          textColor: C.text,
          lineColor: C.border,
          lineWidth: 0.15,
          fillColor: C.white,
        },
        headStyles: {
          fillColor: C.headerBg,
          textColor: [200, 230, 226] as [number, number, number],
          fontStyle: "bold",
          fontSize: 8,
          lineWidth: 0,
        },
        alternateRowStyles: { fillColor: C.rowAlt },
        didParseCell: (data) => {
          if (data.row.index === costRows.length - 1 && data.section === "body") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = C.accentDark;
            data.cell.styles.fillColor = C.totalRow;
          }
        },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 36, halign: "center" },
          2: { cellWidth: 36, halign: "center" },
          3: { cellWidth: 36, halign: "right" },
        },
      });
    }
  }

  // ── TABLE 4: Client Revenue (contact-type credits) ─────────────────────
  if (creditRow) {
    const CREDIT_RATE = 0.19;
    const CREDIT_TYPE_LABELS: { dbField: string; label: string; multiplier: string }[] = [
      { dbField: "mobile_phone_credits",  label: "Mobile Phone",  multiplier: "×4" },
      { dbField: "direct_phone_credits",  label: "Direct Phone",  multiplier: "×3" },
      { dbField: "email_only_credits",    label: "Email / LinkedIn", multiplier: "×2" },
      { dbField: "jobs_credits",          label: "Jobs",          multiplier: "×1" },
    ];

    const revenueRows: string[][] = [];
    let totalCredits = 0;

    CREDIT_TYPE_LABELS.forEach(({ dbField, label, multiplier }) => {
      const credits = Number((creditRow as Record<string, unknown>)[dbField]) || 0;
      if (credits <= 0) return;
      const lineCost = credits * CREDIT_RATE;
      totalCredits += credits;
      revenueRows.push([
        `${label}  ${multiplier}`,
        String(credits),
        `€ ${CREDIT_RATE.toFixed(2)}`,
        `€ ${lineCost.toFixed(2)}`,
      ]);
    });

    if (revenueRows.length > 0) {
      const totalRevenue = totalCredits * CREDIT_RATE;
      revenueRows.push(["Total", String(totalCredits), "", `€ ${totalRevenue.toFixed(2)}`]);

      const prevTableEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
      const revenueBlockH = 12 + revenueRows.length * 8 + 10;
      if (prevTableEndY + revenueBlockH + 14 > PH - 14) {
        doc.addPage();
        cursorY = 20;
      } else {
        cursorY = prevTableEndY + 10;
      }

      sectionHeading("Client Revenue", cursorY);
      cursorY += 5;

      autoTable(doc, {
        startY: cursorY,
        head: [["Contact Type", "Credits", "Rate / Credit", "Revenue"]],
        body: revenueRows,
        margin: { left: ML, right: MR },
        tableWidth: TW,
        styles: {
          fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          textColor: C.text,
          lineColor: C.border,
          lineWidth: 0.15,
          fillColor: C.white,
        },
        headStyles: {
          fillColor: C.headerBg,
          textColor: [200, 230, 226] as [number, number, number],
          fontStyle: "bold",
          fontSize: 8,
          lineWidth: 0,
        },
        alternateRowStyles: { fillColor: C.rowAlt },
        didParseCell: (data) => {
          if (data.row.index === revenueRows.length - 1 && data.section === "body") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = C.accentDark;
            data.cell.styles.fillColor = C.totalRow;
          }
        },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 36, halign: "center" },
          2: { cellWidth: 36, halign: "center" },
          3: { cellWidth: 36, halign: "right" },
        },
      });
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Thin teal rule above footer
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.4);
    doc.line(ML, PH - 10, PW - MR, PH - 10);
    doc.setTextColor(...C.textLight);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text("Bravoro · Confidential", ML, PH - 5);
    doc.text(`Page ${i} of ${totalPages}`, PW - MR, PH - 5, { align: "right" });
  }

  const baseName = search?.excel_file_name
    ? search.excel_file_name.replace(/\.[^/.]+$/, "")
    : search?.company_name
      ? search.company_name.replace(/\s+/g, "_")
      : searchId.slice(0, 8);
  const filename = `${baseName}_UsageAnalytics.pdf`;
  doc.save(filename);
}
