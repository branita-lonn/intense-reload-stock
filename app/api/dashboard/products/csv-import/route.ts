// app/api/dashboard/products/csv-import/route.ts
// Bulk product import via CSV.
// Roles: OWNER, BRANCH_MANAGER.
//
// Design decision — validate-then-transact:
//   We validate ALL rows client-side (via PapaParse) AND server-side (via Zod) BEFORE opening
//   the Prisma transaction. If any row fails validation the entire request is rejected with a
//   per-row error report and the DB is never touched. This avoids partial-import confusion and
//   makes the failure surface obvious to the operator. The alternative (Promise.allSettled inside
//   a transaction) is technically possible but would require savepoints and is harder to reason
//   about correctly — the validate-first approach is simpler and safer for a first import run.
//
// Two formats (auto-detected by header presence):
//   Simple:   category, name, brand, tags, <branch_slug>_qty, ...
//   Detailed: + sku, size, colour, cost_price, selling_price
//
// StockMovement records:
//   CSV import sets baseline quantities for initial system setup; it does NOT generate
//   StockMovement records the same way a stock-in does, because there is no "before" state.
//   However, for full traceability we DO create one STOCK_IN StockMovement per product/variant
//   per branch with quantityBefore: 0, quantityAfter: importedQty, note: "Initial CSV import".

import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Per-row Zod schemas
// ---------------------------------------------------------------------------
const csvSimpleRowSchema = z.object({
  category: z.string().min(1, "Category is required"),
  name: z.string().min(1, "Product name is required"),
  brand: z.string().optional(),
  tags: z.string().optional(), // comma-separated list, split server-side
  // Branch quantity columns are dynamic — validated as part of branchQtys below
});

const csvDetailedRowSchema = csvSimpleRowSchema.extend({
  sku: z.string().optional(),
  size: z.string().optional(),
  colour: z.string().optional(),
  cost_price: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined))
    .refine((v) => v === undefined || (!isNaN(v!) && v! >= 0), { message: "cost_price must be a non-negative number" }),
  selling_price: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined))
    .refine((v) => v === undefined || (!isNaN(v!) && v! >= 0), { message: "selling_price must be a non-negative number" }),
});

// The full parsed-row type the client sends after PapaParse
interface CsvRow {
  category: string;
  name: string;
  brand?: string;
  tags?: string;
  sku?: string;
  size?: string;
  colour?: string;
  cost_price?: string;
  selling_price?: string;
  [branchQty: string]: string | undefined; // e.g. "mombasa_qty": "42"
}

interface ImportRequestBody {
  format: "simple" | "detailed";
  rows: CsvRow[];
}

interface RowResult {
  row: number;
  status: "created" | "error";
  error?: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const body = (await request.json()) as unknown;

    if (
      typeof body !== "object" ||
      body === null ||
      !("format" in body) ||
      !("rows" in body)
    ) {
      throw new ValidationError("Request must include 'format' and 'rows'.");
    }

    const { format, rows } = body as ImportRequestBody;

    if (!["simple", "detailed"].includes(format)) {
      throw new ValidationError("format must be 'simple' or 'detailed'.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError("rows must be a non-empty array.");
    }
    if (rows.length > 500) {
      throw new ValidationError("A single CSV import cannot exceed 500 rows.");
    }

    // Load all active branches to map slug-style column names (e.g. "mombasa_qty") to branch IDs
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    // Build a normalised slug → branchId map
    function toSlug(name: string) {
      return name.toLowerCase().replace(/\s+/g, "_");
    }
    const branchSlugMap = new Map<string, { id: string; name: string }>(
      branches.map((b) => [toSlug(b.name), b])
    );

    // Detect branch quantity column names from the first row header keys
    const sampleRow = rows[0]!;
    const branchQtyKeys = Object.keys(sampleRow).filter((k) => k.endsWith("_qty"));

    // ---------------------------------------------------------------------------
    // Phase 1: Validate ALL rows — collect errors before touching the DB
    // ---------------------------------------------------------------------------
    const rowErrors: RowResult[] = [];

    const validatedRows = rows.map((raw, idx) => {
      const rowNum = idx + 1;
      const schema = format === "detailed" ? csvDetailedRowSchema : csvSimpleRowSchema;
      const parsed = schema.safeParse(raw);

      if (!parsed.success) {
        rowErrors.push({
          row: rowNum,
          status: "error",
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
        return null;
      }

      // Validate qty columns
      const branchQtys: Array<{ branchId: string; branchName: string; qty: number }> = [];
      for (const key of branchQtyKeys) {
        const slug = key.replace(/_qty$/, "");
        const branch = branchSlugMap.get(slug);
        if (!branch) {
          rowErrors.push({
            row: rowNum,
            status: "error",
            error: `Unknown branch column '${key}'. Slug '${slug}' does not match any active branch.`,
          });
          return null;
        }
        const rawQty = raw[key];
        const qty = rawQty !== undefined && rawQty !== "" ? parseInt(rawQty, 10) : 0;
        if (isNaN(qty) || qty < 0) {
          rowErrors.push({
            row: rowNum,
            status: "error",
            error: `Invalid quantity '${rawQty}' in column '${key}'. Must be a non-negative integer.`,
          });
          return null;
        }
        branchQtys.push({ branchId: branch.id, branchName: branch.name, qty });
      }

      return { rowNum, data: parsed.data as z.infer<typeof csvDetailedRowSchema>, branchQtys };
    });

    // If any rows failed validation, abort before touching the DB
    if (rowErrors.length > 0) {
      return Response.json(
        {
          success: false,
          message: `Validation failed for ${rowErrors.length} row(s). No data was imported.`,
          results: rowErrors,
        },
        { status: 422 }
      );
    }

    const cleanRows = validatedRows.filter(Boolean) as NonNullable<typeof validatedRows[0]>[];

    // ---------------------------------------------------------------------------
    // Phase 2: Transactional import — all rows succeed or none do
    // ---------------------------------------------------------------------------
    const results: RowResult[] = [];

    await prisma.$transaction(async (tx) => {
      for (const { rowNum, data, branchQtys } of cleanRows) {
        // Resolve or create the category by name (slug auto-generated)
        let category = await tx.category.findFirst({
          where: { name: { equals: data.category, mode: "insensitive" } },
        });

        if (!category) {
          const slug = data.category
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
          category = await tx.category.create({
            data: {
              name: data.category,
              slug: `${slug}-${Date.now()}`,
              isStockBearing: false, // category-level tracking must be explicitly configured
            },
          });
        }

        const tags = data.tags
          ? data.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [];

        const productSlug =
          data.name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "") +
          `-${Date.now()}-${rowNum}`;

        if (format === "simple") {
          // Simple: product-level stock bearing
          const product = await tx.product.create({
            data: {
              name: data.name,
              slug: productSlug,
              brand: data.brand || null,
              tags,
              categoryId: category.id,
              isStockBearing: true,
            },
          });

          for (const { branchId, qty } of branchQtys) {
            await tx.inventory.create({
              data: {
                branchId,
                productId: product.id,
                quantity: qty,
                isReferenceSnapshot: false,
              },
            });
            // Traceability: one STOCK_IN movement with quantityBefore: 0 per branch
            if (qty > 0) {
              await tx.stockMovement.create({
                data: {
                  branchId,
                  productId: product.id,
                  type: "STOCK_IN",
                  quantityBefore: 0,
                  quantityAfter: qty,
                  quantityDelta: qty,
                  note: "Initial CSV import",
                  performedById: session.user.id,
                },
              });
            }
          }
        } else {
          // Detailed: product + one variant, variant-level stock bearing
          const detailedData = data as z.infer<typeof csvDetailedRowSchema>;
          const product = await tx.product.create({
            data: {
              name: data.name,
              slug: productSlug,
              brand: data.brand || null,
              tags,
              categoryId: category.id,
              isStockBearing: false, // tracking is at variant level
            },
          });

          const variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku: detailedData.sku || null,
              size: detailedData.size || null,
              colour: detailedData.colour || null,
              costPrice: detailedData.cost_price ?? null,
              sellingPrice: detailedData.selling_price ?? null,
            },
          });

          for (const { branchId, qty } of branchQtys) {
            await tx.inventory.create({
              data: {
                branchId,
                productVariantId: variant.id,
                quantity: qty,
                isReferenceSnapshot: false,
              },
            });
            if (qty > 0) {
              await tx.stockMovement.create({
                data: {
                  branchId,
                  productVariantId: variant.id,
                  type: "STOCK_IN",
                  quantityBefore: 0,
                  quantityAfter: qty,
                  quantityDelta: qty,
                  note: "Initial CSV import",
                  performedById: session.user.id,
                },
              });
            }
          }
        }

        results.push({ row: rowNum, status: "created" });
      }
    });

    return Response.json(
      {
        success: true,
        message: `Successfully imported ${results.length} product(s).`,
        results,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
