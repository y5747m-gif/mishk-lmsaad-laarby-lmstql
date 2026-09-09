/**
 * تحليل السؤال: تحديد نوع السؤال (حكم، تعريف، كيفية، سبب، دليل، فرق، نعم/لا)،
 * واستخراج المصطلحات المفتاحية، واكتشاف المحاور الدينية المرتبطة به.
 */

import { normalizeArabic, stemArabic, termsMatch, tokensArabic } from "./arabic";
import { RELIGION_TOPICS, type ReligionTopic } from "./religion-taxonomy";

export type QuestionKind =
  | "ruling"
  | "difference"
  | "evidence"
  | "reason"
  | "howto"
  | "definition"
  | "yesno"
  | "detail";

export type QuestionAnalysis = {
  kind: QuestionKind;
  kindLabel: string;
  keywords: string[];
  topics: string[];
  topicIds: string[];
  isReligious: boolean;
  expandedTerms: string[];
};

const KIND_LABELS: Record<QuestionKind, string> = {
  ruling: "حكم شرعي",
  difference: "فرق بين أمرين",
  evidence: "طلب دليل",
  reason: "حكمة أو سبب",
  howto: "كيفية تطبيق",
  definition: "تعريف وشرح",
  yesno: "سؤال نعم/لا",
  detail: "تفصيل وتوضيح",
};

const KIND_PATTERNS: Array<{ kind: QuestionKind; re: RegExp }> = [
  { kind: "difference", re: /الفرق بين|فرق بين|ما الفرق/ },
  { kind: "evidence", re: /ما الدليل|الدليل|ادله|هل ورد|ورد فيه|ورد عنه|هل في الكتاب|هل في السنه|ما دليل/ },
  { kind: "ruling", re: /حكم|حلال|حرام|جائز|يجوز|مكروه|مسن|مستحب|افضل|الافضل|مبطل|مسقط|وجب|وجب/ },
  { kind: "definition", re: /ما هو|ما هي|ما معني|معنى|تعريف|اشرح|وضح|يعني ايه/ },
  { kind: "reason", re: /لماذا|لماذ|حكمه|الحكمه|السبب|سبب|عقله|ليش/ },
  { kind: "howto", re: /كيف|طريقه|شروط|اركان|خطوات|افعل|اسوي|ادخل|ابدأ|ابدا|كيفيه/ },
  { kind: "yesno", re: /^هل / },
];

/** المصطلحات الدينية العامة التي تجعل السؤال دينيًا حتى بدون محور محدد. */
const RELIGION_MARKERS = [
  "دين", "اسلام", "الله", "ربي", "ربنا", "رسول", "نبي", "اسلاميه",
  "شرعي", "شرعه", "فقه", "فقي", "فتاوي", "فتوا", "عالم دين", "مسلم",
];

function detectKind(normalized: string): QuestionKind {
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(normalized)) return kind;
  }
  return "detail";
}

/**
 * يطابق مصطلحات المحاور مع النص ويعيد المحاور المرتبة بعدد المطابقات.
 */
export function matchTopics(text: string): Array<{ topic: ReligionTopic; hits: number }> {
  const normalized = normalizeArabic(text);
  const queryTokens = tokensArabic(text);
  const results: Array<{ topic: ReligionTopic; hits: number; weight: number }> = [];

  for (const topic of RELIGION_TOPICS) {
    const matchedTokens = new Set<string>();
    let weight = 0;
    let phraseHits = 0;
    for (const term of topic.terms) {
      const termNormalized = normalizeArabic(term);
      const isMultiWord = termNormalized.includes(" ");
      if (isMultiWord) {
        // العبارات متعددة الكلمات تُطابق نصيًا
        if (termNormalized.length >= 5 && normalized.includes(termNormalized)) {
          phraseHits += 1;
          weight += 3;
        }
        continue;
      }
      // الكلمات المفردة تُطابق على مستوى الكلمة (جذر/بادئة) لتجنب
      // تطابق الجزئيات داخل كلمات أطول
      if (termNormalized.length < 2) continue;
      for (const token of queryTokens) {
        if (termsMatch(token, termNormalized)) {
          matchedTokens.add(token);
          // مصطلح أطول (أكثر تحديدًا) يساوي وزنًا أكبر
          weight += Math.min(3, termNormalized.length) * 0.5;
          break;
        }
      }
    }
    const hits = matchedTokens.size + phraseHits;
    if (hits > 0) results.push({ topic, hits, weight });
  }

  return results
    .sort((a, b) => b.weight - a.weight || b.hits - a.hits)
    .map(({ topic, hits }) => ({ topic, hits }));
}

export function analyzeQuestion(query: string): QuestionAnalysis {
  const normalized = normalizeArabic(query);
  const kind = detectKind(normalized);
  const keywords = [...new Set(tokensArabic(query))].slice(0, 8);
  const topicMatches = matchTopics(query).slice(0, 4);
  const topics = topicMatches.map(({ topic }) => topic.label);
  const topicIds = topicMatches.map(({ topic }) => topic.id);
  const isReligious =
    topicMatches.length > 0 ||
    RELIGION_MARKERS.some((marker) => normalized.includes(normalizeArabic(marker)));

  // مصطلحات موسعة: كلمات السؤال + مصطلحات المحاور المطابقة (للتعمق في النص)
  const expanded = new Set<string>(tokensArabic(query));
  for (const { topic } of topicMatches) {
    for (const term of topic.terms) {
      if (term.includes(" ") || term.length < 3) continue;
      expanded.add(stemArabic(term));
    }
  }

  return {
    kind,
    kindLabel: KIND_LABELS[kind],
    keywords,
    topics,
    topicIds,
    isReligious,
    expandedTerms: [...expanded],
  };
}
