/**
 * 智脑供应商 聚合中转适配
 * @version 3.0
 * 
 * 
    1. kuaishou/kling-v3 可用
    2. google/gemini-3-pro-image-preview 生图可用
    3. alibaba/happyhorse-1.0-i2v 可用
 */

// ============================================================
// 类型定义
// ============================================================

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}

interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
  associationSkills?: string;
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}

interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
}

interface VendorConfig {
  id: string;
  version: string;
  name: string;
  author: string;
  description?: string;
  icon?: string;
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];
  inputValues: Record<string, string>;
  models: (TextModel | ImageModel | VideoModel | TTSModel)[];
}

type ReferenceList =
  | { type: "image"; sourceType: "base64"; base64: string }
  | { type: "audio"; sourceType: "base64"; base64: string }
  | { type: "video"; sourceType: "base64"; base64: string };

interface ImageConfig {
  prompt: string;
  referenceList?: Extract<ReferenceList, { type: "image" }>[];
  size: "1K" | "2K" | "4K";
  aspectRatio: `${number}:${number}`;
}

interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: "16:9" | "9:16";
  prompt: string;
  referenceList?: ReferenceList[];
  audio?: boolean;
  mode: VideoMode[];
}

interface TTSConfig {
  text: string;
  voice: string;
  speechRate: number;
  pitchRate: number;
  volume: number;
  referenceList?: Extract<ReferenceList, { type: "audio" }>[];
}

interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

// ============================================================
// 全局声明
// ============================================================

declare const axios: any;
declare const logger: (msg: string) => void;
declare const jsonwebtoken: any;
declare const zipImage: (base64: string, size: number) => Promise<string>;
declare const zipImageResolution: (base64: string, w: number, h: number) => Promise<string>;
declare const mergeImages: (base64Arr: string[], maxSize?: string) => Promise<string>;
declare const urlToBase64: (url: string) => Promise<string>;
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>;
declare const createOpenAI: any;
declare const createDeepSeek: any;
declare const createZhipu: any;
declare const createQwen: any;
declare const createAnthropic: any;
declare const createOpenAICompatible: any;
declare const createXai: any;
declare const createMinimax: any;
declare const createGoogleGenerativeAI: any;
declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;
  imageRequest: (c: ImageConfig, m: ImageModel) => Promise<string>;
  videoRequest: (c: VideoConfig, m: VideoModel) => Promise<string>;
  ttsRequest: (c: TTSConfig, m: TTSModel) => Promise<string>;
  checkForUpdates?: () => Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }>;
  updateVendor?: () => Promise<string>;
};

// ============================================================
// 供应商配置
// ============================================================

const vendor: VendorConfig = {
  id: "zhinao",
  version: "3.0",
  author: "Toonflow",
  name: "智脑供应商",
  description: "## 智脑供应商\n\n智脑专用供应商适配。文本使用 OpenAI 兼容接口；图片固定区分文生图与图生图两种协议；视频使用固定任务提交与轮询协议。",
  icon: "",
  inputs: [
    { key: "apiKey", label: "API密钥", type: "password", required: true },
    { key: "baseUrl", label: "基础地址", type: "url", required: true, placeholder: "例如：https://api.360.cn/v1" },
  ],
  inputValues: {
    apiKey: "",
    baseUrl: "https://api.360.cn/v1",
  },
  models: [],
};

// ============================================================
// 辅助工具
// ============================================================

function joinUrl(baseUrl: string, targetPath: string) {
  if (!targetPath) return baseUrl;
  if (/^https?:\/\//i.test(targetPath)) return targetPath;
  return `${baseUrl.replace(/\/+$/, "")}/${targetPath.replace(/^\/+/, "")}`;
}

function getHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function getTaskId(data: any) {
  return data?.data ?? data?.taskId ?? data?.id ?? data?.data?.taskId ?? data?.result?.taskId;
}

function getStatusValue(data: any) {
  return data?.status ?? data?.data?.status ?? data?.data?.state ?? data?.state;
}

function getResultData(data: any) {
  return data?.data?.[0]?.url ?? data?.data?.data ?? data?.data?.url ?? data?.data?.result ?? data?.result?.url ?? data?.url;
}

function getErrorReason(data: any, fallback: string) {
  return data?.data?.failReason ?? data?.error ?? data?.message ?? fallback;
}

function extractFirstImageFromMd(content: string) {
  const regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+|\/\/[^\s)]+|[^\s)]+)\)/;
  const match = content.match(regex);
  if (!match) return null;
  const raw = match[2].trim();
  const url = raw.startsWith("data:") ? raw : raw.split(/\s+/)[0];
  return { alt: match[1], url, type: url.startsWith("data:image") ? "base64" : "url" };
}

async function requestJson(url: string, body: any, apiKey: string) {
  logger(`[zhinao.request] POST ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  logger(`[zhinao.request] status=${response.status}`);
  if (!response.ok) {
    throw new Error(`请求失败，状态码: ${response.status}, 错误信息: ${responseText}`);
  }
  try {
    return JSON.parse(responseText);
  } catch {
    return { raw: responseText };
  }
}

async function pollByTaskId(taskId: string, statusUrl: string, apiKey: string) {
  return await pollTask(async () => {
    const queryData = await requestJson(statusUrl, { taskICode: taskId }, apiKey);
    logger(queryData);
    const status = getStatusValue(queryData);
    switch (status) {
      case "completed":
      case "SUCCESS":
      case "success":
        return { completed: true, data: getResultData(queryData) };
      case "FAILURE":
      case "failed":
        return { completed: true, error: getErrorReason(queryData, "任务失败") };
      default:
        return { completed: false };
    }
  });
}

// ============================================================
// 适配器函数
// ============================================================

const textRequest = (model: TextModel, think: boolean, thinkLevel: 0 | 1 | 2 | 3) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  return createOpenAI({ baseURL: vendor.inputValues.baseUrl, apiKey }).chat(model.modelName);
};

const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  const baseUrl = vendor.inputValues.baseUrl;
  const lowerName = model.modelName.toLowerCase();
  const imageBase64List = (config.referenceList ?? []).map((r) => r.base64).filter(Boolean);
  const isImageEdit = imageBase64List.length > 0;
  const imageGeneratePath = isImageEdit ? "/images/edits" : "/images/generations";
  const imageUrls = imageBase64List.map((item) => {
    if (/^https?:\/\//i.test(item)) return item;
    if (item.startsWith("data:")) return item;
    return `data:image/jpeg;base64,${item}`;
  });

  let body: Record<string, any>;

  if (lowerName.includes("gemini") || lowerName.includes("nano")) {
    body = {
      model: model.modelName,
      prompt: config.prompt,
      extra_body: {
        ...(isImageEdit ? { image_urls: imageUrls } : {}),
        generation_config: {
          imageConfig: {
            aspectRatio: config.aspectRatio,
            imageSize: config.size,
            personGeneration: "ALLOW_ALL",
          },
        },
      },
    };
  } else if (lowerName.includes("gpt")) {
    body = {
      model: model.modelName,
      prompt: config.prompt,
      size: config.aspectRatio === "16:9" ? "1024x576" : "576x1024",
      n: 1,
      response_format: "",
      style: "",
      quality: "medium",
      ...(isImageEdit
        ? {
            extra_body: {
              images: imageUrls,
              // 标记位置的遮罩图，暂时用不到
              mask: [],
            },
          }
        : {}),
    };
  } else {
    const isDoubaoSeedream = /(^|\/)doubao-seedream/i.test(lowerName) || lowerName.includes("seedream");
    if (isDoubaoSeedream) {
      body = {
        model: model.modelName,
        prompt: config.prompt,
        extra_body: {
          ...(isImageEdit ? { image: imageUrls } : {}),
          sequential_image_generation: "disabled",
          size: config.size,
          watermark: false,
        },
      };
    } else {
      body = {
        model: model.modelName,
        prompt: config.prompt,
        ...(isImageEdit ? { image_urls: imageUrls } : {}),
        size:
          config.aspectRatio === "16:9"
            ? config.size === "1K"
              ? "1600x900"
              : config.size === "2K"
                ? "2848x1600"
                : "4096x2304"
            : config.size === "1K"
              ? "900x1600"
              : config.size === "2K"
                ? "1600x2848"
                : "2304x4096",
        metadata: { response_format: "url", sequential_image_generation: "disabled", stream: false, watermark: false },
      };
    }
  }

  logger(`[imageRequest] 使用 ${imageGeneratePath} 图像接口，模型: ${model.modelName}，参考图数量: ${imageUrls.length}`);
  const data = await requestJson(joinUrl(baseUrl, imageGeneratePath), body, apiKey);
  logger(`[imageRequest] 响应数据: ${JSON.stringify(data).slice(0, 500)}`);
  const directUrl = getResultData(data);
  if (directUrl) return directUrl.startsWith("data:") ? directUrl : await urlToBase64(directUrl);
  if (data?.data?.[0]?.url) return await urlToBase64(data.data[0].url);
  if (data?.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
  const imageResult = extractFirstImageFromMd(data?.choices?.[0]?.message?.content || "");
  if (imageResult) return imageResult.type === "base64" ? imageResult.url : await urlToBase64(imageResult.url);
  throw new Error("图片接口未返回有效图片，响应: " + JSON.stringify(data).slice(0, 300));
};

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");

  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  const baseUrl = vendor.inputValues.baseUrl;
  const lowerName = model.modelName.toLowerCase();
  const activeMode = config.mode as string | string[];
  const imageRefs = (config.referenceList ?? []).filter((r) => r.type === "image").map((r) => r.base64);
  const videoRefs = (config.referenceList ?? []).filter((r) => r.type === "video").map((r) => r.base64);
  const audioRefs = (config.referenceList ?? []).filter((r) => r.type === "audio").map((r) => r.base64);

  const toMediaUrl = (b64: string) => {
    if (/^https?:\/\//i.test(b64)) return b64;
    if (b64.startsWith("data:")) return b64;
    return `data:image/jpeg;base64,${b64}`;
  };

  const content: any[] = [];
  if (config.prompt) {
    content.push({ type: "text", text: config.prompt });
  }
  for (const img of imageRefs) {
    content.push({ type: "image_url", image_url: { url: toMediaUrl(img) } });
  }
  for (const vid of videoRefs) {
    content.push({ type: "video_url", video_url: { url: toMediaUrl(vid) } });
  }
  for (const aud of audioRefs) {
    content.push({ type: "audio_url", audio_url: { url: toMediaUrl(aud) } });
  }

  let extra_body: Record<string, any> = {};

  if (lowerName.includes("doubao") || lowerName.includes("seedance")) {
    // 火山引擎豆包/Seedance 系列
    // 参考请求格式：
    // {
    //   "model": "volcengine/doubao-seedance-2-0",
    //   "content": [
    //     { "type": "text", "text": "..." },
    //     { "type": "image_url", "image_url": { "url": "https://..." } },
    //     { "type": "video_url", "video_url": { "url": "https://..." } },
    //     { "type": "audio_url", "audio_url": { "url": "https://..." } }
    //   ],
    //   "extra_body": {
    //     "role": "reference",
    //     "generate_audio": true,
    //     "ratio": "16:9",
    //     "duration": 11,
    //     "watermark": false
    //   }
    // }
    extra_body = {
      ...(Array.isArray(activeMode) && (imageRefs.length || videoRefs.length || audioRefs.length) ? { role: "reference" } : {}),
      ...(typeof config.audio === "boolean" && { generate_audio: config.audio }),
      ratio: config.aspectRatio,
      duration: config.duration,
      watermark: false,
      person_generation: "allow",
    };
  } else if (lowerName.includes("wan")) {
    if (typeof config.audio === "boolean") extra_body.audio = config.audio;
    if ((activeMode === "startEndRequired" || activeMode === "endFrameOptional" || activeMode === "startFrameOptional") && imageRefs.length >= 2) {
      if (imageRefs[0]) extra_body.first_frame_url = toMediaUrl(imageRefs[0]);
      if (imageRefs[1]) extra_body.last_frame_url = toMediaUrl(imageRefs[1]);
    } else if (imageRefs.length) {
      extra_body.img_url = toMediaUrl(imageRefs[0]);
    }
  } else if (lowerName.includes("vidu")) {
    extra_body = {
      aspect_ratio: config.aspectRatio,
      audio: config.audio ?? false,
      off_peak: false,
    };
  } else if (lowerName.includes("kling")) {
    // Kling 不支持 audio_url 参考，将音频描述注入 prompt 文本
    const audioRefs = (config.referenceList ?? []).filter((r) => r.type === "audio");
    let klingPrompt = config.prompt || "";
    if (audioRefs.length > 0 && klingPrompt) {
      klingPrompt += "\n\n[Audio Reference Description]\n";
      audioRefs.forEach((ref, i) => {
        klingPrompt += `Reference audio ${i + 1}: This audio clip provides voice timbre reference. The character speaking should match this voice characteristics.\n`;
      });
    }
    extra_body = {
      aspect_ratio: config.aspectRatio,
      sound: typeof config?.audio == "boolean" ? (config?.audio ? "on" : "off") : "off",
    };
    // 替换 content 中的 text 为增强后的 prompt
    const textItem = content.find((c) => c.type === "text");
    if (textItem) textItem.text = klingPrompt;
  } else if (lowerName.includes("grok")) {
    extra_body = { aspectRatio: config.aspectRatio };
  } else if (lowerName.includes("veo")) {
    extra_body = {
      instances: [{
        prompt: config.prompt,
        ...(imageRefs.length ? { image: toMediaUrl(imageRefs[0]) } : {}),
      }],
      parameters: {
        aspectRatio: config.aspectRatio,
        durationSeconds: config.duration,
        generateAudio: config.audio ?? false,
        personGeneration: "allow_adult",
        resolution: config.resolution,
      },
    };
  } else if (lowerName.includes("happyhorse")) {
    const media: any[] = [];
    if (activeMode === "singleImage" || activeMode === "startFrameOptional") {
      imageRefs.forEach((img) => media.push({ type: "first_frame", url: toMediaUrl(img) }));
    } else if (activeMode === "startEndRequired" && imageRefs.length >= 2) {
      media.push({ type: "first_frame", url: toMediaUrl(imageRefs[0]) });
      media.push({ type: "last_frame", url: toMediaUrl(imageRefs[1]) });
    } else if (Array.isArray(activeMode)) {
      imageRefs.forEach((img) => media.push({ type: "reference_image", url: toMediaUrl(img) }));
      videoRefs.forEach((vid) => media.push({ type: "video", url: vid }));
    } else {
      imageRefs.forEach((img) => media.push({ type: "first_frame", url: toMediaUrl(img) }));
    }
    const resolution = config.resolution && !/P$/i.test(config.resolution) ? `${config.resolution}P` : config.resolution;
    extra_body = {
      input: {
        prompt: config.prompt,
        ...(media.length ? { media } : {}),
      },
      parameters: {
        resolution,
        duration: config.duration,
        ...(config.aspectRatio && { ratio: config.aspectRatio }),
      },
    };
  }

  // 确保 content 至少包含 text，避免空数组
  if (content.length === 0 || !content.some((c) => c.type === "text")) {
    content.unshift({ type: "text", text: config.prompt || "Generate a video" });
  }

  // doubao/seedance 的图片/视频/音频已通过 content 传入，不需要 extra_body.image_urls
  const isDoubaoSeedance = lowerName.includes("doubao") || lowerName.includes("seedance");
  const modelsWithImageHandled = ["wan", "vidu", "kling", "grok", "veo", "happyhorse"];
  const isImageHandled = modelsWithImageHandled.some((k) => lowerName.includes(k)) || isDoubaoSeedance;
  if (imageRefs.length > 0 && !isImageHandled) {
    extra_body.image_urls = imageRefs.map(toMediaUrl);
  }

  let body: Record<string, any>;
  if (lowerName.includes("happyhorse") || lowerName.includes("veo")) {
    body = {
      model: model.modelName,
      extra_body,
    };
  } else if (isDoubaoSeedance) {
    // seedance/doubao: duration 在 extra_body 内，不在 body 顶层
    body = {
      model: model.modelName,
      content,
      extra_body,
    };
  } else {
    body = {
      model: model.modelName,
      content,
      duration: config.duration,
      extra_body,
    };
  }

  const generateUrl = joinUrl(baseUrl, "/videos/async_generations");
  logger(`[videoRequest] 提交视频任务，模型: ${model.modelName}, URL: ${generateUrl}`);
  // logger(`[videoRequest] 请求body: ${JSON.stringify(body).slice(0, 500)}`);
  const data = await requestJson(generateUrl, body, apiKey);
  const taskId = data?.data?.id;
  if (!taskId) throw new Error("视频生成接口未返回任务ID，响应: " + JSON.stringify(data).slice(0, 300));
  logger(`[videoRequest] 任务ID: ${taskId}`);

  // taskId 中包含 ^^ 分隔符，直接拼接不编码
  const statusUrl = joinUrl(baseUrl, `/videos/async_generations/${taskId}`);
  logger(`[videoRequest] 轮询状态URL: ${statusUrl}`);
  const res = await pollTask(async () => {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: getHeaders(apiKey),
    });
    const responseText = await response.text();
    let queryData: any;
    try { queryData = JSON.parse(responseText); } catch {
      try { queryData = JSON.parse(JSON.parse(responseText)?.error?.message ?? "{}"); } catch { /* ignore */ }
    }
    if (!response.ok) {
      const failReason = queryData?.data?.failure_reason || queryData?.error?.message;
      if (failReason) return { completed: true, error: failReason };
      throw new Error(`查询状态失败，状态码: ${response.status}, 错误信息: ${responseText}`);
    }
    if (!queryData) return { completed: false };
    const status = queryData?.data?.status;
    logger(`[videoRequest] 轮询状态: ${status}`);
    switch (status) {
      case "completed":
      case "SUCCESS":
      case "SUCCEEDED":
      case "success":
      case "succeed": {
        const url = queryData?.data?.url ?? queryData?.data?.video_url ?? queryData?.data?.result?.url;
        logger(`[videoRequest] 视频URL: ${url}`);
        if (!url) {
          logger(`[videoRequest] 完整响应: ${JSON.stringify(queryData).slice(0, 500)}`);
          return { completed: true, error: "任务完成但未返回视频URL" };
        }
        return { completed: true, data: url };
      }
      case "FAILED":
      case "failed":
        return { completed: true, error: queryData?.data?.failure_reason || "任务失败" };
      default:
        return { completed: false };
    }
  });

  if (res.error) throw new Error(res.error);
  return await urlToBase64(res.data!);
};

const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
  return "";
};

const checkForUpdates = async (): Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }> => {
  return { hasUpdate: false, latestVersion: "1.0", notice: "" };
};

const updateVendor = async (): Promise<string> => {
  return "";
};

// ============================================================
// 导出
// ============================================================

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.checkForUpdates = checkForUpdates;
exports.updateVendor = updateVendor;

export {};
