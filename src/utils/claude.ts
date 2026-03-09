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
      resolve(base64);
    };
    reader.onerror = reject;
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
  return new Promise((resolve) => {
    let isResolved = false;

    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve(blob); // Use original image if compression times out
      }
    }, 15000); // Increased timeout for mobile

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        if (isResolved) return;
        clearTimeout(timeout);
        isResolved = true;

        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((compressedBlob) => {
          if (!isResolved) {
            isResolved = true;
            resolve(compressedBlob || blob);
          }
        }, 'image/jpeg', 0.8);
      };

      img.onerror = () => {
        if (isResolved) return;
        clearTimeout(timeout);
        isResolved = true;
        resolve(blob); // Fallback to original blob
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      if (isResolved) return;
      clearTimeout(timeout);
      isResolved = true;
      resolve(blob); // Fallback to original on read error
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Analyze electrical panel image with Claude Vision
 */
export async function analyzeElectricalPanel(
  imageBlob: Blob,
  apiKey: string,
  language: string = 'en'
): Promise<ElectricalPanelInfo> {
  if (!apiKey) {
    throw new Error('Claude API key is required');
  }

  console.log('[AI] Starting analysis, image size:', imageBlob.size, 'bytes');

  // Skip compression for small images (< 500KB) — canvas hangs on mobile
  let compressedImage: Blob;
  if (imageBlob.size > 500000) {
    console.log('[AI] Large image, compressing...');
    compressedImage = await compressImage(imageBlob);
    console.log('[AI] Compressed:', imageBlob.size, '->', compressedImage.size, 'bytes');
  } else {
    console.log('[AI] Small image, skipping compression');
    compressedImage = imageBlob;
  }

  const base64Image = await blobToBase64(compressedImage);
  console.log('[AI] Base64 ready, length:', base64Image.length);

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const prompt = `You are a Swedish electrical expert. Analyze this photo from an electrical work site. It could show anything electrical — a panel, wiring, outlets, switches, junction boxes, conduit, cable trays, grounding, lighting, or any part of an installation. Identify what you see and provide a professional assessment.

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
    throw error;
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
  language: string = 'en'
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

  const prompt = `You are a Swedish electrical expert on site with an electrician. They have this task from a photo analysis:

"${taskTitle}"

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
    throw error;
  }
}
