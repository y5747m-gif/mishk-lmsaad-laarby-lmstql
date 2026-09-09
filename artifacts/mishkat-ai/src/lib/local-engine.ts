/**
 * محرك مِشكاة المحلي: تحليل السؤال، ثم تركيب إجابة عربية منظمة
 * من القاعدة المعرفية (نوع السؤال، الحكم، التفصيل، الأدلة، التطبيق).
 */

import { KNOWLEDGE, type KnowledgeEntry, type KnowledgeSource } from "./knowledge-base";

export type AnswerMode = "واسع" | "عملي" | "تعليمي";
export type AnswerDepth = "مختصر" | "متوازن" | "متعمق";

export type QuestionAnalysisInfo = {
  kindLabel: string;
  keywords: string[];
  topics: string[];
  isReligious: boolean;
};

export type LocalAnswer = {
  answer: string;
  confidence: number;
  sources: KnowledgeSource[];
  followUps: string[];
  matchedTopic: string;
  analysis: QuestionAnalysisInfo;
};

/* ---------------- التطبيع والجذر ---------------- */

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[؟?!،;:,.()[\]{}"'«»_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP_WORDS = new Set([
  "ما", "ماذا", "كيف", "هل", "لماذا", "لماذ", "متى", "اين", "وين", "من",
  "عن", "في", "على", "الى", "عند", "هو", "هي", "هذا", "هذه", "ذلك", "تلك",
  "انا", "انت", "انتم", "اريد", "ارغب", "ممكن", "ممكنه", "لي", "مع", "ان",
  "و", "يا", "اي", "او", "ثم", "فان", "التي", "الذي", "بين", "حول",
  "اعرف", "عايز", "ابي", "احب",
]);

const tokens = (text: string) =>
  normalize(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

function stem(token: string): string {
  let w = normalize(token);
  if (w.length < 2) return w;
  if (w.length >= 4 && w.startsWith("ال")) w = w.slice(2);
  if (w.length > 3) {
    const rest = w.slice(1);
    // نحذف الألف المبدئية (احفظ→حفظ، اتعلم→تعلم) إلا في «استـ» (استخار)
    const isAlifPrefix = w[0] === "ا" && w[1] !== "س";
    if (rest.length >= 3 && (isAlifPrefix || "وفبكلس".includes(w[0]))) w = rest;
  }
  const suffixes = ["ات", "ون", "ين", "ان", "وه", "هم", "هن", "كم", "نا", "ك", "م", "ه", "ي"];
  for (const s of suffixes) {
    if (w.length - s.length >= 3 && w.endsWith(s)) {
      w = w.slice(0, -s.length);
      break;
    }
  }
  // «ال» قد تظهر بعد إزالة لاحقة
  if (w.length >= 4 && w.startsWith("ال")) w = w.slice(2);
  return w;
}

function termsMatch(a: string, b: string): boolean {
  const na = stem(a);
  const nb = stem(b);
  if (na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  const [long, short] = na.length >= nb.length ? [na, nb] : [nb, na];
  return long.startsWith(short);
}

/* ---------------- تحليل السؤال ---------------- */

type QuestionKind =
  | "ruling"
  | "difference"
  | "evidence"
  | "reason"
  | "howto"
  | "definition"
  | "yesno"
  | "detail";

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
  { kind: "ruling", re: /حكم|حلال|حرام|جائز|يجوز|مكروه|مسن|مستحب|افضل|الافضل|مبطل|مسقط|وجب/ },
  { kind: "definition", re: /ما هو|ما هي|ما معني|معنى|تعريف|اشرح|وضح|يعني ايه/ },
  { kind: "reason", re: /لماذا|لماذ|حكمه|الحكمه|السبب|سبب|عقله|ليش/ },
  { kind: "howto", re: /كيف|طريقه|شروط|اركان|خطوات|افعل|اسوي|ادخل|ابدأ|ابدا|كيفيه/ },
  { kind: "yesno", re: /^هل / },
];

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

/* ---------------- المطابقة ---------------- */

function scoreEntry(query: string, entry: KnowledgeEntry) {
  const queryTokens = tokens(query);
  const normalizedQuery = normalize(query);
  let score = 0;
  const matchedKeywords = new Set<string>();

  for (const keyword of entry.keywords) {
    const kw = normalize(keyword);
    const isMultiWord = kw.includes(" ");
    const hit = isMultiWord
      ? kw.length >= 5 && normalizedQuery.includes(kw)
      : kw.length >= 2 && queryTokens.some((token) => termsMatch(token, kw));
    if (hit) {
      matchedKeywords.add(keyword);
      score += isMultiWord ? 3 : Math.min(4, kw.length);
    }
  }

  const titleTokens = tokens(entry.title);
  const titleBoost = titleTokens.some((titleToken) =>
    queryTokens.some((token) => termsMatch(token, titleToken)),
  )
    ? 5
    : 0;
  score += titleBoost;
  return { score, matchedKeywords: [...matchedKeywords] };
}

function confidence(score: number) {
  return Math.min(96, Math.max(54, 54 + score * 7));
}

function greeting(query: string) {
  return /^(السلام عليكم|سلام|اهلا|أهلا|مرحبا|مرحبًا|صباح الخير|مساء الخير|شكرا|شكرًا)/i.test(
    normalize(query),
  );
}

/* ---------------- تركيب الإجابة ---------------- */

export function answerLocally(
  query: string,
  mode: AnswerMode = "واسع",
  depth: AnswerDepth = "متوازن",
): LocalAnswer {
  const clean = query.trim();

  const baseAnalysis: QuestionAnalysisInfo = {
    kindLabel: KIND_LABELS[detectKind(normalize(clean || ""))],
    keywords: tokens(clean).slice(0, 5),
    topics: [],
    isReligious: false,
  };

  if (!clean) {
    return {
      answer: "اكتب سؤالك وسأرتّب لك الفكرة في إجابة واضحة.",
      confidence: 100,
      sources: [],
      followUps: ["ما الذي تريد فهمه اليوم؟"],
      matchedTopic: "بداية",
      analysis: baseAnalysis,
    };
  }

  if (greeting(clean)) {
    return {
      answer:
        "وعليكم السلام ورحمة الله وبركاته.\n\nأنا مِشكاة، مساعد عربي مستقل يعمل بمحرك معرفة محلي داخل التطبيق. أتحللّ سؤالك، وأبحث في فيديوهات قناة «تعلم دينك لتنجو وتسعد»، وأجيب عن الأسئلة الدينية والعامة من قاعدة معرفية تفصيلية — مع توضيح مستوى الثقة بدل ادعاء معرفة لا أملكها.\n\nاكتب سؤالك كما يخطر لك، أو ابدأ بكلمة واحدة وسأساعدك على توسيعه.",
      confidence: 99,
      sources: [{ title: "هوية مِشكاة", category: "المحرك المحلي", signal: "إجابة مباشرة" }],
      followUps: ["كيف تعمل؟", "ما هي أركان الصلاة؟"],
      matchedTopic: "ترحيب",
      analysis: baseAnalysis,
    };
  }

  const ranked = KNOWLEDGE.map((entry) => {
    const { score, matchedKeywords } = scoreEntry(clean, entry);
    return { entry, score, matchedKeywords };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const entry = best.score > 0 ? best.entry : KNOWLEDGE[0];
  const fallback = best.score === 0;

  const kind = detectKind(normalize(clean));
  const analysis: QuestionAnalysisInfo = {
    kindLabel: KIND_LABELS[kind],
    keywords: tokens(clean).slice(0, 5),
    topics: [entry.title],
    isReligious:
      entry.religious ||
      RELIGION_MARKERS.some((marker) => normalize(clean).includes(normalize(marker))),
  };

  const sections: string[] = [];

  // تحليل السؤال
  sections.push(
    "**تحليل السؤال**\n" +
      `نوع السؤال: ${analysis.kindLabel}${analysis.keywords.length ? ` · المصطلحات: ${analysis.keywords.join("، ")}` : ""}`,
  );

  sections.push(`## ${entry.title}`);
  sections.push(entry.summary);

  if (entry.ruling && depth !== "مختصر") {
    sections.push(`### الحكم\n${entry.ruling}`);
  }

  if (depth !== "مختصر") {
    sections.push(
      `### التفصيل\n${entry.details
        .slice(0, depth === "متعمق" ? 3 : 2)
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n")}`,
    );
  }

  if (entry.evidence.length > 0 && (mode === "تعليمي" || depth === "متعمق" || entry.religious)) {
    sections.push(
      `### من الكتاب والسنة\n${entry.evidence
        .slice(0, depth === "متعمق" ? 3 : 2)
        .map((item) => `- ${item}`)
        .join("\n")}`,
    );
  }

  if (mode === "عملي" || depth === "متعمق") {
    sections.push(
      `### جرّب الآن\n${entry.practical
        .slice(0, depth === "متعمق" ? 3 : 2)
        .map((item) => `- ${item}`)
        .join("\n")}`,
    );
  }

  if (mode === "تعليمي" || depth === "متعمق") {
    sections.push(
      `### تبسيط سريع\n${entry.teaching
        .slice(0, depth === "متعمق" ? 2 : 1)
        .map((item) => `- ${item}`)
        .join("\n")}`,
    );
  }

  if (fallback) {
    sections.push(
      "لم أجد تطابقًا قويًا مع موضوع محدد في المعرفة المحلية، لذلك بدأت بإطار عام. إذا أضفت سياقًا — المجال، الهدف، والنتيجة التي تريدها — سأضيّق الإجابة وأجعلها أنفع.",
    );
  }

  const disclaimer = entry.religious
    ? "\n> تنبيه: هذه إجابة معرفية عامة من محرك محلي، وليست فتوى رسمية. في المسائل الخاصة أو الخلافية، اعرض حالتك على عالم موثوق."
    : "\n> تنبيه: هذه إجابة معرفية عامة من محرك محلي، وليست تشخيصًا أو استشارة مهنية متخصصة.";
  sections.push(disclaimer);

  return {
    answer: sections.join("\n\n"),
    confidence: fallback ? 57 : confidence(best.score),
    sources: entry.sources,
    followUps: entry.followUps,
    matchedTopic: entry.title,
    analysis,
  };
}

/**
 * نسخة مضغوطة من الإجابة المحلية، تُستخدم «إضافة معرفية» عندما لا تغطي
 * فيديوهات القناة السؤال بالكامل.
 */
export function compactAnswer(query: string): {
  title: string;
  text: string;
  followUps: string[];
} | null {
  const clean = query.trim();
  if (!clean) return null;
  const ranked = KNOWLEDGE.map((entry) => ({
    entry,
    score: scoreEntry(clean, entry).score,
  })).sort((a, b) => b.score - a.score);
  if (!ranked[0].score) return null;
  const entry = ranked[0].entry;
  const parts: string[] = [`## ${entry.title}`, entry.summary];
  if (entry.ruling) parts.push(`**الحكم:** ${entry.ruling}`);
  if (entry.details.length) {
    parts.push(entry.details.slice(0, 2).map((d, i) => `${i + 1}. ${d}`).join("\n"));
  }
  if (entry.evidence.length) {
    parts.push(`**أبرز الأدلة:**\n${entry.evidence.slice(0, 2).map((e) => `- ${e}`).join("\n")}`);
  }
  return { title: entry.title, text: parts.join("\n\n"), followUps: entry.followUps };
}

export function getKnowledgeTopics() {
  return KNOWLEDGE.map(({ id, title, category, summary }) => ({
    id,
    title,
    category,
    summary,
  }));
}
