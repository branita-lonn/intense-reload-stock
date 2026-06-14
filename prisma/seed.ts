// prisma/seed.ts
// Idempotent seed file for Intense Reload — safe to re-run.
// Creates: owner account, store settings, 3 branches, mixed-granularity category tree,
// and 10 sample products demonstrating the dynamic stock granularity concept.
// Run with: npm run seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateUniqueSlug } from "../lib/generate-slug";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function makeSlug(name: string): Promise<string> {
  return generateUniqueSlug(name, async (slug) => {
    const existing =
      (await prisma.category.findUnique({ where: { slug } })) ??
      (await prisma.product.findUnique({ where: { slug } }));
    return !!existing;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding database…");

  // ── 1. Owner account ──────────────────────────────────────────────────────
  const hashedOwnerPassword = await bcrypt.hash("IntenseReload2026!", 12);
  const owner = await prisma.user.upsert({
    where: { email: "owner@intensereload.com" },
    update: {},
    create: {
      email: "owner@intensereload.com",
      name: "Store Owner",
      password: hashedOwnerPassword,
      role: "OWNER",
      mustChangePassword: false,
      isActive: true,
    },
  });
  console.log("✅ Owner account:", owner.email);

  // ── 2. Store settings (singleton) ─────────────────────────────────────────
  const existingSettings = await prisma.storeSettings.findFirst();
  if (!existingSettings) {
    await prisma.storeSettings.create({
      data: {
        storeName: "Intense Reload",
        storeTagline: "Mombasa's home for street style.",
        requireSaleApproval: true,
        enablePOS: false,
        enableBarcodeScanning: false,
        enableStockValueTracking: false,
        enableDetailedSaleBreakdown: false,
      },
    });
    console.log("✅ Store settings created");
  } else {
    console.log("⏭️  Store settings already exist, skipping");
  }

  // ── 3. Branches ───────────────────────────────────────────────────────────
  const branchData = [
    { name: "Mombasa CBD", town: "Mombasa" },
    { name: "Nyali", town: "Mombasa" },
    { name: "Nairobi CBD", town: "Nairobi" },
  ];

  const branches: { id: string; name: string }[] = [];
  for (const b of branchData) {
    const branch = await prisma.branch.upsert({
      where: { id: (await prisma.branch.findFirst({ where: { name: b.name } }))?.id ?? "none" },
      update: {},
      create: { name: b.name, town: b.town, isActive: true },
    });
    branches.push({ id: branch.id, name: branch.name });
    console.log(`✅ Branch: ${branch.name}`);
  }

  const [branchMombasa, branchNyali, branchNairobi] = branches as [
    { id: string; name: string },
    { id: string; name: string },
    { id: string; name: string },
  ];

  // ── 4. Category tree ──────────────────────────────────────────────────────
  // Helper to upsert a category by slug (idempotent)
  async function upsertCategory(data: {
    name: string;
    parentId?: string;
    isStockBearing?: boolean;
    sortOrder?: number;
  }) {
    const slug = await makeSlug(data.name);
    // Check if it already exists by name to avoid duplicate slugs on re-run
    const existing = await prisma.category.findFirst({ where: { name: data.name } });
    if (existing) return existing;
    return prisma.category.create({
      data: {
        name: data.name,
        slug,
        parentId: data.parentId,
        isStockBearing: data.isStockBearing ?? false,
        sortOrder: data.sortOrder ?? 0,
        isActive: true,
      },
    });
  }

  // Root categories
  const catMen = await upsertCategory({ name: "Men", sortOrder: 1 });
  const catWomen = await upsertCategory({ name: "Women", sortOrder: 2 });
  const catChildren = await upsertCategory({ name: "Children", sortOrder: 3 });
  const catBags = await upsertCategory({ name: "Bags", sortOrder: 4, isStockBearing: true });
  const catPerfumes = await upsertCategory({ name: "Perfumes", sortOrder: 5, isStockBearing: true });
  const catWatches = await upsertCategory({ name: "Watches", sortOrder: 6, isStockBearing: true });

  // Men subcategories
  const catMenShirts = await upsertCategory({ name: "Men Shirts", parentId: catMen.id, sortOrder: 1 });
  // T-Shirts: isStockBearing true — owner currently tracks all T-shirts as one number
  const catMenTShirts = await upsertCategory({
    name: "Men T-Shirts",
    parentId: catMen.id,
    isStockBearing: true,
    sortOrder: 2,
  });
  const catMenTrousers = await upsertCategory({
    name: "Men Trousers",
    parentId: catMen.id,
    isStockBearing: true,
    sortOrder: 3,
  });
  // Men > Shoes: NOT stock-bearing at category level — tracked per variant (demonstrated below)
  const catMenShoes = await upsertCategory({ name: "Men Shoes", parentId: catMen.id, sortOrder: 4 });

  // T-Shirt children — exist in taxonomy but NOT stock-bearing
  // (the parent T-Shirts category is the active stock node)
  // This demonstrates the Stage 3 "drill down" scenario:
  // When the owner is ready to track Round Neck / Polo / Graphic separately,
  // the drill-down flow (Stage 3) will migrate stock from catMenTShirts to these children.
  const catRoundNeck = await upsertCategory({
    name: "Round Neck",
    parentId: catMenTShirts.id,
    isStockBearing: false,
    sortOrder: 1,
  });
  const catPolo = await upsertCategory({
    name: "Polo",
    parentId: catMenTShirts.id,
    isStockBearing: false,
    sortOrder: 2,
  });
  const catGraphicTees = await upsertCategory({
    name: "Graphic Tees",
    parentId: catMenTShirts.id,
    isStockBearing: false,
    sortOrder: 3,
  });

  // Women subcategories
  const catWomenDresses = await upsertCategory({
    name: "Women Dresses",
    parentId: catWomen.id,
    isStockBearing: true,
    sortOrder: 1,
  });
  const catWomenTops = await upsertCategory({ name: "Women Tops", parentId: catWomen.id, sortOrder: 2 });
  const catWomenShoes = await upsertCategory({ name: "Women Shoes", parentId: catWomen.id, sortOrder: 3 });

  // Children subcategories
  const catBoys = await upsertCategory({ name: "Boys", parentId: catChildren.id, sortOrder: 1 });
  const catGirls = await upsertCategory({ name: "Girls", parentId: catChildren.id, sortOrder: 2 });

  console.log("✅ Category tree created");

  // ── 5. Inventory rows for stock-bearing categories ──────────────────────
  // For each isStockBearing category, create one Inventory row per branch.
  // The "exactly one of categoryId/productId/productVariantId" rule is enforced
  // at the application layer (lib/validations/inventory.ts).
  interface InventorySpec {
    categoryId: string;
    quantities: [number, number, number]; // [Mombasa, Nyali, Nairobi]
    lowStockThreshold?: number;
  }

  const categoryInventorySpecs: InventorySpec[] = [
    { categoryId: catMenTShirts.id, quantities: [120, 95, 85], lowStockThreshold: 10 },
    { categoryId: catMenTrousers.id, quantities: [60, 45, 70], lowStockThreshold: 10 },
    { categoryId: catWomenDresses.id, quantities: [80, 55, 65], lowStockThreshold: 10 },
    { categoryId: catBags.id, quantities: [40, 30, 35], lowStockThreshold: 8 },
    { categoryId: catPerfumes.id, quantities: [55, 40, 50], lowStockThreshold: 10 },
    { categoryId: catWatches.id, quantities: [25, 20, 30], lowStockThreshold: 5 },
  ];

  const branchList = [branchMombasa, branchNyali, branchNairobi];

  for (const spec of categoryInventorySpecs) {
    for (let i = 0; i < branchList.length; i++) {
      const branchId = branchList[i]!.id;
      const quantity = spec.quantities[i]!;
      const existing = await prisma.inventory.findFirst({
        where: { branchId, categoryId: spec.categoryId },
      });
      if (!existing) {
        await prisma.inventory.create({
          data: {
            branchId,
            categoryId: spec.categoryId,
            quantity,
            lowStockThreshold: spec.lowStockThreshold ?? 5,
          },
        });
      }
    }
  }
  console.log("✅ Category-level inventory rows created");

  // ── 6. Sample Products ────────────────────────────────────────────────────

  // Helper to upsert a product by name
  async function upsertProduct(data: {
    name: string;
    categoryId: string;
    brand?: string;
    description?: string;
    isStockBearing?: boolean;
    tags?: string[];
  }) {
    const existing = await prisma.product.findFirst({ where: { name: data.name } });
    if (existing) return existing;
    const slug = await makeSlug(data.name);
    return prisma.product.create({
      data: {
        name: data.name,
        slug,
        categoryId: data.categoryId,
        brand: data.brand,
        description: data.description,
        isStockBearing: data.isStockBearing ?? false,
        tags: data.tags ?? [],
        images: [],
        isActive: true,
      },
    });
  }

  // ── 6a. Men Shoes — Variant-level tracking (4 products, each with 2-3 size variants) ──
  // These demonstrate variant-level stock: each ProductVariant owns its own Inventory row.
  // The Product and Category are NOT stock-bearing.
  const shoeProducts = [
    { name: "Air Force Classic", brand: "Nike", description: "Classic low-top sneaker" },
    { name: "Chuck Taylor High", brand: "Converse", description: "High-top canvas sneaker" },
    { name: "Stan Smith White", brand: "Adidas", description: "Classic leather tennis shoe" },
    { name: "Old Skool Black", brand: "Vans", description: "Side-stripe skate shoe" },
  ];

  const shoeSizes = ["39", "40", "41", "42", "43"];

  for (const shoeData of shoeProducts) {
    const product = await upsertProduct({
      name: shoeData.name,
      categoryId: catMenShoes.id,
      brand: shoeData.brand,
      description: shoeData.description,
      isStockBearing: false, // variant-level tracking
      tags: ["shoes", "men", "footwear"],
    });

    // Create 3 size variants per shoe
    const variantSizes = shoeSizes.slice(0, 3);
    for (const size of variantSizes) {
      const existingVariant = await prisma.productVariant.findFirst({
        where: { productId: product.id, size },
      });
      let variant = existingVariant;
      if (!variant) {
        variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            size,
            colour: "Black/White",
            isActive: true,
          },
        });
      }

      // Inventory per branch for each variant
      for (let i = 0; i < branchList.length; i++) {
        const branchId = branchList[i]!.id;
        const quantity = Math.floor(Math.random() * 13) + 3; // 3–15 units
        const existing = await prisma.inventory.findFirst({
          where: { branchId, productVariantId: variant.id },
        });
        if (!existing) {
          await prisma.inventory.create({
            data: {
              branchId,
              productVariantId: variant.id,
              quantity,
              lowStockThreshold: 3,
            },
          });
        }
      }
    }
    console.log(`✅ Shoe product seeded: ${product.name}`);
  }

  // ── 6b. Bags — Product-level tracking (3 products, isStockBearing: true, no variants) ──
  // The Bags category is stock-bearing AND each product under it is also stock-bearing.
  // This is valid: the system allows multiple stock-bearing levels in the taxonomy,
  // as long as only one per path is "active" at a time. In this demo, products own the stock.
  const bagProducts = [
    {
      name: "Canvas Tote Natural",
      brand: "Intense Reload",
      description: "Spacious natural canvas tote bag",
      quantities: [15, 10, 12] as [number, number, number],
    },
    {
      name: "Leather Crossbody Black",
      brand: "Intense Reload",
      description: "Compact black leather crossbody",
      quantities: [8, 6, 9] as [number, number, number],
    },
    {
      name: "Backpack Street Camo",
      brand: "Intense Reload",
      description: "Camouflage print street backpack",
      quantities: [12, 8, 10] as [number, number, number],
    },
  ];

  for (const bagData of bagProducts) {
    const product = await upsertProduct({
      name: bagData.name,
      categoryId: catBags.id,
      brand: bagData.brand,
      description: bagData.description,
      isStockBearing: true, // product-level tracking
      tags: ["bags", "accessories"],
    });

    for (let i = 0; i < branchList.length; i++) {
      const branchId = branchList[i]!.id;
      const quantity = bagData.quantities[i]!;
      const existing = await prisma.inventory.findFirst({
        where: { branchId, productId: product.id },
      });
      if (!existing) {
        await prisma.inventory.create({
          data: {
            branchId,
            productId: product.id,
            quantity,
            lowStockThreshold: 3,
          },
        });
      }
    }
    console.log(`✅ Bag product seeded: ${product.name}`);
  }

  // ── 6c. T-Shirt subcategory products — No inventory rows (category is the stock node) ──
  // These products exist purely in the taxonomy. The catMenTShirts category owns all inventory.
  // When the owner is ready to track Round Neck / Polo / Graphic Tees separately,
  // the Stage 3 "drill down" migration will:
  //   1. Mark catMenTShirts.isStockBearing = false (or create a snapshot inventory row)
  //   2. Set isStockBearing = true on catRoundNeck, catPolo, catGraphicTees
  //   3. Distribute the stock quantities across the subcategory inventory rows
  const tshirtSubcatProducts = [
    { name: "Round Neck Basic White", categoryId: catRoundNeck.id, tags: ["t-shirt", "round-neck"] },
    { name: "Polo Classic Navy", categoryId: catPolo.id, tags: ["polo", "t-shirt"] },
    { name: "Graphic Tee Flame Print", categoryId: catGraphicTees.id, tags: ["graphic", "t-shirt"] },
  ];

  for (const tData of tshirtSubcatProducts) {
    await upsertProduct({
      name: tData.name,
      categoryId: tData.categoryId,
      description: "No inventory row — the parent T-Shirts category owns stock.",
      isStockBearing: false,
      tags: tData.tags,
    });
    console.log(`✅ T-shirt taxonomy product seeded (no inventory): ${tData.name}`);
  }

  console.log("\n🎉 Seeding complete!\n");
  console.log("Login credentials:");
  console.log("  Email:    owner@intensereload.com");
  console.log("  Password: IntenseReload2026!\n");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown seed error";
    console.error("❌ Seed failed:", message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
