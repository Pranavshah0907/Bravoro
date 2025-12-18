import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const GoogleSheetsGuide = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center px-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <div className="container max-w-4xl py-10 px-4 md:px-8">
        {/* Title Section */}
        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            User Guide: Data Enrichment & Selection Tool
          </h1>
          <p className="text-lg text-muted-foreground">
            Complete documentation for using the Enrichment Master Sheet
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="mb-12 p-6 rounded-xl border border-border bg-card/50">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">On this page</h2>
          <ul className="space-y-2">
            {[
              { id: "introduction", label: "Introduction" },
              { id: "requirements", label: "Data Requirements" },
              { id: "interface", label: "Interface Overview" },
              { id: "workflow", label: "Step-by-Step Workflow" },
              { id: "rules", label: "Important Usage Rules" },
              { id: "troubleshooting", label: "Troubleshooting" },
            ].map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content Sections */}
        <div className="space-y-12">
          {/* Introduction */}
          <section id="introduction" className="scroll-mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              1. Introduction
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              This document serves as a tutorial for using the <strong className="text-foreground">Enrichment Master Sheet</strong>. 
              This tool is designed to facilitate the bulk enrichment of company data. It utilizes a "Mirror Database" system 
              to allow for <strong className="text-foreground">multi-selection</strong> of Job Titles and Seniorities without 
              the need for complex scripts or pop-up windows that trigger security warnings.
            </p>
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Key Concept</p>
                  <p className="text-muted-foreground text-sm">
                    Each row in this spreadsheet represents <strong className="text-foreground">one unique company entry</strong>.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Data Requirements */}
          <section id="requirements" className="scroll-mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              2. Data Requirements (Compulsory Fields)
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For the enrichment process to be successful, the following columns are <strong className="text-foreground">MANDATORY</strong> and 
              must be filled out for every row:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Organization Name</strong> (Column B)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Organization Locations</strong> (Column C)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Organization Domains</strong> (Column D) - <em>e.g., company.com</em></span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Person Seniorities</strong> (Selected via Tool)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Results per title</strong> (Column I) - <em>Target number of leads required.</em></span>
              </li>
            </ul>
          </section>

          {/* Interface Overview */}
          <section id="interface" className="scroll-mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              3. The Interface Overview
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              The Main Sheet (<code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-sm">Main_Data</code>) is 
              divided into <strong className="text-foreground">Input Columns</strong> and <strong className="text-foreground">Selection Tools</strong>.
            </p>
            
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Column</TableHead>
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Function</TableHead>
                    <TableHead className="font-semibold">Action Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { col: "A", name: "Sr No", func: "Serial Number tracker.", action: "Auto-filled / Optional" },
                    { col: "B", name: "Organization Name", func: "Name of the company.", action: "Type Manually (Compulsory)", highlight: true },
                    { col: "C", name: "Org Locations", func: "Geographic location target.", action: "Type Manually (Compulsory)", highlight: true },
                    { col: "D", name: "Org Domains", func: "Website domain.", action: "Type Manually (Compulsory)", highlight: true },
                    { col: "E", name: "Edit Titles", func: "Link to the selection tool.", action: "Click Link", highlight: true },
                    { col: "F", name: "Person Titles", func: "Displays your selected titles.", action: "DO NOT EDIT (Auto-calculates)" },
                    { col: "G", name: "Edit Seniorities", func: "Link to the selection tool.", action: "Click Link", highlight: true },
                    { col: "H", name: "Person Seniorities", func: "Displays selected seniorities.", action: "DO NOT EDIT (Auto-calculates)" },
                    { col: "I", name: "Results per title", func: "Quantity of leads needed.", action: "Type Manually (Compulsory)", highlight: true },
                  ].map((row) => (
                    <TableRow key={row.col} className={row.highlight ? "bg-primary/5" : ""}>
                      <TableCell className="font-mono font-semibold">{row.col}</TableCell>
                      <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.func}</TableCell>
                      <TableCell className={row.highlight ? "text-primary font-medium" : "text-muted-foreground"}>{row.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Step-by-Step Workflow */}
          <section id="workflow" className="scroll-mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              4. Step-by-Step Workflow
            </h2>
            
            <div className="space-y-8">
              {/* Step 1 */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Step 1: Enter Company Details</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Locate the first empty row. Enter the <strong className="text-foreground">Organization Name</strong>, 
                  <strong className="text-foreground"> Location</strong>, <strong className="text-foreground">Domain</strong>, 
                  and the required <strong className="text-foreground">Results per title</strong> in the respective columns.
                </p>
              </div>

              {/* Step 2 */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Step 2: Select Person Titles</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  You cannot type directly into the "Person Titles" column. Instead, follow this process:
                </p>
                <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
                  <li>In the row you are working on, click the cell in <strong className="text-foreground">Column E</strong> labeled: <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-sm">📝 Click to Select Titles</code></li>
                  <li>A pop-up link will appear. Click it.</li>
                  <li>The sheet will automatically jump to a hidden database tab (<code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-sm">DB_Titles</code>) and highlight the <strong className="text-foreground">exact row</strong> corresponding to your company.</li>
                  <li><strong className="text-foreground">To Select Specific Titles:</strong> Tick the checkboxes for the roles you want (e.g., <em>Accounting, Finance</em>).</li>
                  <li><strong className="text-foreground">To Select ALL Titles:</strong> Tick the checkbox in <strong className="text-foreground">Column A</strong> (Red Header) labeled <strong className="text-foreground">SELECT ALL</strong>.</li>
                  <li>Once selections are made, click the <strong className="text-foreground">'Main_Data'</strong> tab at the bottom to return.</li>
                  <li>Observe <strong className="text-foreground">Column F</strong>; it will now display your selected titles automatically.</li>
                </ol>
              </div>

              {/* Step 3 */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Step 3: Select Person Seniorities</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Repeat the process for Seniorities:
                </p>
                <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
                  <li>Click the cell in <strong className="text-foreground">Column G</strong> labeled: <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-sm">📝 Click to Select Seniorities</code></li>
                  <li>Follow the link to the <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-sm">DB_Seniorities</code> tab.</li>
                  <li>Tick the desired seniority levels (e.g., <em>Manager, Director</em>) OR tick <strong className="text-foreground">SELECT ALL</strong> in Column A.</li>
                  <li>Return to the <strong className="text-foreground">'Main_Data'</strong> tab.</li>
                  <li>Observe <strong className="text-foreground">Column H</strong>; it will display your selections.</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Important Usage Rules */}
          <section id="rules" className="scroll-mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              5. Important Usage Rules
            </h2>
            
            <div className="space-y-4">
              {/* Warning 1 */}
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground mb-2">WARNING: DO NOT Copy/Paste Rows</p>
                    <p className="text-muted-foreground text-sm mb-2">
                      Because each row in the Main Sheet is mathematically linked to a specific row in the Database Sheet 
                      (Row 5 links to Row 5), <strong className="text-foreground">do not copy and paste entire rows</strong>.
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li><strong className="text-primary">Correct:</strong> Drag the "Click to Select" formula down from the cell above if you add new rows.</li>
                      <li><strong className="text-destructive">Incorrect:</strong> Copying Row 5 and pasting it into Row 10 will break the linkage.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Warning 2 */}
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground mb-2">WARNING: DO NOT Type in Result Columns (F & H)</p>
                    <p className="text-muted-foreground text-sm">
                      Columns F ("Person Titles") and H ("Person Seniorities") contain formulas. If you manually type text 
                      into these cells, <strong className="text-foreground">you will break the automation</strong> for that row.
                    </p>
                  </div>
                </div>
              </div>

              {/* Note */}
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground mb-2">NOTE: "Select All" Priority</p>
                    <p className="text-muted-foreground text-sm">
                      The <strong className="text-foreground">SELECT ALL</strong> checkbox (Column A in the database sheets) has priority. 
                      If it is checked, the result will show <em>every possible option</em>, regardless of individual checkboxes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Troubleshooting */}
          <section id="troubleshooting" className="scroll-mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              6. Troubleshooting
            </h2>
            
            <div className="space-y-6">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <p className="font-semibold text-foreground mb-2">Q: I clicked the link, but I don't know which row is mine.</p>
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">A:</strong> The link highlights your specific row automatically. Look for the row number on the left 
                  that is highlighted or has a border. It corresponds exactly to the Row Number you were on in the Main Sheet.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border bg-card/50">
                <p className="font-semibold text-foreground mb-2">Q: I see #REF! or #VALUE! errors.</p>
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">A:</strong> This usually happens if a row was deleted in one sheet but not the other. 
                  Ensure you do not delete rows in the <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">DB_Titles</code> or 
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs"> DB_Seniorities</code> sheets manually. 
                  Always work from the <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">Main_Data</code> sheet.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-border text-center">
          <Link to="/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default GoogleSheetsGuide;
