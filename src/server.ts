import { app } from "./app.js";
import { client } from "./db/index.js";
import { startRetentionScheduler } from "./retention/scheduler.js";
console.log("TypeScript project is working");

const port = Number(process.env.PORT) || 8080;

async function startServer() {
  try {
    const result = await client`
      SELECT current_database() AS database_name
    `;

    console.log(`Connected to database: ${result[0]?.database_name}`);

    startRetentionScheduler();

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error);
    process.exit(1);
  }
}
void startServer();
