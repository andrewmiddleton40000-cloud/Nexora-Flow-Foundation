import { Router, type IRouter, type Request, type Response } from "express";
import {
  GenerateAssistantContentBody,
  GenerateAssistantContentResponse,
  GetAssistantUsageQueryParams,
  GetAssistantUsageResponse,
} from "@workspace/api-zod";
import {
  AssistantError,
  authenticateRequest,
  generateForWorkspace,
  getWorkspaceUsage,
  isAssistantConfigured,
} from "../lib/assistant";

const router: IRouter = Router();

function sendError(
  req: Request,
  res: Response,
  error: unknown,
): void {
  if (error instanceof AssistantError) {
    if (error.status >= 500) {
      req.log.warn({ code: error.code }, "Assistant request unavailable");
    } else if (error.status === 429) {
      req.log.warn({ code: error.code }, "Assistant request limited");
    }
    if (error.retryAfterSeconds) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  req.log.error(
    { errorType: error instanceof Error ? error.name : "unknown" },
    "Unexpected assistant error",
  );
  res.status(503).json({
    code: "assistant_unavailable",
    message: "The assistant service is temporarily unavailable. Please try again later.",
  });
}

router.get("/assistant/usage", async (req, res): Promise<void> => {
  const parsedQuery = GetAssistantUsageQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({
      code: "invalid_request",
      message: "Select a valid workspace before checking assistant usage.",
    });
    return;
  }

  try {
    const { token, config } = await authenticateRequest(req);
    const usage = await getWorkspaceUsage(
      parsedQuery.data.workspaceId,
      token,
      config,
    );
    res.json(GetAssistantUsageResponse.parse(usage));
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/assistant/generate", async (req, res): Promise<void> => {
  const parsedBody = GenerateAssistantContentBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      code: "invalid_request",
      message: "Choose a valid contact and assistant action, then try again.",
    });
    return;
  }

  try {
    const { token, config } = await authenticateRequest(req);
    if (!isAssistantConfigured()) {
      throw new AssistantError(
        503,
        "assistant_unavailable",
        "The assistant is not configured yet. Ask your workspace administrator to finish setup.",
      );
    }
    const result = await generateForWorkspace(parsedBody.data, token, config);
    res.json(GenerateAssistantContentResponse.parse(result));
  } catch (error) {
    sendError(req, res, error);
  }
});

export default router;
