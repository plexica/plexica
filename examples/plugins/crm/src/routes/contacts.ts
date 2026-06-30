import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { contactsStore, type Contact } from "../stores.js";

const router = Router();

function getWorkspaceId(req: Request): string {
  const id = req.headers["x-plexica-workspace-id"];
  if (typeof id !== "string" || !id) {
    throw new Error("Missing X-Plexica-Workspace-Id header");
  }
  return id;
}

function getWorkspaceStore(workspaceId: string): Map<string, Contact> {
  if (!contactsStore.has(workspaceId)) {
    contactsStore.set(workspaceId, new Map());
  }
  return contactsStore.get(workspaceId)!;
}

router.get("/", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);
    const contacts = Array.from(store.values());
    res.json(contacts);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { name, email, phone, notes } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const now = new Date().toISOString();
    const contact: Contact = {
      id: crypto.randomUUID(),
      workspaceId,
      name,
      email: email ?? "",
      phone: phone ?? "",
      notes: notes ?? "",
      createdAt: now,
      updatedAt: now,
    };

    const store = getWorkspaceStore(workspaceId);
    store.set(contact.id, contact);
    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/:id", (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const store = getWorkspaceStore(workspaceId);
    const contact = store.get(req.params.id!);

    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    res.json(contact);
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
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const { name, email, phone, notes } = req.body;
    const updated: Contact = {
      ...existing,
      name: name ?? existing.name,
      email: email ?? existing.email,
      phone: phone ?? existing.phone,
      notes: notes ?? existing.notes,
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
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    store.delete(req.params.id!);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
