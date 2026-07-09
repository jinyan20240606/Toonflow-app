import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

/**
 * 更新/新增限流配置（以 scope 为维度）
 * 请求体：
 *   { scope: "video:submit:agnes", enable: true, minTime: 60000, maxConcurrent: 1 }
 * 会 upsert 到 o_setting 表的三条记录：
 *   rateLimit:<scope>:enable / :minTime / :maxConcurrent
 */
export default router.post(
  "/",
  validateFields({
    scope: z.string().min(1),
    enable: z.boolean(),
    minTime: z.number().min(0),
    maxConcurrent: z.number().min(1),
  }),
  async (req, res) => {
    const { scope, enable, minTime, maxConcurrent } = req.body;

    const upsert = async (key: string, value: string) => {
      const exists = await u.db("o_setting").where("key", key).first();
      if (exists) {
        await u.db("o_setting").where("key", key).update({ value });
      } else {
        await u.db("o_setting").insert({ key, value });
      }
    };

    await upsert(`rateLimit:${scope}:enable`, enable ? "1" : "0");
    await upsert(`rateLimit:${scope}:minTime`, String(minTime));
    await upsert(`rateLimit:${scope}:maxConcurrent`, String(maxConcurrent));

    res.status(200).send(success("保存限流配置成功"));
  },
);
