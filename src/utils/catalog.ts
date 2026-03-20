/**
 * E-nummer product catalog — live search from e-nummersok.se
 * Searches 915,000+ active products in real-time
 */

export interface CatalogProduct {
  e: string;  // E-nummer
  n: string;  // Name
  d: string;  // Description (technical specs)
  a: string;  // Article number (manufacturer)
  m: string;  // Manufacturer
  c: string;  // Category
}

// Simple in-memory cache to avoid duplicate API calls
const searchCache = new Map<string, { results: CatalogProduct[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the API URL for e-nummersok.se, handling CORS:
 * - Dev: Vite proxy at /api/enummer
 * - Production: CORS proxy via corsproxy.io
 */
function getApiUrl(): string {
  if (import.meta.env.DEV) {
    return '/api/enummer/ApiSearch/Search/';
  }
  return 'https://corsproxy.io/?url=' + encodeURIComponent('https://www.e-nummersok.se/ApiSearch/Search/');
}

/**
 * Live search e-nummersok.se API. Returns only active products.
 */
export async function searchCatalog(query: string, limit = 10): Promise<CatalogProduct[]> {
  if (!query || query.trim().length < 2) return [];

  const cacheKey = query.trim().toLowerCase() + ':' + limit;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.results;

  try {
    const response = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Query: query.trim(),
        Page: 1,
        PageSize: limit,
        OnlyActive: false, // API flag doesn't work, we filter client-side
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const rows = data?.Data?.SearchResultRows || [];

    const results: CatalogProduct[] = rows
      .filter((r: any) => r.IsActive === true) // Only active products
      .map((r: any) => ({
        e: r.RSKNummer,
        n: r.Name,
        d: r.Description || '',
        a: r.ArtikelNummer || '',
        m: (r.ManufacturerAlias || '').replace(/ AB$| Sverige AB$| Sweden AB$/, ''),
        c: r.ProductGroupName2 || '',
      }));

    searchCache.set(cacheKey, { results, ts: Date.now() });
    return results;
  } catch (err) {
    console.error('[Catalog] Live search failed:', err);
    return [];
  }
}

/**
 * Search catalog based on task titles
 */
export async function searchCatalogForTasks(taskTitles: string[], limit = 15): Promise<CatalogProduct[]> {
  if (taskTitles.length === 0) return [];

  // Search each task title separately and merge results
  const seen = new Set<string>();
  const results: CatalogProduct[] = [];

  for (const title of taskTitles.slice(0, 5)) { // Max 5 searches
    const matches = await searchCatalog(title, 3);
    for (const m of matches) {
      if (!seen.has(m.e)) { results.push(m); seen.add(m.e); }
    }
    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

/**
 * Extract individual product search terms from a user message.
 * Splits on commas, numbers with units, and common Swedish connectors.
 * Also generates variations (with/without dimensions, brand combos).
 */
export function extractProductTerms(message: string): string[] {
  // Remove quantity/unit patterns like "1st", "10m", "8st" and common filler
  const cleaned = message
    .replace(/\d+\s*(st|m|paket|rulle|burk)\b/gi, ',')
    .replace(/\b(ge mig|en|på|av|dom|dem|dessa|samt|och|med|för|till|ska|ha|behöver|inköpslista|materiallista|handla|köpa|köp|endast|bara)\b/gi, ' ')
    .replace(/[.!?]/g, ',');

  // Split on commas and filter
  const terms = cleaned
    .split(/[,;]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !/^\d+$/.test(t));

  const unique = [...new Set(terms)];

  // Generate search variations for better catalog hits
  const variations: string[] = [];
  for (const term of unique) {
    variations.push(term);
    // If term has dimensions like "40x60", also search without them
    const withoutDims = term.replace(/\d+x\d+\s*/gi, '').trim();
    if (withoutDims.length >= 3 && withoutDims !== term) {
      variations.push(withoutDims);
    }
    // If term has brand + product, also search just the product type
    const dimMatch = term.match(/(\d+x\d+)/i);
    if (dimMatch) {
      // Also search "kanalplast 40x60" style
      variations.push(term.replace(/^[a-zåäö]+\s+/i, ''));
    }
  }

  return [...new Set(variations)];
}

/**
 * Search catalog with multiple individual product terms extracted from user message.
 * Much better than searching the entire message as one query.
 */
export async function searchCatalogMulti(message: string, perTermLimit = 5): Promise<CatalogProduct[]> {
  const terms = extractProductTerms(message);
  if (terms.length === 0) {
    // Fallback: search the raw message
    return searchCatalog(message, 10);
  }

  const seen = new Set<string>();
  const results: CatalogProduct[] = [];

  for (const term of terms.slice(0, 8)) { // Max 8 searches
    const matches = await searchCatalog(term, perTermLimit);
    for (const m of matches) {
      if (!seen.has(m.e)) {
        results.push(m);
        seen.add(m.e);
      }
    }
  }

  return results;
}

/**
 * Format catalog results as a string for the AI context
 */
export function formatCatalogResults(products: CatalogProduct[]): string {
  if (products.length === 0) return '';

  return products.map(p =>
    `E-nr: ${p.e} | ${p.n}${p.d ? ' — ' + p.d : ''} | Art.nr: ${p.a || '-'} | ${p.m}`
  ).join('\n');
}

/**
 * Installation templates — complete material lists for common jobs.
 */
export interface InstallationTemplate {
  name: string;
  keywords: string[];
  materials: { search: string; qty: string; note: string }[];
}

export const installationTemplates: InstallationTemplate[] = [
  {
    name: 'Köksinstallation (kök)',
    keywords: ['kök', 'köks', 'kitchen'],
    materials: [
      { search: 'EKK 3G2.5', qty: '~30m', note: 'Matning uttag (2,5mm²)' },
      { search: 'EKK 3G1.5', qty: '~20m', note: 'Belysning (1,5mm²)' },
      { search: 'EKK 5G2.5', qty: '~15m', note: 'Spis/ugn (3-fas om tillämpligt)' },
      { search: 'flexslang 16', qty: '~40m', note: 'Installationsrör flex 16mm' },
      { search: 'flexslang 20', qty: '~10m', note: 'Installationsrör flex 20mm (spis)' },
      { search: 'apparatdosa enkelgips', qty: '~12st', note: 'Enkeldosor gips (uttag/strömställare)' },
      { search: 'apparatdosa dubbel', qty: '~4st', note: 'Dubbeldosor gips (dubbeluttag bänkskiva)' },
      { search: 'kopplingsdosa infälld', qty: '~6st', note: 'Kopplingsdosor infälld' },
      { search: 'hörnbox', qty: '~4st', note: 'Hörnboxar för vägguttag' },
      { search: 'vägguttag jordad', qty: '~8st', note: 'Jordade vägguttag' },
      { search: 'dubbeluttag jordad', qty: '~4st', note: 'Jordade dubbeluttag (bänkskiva)' },
      { search: 'strömställare infälld', qty: '~3st', note: 'Strömställare (belysning)' },
      { search: 'WAGO 221', qty: '~20st', note: 'Kopplingsklämmor 3-5 poliga' },
      { search: 'rörklämma 16', qty: '~30st', note: 'Rörklammer 16mm' },
      { search: 'rörklämma 20', qty: '~10st', note: 'Rörklammer 20mm' },
      { search: 'blindlock', qty: '~5st', note: 'Blindlock för oanvända dosor' },
      { search: 'dvärgbrytare C16', qty: '~4st', note: 'Dvärgbrytare C16A (uttag)' },
      { search: 'dvärgbrytare B10', qty: '~2st', note: 'Dvärgbrytare B10A (belysning)' },
      { search: 'jordfelsbrytare 30mA', qty: '1st', note: 'Jordfelsbrytare typ A 30mA' },
      { search: 'kabelmärkning', qty: '1 paket', note: 'Kabelmärkning' },
      { search: 'buntband', qty: '1 paket', note: 'Buntband' },
    ],
  },
  {
    name: 'Badrumsinstallation (badrum/våtrum)',
    keywords: ['badrum', 'våtrum', 'bathroom', 'dusch'],
    materials: [
      { search: 'EKK 3G2.5', qty: '~15m', note: 'Matning uttag (2,5mm²)' },
      { search: 'EKK 3G1.5', qty: '~15m', note: 'Belysning (1,5mm²)' },
      { search: 'flexslang 16', qty: '~25m', note: 'Installationsrör flex 16mm' },
      { search: 'apparatdosa enkel', qty: '~6st', note: 'Enkeldosor infälld' },
      { search: 'kopplingsdosa IP65', qty: '~3st', note: 'Kopplingsdosor IP65 (fukt)' },
      { search: 'vägguttag jordad IP44', qty: '~2st', note: 'IP44 uttag (zon 2+)' },
      { search: 'strömställare infälld', qty: '~2st', note: 'Strömställare' },
      { search: 'WAGO 221', qty: '~15st', note: 'Kopplingsklämmor' },
      { search: 'jordfelsbrytare 30mA', qty: '1st', note: 'Jordfelsbrytare typ A 30mA (krav badrum)' },
      { search: 'värmekabel', qty: '~5m²', note: 'Golvvärmekabel (om tillämpligt)' },
      { search: 'termostat golvvärme', qty: '1st', note: 'Golvvärmetermostat' },
      { search: 'LED downlight IP44', qty: '~4st', note: 'Infälld belysning IP44' },
    ],
  },
  {
    name: 'Elcentral/Gruppcentral',
    keywords: ['elcentral', 'gruppcentral', 'central', 'säkringsskåp', 'proppskåp'],
    materials: [
      { search: 'normkapsling IP40', qty: '1st', note: 'Normkapsling (modern, DIN-skena)' },
      { search: 'dvärgbrytare C16', qty: '~8st', note: 'Dvärgbrytare C16A (uttag)' },
      { search: 'dvärgbrytare B10', qty: '~4st', note: 'Dvärgbrytare B10A (belysning)' },
      { search: 'dvärgbrytare C10', qty: '~2st', note: 'Dvärgbrytare C10A' },
      { search: 'jordfelsbrytare 30mA', qty: '2st', note: 'Jordfelsbrytare 30mA typ A' },
      { search: 'jordfelsbrytare 300mA', qty: '1st', note: 'Jordfelsbrytare 300mA brandskydd' },
      { search: 'överspänningsskydd', qty: '1st', note: 'Överspänningsskydd typ 2' },
      { search: 'kamskena', qty: '~2st', note: 'Samlingsskena/kamskena' },
      { search: 'nollskena', qty: '1st', note: 'Nollskena/N-skena' },
      { search: 'PE-plint', qty: '1st', note: 'PE-skena/jordskena' },
      { search: 'kabelmärkning', qty: '1 paket', note: 'Kretsförteckning + märkning' },
    ],
  },
];

/**
 * Accessory mappings — common products and what they need.
 */
export const accessoryMap: Record<string, { search: string; qty: string; note: string }[]> = {
  // ===== DOSOR =====
  'spårdosa': [
    { search: 'ENKELSTUTS 16/20', qty: 'per kabel', note: 'Enkelstuts för kabelinföring' },
    { search: 'dubbelstuts 16/20', qty: 'per dubbelkabel', note: 'Dubbelstuts för 2 kablar' },
    { search: 'DOSSKRUV M3', qty: '2 per dosa', note: 'Dosskruvar M3x30' },
    { search: 'förhöjningsring spårdosa', qty: 'vid behov', note: 'Förhöjningsring 4/6mm' },
    { search: 'Putslock för apparatdosa', qty: '1 per dosa', note: 'Putslock' },
  ],
  'apparatdosa': [
    { search: 'ENKELSTUTS 16/20', qty: 'per kabel', note: 'Enkelstuts för kabelinföring' },
    { search: 'DOSSKRUV M3', qty: '2 per dosa', note: 'Dosskruvar' },
    { search: 'Putslock för apparatdosa', qty: '1 per dosa', note: 'Putslock' },
  ],
  'kopplingsdosa IP65': [
    { search: 'kabelförskruvning M20', qty: 'per kabel', note: 'Kabelförskruvning M20 IP68' },
    { search: 'WAGO 221', qty: 'per anslutning', note: 'Kopplingsklämmor WAGO' },
  ],
  'brandkopplingsdosa': [
    { search: 'kabelförskruvning M20', qty: 'per kabel', note: 'Kabelförskruvning M20' },
    { search: 'WAGO 221', qty: 'per anslutning', note: 'Kopplingsklämmor WAGO' },
  ],
  'kopplingsdosa': [
    { search: 'kabelgenomföring M20', qty: 'per kabel', note: 'Kabelgenomföring' },
    { search: 'WAGO 221', qty: 'per anslutning', note: 'Kopplingsklämmor WAGO' },
  ],
  'hörnbox': [
    { search: 'DOSSKRUV M3', qty: '2 per hörnbox', note: 'Dosskruvar' },
  ],
  // ===== RÖR & KABEL =====
  'flexrör': [
    { search: 'rörklämma 16', qty: '1 per 30cm', note: 'Rörklammer' },
    { search: 'skarvmuff', qty: 'vid skarv', note: 'Skarvmuff' },
  ],
  'flexslang': [
    { search: 'rörklämma 16', qty: '1 per 30cm', note: 'Rörklammer' },
    { search: 'skarvmuff', qty: 'vid skarv', note: 'Skarvmuff' },
  ],
  'EKK': [
    { search: 'buntband', qty: '1 paket', note: 'Buntband' },
    { search: 'kabelmärkning', qty: '1 paket', note: 'Kabelmärkning' },
  ],
  'FQ': [
    { search: 'buntband', qty: '1 paket', note: 'Buntband' },
    { search: 'kabelmärkning', qty: '1 paket', note: 'Kabelmärkning' },
  ],
  // ===== UTTAG & STRÖMSTÄLLARE =====
  'vägguttag': [
    { search: 'täckram', qty: '1 per uttag', note: 'Täckram' },
    { search: 'apparatdosa enkelgips', qty: '1 (om infälld)', note: 'Apparatdosa' },
  ],
  'dubbeluttag': [
    { search: 'täckram dubbel', qty: '1 per dubbeluttag', note: 'Täckram dubbel' },
    { search: 'apparatdosa dubbel', qty: '1 (om infälld)', note: 'Apparatdosa dubbel' },
  ],
  'strömställare': [
    { search: 'täckram', qty: '1 per strömställare', note: 'Täckram' },
    { search: 'apparatdosa enkelgips', qty: '1 (om infälld)', note: 'Apparatdosa' },
  ],
  'dimmer': [
    { search: 'täckram', qty: '1 per dimmer', note: 'Täckram' },
    { search: 'apparatdosa enkelgips', qty: '1 (om infälld)', note: 'Apparatdosa' },
  ],
  'rörelsevakt': [
    { search: 'apparatdosa enkelgips', qty: '1 (om infälld)', note: 'Apparatdosa' },
  ],
  'IP44': [
    { search: 'kabelförskruvning M20', qty: 'per kabel', note: 'Kabelförskruvning M20' },
  ],
  // ===== CENTRAL & BRYTARE =====
  'dvärgbrytare': [
    { search: 'kamskena', qty: '1 per rad', note: 'Kamskena/samlingsskena' },
  ],
  'jordfelsbrytare': [
    { search: 'kamskena', qty: '1 per rad', note: 'Kamskena/samlingsskena' },
  ],
  'gruppcentral': [
    { search: 'kamskena', qty: '1-2st', note: 'Kamskena' },
    { search: 'PE-plint', qty: '1st', note: 'PE-skena/jordskena' },
    { search: 'kabelmärkning', qty: '1 paket', note: 'Kretsförteckning/märkning' },
    { search: 'kabelgenomföring M20', qty: 'per kabel', note: 'Kabelgenomföringar' },
  ],
  'normkapsling': [
    { search: 'kamskena', qty: '1-2st', note: 'Kamskena' },
    { search: 'PE-plint', qty: '1st', note: 'PE-skena/jordskena' },
    { search: 'kabelmärkning', qty: '1 paket', note: 'Kretsförteckning/märkning' },
  ],
  // ===== BELYSNING =====
  'downlight': [
    { search: 'WAGO 221', qty: '1 per armatur', note: 'Kopplingsklämmor' },
  ],
  'LED panel': [
    { search: 'WAGO 221', qty: '1 per panel', note: 'Kopplingsklämmor' },
  ],
  // ===== VÄRMEKABEL =====
  'värmekabel': [
    { search: 'termostat golvvärme', qty: '1st', note: 'Golvvärmetermostat' },
    { search: 'kopplingsdosa', qty: '1st', note: 'Kopplingsdosa vid termostat' },
    { search: 'apparatdosa enkelgips', qty: '1st', note: 'Apparatdosa för termostat' },
  ],
  // ===== CEE / INDUSTRI =====
  'CEE uttag': [
    { search: 'kabelförskruvning M25', qty: 'per kabel', note: 'Kabelförskruvning M25' },
  ],
  'CEE kontakt': [
    { search: 'kabelförskruvning M25', qty: '1st', note: 'Kabelförskruvning M25' },
  ],
  'kopplingsplint': [
    { search: 'PE-plint', qty: 'vid behov', note: 'PE-plint för jordning' },
  ],
};

/**
 * Get accessories for a product name (uses live search).
 */
export async function getAccessories(productName: string): Promise<{ search: string; qty: string; note: string; match?: CatalogProduct }[]> {
  const name = productName.toLowerCase();
  const results: { search: string; qty: string; note: string; match?: CatalogProduct }[] = [];
  const addedSearches = new Set<string>();

  const sortedKeys = Object.keys(accessoryMap).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (name.includes(key.toLowerCase())) {
      for (const acc of accessoryMap[key]) {
        if (!addedSearches.has(acc.search)) {
          const match = await searchCatalog(acc.search, 1);
          results.push({ ...acc, match: match[0] });
          addedSearches.add(acc.search);
        }
      }
      break;
    }
  }
  return results;
}

/**
 * Get matching installation templates for a query
 */
export function getInstallationTemplates(query: string): InstallationTemplate[] {
  const q = query.toLowerCase();
  return installationTemplates.filter((t) =>
    t.keywords.some((kw) => q.includes(kw))
  );
}

/**
 * Format installation template as context for AI (uses live search)
 */
export async function formatTemplateForAI(template: InstallationTemplate): Promise<string> {
  let result = `INSTALLATION TEMPLATE: ${template.name}\nComplete material list (include ALL items + their accessories when creating shopping list):\n`;
  for (const m of template.materials) {
    const match = await searchCatalog(m.search, 1);
    if (match.length > 0) {
      result += `- ${m.note}: ${match[0].n} (E-nr: ${match[0].e}, Art: ${match[0].a}) x ${m.qty}\n`;
    } else {
      result += `- ${m.note}: ${m.search} x ${m.qty}\n`;
    }
  }
  result += '\nIMPORTANT: Always include stutsar for dosor, rörklammer for flexrör, dosskruvar, ramar for uttag/strömställare, and kopplingsklämmor (WAGO).\n';
  return result;
}
