import express from "express";
import u from "@/utils";
import { db } from "@/utils/db";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import recalcTrackDuration from "@/lib/recalcTrackDuration";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()).min(2, "至少选择2条分镜"),
    projectId: z.number(),
    videoDesc: z.string().min(1, "合并后的画面描述不能为空"),
    duration: z.number().positive("时长必须大于0"),
  }),
  async (req, res) => {
    const { ids, projectId, videoDesc, duration } = req.body as {
      ids: number[];
      projectId: number;
      videoDesc: string;
      duration: number;
    };

    const storyboardList = await u
      .db("o_storyboard")
      .whereIn("id", ids)
      .where("projectId", projectId)
      .orderBy("id")
      .select(
        "id",
        "track",
        "trackId",
        "flowId",
        "scriptId",
        "prompt",
        "state",
        "shouldGenerateImage",
        "duration",
        "createTime",
        "index",
      );

    if (storyboardList.length !== ids.length) {
      return res.status(400).send(error("存在无效分镜，无法合并"));
    }

    const sortedBySelection = ids
      .map((id) => storyboardList.find((item: any) => item.id === id))
      .filter(Boolean) as Array<{
      id: number;
      track: string | null;
      trackId: number | null;
      flowId: number | null;
      scriptId: number;
      prompt: string | null;
      state: string | null;
      shouldGenerateImage: number | null;
      duration: string | number | null;
      createTime: number | null;
      index: number | null;
    }>;

    const scriptId = sortedBySelection[0]?.scriptId;
    if (!scriptId) {
      return res.status(400).send(error("未找到有效分镜数据"));
    }

    const allSameScript = sortedBySelection.every((item) => item.scriptId === scriptId);
    if (!allSameScript) {
      return res.status(400).send(error("仅支持合并同一剧本下的分镜"));
    }

    const allShouldGenerateImage = sortedBySelection.every((item) => Number(item.shouldGenerateImage) === 1);
    if (!allShouldGenerateImage) {
      return res.status(400).send(error("当前仅支持合并需要生成分镜图的分镜"));
    }

    // 合并后统一归到第一条选中分镜所在的轨道；被合并分镜原轨道的时长会在事务里统一重算
    const firstSelected = sortedBySelection[0];
    const targetTrack = firstSelected?.track || `${Date.now()}`;
    const targetTrackId = firstSelected?.trackId != null ? Number(firstSelected.trackId) : null;

    const allStoryboardOfScript = await u
      .db("o_storyboard")
      .where({ projectId, scriptId })
      .orderBy([{ column: "createTime", order: "asc" }, { column: "id", order: "asc" }])
      .select("id", "trackId", "shouldGenerateImage", "track", "duration");

    const orderedIds = allStoryboardOfScript.map((item: any) => item.id);
    const selectedIndexes = ids
      .map((id) => orderedIds.indexOf(id))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);

    const isContinuous = selectedIndexes.every((index, i) => i === 0 || index === selectedIndexes[i - 1] + 1);
    if (!isContinuous) {
      return res.status(400).send(error("仅支持合并列表中连续相邻的分镜"));
    }

    const insertAfterId = selectedIndexes[0] > 0 ? orderedIds[selectedIndexes[0] - 1] : null;
    const firstStoryboard = sortedBySelection[0];
    const inheritedPrompt = firstStoryboard?.prompt || "";

    const assetRows = await u
      .db("o_assets2Storyboard")
      .whereIn("storyboardId", ids)
      .orderBy("rowid")
      .select("storyboardId", "assetId");

    const uniqueAssetIds = Array.from(new Set(assetRows.map((item: any) => item.assetId).filter((item) => item != null)));

    const flowIds = sortedBySelection.map((item) => item.flowId).filter((item): item is number => item != null);

    await db.transaction(async (trx) => {
      if (flowIds.length) {
        await trx("o_imageFlow").whereIn("id", flowIds).delete();
      }

      await trx("o_assets2Storyboard").whereIn("storyboardId", ids).delete();
      await trx("o_storyboard").whereIn("id", ids).delete();

      const [newId] = await trx("o_storyboard").insert({
        scriptId,
        projectId,
        track: targetTrack,
        trackId: targetTrackId,
        prompt: inheritedPrompt,
        videoDesc,
        duration: String(duration),
        state: "未生成",
        shouldGenerateImage: 1,
        createTime: Date.now(),
      });

      if (uniqueAssetIds.length) {
        await trx("o_assets2Storyboard").insert(
          uniqueAssetIds.map((assetId) => ({
            assetId,
            storyboardId: newId,
          })),
        );
      }

      if (insertAfterId) {
        const afterRow = await trx("o_storyboard").where("id", insertAfterId).select("createTime").first();
        if (afterRow?.createTime != null) {
          await trx("o_storyboard").where("id", newId).update({ createTime: Number(afterRow.createTime) + 1 });
        }
      } else {
        const firstRemaining = await trx("o_storyboard")
          .where({ projectId, scriptId })
          .orderBy([{ column: "createTime", order: "asc" }, { column: "id", order: "asc" }])
          .first();
        if (firstRemaining?.createTime != null) {
          await trx("o_storyboard").where("id", newId).update({ createTime: Number(firstRemaining.createTime) - 1 });
        }
      }

      // 统一重算该剧本下所有轨道时长并清理孤儿轨道（含被合并分镜原本所在的轨道）
      await recalcTrackDuration(scriptId, trx);

      // 合并删除/插入会打乱 index：按 createTime 重排为连续 0..N，保证分镜面板/分镜台/快速预览顺序一致
      const orderedForIndex = await trx("o_storyboard")
        .where({ projectId, scriptId })
        .orderBy([{ column: "createTime", order: "asc" }, { column: "id", order: "asc" }])
        .select("id");
      for (let i = 0; i < orderedForIndex.length; i++) {
        await trx("o_storyboard").where("id", orderedForIndex[i].id).update({ index: i });
      }

      const newRow = await trx("o_storyboard").where("id", newId).first();

      return res.status(200).send(
        success({
          id: newId,
          track: targetTrack,
          trackId: targetTrackId,
          prompt: inheritedPrompt,
          duration: Number(newRow?.duration || duration),
          state: "未生成",
          videoDesc,
          src: "",
          associateAssetsIds: uniqueAssetIds,
          shouldGenerateImage: 1,
        }),
      );
    });
  },
);
