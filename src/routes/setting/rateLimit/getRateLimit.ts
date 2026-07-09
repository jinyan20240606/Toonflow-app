import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = express.Router();

/**
 * 获取限流配置列表
 * 返回 o_setting 中所有以 rateLimit: 开头的配置，按 scope 聚合。
 * 响应示例：
 * [
 *   { scope: "video:submit:agnes", enable: true, minTime: 60000, maxConcurrent: 1 }
 * ]
 */
export default router.get("/", async (_req, res) => {
  const rows = await u.db("o_setting").where("key", "like", "rateLimit:%").select("key", "value");

  const map: Record<string, { scope: string; enable: boolean; minTime: number; maxConcurrent: number }> = {};
  for (const row of rows) {
    // key 形如 rateLimit:<scope...>:<field>
    const parts = (row.key ?? "").split(":");
    const field = parts[parts.length - 1]; // enable | minTime | maxConcurrent
    const scope = parts.slice(1, parts.length - 1).join(":");
    if (!scope) continue;

    if (!map[scope]) {
      map[scope] = { scope, enable: false, minTime: 0, maxConcurrent: 1 };
    }
    if (field === "enable") map[scope].enable = row.value === "1";
    else if (field === "minTime") map[scope].minTime = Number(row.value) || 0;
    else if (field === "maxConcurrent") map[scope].maxConcurrent = Number(row.value) || 1;
  }

  res.status(200).send(success(Object.values(map)));
});
