/**
 * 智脑供应商 聚合中转适配
 * @version 1.0
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
  version: "1.0",
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

  logger(`[imageRequest] 使用 ${imageGeneratePath} 图像接口，模型: ${model.modelName}，参考图数量: ${imageUrls.length}`);
  const data = await requestJson(joinUrl(baseUrl, imageGeneratePath), body, apiKey);
  const directUrl = getResultData(data);
  if (directUrl) return directUrl.startsWith("data:") ? directUrl : await urlToBase64(directUrl);
  const imageResult = extractFirstImageFromMd(data?.choices?.[0]?.message?.content || "");
  if (imageResult) return imageResult.type === "base64" ? imageResult.url : await urlToBase64(imageResult.url);
  throw new Error("图片接口未返回有效图片");
};

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");

  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  const baseUrl = vendor.inputValues.baseUrl;
  const videoGeneratePath = "/video/generateVideo";
  const videoStatusPath = "/video/getVideoStatus";
  const lowerName = model.modelName.toLowerCase();
  const activeMode = config.mode as string | string[];
  const imageRefs = (config.referenceList ?? []).filter((r) => r.type === "image").map((r) => r.base64);
  const videoRefs = (config.referenceList ?? []).filter((r) => r.type === "video").map((r) => r.base64);
  const audioRefs = (config.referenceList ?? []).filter((r) => r.type === "audio").map((r) => r.base64);

  let metadata: Record<string, any> = {};

  if (lowerName.includes("wan")) {
    if ((activeMode === "startEndRequired" || activeMode === "endFrameOptional" || activeMode === "startFrameOptional") && imageRefs.length >= 2) {
      if (imageRefs[0]) metadata.first_frame_url = imageRefs[0];
      if (imageRefs[1]) metadata.last_frame_url = imageRefs[1];
    } else if (imageRefs.length) {
      metadata.img_url = imageRefs[0];
    }
    if (typeof config.audio === "boolean") metadata.audio = config.audio;
  } else if (lowerName.includes("doubao") || lowerName.includes("seedance")) {
    metadata = {
      ...(typeof config.audio === "boolean" && { generate_audio: config.audio }),
      ratio: config.aspectRatio,
      references: [],
      resolution: config.resolution,
    };
    if (Array.isArray(activeMode)) {
      imageRefs.forEach((item) => metadata.references.push({ role: "reference_image", type: "image_url", image_url: { url: item } }));
      videoRefs.forEach((item) => metadata.references.push({ role: "reference_video", type: "video_url", video_url: { url: item } }));
      audioRefs.forEach((item) => metadata.references.push({ role: "reference_audio", type: "audio_url", audio_url: { url: item } }));
    } else if (activeMode === "startEndRequired" || activeMode === "endFrameOptional" || activeMode === "startFrameOptional") {
      imageRefs.forEach((item, i) => metadata.references.push({ type: "image_url", image_url: { url: item }, role: i == 0 ? "first_frame" : "last_frame" }));
    } else if (activeMode === "singleImage") {
      imageRefs.forEach((item) => metadata.references.push({ role: "reference_image", type: "image_url", image_url: { url: item } }));
    }
  } else if (lowerName.includes("vidu")) {
    metadata = { aspect_ratio: config.aspectRatio, audio: config.audio ?? false, off_peak: false };
  } else if (lowerName.includes("kling")) {
    metadata = {
      aspect_ratio: config.aspectRatio,
      sound: typeof config?.audio == "boolean" ? (config?.audio ? "on" : "off") : "off",
      video_list: videoRefs.map((item) => ({ video_url: item })),
      image_list: imageRefs.map((item) => ({ image_url: item })),
    };
  } else if (lowerName.includes("grok")) {
    metadata = { aspectRatio: config.aspectRatio };
  }

  const body: Record<string, any> = {
    model: model.modelName,
    ...(imageRefs.length && lowerName.includes("vidu") ? { images: imageRefs } : {}),
    prompt: config.prompt,
    duration: config.duration,
    resolution: config.resolution,
    metadata,
  };

  logger(`[videoRequest] 提交视频任务，模型: ${model.modelName}`);
  const data = await requestJson(joinUrl(baseUrl, videoGeneratePath), body, apiKey);
  const taskId = getTaskId(data);
  if (!taskId) throw new Error("视频生成接口未返回任务ID");
  logger(`[videoRequest] 任务ID: ${taskId}`);

  const res = await pollByTaskId(taskId, joinUrl(baseUrl, videoStatusPath), apiKey);
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
