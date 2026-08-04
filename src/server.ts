import express from "express";
import logsRouter from "./routes/logs.js";
import { client } from "./db/index.js";

console.log("TypeScript project is working");

const app = express();
const port = Number(process.env.PORT) || 8080;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.use(logsRouter);

async function startServer() {
  try {
    const result = await client`
      SELECT current_database() AS database_name
    `;

    console.log(`Connected to database: ${result[0]?.database_name}`);

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error);
    process.exit(1);
  }
}

void startServer();
