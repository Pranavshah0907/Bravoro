import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Repair mojibake: reverse Latin-1-misinterpreted UTF-8.
 * e.g. "GÃ¼ntner" → "Güntner", "MÃ¼ller" → "Müller"
 *
 * Works by treating each char code as a raw byte and re-decoding as UTF-8.
 * Returns the original string unchanged if it's already clean.
 */
export function fixMojibake(str: string): string {
  // Quick check: if every char is ASCII (< 128) there's nothing to fix
  if (!/[\x80-\xff]/.test(str)) return str;
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code > 255) return str; // Already proper Unicode, not mojibake
      bytes[i] = code;
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return str; // Not valid UTF-8 bytes → leave as-is
  }
}

/**
 * Walk an entire parsed-Excel data structure and fix mojibake on every string value.
 */
export function fixMojibakeDeep(obj: any): any {
  if (typeof obj === "string") return fixMojibake(obj);
  if (Array.isArray(obj)) return obj.map(fixMojibakeDeep);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      out[fixMojibake(k)] = fixMojibakeDeep(v);
    }
    return out;
  }
  return obj;
}
