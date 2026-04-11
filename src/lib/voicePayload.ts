import { Program } from '@/src/types';

export type VoicePartial = {
  name?: string;
  vendor?: string;
  weight?: string;
  pricing?: string;
  quantity?: number;
  program?: string;
};

const MAX_NAME_LEN = 200;

function normalizeProgram(p: unknown): Program {
  if (p === 'Open-Hours' || p === 'Grocery') return p;
  return 'Grocery';
}

function isEffectivelyWholeNumber(n: number): boolean {
  return Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9;
}

function looksLikeMoneyString(s: string): boolean {
  return /[$€£]|\d+\.\d{2}\b|dollar|bucks|cent/i.test(s);
}

/** Parses quantity only when it is clearly a unit count, not a price. */
function parseVoiceQuantity(raw: unknown): { quantity?: number; pricingFromQuantity?: string } {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (isEffectivelyWholeNumber(raw) && Math.round(raw) >= 1) {
      return { quantity: Math.round(raw) };
    }
    return { pricingFromQuantity: String(raw) };
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const t = raw.trim();
    if (looksLikeMoneyString(t)) {
      return { pricingFromQuantity: t };
    }
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n) && n >= 1) return { quantity: Math.round(n) };
      return {};
    }
    const n = Number(t);
    if (Number.isFinite(n) && isEffectivelyWholeNumber(n) && Math.round(n) >= 1) {
      return { quantity: Math.round(n) };
    }
    if (Number.isFinite(n) && !isEffectivelyWholeNumber(n)) {
      return { pricingFromQuantity: t };
    }
  }
  return {};
}

/** Determines Auto-Save vs Fail-Safe: requires valid name + integer quantity ≥ 1. */
export function parseVoiceInventoryPayload(raw: unknown):
  | {
      ok: true;
      item: {
        name: string;
        vendor?: string;
        weight?: string;
        pricing?: string;
        quantity: number;
        program: Program;
      };
    }
  | { ok: false; partial: VoicePartial } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const nameRaw = typeof o.name === 'string' ? o.name.trim() : '';
  const { quantity, pricingFromQuantity } = parseVoiceQuantity(o.quantity);

  const pricingRaw =
    typeof o.pricing === 'string' && o.pricing.trim() !== '' ? o.pricing.trim() : undefined;
  const mergedPricing = [pricingRaw, pricingFromQuantity].filter(Boolean).join(' ').trim() || undefined;

  const partial: VoicePartial = {
    name: nameRaw || undefined,
    vendor: typeof o.vendor === 'string' ? o.vendor : undefined,
    weight: typeof o.weight === 'string' ? o.weight : undefined,
    pricing: mergedPricing,
    quantity,
    program: typeof o.program === 'string' ? o.program : undefined,
  };

  if (!nameRaw || nameRaw.length > MAX_NAME_LEN) {
    return { ok: false, partial };
  }
  if (quantity === undefined || !Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, partial: { ...partial, name: nameRaw } };
  }

  return {
    ok: true,
    item: {
      name: nameRaw,
      vendor: typeof o.vendor === 'string' ? o.vendor : undefined,
      weight: typeof o.weight === 'string' ? o.weight : undefined,
      pricing: mergedPricing,
      quantity,
      program: normalizeProgram(o.program),
    },
  };
}
