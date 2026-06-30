import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { dealsStore, type Deal } from "../stores.js";

const router = Router();

router.post("/", (req: Request, res: Response) => {
  const workspaceId = req.headers["x-plexica-workspace-id"];
  const correlationId = req.headers["x-plexica-correlation-id"];
  const { type: eventType } = req.body;

  console.log(
    `[event] type=${eventType ?? "unknown"} workspaceId=${workspaceId ?? "unknown"} correlationId=${correlationId ?? "unknown"}`,
  );

  if (eventType === "plexica.workspace.created" && typeof workspaceId === "string") {
    const now = new Date().toISOString();
    const pipeline: Deal = {
      id: crypto.randomUUID(),
      workspaceId,
      contactId: "",
      title: "Default Pipeline",
      value: 0,
      stage: "new",
      createdAt: now,
      updatedAt: now,
    };

    if (!dealsStore.has(workspaceId)) {
      dealsStore.set(workspaceId, new Map());
    }
    dealsStore.get(workspaceId)!.set(pipeline.id, pipeline);
    console.log(`[event] created default pipeline for workspace ${workspaceId}`);
  }

  res.status(200).json({ received: true });
});

export default router;
