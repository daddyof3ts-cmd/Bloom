import { GoogleGenAI, Type } from '@google/genai';
import { GEMINI_MODEL } from '@/src/config/gemini';
import type { InventoryItem } from '@/src/types';

export interface CompareItemsResult {
  same: boolean;
  reason: string;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** When no API key: only treat as same if normalized names match and program matches. */
export function compareItemsFallback(a: InventoryItem, b: InventoryItem): CompareItemsResult {
  if (a.program !== b.program) {
    return { same: false, reason: 'Different programs (Open-Hours vs Grocery).' };
  }
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  if (na.length === 0 || nb.length === 0) {
    return { same: false, reason: 'Could not compare names.' };
  }
  if (na === nb) {
    return { same: true, reason: 'Exact name match (after normalizing punctuation and case).' };
  }
  return {
    same: false,
    reason: 'Names differ. Use Check with AI when GEMINI_API_KEY is set, or merge only if you are sure.',
  };
}

export async function compareItemsWithGemini(
  a: InventoryItem,
  b: InventoryItem,
  apiKey: string
): Promise<CompareItemsResult> {
  const ai = new GoogleGenAI({ apiKey });
  const snapshot = (x: InventoryItem) => ({
    name: x.name,
    vendor: x.vendor ?? '',
    weight: x.weight ?? '',
    category: x.category ?? '',
    program: x.program,
  });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        text: `Bloom is a food pantry inventory. Decide if these two rows describe the SAME real-world product for stock-keeping (same SKU / same pack), not just same category.

Item A: ${JSON.stringify(snapshot(a))}
Item B: ${JSON.stringify(snapshot(b))}

Minor spelling differences, abbreviations, or extra words ("Organic", size) may still be the same item if they clearly refer to one product. Different flavors, sizes, or donors usually mean different items.

Return JSON only.`,
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          same: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
        },
        required: ['same', 'reason'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}') as CompareItemsResult;
  return {
    same: Boolean(parsed.same),
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

/** Uses Gemini when API key is set; otherwise fallback. */
export async function compareItemsSmart(
  a: InventoryItem,
  b: InventoryItem
): Promise<CompareItemsResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return compareItemsFallback(a, b);
  }
  try {
    return await compareItemsWithGemini(a, b, key);
  } catch (e) {
    console.error('compareItemsWithGemini failed:', e);
    return compareItemsFallback(a, b);
  }
}
