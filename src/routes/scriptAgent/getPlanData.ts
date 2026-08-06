import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    agentType: z.enum(["scriptAgent"]),
    episodesId: z.number().optional(),
  }),
  async (req, res) => {
    const { projectId, agentType, episodesId } = req.body;
    const key = episodesId ? `${agentType}:${episodesId}` : agentType;
    const row = await u.db("o_agentWorkData").where({ projectId: projectId, key }).first();

    if (!row) {
      const [id] = await u.db("o_agentWorkData").insert({
        projectId: projectId,
        key,
        data: JSON.stringify({
          storySkeleton: "",
          adaptationStrategy: "",
        }),
      });
      const scriptList = episodesId
        ? await u.db("o_script").where({ projectId, id: episodesId }).select("id", "name", "content")
        : await u.db("o_script").where({ projectId }).select("id", "name", "content");
      return res.status(200).send(
        success({
          data: {
            storySkeleton: "",
            adaptationStrategy: "",
            script: scriptList,
          },
          id
        }),
      );
    }
    const data = JSON.parse(row.data ?? "{}");
    data.script = episodesId
      ? await u.db("o_script").where({ projectId, id: episodesId }).select("id", "name", "content")
      : await u.db("o_script").where({ projectId }).select("id", "name", "content");

    res.status(200).send(success({ data, id: row.id }));
  },
);
