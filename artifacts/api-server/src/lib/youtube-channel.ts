import { YoutubeTranscript } from "youtube-transcript";

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

export type ChannelSearchVideo = {
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  snippet: string;
  relevance: number;
  transcriptAvailable: boolean;
};

export type ChannelSearchResult = {
  answer: string;
  confidence: number;
  matchedTopic: string;
  channelName: string;
  channelUrl: string;
  videos: ChannelSearchVideo[];
  sourceStatus: "live" | "cached" | "metadata-only";
};

const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL.id}`;
const VIDEOS_URL = `${CHANNEL.url}/videos`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const VIDEO_CACHE_MS = 15 * 60 * 1000;
const TRANSCRIPT_CACHE_MS = 6 * 60 * 60 * 1000;

let videoCache: { expiresAt: number; videos: ChannelVideo[] } | null = null;
const transcriptCache = new Map<
  string,
  { expiresAt: number; text: string }
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
    return [...new Set([...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))];
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

async function fetchTranscript(videoId: string) {
  const cached = transcriptCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.text;
  try {
    let segments;
    try {
      segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ar" });
    } catch {
      segments = await YoutubeTranscript.fetchTranscript(videoId);
    }
    const text = cleanTranscript(segments.map((segment) => segment.text).join(" "));
    transcriptCache.set(videoId, {
      expiresAt: Date.now() + TRANSCRIPT_CACHE_MS,
      text,
    });
    return text;
  } catch {
    transcriptCache.set(videoId, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      text: "",
    });
    return "";
  }
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!،؛:.()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "ما",
  "ماذا",
  "كيف",
  "هل",
  "لماذا",
  "متى",
  "اين",
  "من",
  "عن",
  "في",
  "على",
  "الى",
  "هو",
  "هي",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "انا",
  "اريد",
  "مع",
  "ان",
  "و",
]);

function tokens(text: string) {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function score(queryTokens: string[], video: ChannelVideo) {
  const haystack = normalize(`${video.title} ${video.description}`);
  return queryTokens.reduce((total, token) => {
    if (haystack.includes(token)) return total + (normalize(video.title).includes(token) ? 4 : 2);
    return total;
  }, 0);
}

function bestSnippets(text: string, query: string, count = 2) {
  const queryTokens = tokens(query);
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const windowSize = 85;
  const windows: { content: string; score: number }[] = [];
  for (let start = 0; start < words.length; start += 55) {
    const slice = words.slice(start, start + windowSize);
    if (slice.length < 20) break;
    const content = slice.join(" ");
    const lowered = normalize(content);
    const hits = queryTokens.filter((token) => lowered.includes(token)).length;
    if (hits > 0) windows.push({ content, score: hits });
  }
  return windows
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((window) => window.content);
}

export async function searchChannel(
  query: string,
  limit = 3,
): Promise<ChannelSearchResult> {
  const cleanQuery = query.trim();
  const { videos, cached } = await getChannelVideos();
  const queryTokens = tokens(cleanQuery);
  const ranked = videos
    .map((video) => ({ video, score: score(queryTokens, video) }))
    .sort((a, b) => b.score - a.score);
  const candidates = (ranked.some((item) => item.score > 0)
    ? ranked.filter((item) => item.score > 0)
    : ranked
  ).slice(0, 8);

  const withTranscripts = await Promise.all(
    candidates.map(async ({ video, score: metadataScore }) => {
      const transcript = await fetchTranscript(video.videoId);
      const snippets = bestSnippets(transcript, cleanQuery);
      return { video, transcript, snippets, metadataScore };
    }),
  );
  const grounded = withTranscripts
    .filter((item) => item.snippets.length > 0)
    .sort((a, b) => b.snippets.length - a.snippets.length || b.metadataScore - a.metadataScore);
  const selected = grounded.slice(0, limit);
  const sourceVideos = selected.length ? selected : withTranscripts.slice(0, limit);

  if (selected.length) {
    const answerParts = selected.flatMap(({ video, snippets }) => [
      `### من فيديو «${video.title}»`,
      snippets.map((snippet) => `«${snippet}»`).join("\n\n"),
    ]);
    return {
      answer: [
        `بحثت في قناة «${CHANNEL.name}» ووجدت مقاطع مرتبطة بسؤالك:`,
        "",
        answerParts.join("\n\n"),
        "",
        "هذه الفقرات مستخلصة من النص المتاح للفيديوهات، وليست إجابة مولّدة من مصدر خارجي.",
      ].join("\n"),
      confidence: Math.min(94, 68 + selected.length * 8),
      matchedTopic: selected[0].video.title,
      channelName: CHANNEL.name,
      channelUrl: CHANNEL.url,
      videos: sourceVideos.map((item, index) => ({
        videoId: item.video.videoId,
        title: item.video.title,
        url: item.video.url,
        thumbnail: item.video.thumbnail,
        snippet: item.snippets[0] ?? "تم العثور على الفيديو من خلال عنوانه ووصفه.",
        relevance: Math.max(55, 96 - index * 12),
        transcriptAvailable: Boolean(item.transcript),
      })),
      sourceStatus: cached ? "cached" : "live",
    };
  }

  return {
    answer: [
      `بحثت في قناة «${CHANNEL.name}»، لكن لم أجد نصًا مترجمًا متاحًا يطابق السؤال بشكل كافٍ.`,
      "",
      "أرفقت أقرب فيديوهات ظهرت من عنوانها أو وصفها. جرّب إعادة صياغة السؤال بكلمات من عنوان الفيديو، أو افتح أحد المصادر للاطلاع عليه مباشرة.",
    ].join("\n"),
    confidence: 35,
    matchedTopic: "لم يوجد تطابق نصي كافٍ",
    channelName: CHANNEL.name,
    channelUrl: CHANNEL.url,
    videos: sourceVideos.map((item, index) => ({
      videoId: item.video.videoId,
      title: item.video.title,
      url: item.video.url,
      thumbnail: item.video.thumbnail,
      snippet: "مطابقة من عنوان الفيديو أو وصفه فقط؛ لم يتوفر نص ترجمة كافٍ.",
      relevance: Math.max(30, 65 - index * 10),
      transcriptAvailable: Boolean(item.transcript),
    })),
    sourceStatus: "metadata-only",
  };
}