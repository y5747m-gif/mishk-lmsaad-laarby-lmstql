import { YoutubeTranscript } from "youtube-transcript";
import {
  formatTime,
  normalizeArabic,
  tokensArabic,
  termsMatch,
} from "./arabic";
import {
  analyzeQuestion,
  matchTopics,
  type QuestionAnalysis,
} from "./question-analyzer";

export const CHANNEL = {
  id: "UCv0g_v1C6JcZALvrkDu98AQ",
  name: "تعلم دينك لتنجو وتسعد",
  url: "https://www.youtube.com/channel/UCv0g_v1C6JcZALvrkDu98AQ",
} as const;

type ChannelVideo = {
  videoId: string;
  title: string;
  description: string;
  url: string;
  thumbnail: string;
  publishedAt: string | null;
  views: number;
};

export type VideoHighlight = {
  text: string;
  time: string;
};

export type ChannelSearchVideo = {
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  snippet: string;
  relevance: number;
  transcriptAvailable: boolean;
  topics: string[];
  highlights: VideoHighlight[];
};

export type ChannelSearchResult = {
  answer: string;
  confidence: number;
  matchedTopic: string;
  channelName: string;
  channelUrl: string;
  videos: ChannelSearchVideo[];
  sourceStatus: "live" | "cached" | "metadata-only";
  analysis: {
    kind: string;
    kindLabel: string;
    keywords: string[];
    topics: string[];
  };
  summaryPoints: string[];
  coverage: number;
};

export type AnswerDepth = "concise" | "balanced" | "deep";

const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL.id}`;
const VIDEOS_URL = `${CHANNEL.url}/videos`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const VIDEO_CACHE_MS = 15 * 60 * 1000;
const TRANSCRIPT_CACHE_MS = 6 * 60 * 60 * 1000;
const TRANSCRIPT_TIMEOUT_MS = 20_000;
const MAX_TRANSCRIPT_CANDIDATES = 8;
const QUOTES_BY_DEPTH: Record<AnswerDepth, number> = {
  concise: 2,
  balanced: 3,
  deep: 4,
};

let videoCache: { expiresAt: number; videos: ChannelVideo[] } | null = null;

type TimedTranscript = {
  text: string;
  sentences: Array<{ text: string; start: number }>;
};
const transcriptCache = new Map<
  string,
  { expiresAt: number; transcript: TimedTranscript }
>();

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .trim();
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ar,en" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRssVideos(): Promise<ChannelVideo[]> {
  const xml = await fetchText(RSS_URL);
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.flatMap((entry) => {
    const pick = (pattern: RegExp) => {
      const match = entry.match(pattern);
      return match ? decodeEntities(match[1]) : "";
    };
    const videoId = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!videoId) return [];
    const publishedAt = pick(/<published>([^<]+)<\/published>/);
    return [
      {
        videoId,
        title:
          pick(/<media:title>([^<]*)<\/media:title>/) ||
          pick(/<title>([^<]*)<\/title>/) ||
          "فيديو من القناة",
        description: pick(/<media:description>([\s\S]*?)<\/media:description>/),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail:
          pick(/<media:thumbnail url="([^"]+)"/) ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: publishedAt || null,
        views: Number(pick(/<media:statistics views="(\d+)"/)) || 0,
      },
    ];
  });
}

async function fetchVideoIdsFromChannelPage() {
  try {
    const html = await fetchText(VIDEOS_URL);
    return [
      ...new Set(
        [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]),
      ),
    ];
  } catch {
    return [];
  }
}

async function fetchOEmbedTitle(videoId: string) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (!response.ok) return "";
    const data = (await response.json()) as { title?: string };
    return data.title ?? "";
  } catch {
    return "";
  }
}

async function getChannelVideos() {
  if (videoCache && videoCache.expiresAt > Date.now()) {
    return { videos: videoCache.videos, cached: true };
  }

  const rssVideos = await fetchRssVideos();
  const byId = new Map(rssVideos.map((video) => [video.videoId, video]));
  const ids = await fetchVideoIdsFromChannelPage();
  const missing = ids.filter((id) => !byId.has(id)).slice(0, 20);

  for (let i = 0; i < missing.length; i += 5) {
    const batch = await Promise.all(
      missing.slice(i, i + 5).map(async (videoId) => ({
        videoId,
        title: await fetchOEmbedTitle(videoId),
      })),
    );
    for (const item of batch) {
      if (!item.title) continue;
      byId.set(item.videoId, {
        videoId: item.videoId,
        title: item.title,
        description: "",
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        publishedAt: null,
        views: 0,
      });
    }
  }

  const videos = [...byId.values()].slice(0, 35);
  videoCache = { expiresAt: Date.now() + VIDEO_CACHE_MS, videos };
  return { videos, cached: false };
}

function cleanTranscript(text: string) {
  return text
    .replace(/\[(موسيقى|تصفيق|ضحك|تنحنُح|موسيقى مبهجة)\]/g, " ")
    .replace(/\[(music|applause|laughter)\]/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\s+([،.؟!:؛])/g, "$1")
    .trim();
}

/**
 * يفكك مقاطع النص الموقّتة إلى جُمل مع الاحتفاظ بوقت بداية كل جملة،
 * حتى نستطيع إرفاع الأوقات داخل الإجابة.
 */
function buildTimedSentences(
  segments: Array<{ text: string; start: number }>,
): TimedTranscript {
  const text = cleanTranscript(segments.map((s) => s.text).join(" "));
  const sentences: Array<{ text: string; start: number }> = [];
  let buffer = "";
  let bufferStart = 0;

  for (const segment of segments) {
    if (!buffer) bufferStart = segment.start;
    buffer += ` ${segment.text}`;
    const trimmed = buffer.trim();
    const endsSentence = /[؟.!؛،]$/.test(segment.text.trimEnd());
    if ((endsSentence && trimmed.length >= 40) || trimmed.length >= 110) {
      sentences.push({ text: trimmed, start: bufferStart });
      buffer = "";
    }
  }
  if (buffer.trim()) {
    sentences.push({ text: buffer.trim(), start: bufferStart });
  }

  return { text, sentences };
}

async function fetchTranscriptTimed(videoId: string): Promise<TimedTranscript> {
  const cached = transcriptCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.transcript;

  const withTimeout = Promise.race<TimedTranscript | null>([
    (async () => {
      try {
        let segments;
        try {
          segments = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: "ar",
          });
        } catch {
          segments = await YoutubeTranscript.fetchTranscript(videoId);
        }
        return buildTimedSentences(
          segments
            .map((s) => ({ text: s.text, start: s.offset ?? 0 }))
            .filter((s) => s.text.trim().length > 0),
        );
      } catch {
        return null;
      }
    })(),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TRANSCRIPT_TIMEOUT_MS),
    ),
  ]);

  const transcript = await withTimeout;
  if (transcript) {
    transcriptCache.set(videoId, {
      expiresAt: Date.now() + TRANSCRIPT_CACHE_MS,
      transcript,
    });
  } else {
    transcriptCache.set(videoId, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      transcript: { text: "", sentences: [] },
    });
  }
  return transcript ?? { text: "", sentences: [] };
}

/**
 * وزن مصطلحات السؤال: كلمات السؤال الأصلية أهم من المصطلحات الموسعة
 * (مرادفات المحاور) لأنها تعبّر عن نية السائل مباشرة.
 */
function buildTermWeights(analysis: QuestionAnalysis): Map<string, number> {
  const queryTerms = new Set(analysis.keywords);
  const weights = new Map<string, number>();
  for (const term of analysis.expandedTerms) {
    const weight = queryTerms.has(term) ? 3 : 2;
    weights.set(term, Math.max(weight, weights.get(term) ?? 0));
  }
  return weights;
}

function scoreSentence(
  sentence: string,
  termWeights: Map<string, number>,
): { score: number; matched: string[] } {
  const normalized = normalizeArabic(sentence);
  const sentenceTokens = tokensArabic(sentence);
  let score = 0;
  const matched: string[] = [];

  for (const [term, weight] of termWeights) {
    if (term.length < 3) continue;
    const isMultiWord = term.includes(" ");
    const hit = isMultiWord
      ? normalized.includes(term)
      : normalized.includes(term) ||
        sentenceTokens.some((token) => termsMatch(token, term));
    if (hit) {
      score += weight;
      matched.push(term);
      if (normalized.split(term).length - 1 >= 2) score += 1;
    }
  }

  // مجاورة: وجود أكثر من مصطلح في الجملة يدل على أن الفيديو يتناول السؤال فعلًا
  if (matched.length >= 2) score += 3;
  if (matched.length >= 3) score += 2;
  const len = sentence.length;
  if (len >= 35 && len <= 280) score += 1.5;

  return { score, matched };
}

function wordSet(sentence: string): Set<string> {
  return new Set(tokensArabic(sentence));
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common += 1;
  return common / Math.min(a.size, b.size);
}

/**
 * استخراج أفضل الجُمل من نص الفيديو: أعلى تطابق، دون تكرار،
 * مع الحفاظ على الأوقات.
 */
function mineSentences(
  sentences: Array<{ text: string; start: number }>,
  termWeights: Map<string, number>,
  maxQuotes: number,
): Array<{ text: string; start: number; score: number }> {
  const scored = sentences
    .filter((s) => s.text.length >= 30)
    .map((s) => ({ sentence: s, result: scoreSentence(s.text, termWeights) }))
    .filter((s) => s.result.score >= 4)
    .sort((a, b) => b.result.score - a.result.score);

  const selected: Array<{
    text: string;
    start: number;
    score: number;
    words: Set<string>;
  }> = [];
  for (const { sentence, result } of scored) {
    if (selected.length >= maxQuotes) break;
    const words = wordSet(sentence.text);
    const overlaps = selected.some((s) => overlapRatio(s.words, words) > 0.45);
    if (overlaps) continue;
    selected.push({
      text: sentence.text,
      start: sentence.start,
      score: result.score,
      words,
    });
  }
  return selected.map(({ text, start, score }) => ({ text, start, score }));
}

/** قراءة محاور الفيديو: ما المواضيع الدينية يتناولها نص الفيديو؟ */
function videoTopics(text: string, topN = 5): string[] {
  const matches = matchTopics(text)
    .filter(({ hits }) => hits >= 2)
    .slice(0, topN);
  return matches.map(({ topic }) => topic.label);
}

function metadataScore(
  queryTokens: string[],
  analysis: QuestionAnalysis,
  video: ChannelVideo,
): number {
  const title = normalizeArabic(video.title);
  const haystack = normalizeArabic(`${video.title} ${video.description}`);
  let score = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) score += 4;
    else if (haystack.includes(token)) score += 2;
  }
  for (const term of analysis.expandedTerms) {
    if (term.length < 3) continue;
    if (title.includes(term)) score += 2;
  }
  // تطابق جذري للعناوين
  const titleTokens = tokensArabic(video.title);
  for (const token of queryTokens) {
    if (titleTokens.some((t) => termsMatch(t, token))) score += 2;
  }
  return score;
}

function truncate(text: string, max = 240): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export async function searchChannel(
  query: string,
  limit = 3,
  depth: AnswerDepth = "balanced",
): Promise<ChannelSearchResult> {
  const cleanQuery = query.trim();
  const analysis = analyzeQuestion(cleanQuery);
  const { videos, cached } = await getChannelVideos();
  const queryTokens = tokensArabic(cleanQuery);
  const termWeights = buildTermWeights(analysis);

  const ranked = videos
    .map((video) => ({
      video,
      score: metadataScore(queryTokens, analysis, video),
    }))
    .sort((a, b) => b.score - a.score);
  const candidates = (ranked.some((item) => item.score > 0)
    ? ranked.filter((item) => item.score > 0)
    : ranked
  ).slice(0, MAX_TRANSCRIPT_CANDIDATES);

  const withTranscripts = await Promise.all(
    candidates.map(async ({ video, score: metadataScoreValue }) => {
      const transcript = await fetchTranscriptTimed(video.videoId);
      const quotes = mineSentences(
        transcript.sentences,
        termWeights,
        QUOTES_BY_DEPTH[depth],
      );
      const topics = transcript.text ? videoTopics(transcript.text) : [];
      return {
        video,
        metadataScore: metadataScoreValue,
        transcript,
        quotes,
        topics,
      };
    }),
  );

  const grounded = withTranscripts
    .filter((item) => item.quotes.length > 0)
    .sort(
      (a, b) =>
        b.quotes.length - a.quotes.length ||
        b.metadataScore - a.metadataScore,
    );
  const selected = grounded.slice(0, limit);
  const sourceVideos = selected.length ? selected : withTranscripts.slice(0, limit);

  const totalQuotes = selected.reduce((n, item) => n + item.quotes.length, 0);
  const coverage = selected.length
    ? Math.min(
        96,
        30 +
          selected.length * 10 +
          totalQuotes * 6 +
          (analysis.topicIds.length ? 6 : 0) +
          (sourceVideos.some((v) => v.topics.length > 0) ? 4 : 0),
      )
    : 20;

  const analysisBlock = [
    "**تحليل السؤال**",
    `نوع السؤال: ${analysis.kindLabel}${
      analysis.topics.length ? ` · المحاور: ${analysis.topics.join("، ")}` : ""
    }${analysis.keywords.length ? ` · المصطلحات: ${analysis.keywords.slice(0, 5).join("، ")}` : ""}`,
  ].join("\n");

  if (selected.length) {
    const videoBlocks = selected.map(({ video, quotes, topics, metadataScore: ms }) => {
      const topicsLine = topics.length
        ? `*يغطي الفيديو:* ${topics.join("، ")}`
        : null;
      const quoteLines = quotes
        .map((quote) => `- «${truncate(quote.text)}» — ${formatTime(quote.start)}`)
        .join("\n");
      const lines = [`### «${video.title}»`, ...(topicsLine ? [topicsLine] : []), quoteLines];
      return lines.join("\n");
    });

    const summaryPool = selected
      .flatMap(({ video, quotes }) =>
        quotes.map((quote) => ({ ...quote, video: video.title })),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, depth === "concise" ? 3 : 5)
      .map(
        (quote) =>
          `«${truncate(quote.text, 200)}» (من «${quote.video}» — ${formatTime(quote.start)})`,
      );

    const answer = [
      analysisBlock,
      "",
      `تعمّقت في نصوص قناة «${CHANNEL.name}» وعثرت على ${selected.length === 1 ? "فيديو يعالج سؤالك" : `${selected.length} فيديوهات مرتبطة بسؤالك`}:`,
      "",
      videoBlocks.join("\n\n"),
      "",
      "**خلاصة التفاصيل**",
      summaryPool.map((point, i) => `${i + 1}. ${point}`).join("\n"),
      "",
      "الاقتباسات مستخرجة من نصوص الفيديوهات المتاحة، ومرتبة حسب قربها من مفردات سؤالك. هذه خلاصة استخلاص محلي، وليست فتوى رسمية.",
    ].join("\n");

    return {
      answer,
      confidence: Math.min(94, 66 + selected.length * 7 + totalQuotes * 2),
      matchedTopic: selected[0].video.title,
      channelName: CHANNEL.name,
      channelUrl: CHANNEL.url,
      videos: sourceVideos.map((item, index) => ({
        videoId: item.video.videoId,
        title: item.video.title,
        url: item.video.url,
        thumbnail: item.video.thumbnail,
        snippet: item.quotes[0]
          ? truncate(item.quotes[0].text, 220)
          : "تم العثور على الفيديو من خلال عنوانه ووصفه.",
        relevance: Math.max(
          55,
          Math.min(96, 60 + item.quotes.length * 10 + (item.metadataScore >= 6 ? 6 : 0)) - index * 4,
        ),
        transcriptAvailable: Boolean(item.transcript.text),
        topics: item.topics.slice(0, 4),
        highlights: item.quotes
          .slice(0, depth === "concise" ? 1 : 2)
          .map((quote) => ({
            text: truncate(quote.text, 180),
            time: formatTime(quote.start),
          })),
      })),
      sourceStatus: cached ? "cached" : "live",
      analysis: {
        kind: analysis.kind,
        kindLabel: analysis.kindLabel,
        keywords: analysis.keywords.slice(0, 5),
        topics: analysis.topics,
      },
      summaryPoints: summaryPool,
      coverage,
    };
  }

  // لا توجد اقتباسات مطابقة: نعيد أقرب الفيديوهات من العنوان مع التحليل
  const answer = [
    analysisBlock,
    "",
    `بحثت في نصوص قناة «${CHANNEL.name}»، لكن لم أجد مقتطفات تطابق سؤالك بمعايير كافية.`,
    "",
    "أرفقت أقرب فيديوهات ظهرت من عناوينها أو أوصافها؛ جرّب إعادة صياغة السؤال بكلمات من عنوان الفيديو، أو افتح أحد المصادر للاطلاع عليه مباشرة.",
  ].join("\n");

  return {
    answer,
    confidence: 35,
    matchedTopic: "لم يوجد تطابق نصي كافٍ",
    channelName: CHANNEL.name,
    channelUrl: CHANNEL.url,
    videos: sourceVideos.map((item, index) => ({
      videoId: item.video.videoId,
      title: item.video.title,
      url: item.video.url,
      thumbnail: item.video.thumbnail,
      snippet: "مطابقة من عنوان الفيديو أو وصفه فقط؛ لم يتوفر نص مطابق كافٍ.",
      relevance: Math.max(30, 65 - index * 10),
      transcriptAvailable: Boolean(item.transcript.text),
      topics: item.topics.slice(0, 4),
      highlights: item.quotes
        .slice(0, 1)
        .map((quote) => ({
          text: truncate(quote.text, 180),
          time: formatTime(quote.start),
        })),
    })),
    sourceStatus: "metadata-only",
    analysis: {
      kind: analysis.kind,
      kindLabel: analysis.kindLabel,
      keywords: analysis.keywords.slice(0, 5),
      topics: analysis.topics,
    },
    summaryPoints: [],
    coverage,
  };
}

/** يُستخدم في الاختبارات: تعديلات مباشرة على كاش الفيديو/النصوص. */
export const __testing = {
  setVideoCache(videos: ChannelVideo[]) {
    videoCache = { expiresAt: Date.now() + 60_000, videos };
  },
  setTranscript(videoId: string, transcript: TimedTranscript) {
    transcriptCache.set(videoId, {
      expiresAt: Date.now() + 60_000,
      transcript,
    });
  },
};
