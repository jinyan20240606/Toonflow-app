import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import fs from "fs/promises";
import path from "path";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    trackId: z.number(),
    projectId: z.number(),
    info: z.array(
      z.object({
        id: z.number(),
        sources: z.string(),
      }),
    ),
    model: z.string(),
    mode: z.string(),
  }),
  async (req, res) => {
    const { trackId, projectId, info, model, mode } = req.body;
    await u.db("o_videoTrack").where({ id: trackId }).update({
      state: "生成中",
    });
    //查询参数
    const images = await Promise.all(
      info.map(async (item: { id: number; sources: string }) => {
        if (item.sources === "storyboard") {
          // 查询分镜主信息
          const storyboard = await u
            .db("o_storyboard")
            .where("o_storyboard.id", item.id)
            .select("videoDesc", "prompt", "track", "duration", "shouldGenerateImage")
            .first();
          // 查询分镜关联的资产ID
          const assetRows = await u.db("o_assets2Storyboard").where("storyboardId", item.id).orderBy("rowid").select("assetId");
          const associateAssetsIds = assetRows.map((row: any) => row.assetId);
          return {
            ...storyboard,
            associateAssetsIds,
            _type: "storyboard", // 标记类型，便于后续区分
          };
        }
        if (item.sources === "assets") {
          // 查询素材
          const assetsData = await u
            .db("o_assets")
            .leftJoin("o_image", "o_image.id", "o_assets.imageId")
            .where("o_assets.id", item.id)
            .select("o_assets.id", "o_assets.type", "o_assets.name", "o_image.filePath")
            .first();
          return {
            ...assetsData,
            _type: "assets", // 标记类型
          };
        }
      }),
    );

    // 拆分 assets 和 storyboard
    const assets: any[] = [];
    const storyboard: any[] = [];
    for (const item of images) {
      if (!item) continue; // 忽略空
      if (item._type === "assets")
        assets.push({
          id: item.id,
          type: item.type,
          name: item.name,
          filePath: item.filePath,
        });
      if (item._type === "storyboard")
        storyboard.push({
          videoDesc: item.videoDesc,
          prompt: item.prompt,
          track: item.track,
          duration: item.duration,
          associateAssetsIds: item.associateAssetsIds,
          shouldGenerateImage: item.shouldGenerateImage,
        });
    }
    // 查询角色绑定的音频信息（音色描述），注入到 LLM 上下文中
    // 从 storyboard 的 associateAssetsIds + assets 中收集所有角色 ID
    const allAssetIds = [
      ...new Set([
        ...assets.map((i) => i.id),
        ...storyboard.flatMap((s) => s.associateAssetsIds || []),
      ]),
    ];
    const role2AudioData = allAssetIds.length
      ? await u
          .db("o_assetsRole2Audio")
          .leftJoin("o_assets", "o_assets.id", "o_assetsRole2Audio.assetsAudioId")
          .whereIn("o_assetsRole2Audio.assetsRoleId", allAssetIds)
          .select(
            "o_assetsRole2Audio.assetsRoleId",
            "o_assetsRole2Audio.assetsAudioId",
            "o_assets.name as audioName",
            "o_assets.describe as audioDescribe",
          )
      : [];
    const roleAudioMap: Record<number, { name: string; describe: string; audioId: number }> = {};
    role2AudioData.forEach((i: any) => {
      roleAudioMap[i.assetsRoleId] = { name: i.audioName, describe: i.audioDescribe, audioId: i.assetsAudioId };
    });
    // 判断当前模式是否为「支持参考音频」的多参模式（mode 数组中含 audioReference）
    let videoModeParsed: any = mode;
    try {
      videoModeParsed = JSON.parse(mode);
    } catch {}
    const isAudioReferenceMode =
      Array.isArray(videoModeParsed) && videoModeParsed.some((m: any) => String(m).toLowerCase().startsWith("audioreference"));
    // 查出有音频绑定的角色名称
    const bindRoleIds = Object.keys(roleAudioMap).map(Number);
    const bindRoles = bindRoleIds.length
      ? await u.db("o_assets").whereIn("id", bindRoleIds).select("id", "name")
      : [];
    const bindRoleNameMap: Record<number, string> = {};
    bindRoles.forEach((r: any) => { bindRoleNameMap[r.id] = r.name; });

    const [id, modelData] = model.split(/:(.+)/);
    const projectData = await u.db("o_project").select("*").where({ id: projectId }).first();
    const videoPrompt = await u.db("o_prompt").where("type", "videoPromptGeneration").first();
    let videoPromptGeneration = "" as string | undefined;

    const modelPromptData = await u.db("o_modelPrompt").where("vendorId", id).where("model", modelData).first();
    //查询到 有绑定对应视频提示词
    if (modelPromptData) {
      const modelPromptRoot = u.getPath(["modelPrompt"]);
      try {
        const fullPath = path.join(modelPromptRoot, modelPromptData?.path!);
        const content = await fs.readFile(fullPath, "utf-8");
        videoPromptGeneration = content ?? "";
      } catch {}
    }

    // 未查询到绑定，根据模型名称 + mode 自动匹配 modelPrompt/video/ 下的文件
    if (!videoPromptGeneration) {
      const modelPromptRoot = u.getPath(["modelPrompt"]);
      const videoPromptDir = path.join(modelPromptRoot, "video");
      const modelLower = (modelData ?? "").toLowerCase();

      let fileName: string | null = null;

      if (modelLower.includes("wan") && modelLower.includes("2.6")) {
        // wan2.6 系列 => 单图首尾帧模式
        fileName = "wan2.6Single-imageFirstFrameMode.md";
      } else if (/seedance.*2[.\-]0/i.test(modelData)) {
        // seedance 2.0 / 2-0 系列
        fileName = "seedance2Multi-parameterMode.md";
      } else if (mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional") {
        // body.mode 为首尾帧相关 => 通用首尾帧模式
        fileName = "universalFirstAndLastFrameMode.md";
      } else if (typeof mode === "string" && mode.startsWith('["') && mode.endsWith('"]')) {
        // 其他 => 通用多参模式
        fileName = "universalMulti-parameterMode.md";
      }
      if (fileName) {
        try {
          const fullPath = path.join(videoPromptDir, fileName);
          videoPromptGeneration = await fs.readFile(fullPath, "utf-8");
        } catch {
          // 文件不存在则忽略，继续用备选
        }
      }
    }

    //备选
    if (!videoPromptGeneration) {
      if (videoPrompt && videoPrompt.useData) {
        videoPromptGeneration = videoPrompt.useData;
      } else {
        videoPromptGeneration = videoPrompt?.data ?? undefined;
      }
    }

    const artStyle = projectData?.artStyle || "无";

    const visualManual = u.getArtPrompt(artStyle, "art_skills", "art_storyboard_video");

    // 双轨拼接：参考音频模式 → 保留 audio:ID 引用；非参考音频模式 → 纯文字音色描述
    let content: string;
    if (isAudioReferenceMode) {
      // 参考音频模式：资产信息中为有绑定音频的角色追加 audio:ID 引用
      const assetLines = assets
        .filter((i) => i.filePath)
        .map((i) => {
          const audioId = roleAudioMap[i.id]?.audioId;
          return audioId ? `[${i.id},${i.type},${i.name} audio:${audioId}]` : `[${i.id},${i.type},${i.name}]`;
        })
        .join("，");
      content = `
          **模型名称**：${modelData},

          **资产信息**（角色、场景、道具、音频):${assetLines},
          **分镜信息**：${storyboard.map(
            (i) => `<storyboardItem
  videoDesc='${i.videoDesc}'
  duration='${i.duration}'
></storyboardItem>`,
          )},
          `;
    } else {
      // 非参考音频模式：注入可读的角色音色文字描述
      const roleAudioDesc = Object.entries(roleAudioMap)
        .map(([roleId, audio]) => {
          const roleName = bindRoleNameMap[Number(roleId)] || `角色ID:${roleId}`;
          const [sex, timbre] = (audio.describe || "").split("|");
          return `- ${roleName}：${sex || ""}，${timbre || audio.describe || audio.name || "无描述"}`;
        })
        .join("\n");
      content = `
          **模型名称**：${modelData},

          **资产信息**（角色、场景、道具、音频):${assets
            .filter((i) => i.filePath)
            .map((i) => `[${i.id},${i.type},${i.name}]`)
            .join("，")},
          ${roleAudioDesc ? `**角色音色信息**（角色绑定的音色描述，请在台词和 Audio 段落中使用这些音色特征）:\n${roleAudioDesc}\n` : ""}
          **分镜信息**：${storyboard.map(
            (i) => `<storyboardItem
  videoDesc='${i.videoDesc}'
  duration='${i.duration}'
></storyboardItem>`,
          )},
          `;
    }

    try {
      const { text } = await u.Ai.Text("universalAi").invoke({
        system: videoPromptGeneration,
        messages: [
          {
            role: "assistant",
            content: `${visualManual}`,
          },
          {
            role: "user",
            content: content,
          },
        ],
      });
      // 非音频模式下，在提示词末尾追加 [Voice Timbre] 段
      let promptText = text;
      if (!isAudioReferenceMode && Object.keys(roleAudioMap).length > 0) {
        const timbreLines = Object.entries(roleAudioMap)
          .map(([roleId, audio]) => {
            const roleName = bindRoleNameMap[Number(roleId)] || `角色ID:${roleId}`;
            const [sex, timbre] = (audio.describe || "").split("|");
            return `- ${roleName}：${sex || ""}，${timbre || audio.describe || audio.name || "无描述"}`;
          });
        promptText = text + `\n\n[Voice Timbre]\n${timbreLines.join("\n")}`;
      }
      await u.db("o_videoTrack").where({ id: trackId }).update({
        state: "已完成",
        prompt: promptText,
      });
      res.status(200).send(success(promptText));
    } catch (e) {
      await u
        .db("o_videoTrack")
        .where({ id: trackId })
        .update({
          state: "生成失败",
          reason: u.error(e).message,
        });
      res.status(400).send(error(u.error(e).message));
    }
  },
);
