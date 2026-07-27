import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import recalcTrackDuration from "@/lib/recalcTrackDuration";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { ids, projectId } = req.body;
    if (!ids.length) return res.status(400).send(error("请先选择分镜"));
    const storyboardDataList = await u.db("o_storyboard").whereIn("id", ids).where("projectId", projectId).select("id", "track", "trackId", "flowId", "scriptId");
    if (!storyboardDataList.length) return res.status(400).send(error("当前选择分镜不存在"));
    const flowIds = storyboardDataList.map((i) => i.flowId);
    const storyBoardIds = storyboardDataList.map((i) => i.id);
    if (flowIds.length)
      await u
        .db("o_imageFlow")
        .whereIn("id", flowIds as number[])
        .delete();

    await u.db("o_storyboard").whereIn("id", storyBoardIds).delete();
    await u.db("o_assets2Storyboard").whereIn("storyboardId", storyBoardIds).delete();

    // 删除后统一重算受影响剧本的轨道时长并清理孤儿轨道
    const scriptIds = [...new Set(storyboardDataList.map((i) => i.scriptId).filter((id): id is number => id != null))];
    for (const scriptId of scriptIds) await recalcTrackDuration(scriptId);

    res.status(200).send(success({ message: "视频删除成功" }));
  },
);
