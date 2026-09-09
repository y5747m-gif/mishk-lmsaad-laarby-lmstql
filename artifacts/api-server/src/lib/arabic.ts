/**
 * أدوات نصية مشتركة للتعامل مع العربية: تطبيع، تقسيم، وجذْر تقريبي.
 * تُستخدم في تحليل السؤال وفي استخراج المقاطع من نصوص الفيديوهات.
 */

const DIACRITICS = /[\u064B-\u0652\u0670\u06D6-\u06ED\u0640]/g;

export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[؟?!،;:,.()[\]{}"'«»_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "ما",
  "ماذا",
  "كيف",
  "هل",
  "لماذا",
  "لماذ",
  "متى",
  "اين",
  "وين",
  "من",
  "عن",
  "في",
  "على",
  "الى",
  "عند",
  "هو",
  "هي",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "ذالك",
  "انا",
  "انت",
  "انتم",
  "اريد",
  "ارغب",
  "ممكن",
  "ممكنه",
  "لي",
  "مع",
  "عن",
  "ان",
  "و",
  "يا",
  "اي",
  "او",
  "ثم",
  "فان",
  "التي",
  "الذي",
  "الذي",
  "بين",
  "بشان",
  "بشان",
  "حول",
  "اعرف",
  "عايز",
  "ابي",
  "احب",
]);

export function tokensArabic(text: string): string[] {
  return normalizeArabic(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * جذْر تقريبي خفيف: يزيل «ال» وأحرف الزيادة المبدئية ثم لاحقة واحدة.
 * ليس جذْرًا كاملًا، لكنه يكفي لمطابقة الكلمات الشائعة في نطاق معرفتنا.
 */
export function stemArabic(token: string): string {
  let w = normalizeArabic(token);
  if (w.length < 2) return w;

  if (w.length >= 4 && w.startsWith("ال")) w = w.slice(2);

  if (w.length > 3) {
    const rest = w.slice(1);
    // نحذف الألف المبدئية (احفظ→حفظ، اتعلم→تعلم) إلا في «استـ» (استخار)
    const isAlifPrefix = w[0] === "ا" && w[1] !== "س";
    if (rest.length >= 3 && (isAlifPrefix || "وفبكلس".includes(w[0]))) w = rest;
  }

  const suffixes = ["ات", "ون", "ين", "ان", "وه", "هم", "هن", "كم", "نا", "ك", "م", "ه", "ي"];
  for (const suffix of suffixes) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  // «ال» قد تظهر بعد إزالة لاحقة
  if (w.length >= 4 && w.startsWith("ال")) w = w.slice(2);
  return w;
}

/**
 * مطابقة مرنة بين كلمتين: تجانس جذري، أو علاقة بادئة عند الطول الكافي.
 */
export function termsMatch(a: string, b: string): boolean {
  const na = stemArabic(a);
  const nb = stemArabic(b);
  if (na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  const [long, short] = na.length >= nb.length ? [na, nb] : [nb, na];
  return long.startsWith(short);
}

/** يقسّم النص إلى جُمل مع الحفاظ على حدود الجمل العربية. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(/(?<=[؟.!؛،])\s+/);
  const sentences: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // الجمل الطويلة جدًا تُقسَّم عند الفواصل الداخلية
    if (trimmed.length > 320) {
      for (const piece of trimmed.split(/،(?=\s)/)) {
        const p = piece.trim();
        if (p.length >= 25) sentences.push(p.endsWith("،") ? p : p + "…");
      }
    } else {
      sentences.push(trimmed);
    }
  }
  return sentences;
}

/** تحويل ثانية إلى نص زمني منسق (03:12). */
export function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
