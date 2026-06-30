import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { dealsStore, type Deal } from "../stores.js";

const router = Router();

function getWorkspaceId(req: Request): string {
  const id = req.headers["x-plexica-workspace-id"];
  if (typeof id !== "string" || !id) {
    throw new Error("Missing X-Plexica-Workspace-Id header");
  }
  return id;
}

function getWorkspaceStore(workspaceId: string): Map<string, Deal> {
  if (!dealsStore.has(workspaceId)) {
    dealsStore.set(workspaceId, new Map());
  }
  return dealsStore.get(workspaceId)!;
}

router.get("/", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);
    const deals = Array.from(store.values());
    res.json(deals);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { title, value, stage, contactId } = req.body;

    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const now = new Date().toISOString();
    const deal: Deal = {
      id: crypto.randomUUID(),
      workspaceId,
      contactId: contactId ?? "",
      title,
      value: typeof value === "number" ? value : 0,
      stage: stage ?? "new",
      createdAt: now,
      updatedAt: now,
    };

    const store = getWorkspaceStore(workspaceId);
    store.set(deal.id, deal);
    res.status(201).json(deal);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/:id", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);
    const deal = store.get(req.params.id!);

    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    res.json(deal);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/count", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);
    res.json({ count: store.size });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.put("/:id", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);
    const existing = store.get(req.params.id!);

    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    const { title, value, stage, contactId } = req.body;
    const updated: Deal = {
      ...existing,
      title: title ?? existing.title,
      value: value !== undefined ? value : existing.value,
      stage: stage ?? existing.stage,
      contactId: contactId ?? existing.contactId,
      updatedAt: new Date().toISOString(),
    };

    store.set(updated.id, updated);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete("/:id", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);

    if (!store.has(req.params.id!)) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    store.delete(req.params.id!);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
