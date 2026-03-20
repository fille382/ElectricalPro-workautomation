import Anthropic from '@anthropic-ai/sdk';
import type { ElectricalPanelInfo } from '../types';

/**
 * Track and log token usage across all API calls
 */
const tokenTracker = {
  session: { input: 0, output: 0, cached: 0, calls: 0 },
  log(label: string, usage: any) {
    if (!usage) return;
    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cached = usage.cache_read_input_tokens || 0;
    this.session.input += input;
    this.session.output += output;
    this.session.cached += cached;
    this.session.calls++;
    const cost = ((input * 3 + output * 15 + cached * 0.3) / 1_000_000).toFixed(4);
    const sessionCost = ((this.session.input * 3 + this.session.output * 15 + this.session.cached * 0.3) / 1_000_000).toFixed(4);
    console.log(
      `%c[Tokens] ${label}%c in: ${input.toLocaleString()}${cached > 0 ? ` (${cached.toLocaleString()} cached)` : ''} | out: ${output.toLocaleString()} | ~$${cost}`,
      'color: #4fc3f7; font-weight: bold', 'color: #aaa'
    );
    console.log(
      `%c[Session Total]%c ${this.session.calls} calls | in: ${this.session.input.toLocaleString()} | out: ${this.session.output.toLocaleString()} | ~$${sessionCost}`,
      'color: #81c784; font-weight: bold', 'color: #888'
    );
  }
};

/**
 * Convert Blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      if (!base64) {
        reject(new Error('Failed to extract base64 from image data'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert Blob/ArrayBuffer to data URL for displaying images
 */
export function blobToDataURL(data: Blob | ArrayBuffer | string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!data) {
      reject(new Error('No image data provided'));
      return;
    }

    // Already a data URL string
    if (typeof data === 'string' && data.startsWith('data:')) {
      resolve(data);
      return;
    }

    // Convert ArrayBuffer to Blob if needed (IndexedDB sometimes returns this)
    let blob: Blob;
    if (data instanceof ArrayBuffer) {
      blob = new Blob([data], { type: 'image/jpeg' });
    } else if (data instanceof Blob) {
      blob = data;
    } else {
      // Try wrapping whatever we got
      try {
        blob = new Blob([data as any], { type: 'image/jpeg' });
      } catch {
        reject(new Error('Cannot convert image data: ' + typeof data));
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress image before sending to Claude (reduce token usage)
 */
export async function compressImage(blob: Blob, maxWidth = 1200): Promise<Blob> {
  try {
    // createImageBitmap works directly with Blob — no FileReader, no Image element,
    // no data URLs. Most memory-efficient approach for mobile.
    const bitmap = await createImageBitmap(blob);

    let width = bitmap.width;
    let height = bitmap.height;
    console.log(`[Compress] Original dimensions: ${width}x${height}, size: ${blob.size}`);

    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); // Free decoded image memory immediately

    const compressed = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', 0.75);
    });

    console.log(`[Compress] Done: ${blob.size} -> ${compressed.size} bytes (${width}x${height})`);
    return compressed;
  } catch (err) {
    console.error('[Compress] Failed:', err);
    return blob;
  }
}

/**
 * Analyze electrical panel image with Claude Vision
 */
export interface PreviousPhotoSummary {
  component_type?: string;
  condition?: string;
  recommendations?: string[];
}

export async function analyzeElectricalPanel(
  imageBlob: Blob,
  apiKey: string,
  language: string = 'en',
  jobContext?: { name: string; description?: string; address?: string },
  previousPhotos?: PreviousPhotoSummary[]
): Promise<ElectricalPanelInfo> {
  if (!apiKey) {
    throw new Error('Claude API key is required');
  }

  console.log('[AI] Starting analysis, image size:', imageBlob.size, 'bytes');

  // Images should already be compressed at capture time, but compress as safety net
  let compressedImage: Blob;
  if (imageBlob.size > 1000000) {
    console.log('[AI] Image still large, compressing...');
    compressedImage = await compressImage(imageBlob);
    console.log('[AI] Compressed:', imageBlob.size, '->', compressedImage.size, 'bytes');
  } else {
    compressedImage = imageBlob;
  }

  const base64Image = await blobToBase64(compressedImage);
  console.log('[AI] Base64 ready, length:', base64Image.length);

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const jobInfo = jobContext
    ? `\n\nJOB CONTEXT — this photo belongs to the following job:\n- Job: ${jobContext.name}${jobContext.description ? `\n- Description: ${jobContext.description}` : ''}${jobContext.address ? `\n- Address: ${jobContext.address}` : ''}\n\nUse this context to understand what part of the building/installation the photo shows. Do NOT guess the room or location — use the job description.\n`
    : '';

  const prevInfo = previousPhotos && previousPhotos.length > 0
    ? `\n\nPREVIOUS PHOTOS already analyzed for this job:\n${previousPhotos.map((p, i) => `${i + 1}. ${p.component_type || 'unknown'}${p.condition ? ` (${p.condition})` : ''}${p.recommendations?.length ? ` — ${p.recommendations.join('; ')}` : ''}`).join('\n')}\n\nAvoid duplicate recommendations. Reference previous findings if relevant.\n`
    : '';

  const prompt = `You are a Swedish electrical expert. Analyze this photo from an electrical work site. It could show anything electrical — a panel, wiring, outlets, switches, junction boxes, conduit, cable trays, grounding, lighting, or any part of an installation. Identify what you see and provide a professional assessment.${jobInfo}${prevInfo}

Decide yourself how deep to go based on what you see — if the image is clear and detailed, provide comprehensive analysis including Swedish standards (SS 436, ELSÄK-FS, BBR). If the image is blurry or shows little detail, just extract what you can.

Format your response as a JSON object:

{
  "component_type": "What the photo shows, e.g. 'panel', 'outlet', 'wiring', 'junction box', 'switch', 'lighting', 'grounding', 'cable tray', 'conduit', 'general installation'",
  "manufacturer": "Brand/manufacturer name if visible, otherwise null",
  "model": "Model number if visible, otherwise null",
  "voltage": "Voltage rating if visible or relevant",
  "amperage": "Amperage/current rating if visible or relevant",
  "circuits": "Number of circuits/breakers if applicable, otherwise null",
  "compliance_marks": ["Visible compliance marks like CE, Swedish Standards"],
  "condition": "Visual condition assessment: excellent/good/fair/poor",
  "location_notes": "What part of the installation this shows and any context",
  "recommendations": ["Actionable work tasks for the electrician, e.g. 'Replace damaged cable insulation', 'Tighten loose terminal connections', 'Add missing cable strain relief'"],
  "raw_analysis": "Your full analysis of what you see"
}

Focus on Swedish electrical standards compliance (SE standard, 3-phase systems, safety requirements). Only include fields you can actually determine from the image. Make recommendations specific and actionable — they will become work tasks for the electrician on site.

${language === 'sv' ? 'IMPORTANT: Write your ENTIRE response in Swedish (svenska). All field values in the JSON — especially "component_type", "recommendations", "location_notes" and "raw_analysis" — MUST be in Swedish.' : ''}`;

  try {
    console.log('[AI] Calling claude-sonnet-4-20250514...');
    const startTime = Date.now();

    // Add timeout for API call (30s)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API call timed out after 30 seconds')), 30000)
    );

    // Detect actual media type from base64 magic bytes (blob.type lies)
    let finalMediaType = 'image/jpeg';
    if (base64Image.startsWith('UklGR')) finalMediaType = 'image/webp';
    else if (base64Image.startsWith('iVBOR')) finalMediaType = 'image/png';
    else if (base64Image.startsWith('/9j/')) finalMediaType = 'image/jpeg';
    else if (base64Image.startsWith('R0lGO')) finalMediaType = 'image/gif';
    console.log('[AI] Detected media type from bytes:', finalMediaType, '(blob said:', compressedImage.type + ')');

    const response = await Promise.race([
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: finalMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
      timeoutPromise,
    ]) as any;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AI] Response received in ${elapsed}s`);
    tokenTracker.log('analyzePanel', response.usage);

    // Extract the text response
    const textContent = response.content.find((block: any) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      console.error('[AI] No text in response:', response.content);
      throw new Error('No text response from Claude');
    }

    console.log('[AI] Raw response:', textContent.text.substring(0, 200) + '...');

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI] No JSON found in response');
      throw new Error('Could not extract JSON from Claude response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    console.log('[AI] Parsed result:', Object.keys(extractedData).join(', '));
    return extractedData as ElectricalPanelInfo;
  } catch (error) {
    console.error('[AI] Analysis error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
    // Handle non-Error objects (e.g., DOM events with {isTrusted: true})
    const msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
    throw new Error(`Failed to analyze image: ${msg}`);
  }
}

/**
 * Ask Claude about electrical standards and best practices
 */
export async function askElectricalQuestion(
  question: string,
  apiKey: string,
  context?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('Claude API key is required');
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const systemPrompt = `You are a Swedish electrical expert with deep knowledge of:
- Swedish electrical standards (SS, SEK)
- European standards (CE, HD)
- Three-phase electrical systems common in Sweden
- Residential and commercial electrical installations
- Building codes and safety regulations in Sweden

Provide clear, practical, and standards-compliant advice.`;

  const userMessage = context
    ? `Context: ${context}\n\nQuestion: ${question}`
    : question;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });
    tokenTracker.log('explainTask', response.usage);

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    return textContent.text;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get response: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Chat with AI about a job — multi-turn conversation with full job context
 */
export interface ChatContext {
  job: { name: string; description?: string; address?: string };
  tasks: { id: string; title: string; status: string; source_photo_id?: string }[];
  photoSummaries: { id: string; component_type?: string; condition?: string; recommendations?: string[] }[];
  shoppingItems?: { name: string; e_number?: string; quantity: number; unit: string; checked: boolean }[];
}

export interface ChatAction {
  type: 'update_task' | 'create_task' | 'delete_task' | 'add_shopping_item' | 'delete_shopping_item' | 'clear_shopping_list';
  task_id?: string;
  status?: 'pending' | 'in-progress' | 'completed';
  title?: string;
  parent_task_id?: string;
  // Shopping item fields
  name?: string;
  e_number?: string;
  article_number?: string;
  manufacturer?: string;
  category?: string;
  quantity?: number;
  unit?: string;
}

export interface ChatResponse {
  message: string;
  actions: ChatAction[];
  options?: string[];  // Clickable option buttons shown to the user
}

export async function chatWithJob(
  userMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  context: ChatContext,
  apiKey: string,
  language: string = 'en',
  knowledgeContext?: string,
  _catalogContext?: string // kept for backward compat, no longer used — AI searches itself
): Promise<ChatResponse> {
  if (!apiKey) throw new Error('Claude API key is required');

  // Import searchCatalog dynamically to avoid circular deps
  const { searchCatalog, formatCatalogResults } = await import('./catalog');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const taskSummary = context.tasks.length > 0
    ? context.tasks.map((t) => `- [${t.status.toUpperCase()}] (id: ${t.id}) ${t.title}`).join('\n')
    : 'No tasks yet.';

  const photoSummary = context.photoSummaries.length > 0
    ? context.photoSummaries.map((p, i) => `${i + 1}. ${p.component_type || 'Photo'} — condition: ${p.condition || 'unknown'}${p.recommendations?.length ? `, recommendations: ${p.recommendations.join('; ')}` : ''}`).join('\n')
    : 'No photos analyzed yet.';

  const kbSection = knowledgeContext
    ? `\n\nGENERAL REFERENCE (Swedish electrical standards — use ONLY if the user asks a related question, do NOT apply this to the job unless relevant):\n${knowledgeContext}\n`
    : '';

  const systemPrompt = `You are an expert Swedish electrician assistant embedded in a work management app. You have DIRECT ACCESS to manage tasks and a shopping list.

You have a tool called "search_catalog" that searches e-nummersok.se (Sweden's official E-nummer database with 915,000+ active products) in REAL-TIME. Use it whenever the user asks about products, materials, or shopping lists. Be smart about search terms — use product names, brands, dimensions, types in Swedish.

SEARCH STRATEGY:
- Keep searches efficient: max 3-5 tool calls per response. Don't over-search.
- If a specific brand doesn't have what's needed, TRY OTHER BRANDS immediately (Hager, Schneider, ABB, OBO, etc.) — don't get stuck on one.
- If no exact match exists, present the CLOSEST alternatives you found and ask the user which one they want. Don't keep searching endlessly.
- Vary search terms: try generic terms ("matarkanal 40x60"), brand-specific ("Hager LFE 40x60"), and dimension-based ("kanal 40x60 vit").
- When the user says a brand, treat it as a preference, not a hard requirement. If that brand lacks the product, suggest alternatives from other brands.
- IMPORTANT: The user speaks casually but you MUST search with professional Swedish electrical terms:
  - "brytare"/"strömbrytare" → search "strömställare"
  - "trapp" (in switch context) → "strömställare trapp" (NOT "trappströmställare" — catalog uses separate words)
  - "kors" → "strömställare kors"
  - "uttag" → "vägguttag jordat"
  - "dimmer" → "dimmer LED" or "vridimmer"
  - "dosa" → "apparatdosa" or "kopplingsdosa"
  - CABLES: "EXQ", "EKLK", "RK", "FK", "PKL" are standard cable type names — search them DIRECTLY: "EXQ 3G1,5", "EKLK 3G1.5"
    Common cables: EXQ (standard installation), EKLK (screened), RK (single conductor), FK (flexible), PKL (patch cable)
  - Always combine with brand when given: "ELKO strömställare trapp", "Schneider strömställare trapp"
  - CATALOG NAMES ARE ABBREVIATED: "STRÖMST TR./1P SNABB INF" = strömställare trapp. So search with SHORT terms too.
  - Use COMMA for decimals in dimensions: "3G1,5" NOT "3G1.5" — the catalog uses Swedish format
  - If first search returns 0 results, try:
    1. Shorter terms: "ELKO strömställare" instead of full description
    2. Just the product code/type: "EXQ 3G1,5", "ELKO trapp"
    3. Article number or E-number if the user provides one — search E-numbers as DIGITS ONLY without "E" prefix: "74 780 19" NOT "E74 780 19"
    4. Synonyms: brytare→strömställare, uttag→vägguttag, kabel→installationskabel
    5. Without brand: user says "exq 3g1.5 oskärmad" → search "EXQ 3G1,5"
  - Search "komplett" or "blister" for products with frame included
  - NEVER search a single casual word alone — always add product context from the conversation

JOB: ${context.job.name}
${context.job.description ? `Description: ${context.job.description}` : ''}
${context.job.address ? `Address: ${context.job.address}` : ''}

CURRENT TASKS:
${taskSummary}

PHOTO ANALYSES:
${photoSummary}

SHOPPING LIST:
${context.shoppingItems && context.shoppingItems.length > 0
    ? context.shoppingItems.map((s) => `- ${s.checked ? '[BOUGHT]' : '[  ]'} ${s.name}${s.e_number ? ` (E-nr: ${s.e_number})` : ''} x${s.quantity} ${s.unit}`).join('\n')
    : 'Empty.'}${kbSection}

AFTER you have all the product data you need (from tool calls), respond with valid JSON:
{"message": "text", "actions": [...], "options": ["Option 1", "Option 2"]}

OPTIONS FIELD (interactive buttons shown to the user):
Use "options" to present clickable choices. The user taps a button instead of typing. Great for mobile users.
- Use options when presenting product alternatives, brand choices, series selection, or any decision point
- Keep option text short and clear (product name + key info)
- Max 6 options per response
- Options are sent as user messages when tapped
- Guide the user step by step: first brand → then series → then specific product
- Example flow: ["Schneider", "Hager", "ABB"] → ["Exxact", "Renova", "Robust"] → ["1-vägs jordat", "2-vägs jordat", "USB-uttag"]
- If the user's choice is clear and doesn't need narrowing down, skip options and just add the item directly
- Omit "options" or set to [] when no choices are needed
- NEVER offer options for things the user can do in the UI already (changing quantity, checking off items). The shopping list has +/- buttons for quantity. Only offer options for PRODUCT SELECTION decisions.
- After adding an item, suggest RELATED products the user might also need (e.g. after adding uttag: "Behöver du ram?", "Lägg till apparatdosa?") — not quantity changes

AVAILABLE ACTIONS:

1. UPDATE task: {"type": "update_task", "task_id": "ID", "status": "completed", "title": "optional new title"}
2. CREATE task: {"type": "create_task", "title": "Task description"}
   Sub-task: {"type": "create_task", "title": "Sub-step", "parent_task_id": "parent_ID"}
3. DELETE task: {"type": "delete_task", "task_id": "ID"}
4. ADD to shopping list: {"type": "add_shopping_item", "name": "Product name", "e_number": "XX XXX XX", "article_number": "art-nr", "manufacturer": "brand", "category": "Category", "quantity": 10, "unit": "st"}
   CRITICAL: Always use the search_catalog tool FIRST to find real E-numbers before adding shopping items. Copy e_number and article_number EXACTLY from search results. The user NEEDS E-numbers to order from their grossist.
   CATEGORY: Always set category to group products. Use these standard categories:
   "Kanaler & rör", "Uttag & strömställare", "Dosor & kapslingar", "Kabel", "Central & säkringar", "Data & nätverk", "Belysning", "Tillbehör", "Övrigt"
   DEDUPLICATION: If the same product (same E-number) already exists in the shopping list, do NOT add it again. Instead tell the user to update the quantity on the existing item.
5. DELETE shopping item by name: {"type": "delete_shopping_item", "name": "Product name"}
6. CLEAR entire shopping list: {"type": "clear_shopping_list"}

Valid task statuses: "pending", "in-progress", "completed"
Valid shopping units: "st", "m", "paket", "rulle", "burk"

WHEN TO USE ACTIONS:
- User says task is done → update_task with status "completed"
- User says task text is wrong → update_task with new title
- User asks to remove irrelevant tasks → delete_task
- User asks to break down/develop a task → create multiple sub-tasks with parent_task_id
- User asks to add new work items → create_task
- User asks for materials/shopping list → FIRST search_catalog for each product type, THEN add_shopping_item with real E-numbers
- User asks "vad behöver jag" or "skapa inköpslista" → analyze tasks, search catalog, create shopping items with real products
- User asks to remove items from shopping list → delete_shopping_item with matching name
- User asks to clear/empty shopping list → clear_shopping_list
- User asks about products/brands/specifications → search_catalog to find real data, then answer
- User asks general questions → empty actions []

You can use MULTIPLE actions at once. When creating a shopping list, add ALL relevant items in one response.

RULES:
- ALWAYS output valid JSON as your final response (after any tool calls)
- Use EXACT task IDs from the list
- Keep message concise — used on phone on-site
- You are also a general electrical expert — answer any electrical questions
- CRITICAL: ONLY reference tasks, photos, and conditions that ACTUALLY exist in the data above. NEVER invent or assume issues that are not in the CURRENT TASKS or PHOTO ANALYSES sections.
- When adding shopping items, ALWAYS search the catalog first. If no catalog match exists, still add the item but without e_number.
${language === 'sv' ? '- Write "message" in Swedish (svenska)' : ''}`;

  // Tool definition for catalog search
  const tools = [
    {
      name: 'search_catalog',
      description: 'Search the Swedish E-nummer product catalog (e-nummersok.se) for electrical products. Returns real products with E-numbers, article numbers, and manufacturers. Use specific Swedish product terms for best results. Call multiple times with different queries to find all needed products. When searching by E-number, use DIGITS ONLY: "74 780 19" NOT "E74 780 19".',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'Search query — use specific Swedish product names, brands, dimensions. Examples: "Hager kanalplast 40x60", "Exxact vägguttag", "patchkabel cat6 1m", "ABB jordfelsbrytare 30mA"',
          },
          limit: {
            type: 'number',
            description: 'Max number of results (default 8)',
          },
        },
        required: ['query'],
      },
    },
  ];

  // Build conversation messages — limit to last 10 messages to save tokens
  const recentHistory = conversationHistory.slice(-10);
  const messages: any[] = [
    ...recentHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'assistant'
        ? `{"message": ${JSON.stringify(m.content)}, "actions": []}`
        : m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  // System prompt with cache control for prompt caching (saves ~90% on repeated calls)
  const systemMessages = [
    {
      type: 'text' as const,
      text: systemPrompt,
      cache_control: { type: 'ephemeral' as const },
    },
  ];

  try {
    // Tool-use loop: let AI search catalog as many times as it needs
    let maxIterations = 8; // Safety limit — AI should use max 3-5 searches per response
    while (maxIterations-- > 0) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('API call timed out after 60 seconds')), 60000)
      );

      const response = await Promise.race([
        client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemMessages,
          messages,
          tools,
        }),
        timeoutPromise,
      ]) as any;

      tokenTracker.log('chatWithJob', response.usage);

      // Check if AI wants to use a tool
      const toolUses = response.content.filter((b: any) => b.type === 'tool_use');

      if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
        // No tool calls — parse the final text response
        const textContent = response.content.find((b: any) => b.type === 'text');
        if (!textContent || textContent.type !== 'text') throw new Error('No text response from Claude');

        return parseJsonResponse(textContent.text);
      }

      // Execute tool calls and feed results back
      // Add assistant message with all content blocks
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool call
      const toolResults: any[] = [];
      for (const toolUse of toolUses) {
        if (toolUse.name === 'search_catalog') {
          const query = toolUse.input?.query || '';
          const limit = toolUse.input?.limit || 8;
          console.log(`[AI Tool] search_catalog("${query}", ${limit})`);

          const results = await searchCatalog(query, limit);
          const formatted = results.length > 0
            ? formatCatalogResults(results)
            : `No results found for "${query}". Try a different search term.`;

          console.log(`[AI Tool] Got ${results.length} results for "${query}"`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: formatted,
          });
        }
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });
    }

    // If we exhausted iterations, try to get final response
    throw new Error('Too many tool call iterations');
  } catch (error) {
    if (error instanceof Error) throw new Error(`Chat failed: ${error.message}`);
    throw new Error(`Chat failed: ${String(error)}`);
  }
}

/**
 * Parse a JSON chat response from the AI, handling various formats
 */
function parseJsonResponse(text: string): ChatResponse {
  const extract = (parsed: any): ChatResponse => ({
    message: parsed.message,
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    options: Array.isArray(parsed.options) ? parsed.options.filter((o: any) => typeof o === 'string') : undefined,
  });

  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (parsed.message !== undefined) return extract(parsed);
  } catch { /* try next */ }

  // Try finding JSON object in text
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.message !== undefined) return extract(parsed);
    }
  } catch { /* try next */ }

  // Find outermost JSON with "message" key
  try {
    const msgIdx = text.indexOf('"message"');
    if (msgIdx >= 0) {
      let start = text.lastIndexOf('{', msgIdx);
      if (start >= 0) {
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') {
            depth--;
            if (depth === 0) {
              try {
                const parsed = JSON.parse(text.substring(start, i + 1));
                if (parsed.message !== undefined) return extract(parsed);
              } catch { /* continue */ }
            }
          }
        }
      }
    }
  } catch { /* fall through */ }

  // Final fallback: return as plain message
  const cleaned = text
    .replace(/^["\s]*message["\s]*:["\s]*/i, '')
    .replace(/["\s]*,\s*"actions"\s*:\s*\[[\s\S]*$/i, '')
    .replace(/^["']|["']$/g, '');
  return { message: cleaned || text, actions: [] };
}

export interface TaskExplanation {
  explanation: string;
  subtasks: string[];
}

/**
 * Explain a specific task/recommendation in detail, using the source photo for context.
 * Returns both explanation text and actionable sub-tasks.
 */
export async function explainTask(
  taskTitle: string,
  imageBlob: Blob,
  apiKey: string,
  language: string = 'en',
  jobContext?: { name: string; description?: string; address?: string }
): Promise<TaskExplanation> {
  if (!apiKey) {
    throw new Error('Claude API key is required');
  }

  console.log('[AI] Explaining task:', taskTitle);

  // Same compression/base64 logic as analyzeElectricalPanel
  let compressedImage: Blob;
  if (imageBlob.size > 500000) {
    compressedImage = await compressImage(imageBlob);
  } else {
    compressedImage = imageBlob;
  }

  const base64Image = await blobToBase64(compressedImage);

  let finalMediaType = 'image/jpeg';
  if (base64Image.startsWith('UklGR')) finalMediaType = 'image/webp';
  else if (base64Image.startsWith('iVBOR')) finalMediaType = 'image/png';
  else if (base64Image.startsWith('/9j/')) finalMediaType = 'image/jpeg';
  else if (base64Image.startsWith('R0lGO')) finalMediaType = 'image/gif';

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const jobInfo = jobContext
    ? `\n\nJOB CONTEXT:\n- Job: ${jobContext.name}${jobContext.description ? `\n- Description: ${jobContext.description}` : ''}${jobContext.address ? `\n- Address: ${jobContext.address}` : ''}\n`
    : '';

  const prompt = `You are a Swedish electrical expert on site with an electrician. They have this task from a photo analysis:

"${taskTitle}"${jobInfo}

Look at the photo and provide:
1. A detailed explanation of what needs to be done and why
2. Which specific parts of the installation are affected (reference what you see in the photo)
3. Relevant Swedish standards (SS 436, ELSÄK-FS, BBR) and what they require
4. Any tools or materials needed

Then break this task down into specific, actionable sub-tasks (the concrete steps to complete it).

Format your response as JSON:
{
  "explanation": "Your detailed explanation in clear paragraphs. Use \\n for line breaks between paragraphs.",
  "subtasks": [
    "Step 1: concrete action",
    "Step 2: concrete action",
    "..."
  ]
}

Be practical and specific — this is for a working electrician on site. The subtasks should be short, checkable items (3-8 items).

${language === 'sv' ? 'IMPORTANT: Write your ENTIRE response in Swedish (svenska). Both the "explanation" text and all "subtasks" items MUST be in Swedish.' : ''}`;

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API call timed out after 45 seconds')), 45000)
    );

    const response = await Promise.race([
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: finalMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
      timeoutPromise,
    ]) as any;

    tokenTracker.log('explainTaskWithPhoto', response.usage);

    const textContent = response.content.find((block: any) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    console.log('[AI] Task explanation received');

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          explanation: parsed.explanation || textContent.text,
          subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
        };
      } catch {
        // JSON parse failed, fall back to plain text
      }
    }

    // Fallback: return raw text with no subtasks
    return { explanation: textContent.text, subtasks: [] };
  } catch (error) {
    console.error('[AI] Explain task error:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to explain task: ${error.message}`);
    }
    const msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
    throw new Error(`Failed to explain task: ${msg}`);
  }
}
