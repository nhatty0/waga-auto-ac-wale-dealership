/**
 * Ethiopian Vehicle License Plate Utilities & Formatting
 *
 * Supports:
 *  - new_series ("አዲስ ሰሌዳ - AAA/AAB Series" New Digital Plate)
 *  - unregistered ("ያልተለጠፈ")
 *  - code_2 ("ኮድ 2")
 *  - code_3 ("ኮድ 3")
 */

export type CanonicalPlateType = "new_series" | "unregistered" | "code_2" | "code_3";

export function getPlateType(plate?: string | null): CanonicalPlateType {
  if (!plate) return "code_2";
  const p = plate.trim().toLowerCase();

  if (p === "unregistered" || p === "ያልተለጠፈ") {
    return "unregistered";
  }
  if (
    p === "new_series" ||
    p === "new_digital" ||
    p.startsWith("new_series") ||
    p.startsWith("aaa") ||
    p.startsWith("aab") ||
    p.includes("አዲስ ሰሌዳ") ||
    p.includes("new digital")
  ) {
    return "new_series";
  }
  if (p === "code_3" || p === "code 3" || p === "ኮድ 3") {
    return "code_3";
  }
  return "code_2";
}

export function isNewSeriesPlate(plate?: string | null): boolean {
  return getPlateType(plate) === "new_series";
}

/**
 * Extracts optional custom series number (e.g. "AAA 12345" from "new_series: AAA 12345")
 */
export function extractPlateNumber(plate?: string | null): string | null {
  if (!plate) return null;
  const trimmed = plate.trim();
  if (trimmed.toLowerCase().startsWith("new_series:") || trimmed.toLowerCase().startsWith("new_series -")) {
    const after = trimmed.split(/[:\-]/, 2)[1]?.trim();
    return after || null;
  }
  if (/^[A-Za-z]{3}\s*\d+/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Clean display badge label
 */
export function getPlateLabel(plate?: string | null, isAm = true): string {
  const pType = getPlateType(plate);
  const customNum = extractPlateNumber(plate);

  if (pType === "new_series") {
    if (customNum) {
      return isAm ? `አዲስ ሰሌዳ • ${customNum}` : `New Series • ${customNum}`;
    }
    return isAm ? "አዲስ ሰሌዳ • AAA Series" : "New Series • AAA Plate";
  }

  if (pType === "unregistered") {
    return isAm ? "ያልተለጠፈ" : "Unregistered";
  }

  if (pType === "code_3") {
    return isAm ? "ኮድ 3" : "Code 3";
  }

  return isAm ? "ኮድ 2" : "Code 2";
}

/**
 * Distinct badge styling
 * - New Digital (AAA): Modern Emerald / Cyan badge
 * - Unregistered: Sky Blue
 * - Code 2: Classic Amber
 * - Code 3: Slate / Zinc
 */
export function getPlateBadgeClasses(plate?: string | null): string {
  const pType = getPlateType(plate);

  if (pType === "new_series") {
    return "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shadow-emerald-500/20";
  }
  if (pType === "unregistered") {
    return "bg-sky-950/90 text-sky-300 border border-sky-500/30";
  }
  if (pType === "code_3") {
    return "bg-zinc-900/90 text-zinc-300 border border-zinc-700";
  }
  return "bg-black/80 text-amber-400 border border-amber-500/30";
}

/**
 * Printable Window Flyer Spec Sheet plate format
 */
export function getFlyerPlateSpec(plate?: string | null): { am: string; en: string; badge: string } {
  const pType = getPlateType(plate);
  const customNum = extractPlateNumber(plate);

  if (pType === "new_series") {
    const detail = customNum ? ` (${customNum})` : " (AAA Series)";
    return {
      am: `የሰሌዳ ሁኔታ: አዲስ ሰሌዳ${detail}`,
      en: `Plate: New Digital System${detail}`,
      badge: customNum ? `አዲስ ሰሌዳ • ${customNum}` : "አዲስ ሰሌዳ (AAA Series)",
    };
  }

  if (pType === "unregistered") {
    return {
      am: "የሰሌዳ ሁኔታ: ያልተለጠፈ",
      en: "Plate: Unregistered",
      badge: "ያልተለጠፈ (Unregistered)",
    };
  }

  if (pType === "code_3") {
    return {
      am: "የሰሌዳ ሁኔታ: ኮድ 3",
      en: "Plate: Code 3",
      badge: "ኮድ 3 (Code 3)",
    };
  }

  return {
    am: "የሰሌዳ ሁኔታ: ኮድ 2",
    en: "Plate: Code 2",
    badge: "ኮድ 2 (Code 2)",
  };
}
