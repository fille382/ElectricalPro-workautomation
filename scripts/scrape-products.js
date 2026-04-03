#!/usr/bin/env node
/**
 * E-nummersok.se Product Scraper
 *
 * Scrapes products from e-nummersok.se API and inserts into PocketBase.
 * Searches by category keywords to build up a comprehensive product database.
 *
 * Usage:
 *   node scripts/scrape-products.js                    # Run all categories
 *   node scripts/scrape-products.js --category "uttag" # Run specific category
 *   node scripts/scrape-products.js --resume           # Resume from last position
 *   node scripts/scrape-products.js --stats            # Show database stats
 *
 * Config:
 *   PB_URL     - PocketBase URL (default: http://127.0.0.1:8090)
 *   PB_EMAIL   - Admin email
 *   PB_PASS    - Admin password
 */

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_EMAIL = process.env.PB_EMAIL || 'bellanderfilip@gmail.com';
const PB_PASS = process.env.PB_PASS || 'smzsrRQSgnu3rNJ34Juz';
const API_URL = 'https://www.e-nummersok.se/ApiSearch/Search/';

// Rate limiting
const DELAY_BETWEEN_SEARCHES = 500; // ms between API calls
const DELAY_BETWEEN_CATEGORIES = 2000; // ms between categories
const MAX_PAGES_PER_SEARCH = 10;
const PAGE_SIZE = 50;

// All electrical product search terms organized by category
const SEARCH_TERMS = {
  'Vägguttag': [
    'vägguttag jordat', 'vägguttag 1-v', 'vägguttag 2-v', 'dubbeluttag',
    'vägguttag IP44', 'vägguttag USB', 'vägguttag utanpåliggande',
    'petterssonutag', 'jordade uttag', 'uttag infälld',
  ],
  'Strömställare': [
    'strömställare trapp', 'strömställare kors', 'strömställare 1-pol',
    'strömställare komplett', 'vippströmställare', 'tryckknapp',
    'strömställare IP44', 'strömställare utanpåliggande',
  ],
  'Dimmer': [
    'dimmer LED', 'dimmer roterande', 'vriddimmer', 'dimmer universal',
    'dimmer DALI', 'dimmer tryck', 'dimmer infälld',
  ],
  'Centraler & Brytare': [
    'dvärgbrytare B10', 'dvärgbrytare B16', 'dvärgbrytare C10', 'dvärgbrytare C16',
    'dvärgbrytare C20', 'dvärgbrytare C25', 'dvärgbrytare C32',
    'jordfelsbrytare 30mA', 'jordfelsbrytare 300mA', 'jordfelsbrytare typ A',
    'jordfelsbrytare typ B', 'personskyddsbrytare',
    'normkapsling', 'gruppcentral', 'kapsling IP40', 'kapsling IP65',
    'överspänningsskydd', 'kamskena', 'nollskena', 'PE-plint',
    'huvudbrytare', 'lastfrånskiljare',
  ],
  'Dosor': [
    'apparatdosa enkelgips', 'apparatdosa dubbel', 'apparatdosa trippel',
    'apparatdosa betong', 'spårdosa', 'kopplingsdosa', 'kopplingsdosa IP65',
    'brandkopplingsdosa', 'hörnbox', 'förhöjningsring',
    'putslock', 'blindlock', 'dosskruv',
  ],
  'Stutsar & Genomföringar': [
    'enkelstuts', 'dubbelstuts', 'stuts 16', 'stuts 20',
    'kabelförskruvning M20', 'kabelförskruvning M25', 'kabelförskruvning M32',
    'kabelgenomföring', 'dragavlastning',
  ],
  'Kabel': [
    'EKK 3G1.5', 'EKK 3G2.5', 'EKK 5G2.5', 'EKK 5G6',
    'EXQ 3G1.5', 'EXQ 3G2.5', 'EXQ 5G2.5',
    'FQ 2x0.75', 'FQ 2x1.5', 'FQ 4x0.75',
    'installationskabel', 'skärmad kabel', 'brandkabel',
    'EKLK', 'FXQJ', 'N1XV',
  ],
  'Rör & Flexslang': [
    'flexslang 16', 'flexslang 20', 'flexslang 25',
    'installationsrör', 'elrör', 'rörklämma 16', 'rörklämma 20',
    'skarvmuff', 'rörbockar',
  ],
  'Kanaler': [
    'kabelkanal', 'matarkanal', 'kanal 40x60', 'kanal 60x60',
    'kanal 80x60', 'kanal 100x60', 'hager LFE', 'hager LF',
    'ändstycke kanal', 'innerhörn kanal', 'ytterhörn kanal',
    'T-stycke kanal', 'L-vinkel kanal', 'låsbygel',
    'kanalplast', 'minikanal', 'golvkanal',
  ],
  'Belysning': [
    'downlight LED', 'LED panel', 'LED list', 'LED driver',
    'plafond', 'armatur IP44', 'armatur IP65',
    'nödbelysning', 'nödljus', 'rörelsevakt',
    'skymningsrelä', 'tidur', 'trappautomat',
  ],
  'WAGO & Kopplingsklämmor': [
    'WAGO 221', 'WAGO 222', 'WAGO 773',
    'kopplingklämma', 'snabbkoppling', 'skarvklämma',
    'kopplingsplint', 'jordklämma',
  ],
  'Täckramar & Design': [
    'täckram', 'täckram 1-fack', 'täckram 2-fack', 'täckram 3-fack',
    'centrumplatta', 'mellanram',
  ],
  'Data & Tele': [
    'keystone', 'datauttag', 'patchkabel', 'patchpanel',
    'nätverksuttag', 'RJ45', 'teleuttag', 'antennuttag',
    'mediaomvandlare', 'nätverksswitch',
  ],
  'Värmekabel': [
    'värmekabel', 'termostat golvvärme', 'värmematta',
    'frostskyddskabel', 'värmekabelset',
  ],
  'CEE & Industri': [
    'CEE uttag', 'CEE kontakt', 'CEE kopplingsdon',
    'kraftuttag', 'byggström', 'centralapparat',
  ],
  'Brandskydd': [
    'brandvarnare', 'brandlarm', 'rökdetektor',
    'brandtätning', 'brandmanschett',
  ],
  'Schneider Serier': [
    'schneider exxact', 'schneider renova', 'schneider robust',
    'schneider primo', 'schneider mureva',
  ],
  'ELKO Serier': [
    'elko one', 'elko plus', 'elko RS',
    'elko strömställare', 'elko uttag',
  ],
  'ABB Serier': [
    'ABB impressivo', 'ABB jussi', 'ABB ocean',
    'ABB strömställare', 'ABB uttag',
  ],
  'Hager Serier': [
    'hager dvärgbrytare', 'hager jordfelsbrytare',
    'hager normkapsling', 'hager kamskena',
  ],
  'Buntband & Märkning': [
    'buntband', 'kabelmärkning', 'märkbricka', 'etikett',
    'kabelstrip', 'spiralslang', 'kabelkanal kontorsgolv',
  ],
};

// State tracking
let token = null;
let stats = { searched: 0, inserted: 0, duplicates: 0, errors: 0, apiCalls: 0 };
let progressFile = 'scrape-progress.json';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function authenticate() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Auth failed: ' + JSON.stringify(data));
  token = data.token;
  console.log('✓ Authenticated with PocketBase');
}

async function searchENummer(query, page = 1) {
  stats.apiCalls++;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Query: query, Page: page, PageSize: PAGE_SIZE, OnlyActive: false }),
  });
  if (!res.ok) return { rows: [], total: 0 };
  const data = await res.json();
  const rows = (data?.Data?.SearchResultRows || []).filter(r => r.IsActive);
  const total = data?.Data?.TotalHits || 0;
  return { rows, total };
}

async function insertProduct(product) {
  const res = await fetch(`${PB_URL}/api/collections/products/records`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  const data = await res.json();
  if (data.id) {
    stats.inserted++;
    return true;
  }
  if (data.data?.e_number?.code === 'validation_not_unique') {
    stats.duplicates++;
    return false;
  }
  stats.errors++;
  return false;
}

function formatProduct(row) {
  return {
    e_number: row.RSKNummer || '',
    name: row.Name || '',
    description: row.Description || '',
    article_number: row.ArtikelNummer || '',
    manufacturer: (row.ManufacturerAlias || '').replace(/ AB$| Sverige AB$| Sweden AB$/, ''),
    category: row.ProductGroupName2 || '',
  };
}

async function scrapeSearchTerm(term) {
  let page = 1;
  let totalInserted = 0;

  while (page <= MAX_PAGES_PER_SEARCH) {
    const { rows, total } = await searchENummer(term, page);
    if (rows.length === 0) break;

    for (const row of rows) {
      const product = formatProduct(row);
      if (product.e_number) {
        const inserted = await insertProduct(product);
        if (inserted) totalInserted++;
      }
    }

    stats.searched += rows.length;

    // Check if we've gotten all results
    if (page * PAGE_SIZE >= total) break;
    page++;
    await sleep(DELAY_BETWEEN_SEARCHES);
  }

  return totalInserted;
}

async function getStats() {
  const res = await fetch(`${PB_URL}/api/collections/products/records?perPage=1`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  return data.totalItems || 0;
}

async function loadProgress() {
  try {
    const fs = await import('fs');
    if (fs.existsSync(progressFile)) {
      return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    }
  } catch {}
  return { completedCategories: [], completedTerms: [] };
}

async function saveProgress(progress) {
  const fs = await import('fs');
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

async function main() {
  const args = process.argv.slice(2);

  await authenticate();

  // Stats mode
  if (args.includes('--stats')) {
    const total = await getStats();
    console.log(`\n📊 Database Stats:`);
    console.log(`   Total products: ${total}`);

    // Count by manufacturer
    const manufacturers = {};
    let page = 1;
    while (true) {
      const res = await fetch(`${PB_URL}/api/collections/products/records?perPage=200&page=${page}&fields=manufacturer`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      for (const item of data.items || []) {
        const m = item.manufacturer || 'Unknown';
        manufacturers[m] = (manufacturers[m] || 0) + 1;
      }
      if (page * 200 >= data.totalItems) break;
      page++;
    }
    console.log(`\n   By manufacturer:`);
    Object.entries(manufacturers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([m, c]) => console.log(`     ${m}: ${c}`));
    return;
  }

  const startTotal = await getStats();
  console.log(`📦 Starting with ${startTotal} products in database\n`);

  // Filter categories
  const targetCategory = args.find(a => !a.startsWith('--'));
  const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
  const resume = args.includes('--resume');

  let progress = resume ? await loadProgress() : { completedCategories: [], completedTerms: [] };

  const categories = Object.entries(SEARCH_TERMS);

  for (const [category, terms] of categories) {
    // Skip if filtering
    if (categoryFilter && !category.toLowerCase().includes(categoryFilter.toLowerCase())) continue;
    if (resume && progress.completedCategories.includes(category)) {
      console.log(`⏭ Skipping completed: ${category}`);
      continue;
    }

    console.log(`\n🔍 Category: ${category} (${terms.length} search terms)`);
    console.log('─'.repeat(50));

    let categoryInserted = 0;

    for (const term of terms) {
      if (resume && progress.completedTerms.includes(term)) {
        process.stdout.write(`  ⏭ ${term}\n`);
        continue;
      }

      process.stdout.write(`  🔎 "${term}" ... `);
      const inserted = await scrapeSearchTerm(term);
      console.log(`+${inserted} (${stats.duplicates} dup)`);
      categoryInserted += inserted;

      progress.completedTerms.push(term);
      await saveProgress(progress);

      await sleep(DELAY_BETWEEN_SEARCHES);
    }

    console.log(`  ✓ ${category}: +${categoryInserted} new products`);
    progress.completedCategories.push(category);
    await saveProgress(progress);

    await sleep(DELAY_BETWEEN_CATEGORIES);
  }

  const endTotal = await getStats();
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Scraping complete!`);
  console.log(`   API calls: ${stats.apiCalls}`);
  console.log(`   Products searched: ${stats.searched}`);
  console.log(`   New products: ${stats.inserted}`);
  console.log(`   Duplicates skipped: ${stats.duplicates}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Total in database: ${startTotal} → ${endTotal}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
