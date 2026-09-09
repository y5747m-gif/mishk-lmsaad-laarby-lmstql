import { Router, type IRouter } from "express";
import {
  SearchChannelQueryParams,
  SearchChannelResponse,
} from "@workspace/api-zod";
import { searchChannel } from "../lib/youtube-channel";

const router: IRouter = Router();

router.get("/channel/search", async (req, res) => {
  const parsed = SearchChannelQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "اكتب سؤالًا من حرفين على الأقل." });
    return;
  }

  try {
    const result = await searchChannel(parsed.data.q, parsed.data.limit);
    res.json(SearchChannelResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "YouTube channel search failed");
    res.status(502).json({
      error:
        "تعذر الوصول إلى قناة يوتيوب الآن. جرّب مرة أخرى بعد قليل أو افتح أحد الأسئلة المحلية.",
    });
  }
});

export default router;