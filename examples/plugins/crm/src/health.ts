import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy", version: "1.0.0" });
});

router.get("/ready", (_req: Request, res: Response) => {
  res.json({ status: "ready" });
});

export default router;
