import type { KnowledgeEntry } from '../types';
import { getAllKnowledge, addKnowledge, updateKnowledge } from './db';

/**
 * Search knowledge base for relevant entries.
 * Returns matches sorted by relevance (keyword overlap).
 */
export async function searchKnowledge(query: string, maxResults = 3): Promise<KnowledgeEntry[]> {
  const all = await getAllKnowledge();
  if (all.length === 0) return [];

  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return [];

  const scored = all.map((entry) => {
    const entryText = `${entry.question} ${entry.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (entryText.includes(word)) score++;
      // Bonus for exact keyword match
      if (entry.keywords.some((k) => k.toLowerCase() === word)) score += 2;
    }
    // Normalize by query length to require meaningful overlap
    const relevance = score / queryWords.length;
    return { entry, score, relevance };
  });

  return scored
    .filter((s) => s.relevance >= 0.4) // At least 40% of query words must match
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.entry);
}

/**
 * Increment use count for a knowledge entry
 */
export async function markUsed(id: string): Promise<void> {
  const all = await getAllKnowledge();
  const entry = all.find((e) => e.id === id);
  if (entry) {
    await updateKnowledge(id, { useCount: entry.useCount + 1 });
  }
}

/**
 * Auto-save an AI answer as knowledge if it contains useful technical info.
 * Avoids duplicates by checking keyword overlap with existing entries.
 */
export async function learnFromChat(question: string, answer: string, language: string): Promise<void> {
  // Only save substantial technical answers (not task management chatter)
  if (answer.length < 150) return;

  // Skip if it's just task management (mark done, prioritize, etc.)
  const taskWords = /markera|klart|klar|prioriter|ta bort|remove|delete|done|complete|mark|next/i;
  if (taskWords.test(question) && question.length < 50) return;

  const keywords = extractKeywords(question + ' ' + answer, language);
  if (keywords.length < 3) return;

  // Check for duplicates
  const existing = await getAllKnowledge();
  const isDuplicate = existing.some((e) => {
    const overlap = e.keywords.filter((k) => keywords.includes(k));
    return overlap.length >= Math.min(3, keywords.length);
  });
  if (isDuplicate) return;

  const category = detectCategory(question + ' ' + answer);

  await addKnowledge({
    question,
    keywords,
    answer,
    category,
    source: 'ai',
  });
}

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string, _language: string): string[] {
  const stopWords = new Set([
    // Swedish
    'och', 'att', 'det', 'som', 'för', 'med', 'den', 'har', 'kan', 'ska',
    'inte', 'ett', 'var', 'alla', 'man', 'hur', 'vad', 'finns', 'till',
    'från', 'eller', 'när', 'här', 'där', 'bara', 'mer', 'ser', 'dig',
    'jag', 'min', 'mig', 'ditt', 'din', 'dom', 'dem',
    // English
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'with',
    'this', 'that', 'what', 'from', 'they', 'will', 'been', 'would',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-zåäö0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Deduplicate and take top 10
  return [...new Set(words)].slice(0, 10);
}

/**
 * Detect knowledge category from content
 */
function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/ss\s*436|elsäk|standard|norm|bbr|boverket/.test(lower)) return 'standards';
  if (/kabel|ledning|wir|dragning|dimension/.test(lower)) return 'wiring';
  if (/säkerhet|skydd|jord|brand|fire|safety/.test(lower)) return 'safety';
  if (/verktyg|tool|instrument|mät|measur/.test(lower)) return 'tools';
  if (/panel|central|breaker|säkring|fuse/.test(lower)) return 'panels';
  if (/ip\s*\d|klass|fukt|moisture|damp/.test(lower)) return 'ip-rating';
  return 'general';
}

/**
 * No-op — knowledge base is now purely learned from AI conversations.
 * Kept for backwards compatibility with App.tsx import.
 */
export async function seedKnowledgeBase(): Promise<void> {
  // Knowledge is only saved from actual useful AI chat responses via learnFromChat()
}
