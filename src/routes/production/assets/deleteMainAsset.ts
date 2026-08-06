import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 删除主资产（含其所有衍生资产）
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { id, projectId } = req.body;
    const asset = await u.db("o_assets").where("id", id).first();
    if (!asset) {
      return res.status(404).send({ error: "资源未找到" });
    }
    // 删除衍生资产
    const deriveAssets = await u.db("o_assets").where("assetsId", id);
    for (const da of deriveAssets) {
      if (da.flowId) await u.db("o_imageFlow").where("id", da.flowId).delete();
    }
    await u.db("o_assets").where("assetsId", id).delete();
    // 删除主资产
    if (asset.flowId) await u.db("o_imageFlow").where("id", asset.flowId).delete();
    await u.db("o_assets").where("id", id).delete();
    // 删除关联关系
    await u.db("o_assets2Storyboard").where("assetId", id).delete();
    await u.db("o_scriptAssets").where("assetId", id).delete();

    res.status(200).send(success({ message: "资产删除成功" }));
  },
);
