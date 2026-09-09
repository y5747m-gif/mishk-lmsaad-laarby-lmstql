import { Router, type IRouter } from "express";
import healthRouter from "./health";
import channelRouter from "./channel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(channelRouter);

export default router;
