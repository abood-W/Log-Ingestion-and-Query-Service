import express from "express";
import logsRouter from "./routes/logs.js";
import aggregateRouter from "./routes/aggregate.js";
export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.use(logsRouter);
app.use(aggregateRouter);
