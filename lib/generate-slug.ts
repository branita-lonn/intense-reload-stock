// lib/generate-slug.ts
// Utility function to generate unique URL-friendly slugs for categories and products

/**
 * Generates a clean URL-friendly slug from a name and resolves conflicts using a database check callback.
 */
export async function generateUniqueSlug(
  name: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  // Clean special characters, trim, lowercase, and replace spaces/underscores with hyphens
  let baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove non-word chars except spaces/hyphens
    .replace(/[\s_]+/g, "-")  // replace spaces/underscores with a single hyphen
    .replace(/-+/g, "-");     // replace multiple hyphens with a single one

  // If the string is empty after cleaning, default to a fallback
  if (!baseSlug) {
    baseSlug = "item";
  }

  let slug = baseSlug;
  let exists = await checkExists(slug);
  let counter = 1;

  // Append a short random suffix or incremental counter if slug exists
  while (exists) {
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    slug = `${baseSlug}-${randomSuffix}`;
    exists = await checkExists(slug);
    
    // Safety break after 5 attempts to avoid infinite loops, fallback to incrementing
    counter++;
    if (counter > 5) {
      slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
      break;
    }
  }

  return slug;
}
