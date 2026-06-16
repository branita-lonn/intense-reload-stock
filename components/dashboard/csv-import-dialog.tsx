// components/dashboard/csv-import-dialog.tsx
// Bulk CSV product import dialog.
// Uses PapaParse for client-side parsing and preview, then POSTs validated rows
// to /api/dashboard/products/csv-import.
//
// Two supported formats (auto-detected from headers):
//   Simple:   category, name, brand, tags, <branch>_qty, ...
//   Detailed: + sku, size, colour, cost_price, selling_price
//
// IMPORTANT: This dialog requires the papaparse package.
// Install with: npm install papaparse && npm install --save-dev @types/papaparse

"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Branch {
  id: string;
  name: string;
}

interface CsvImportDialogProps {
  branches: Branch[];
  onSuccess?: () => void;
}

type CsvFormat = "simple" | "detailed" | null;

interface ParsedRow {
  [key: string]: string;
}

interface RowResult {
  row: number;
  status: "created" | "error";
  error?: string;
}

// Detect format from headers
function detectFormat(headers: string[]): CsvFormat {
  const detailedMarkers = ["sku", "size", "colour", "cost_price", "selling_price"];
  const hasDetailed = detailedMarkers.some((m) => headers.includes(m));
  const hasRequired = ["category", "name"].every((h) => headers.includes(h));
  if (!hasRequired) return null;
  return hasDetailed ? "detailed" : "simple";
}

// Simple heuristic to confirm the file looks like CSV text (not binary)
function looksLikeCsv(text: string): boolean {
  // Must start with printable ASCII characters, not binary byte sequences
  const firstLine = text.split("\n")[0] ?? "";
  return /^[\x20-\x7E,]+$/.test(firstLine.trim());
}

// Generate a downloadable CSV template for the user
function buildTemplateUrl(format: "simple" | "detailed", branches: Branch[]): string {
  const branchCols = branches.map((b) => `${b.name.toLowerCase().replace(/\s+/g, "_")}_qty`).join(",");
  const simpleHeader = `category,name,brand,tags,${branchCols}`;
  const detailedHeader = `category,name,brand,tags,sku,size,colour,cost_price,selling_price,${branchCols}`;
  const header = format === "detailed" ? detailedHeader : simpleHeader;
  const blob = new Blob([header + "\n"], { type: "text/csv" });
  return URL.createObjectURL(blob);
}

export function CsvImportDialog({ branches, onSuccess }: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<CsvFormat>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<RowResult[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  function resetState() {
    setFileName(null);
    setFormat(null);
    setHeaders([]);
    setPreviewRows([]);
    setAllRows([]);
    setParseError(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetState();
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate extension
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Only .csv files are accepted.");
      return;
    }

    const text = await file.text();

    // Heuristic content check — reject obvious binary files renamed to .csv
    if (!looksLikeCsv(text)) {
      setParseError(
        "File does not appear to be a valid CSV. The first line contains non-text characters."
      );
      return;
    }

    // Dynamically import PapaParse to keep bundle lean
    const Papa = (await import("papaparse")).default;

    const result = Papa.parse<ParsedRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    if (result.errors.length > 0) {
      setParseError(`CSV parse error: ${result.errors[0]?.message ?? "Unknown error"}`);
      return;
    }

    const parsedHeaders = result.meta.fields ?? [];
    const detectedFormat = detectFormat(parsedHeaders);

    if (!detectedFormat) {
      setParseError(
        `Could not detect a valid format. Ensure the CSV has at minimum 'category' and 'name' columns. ` +
          `Found headers: ${parsedHeaders.join(", ")}`
      );
      return;
    }

    setFileName(file.name);
    setFormat(detectedFormat);
    setHeaders(parsedHeaders);
    setAllRows(result.data);
    setPreviewRows(result.data.slice(0, 10));
  }

  async function handleImport() {
    if (!format || allRows.length === 0) return;

    setIsImporting(true);
    setImportResults(null);

    try {
      const res = await fetch("/api/dashboard/products/csv-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, rows: allRows }),
      });

      const data = (await res.json()) as {
        success: boolean;
        message: string;
        results: RowResult[];
      };

      setImportResults(data.results);

      if (res.ok && data.success) {
        toast.success(data.message);
        onSuccess?.();
      } else {
        toast.error(data.message ?? "Import failed.");
      }
    } catch {
      toast.error("Network error during import.");
    } finally {
      setIsImporting(false);
    }
  }

  const successCount = importResults?.filter((r) => r.status === "created").length ?? 0;
  const errorCount = importResults?.filter((r) => r.status === "error").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl gap-2">
          <Upload className="h-4 w-4" />
          CSV Import
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl rounded-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-bold">Bulk CSV Product Import</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Import products in bulk using a CSV file. Two formats are supported and auto-detected.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-5">
          <div className="space-y-5">

            {/* Format guide */}
            <div className="rounded-2xl bg-muted/30 border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Info className="h-4 w-4 text-muted-foreground" />
                Supported formats (auto-detected from headers)
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="space-y-1">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">Simple</Badge>
                  <p className="font-mono leading-relaxed">
                    category, name, brand, tags,<br />
                    {branches.slice(0, 2).map(b => `${b.name.toLowerCase().replace(/\s+/g, "_")}_qty`).join(", ")}
                    {branches.length > 2 ? ", …" : ""}
                  </p>
                  <p>Creates products with product-level stock tracking.</p>
                </div>
                <div className="space-y-1">
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">Detailed</Badge>
                  <p className="font-mono leading-relaxed">
                    + sku, size, colour,<br />
                    cost_price, selling_price
                  </p>
                  <p>Creates products with a single variant per row, variant-level tracking.</p>
                </div>
              </div>

              {/* Template download buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={buildTemplateUrl("simple", branches)}
                  download="import-template-simple.csv"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Simple template
                </a>
                <a
                  href={buildTemplateUrl("detailed", branches)}
                  download="import-template-detailed.csv"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Detailed template
                </a>
              </div>
            </div>

            {/* File picker */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                id="csv-file-input"
                onChange={handleFileChange}
              />
              <label
                htmlFor="csv-file-input"
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all cursor-pointer p-8 text-center"
              >
                <FileText className="h-8 w-8 text-muted-foreground" />
                {fileName ? (
                  <div className="space-y-0.5">
                    <p className="font-bold text-foreground text-sm">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{allRows.length} data rows detected</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground text-sm">Click to select a CSV file</p>
                    <p className="text-xs text-muted-foreground">.csv files only</p>
                  </div>
                )}
              </label>
            </div>

            {/* Parse error */}
            {parseError && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{parseError}</p>
              </div>
            )}

            {/* Detected format badge */}
            {format && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Detected format:</span>
                <Badge className={format === "detailed"
                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                }>
                  {format === "detailed" ? "Detailed (with variants)" : "Simple (product-level)"}
                </Badge>
                <span className="text-muted-foreground text-xs ml-auto">{allRows.length} total rows</span>
              </div>
            )}

            {/* Preview table — first 10 rows */}
            {previewRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Preview (first {previewRows.length} of {allRows.length} rows)
                </p>
                <div className="rounded-2xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-[11px] py-2 px-3 w-8">#</TableHead>
                          {headers.map((h) => (
                            <TableHead key={h} className="text-[11px] py-2 px-3 whitespace-nowrap">
                              {h}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-[11px] py-2 px-3 text-muted-foreground font-mono">
                              {i + 1}
                            </TableCell>
                            {headers.map((h) => (
                              <TableCell key={h} className="text-[11px] py-2 px-3 max-w-[120px] truncate">
                                {row[h] ?? ""}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {allRows.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">
                    … and {allRows.length - 10} more rows not shown in preview.
                  </p>
                )}
              </div>
            )}

            {/* Import results */}
            {importResults && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {successCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {successCount} imported
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                      <XCircle className="h-4 w-4" />
                      {errorCount} failed
                    </div>
                  )}
                </div>

                {errorCount > 0 && (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-destructive/10">
                        <TableRow>
                          <TableHead className="text-[11px] py-2 px-3">Row</TableHead>
                          <TableHead className="text-[11px] py-2 px-3">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResults
                          .filter((r) => r.status === "error")
                          .map((r) => (
                            <TableRow key={r.row}>
                              <TableCell className="text-[11px] py-2 px-3 font-mono font-bold text-destructive">
                                #{r.row}
                              </TableCell>
                              <TableCell className="text-[11px] py-2 px-3 text-destructive">
                                {r.error}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => { setOpen(false); resetState(); }}
          >
            {importResults ? "Close" : "Cancel"}
          </Button>
          {!importResults && (
            <Button
              id="csv-import-confirm-btn"
              className="rounded-xl gap-2"
              disabled={!format || allRows.length === 0 || isImporting}
              onClick={handleImport}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing {allRows.length} rows…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import {allRows.length > 0 ? `${allRows.length} rows` : ""}
                </>
              )}
            </Button>
          )}
          {importResults && errorCount === 0 && (
            <Button className="rounded-xl gap-2" onClick={() => { setOpen(false); resetState(); }}>
              <CheckCircle2 className="h-4 w-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
