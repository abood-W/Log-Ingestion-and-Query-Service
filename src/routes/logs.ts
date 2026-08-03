import { Router } from "express";

const router = Router();

router.post("/logs", (_req, res) => {
  res.status(501).json({
    error: "Not implemented yet",
  });
});

export default router;
