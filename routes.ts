import type { Express } from "express";
import { registerAmplitudeRoutes } from "./src/routes/amplitude.ts";
import { registerIssueRoutes } from "./src/routes/issues.ts";
import { registerPersonaRoutes } from "./src/routes/personas.ts";

export const registerRoutes = (app: Express) => {
  app.get("/", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  registerAmplitudeRoutes(app);
  registerIssueRoutes(app);
  registerPersonaRoutes(app);
};
