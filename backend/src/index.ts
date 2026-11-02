import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { connectDatabase, initSchema, resolveFrontendDir } from "./db";
import { seedDemoData } from "./seed";
import { api, sendUpload } from "./routes";
import { AuthedRequest } from "./types";

const app = express();
const port = Number(process.env.PORT || 3000);
const frontendDir = resolveFrontendDir();
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

app.use(
  cors({
    origin: (process.env.FRONTEND_ORIGIN || "*").split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/api", api);
app.get("/api/uploads/banners/:file", (req, res) => sendUpload(req as AuthedRequest, res));

if (frontendDir) {
  app.use(express.static(frontendDir));
  app.get("/", (_req, res) => res.sendFile(path.join(frontendDir, "index.html")));
} else {
  console.warn("Frontend folder not found");
}

async function start() {
  fs.mkdirSync(path.join(uploadDir, "banners"), { recursive: true });
  await connectDatabase();
  await initSchema();
  if ((process.env.SEED_DEMO_DATA || "true") === "true") {
    await seedDemoData();
  }
  app.listen(port, () => {
    console.log(`CampusConnect running on http://localhost:${port}`);
    if (frontendDir) console.log("Serving frontend from", frontendDir);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
