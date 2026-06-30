import express from "express";
import cors from "cors";
import contactsRouter from "./routes/contacts.js";
import dealsRouter from "./routes/deals.js";
import eventsRouter from "./routes/events.js";
import healthRouter from "./health.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/contacts", contactsRouter);
app.use("/deals", dealsRouter);
app.use("/_plexica/event", eventsRouter);
app.use("/_plexica", healthRouter);

export default app;
