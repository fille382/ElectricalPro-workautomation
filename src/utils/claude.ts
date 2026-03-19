import Anthropic from '@anthropic-ai/sdk';
import type { ElectricalPanelInfo } from '../types';

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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

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
  quantity?: number;
  unit?: string;
}

export interface ChatResponse {
  message: string;
  actions: ChatAction[];
}

export async function chatWithJob(
  userMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  context: ChatContext,
  apiKey: string,
  language: string = 'en',
  knowledgeContext?: string,
  catalogContext?: string
): Promise<ChatResponse> {
  if (!apiKey) throw new Error('Claude API key is required');

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

  const catalogSection = catalogContext
    ? `\n\nPRODUCT CATALOG (real E-numbers from e-nummersok.se — ALWAYS use these when adding shopping items):\n${catalogContext}\n\nCRITICAL: When adding shopping items, you MUST copy the exact E-nr and Art.nr from the catalog above into the e_number and article_number fields. Every add_shopping_item action MUST have e_number if a matching product exists in the catalog. The user NEEDS E-numbers to order from their grossist.\n`
    : '';

  const systemPrompt = `You are an expert Swedish electrician assistant embedded in a work management app. You have DIRECT ACCESS to manage tasks and a shopping list.

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
    : 'Empty.'}${kbSection}${catalogSection}

YOU MUST ALWAYS respond with valid JSON: {"message": "text", "actions": []}

AVAILABLE ACTIONS:

1. UPDATE task: {"type": "update_task", "task_id": "ID", "status": "completed", "title": "optional new title"}
2. CREATE task: {"type": "create_task", "title": "Task description"}
   Sub-task: {"type": "create_task", "title": "Sub-step", "parent_task_id": "parent_ID"}
3. DELETE task: {"type": "delete_task", "task_id": "ID"}
4. ADD to shopping list: {"type": "add_shopping_item", "name": "Product name", "e_number": "XX XXX XX", "article_number": "art-nr", "manufacturer": "brand", "quantity": 10, "unit": "st"}
   MANDATORY: Copy e_number and article_number EXACTLY from the PRODUCT CATALOG section above. Match the user's request to catalog products and use their E-nr values. Without E-numbers the shopping list is useless.
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
- User asks for materials/shopping list → add_shopping_item (one per product, use REAL E-numbers from the catalog when available)
- User asks "vad behöver jag" or "skapa inköpslista" → analyze tasks and create shopping items with real products
- User asks to remove items from shopping list → delete_shopping_item with matching name
- User asks to clear/empty shopping list → clear_shopping_list
- User asks general questions → empty actions []

You can use MULTIPLE actions at once. When creating a shopping list, add ALL relevant items in one response.

RULES:
- ALWAYS output valid JSON
- Use EXACT task IDs from the list
- Keep message concise — used on phone on-site
- You are also a general electrical expert — answer any electrical questions
- CRITICAL: ONLY reference tasks, photos, and conditions that ACTUALLY exist in the data above. NEVER invent or assume issues that are not in the CURRENT TASKS or PHOTO ANALYSES sections.
- When adding shopping items, prefer products from the PRODUCT CATALOG with real E-numbers. If no catalog match, still add the item but without e_number.
${language === 'sv' ? '- Write "message" in Swedish (svenska)' : ''}`;

  // Only send last 10 messages for context, and wrap assistant messages
  // so the AI sees them as the "message" field, not raw JSON
  const recentHistory = conversationHistory.slice(-10);
  const messages = [
    ...recentHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'assistant'
        ? `{"message": ${JSON.stringify(m.content)}, "actions": []}`
        : m.content,
    })),
    { role: 'user' as const, content: userMessage },
    // Prefill to force JSON output
    { role: 'assistant' as const, content: '{' },
  ];

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API call timed out after 45 seconds')), 45000)
    );

    const response = await Promise.race([
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      }),
      timeoutPromise,
    ]) as any;

    const textContent = response.content.find((block: any) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') throw new Error('No text response from Claude');

    // Parse structured response — prefill sent '{', so prepend it
    const raw = '{' + textContent.text;

    // Try multiple parsing strategies
    // Strategy 1: Direct JSON parse of entire response
    try {
      const parsed = JSON.parse(raw);
      if (parsed.message !== undefined) {
        return {
          message: parsed.message,
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
      }
    } catch { /* try next strategy */ }

    // Strategy 2: Find the outermost valid JSON with "message" key
    try {
      // Find "message" and "actions" positions to extract the JSON structure
      const msgIdx = raw.indexOf('"message"');
      if (msgIdx >= 0) {
        // Find the opening brace before "message"
        let start = raw.lastIndexOf('{', msgIdx);
        if (start >= 0) {
          // Try parsing from each '{' working outward
          let depth = 0;
          for (let i = start; i < raw.length; i++) {
            if (raw[i] === '{') depth++;
            else if (raw[i] === '}') {
              depth--;
              if (depth === 0) {
                try {
                  const parsed = JSON.parse(raw.substring(start, i + 1));
                  if (parsed.message !== undefined) {
                    return {
                      message: parsed.message,
                      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
                    };
                  }
                } catch { /* try wider match */ }
              }
            }
          }
        }
      }
    } catch { /* try next strategy */ }

    // Strategy 3: Regex fallback
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message || textContent.text,
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
      }
    } catch { /* fall through */ }

    // Final fallback: strip any JSON artifacts and return as plain message
    const cleaned = textContent.text
      .replace(/^["\s]*message["\s]*:["\s]*/i, '')
      .replace(/["\s]*,\s*"actions"\s*:\s*\[[\s\S]*$/i, '')
      .replace(/^["']|["']$/g, '');
    return { message: cleaned || textContent.text, actions: [] };
  } catch (error) {
    if (error instanceof Error) throw new Error(`Chat failed: ${error.message}`);
    throw new Error(`Chat failed: ${String(error)}`);
  }
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
