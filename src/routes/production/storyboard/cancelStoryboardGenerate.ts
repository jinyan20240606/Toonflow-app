import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 取消分镜图片生成
export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
  }),
  async (req, res) => {
    const { ids } = req.body;
    await u.db("o_storyboard").whereIn("id", ids).update({
      state: "生成失败",
      reason: "用户取消生成",
    });
    res.status(200).send(success({ message: "取消成功" }));
  },
);
