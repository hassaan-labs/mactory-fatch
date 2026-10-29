# Universal manufacturing scope — MACTORY FATCH

This release replaces the old narrow category list with one shared, expandable taxonomy.

- Manufacturing families: **52**
- Example subcategories: **406**
- Categories include perfumes/fragrances, pens/writing instruments, books/paper, plastic and glass bottles, fibres/yarn/nonwovens, wood/timber, metals, technical/precision components, hardware, chemicals, packaging, electronics, machinery, construction materials, medical products, energy, mining/minerals, contract manufacturing and a flexible “Other / not listed” route.
- Factory owners can select up to 30 manufacturing families and describe products, materials, industries served and capability keywords.
- Buyer category filters and text search use the same taxonomy.
- SEO category pages are driven by the same taxonomy, but empty category pages remain `noindex`; the sitemap includes category pages only when approved public factories match.
- A single factory can appear in several category pages without duplicating the factory record.

## Important scope distinction

This provides broad category coverage from day one. It does not mean every manufacturing business is already a member. Only genuine factory submissions approved for public display and consented by the business appear as members. The category tree is deliberately data-driven so new families/subcategories can be added without rewriting the UI or database schema.

## Deploy

1. Replace the existing repository with this release.
2. Deploy the updated static assets and Node API code together.
3. No additional relational columns are required for category arrays because the profile is stored in the existing JSON payload. Still run the complete SQL file if you have not already deployed the RFQ release schema.
4. Test a new fictional application locally, selecting multiple categories, and confirm the server accepts the taxonomy values. Do not create fake production supplier profiles.
5. Once a real factory is approved, verify it appears in all selected category pages and is searchable by product, material, process, and capability.

## Latest UX updates

The factory onboarding category picker is now searchable and uses checkboxes rather than Ctrl/Command multi-select. Specific product/subcategory examples are captured separately. The buyer directory category filter is populated from the same canonical taxonomy.
