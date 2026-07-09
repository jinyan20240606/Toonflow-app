/**
 * Agnes AI 供应商适配
 * @version 2.0
 */

// ============================================================
// 类型定义
// ============================================================

type VideoMode =
  | "singleImage" //单图参考
  | "startEndRequired" //首尾帧（两张都得有）
  | "endFrameOptional" //首尾帧（尾帧可选）
  | "startFrameOptional" //首尾帧（首帧可选）
  | "text" //文本
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[]; //多参考（数字代表限制数量）

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
  id: "agnes",
  version: "2.0",
  author: "Agnes AI",
  name: "Agnes AI",
  description: "## Agnes AI 视频生成供应商\n支持文本生成视频、图片参考生成视频、首尾帧关键帧模式",
  inputs: [
    { key: "apiKey", label: "API密钥", type: "password", required: true, placeholder: "sk-xxxxxxxx" },
    { key: "baseUrl", label: "请求地址", type: "url", required: true, placeholder: "https://apihub.agnes-ai.com/v1/videos" },
  ],
  inputValues: { apiKey: "", baseUrl: "https://apihub.agnes-ai.com/v1/videos" },
  models: [
    {
      name: "Agnes Video v2.0",
      modelName: "agnes-video-v2.0",
      type: "video",
      mode: ["singleImage", "startEndRequired", "text"],
      audio: true,
      durationResolutionMap: [{ duration: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15], resolution: ["720p"] }],
    },
  ],
};

// ============================================================
// 辅助工具
// ============================================================

function getApiBase(): string {
  const rawBaseUrl = vendor.inputValues.baseUrl.replace(/\/+$/, "");
  // 如果 baseUrl 已经是 /v1/videos 形式，直接返回
  if (rawBaseUrl.endsWith("/v1/videos")) return rawBaseUrl;
  // 否则拼接 /v1/videos
  return rawBaseUrl.replace(/\/v1\/.*$/, "/v1/videos");
}

function durationToFrames(duration: number, frameRate: number = 24): number {
  // Agnes AI 要求 num_frames = 8 * n + 1（如 1, 9, 17, 25, ...）
  const raw = Math.round(duration * frameRate);
  const n = Math.max(0, Math.round((raw - 1) / 8));
  return 8 * n + 1;
}

// ============================================================
// 适配器函数
// ============================================================

const textRequest = (model: TextModel, think: boolean, thinkLevel: 0 | 1 | 2 | 3) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  const baseUrl = vendor.inputValues.baseUrl.replace(/\/videos$/, "");
  return createOpenAI({ baseURL: baseUrl, apiKey }).chat(model.modelName);
};

const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  return "";
};

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  const apiBase = getApiBase();

  const activeMode = config.mode as string | string[];
  const imageRefs = (config.referenceList ?? []).filter((r) => r.type === "image").map((r) => r.base64);

  // 计算帧数：duration(秒) * frame_rate + 1
  const frameRate = 24;
  const numFrames = durationToFrames(config.duration, frameRate);

  // 构建请求体
  const body: Record<string, any> = {
    model: model.modelName,
    prompt: config.prompt,
    num_frames: numFrames,
    frame_rate: frameRate,
  };

  // 根据模式设置图片参数
  if (activeMode === "singleImage" && imageRefs.length > 0) {
    // 单图参考模式
    body.image = imageRefs[0];
  } else if (
    (activeMode === "startEndRequired" || activeMode === "endFrameOptional" || activeMode === "startFrameOptional") &&
    imageRefs.length >= 1
  ) {
    // 首尾帧/关键帧模式
    body.extra_body = {
      image: imageRefs.slice(0, 2),
      mode: "keyframes",
    };
  }

  logger(`[videoRequest] 提交视频任务，模型: ${model.modelName}, apiBase: ${apiBase}`);
  const response = await fetch(apiBase, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`请求失败，状态码: ${response.status}, 错误信息: ${errorText}`);
  }
  const createData = await response.json();
  const videoId = createData.video_id || createData.id;
  const taskId = createData.task_id || videoId;
  if (!videoId) throw new Error("视频生成接口未返回 video_id");
  logger(`[videoRequest] 任务创建成功, task_id=${taskId}, video_id=${videoId}`);

  // 轮询查询状态：GET /agnesapi?video_id=<VIDEO_ID>
  const agnesApiBase = apiBase.replace(/\/v1\/videos$/, "/agnesapi");
  const res = await pollTask(async () => {
    const queryResponse = await fetch(`${agnesApiBase}?video_id=${videoId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      throw new Error(`轮询失败，状态码: ${queryResponse.status}, 错误信息: ${errorText}`);
    }
    const queryData = await queryResponse.json();
    const status = queryData?.status;
    logger(`[videoRequest] 轮询状态: status=${status}, progress=${queryData?.progress}`);

    if (status === "completed") {
      const videoUrl = queryData?.url;
      if (!videoUrl) throw new Error("视频生成完成但未返回视频URL");
      return { completed: true, data: videoUrl };
    }
    if (status === "failed" || status === "error") {
      const reason = queryData?.error || "视频生成失败";
      return { completed: true, error: reason };
    }
    return { completed: false };
  }, 5000, 600000);

  if (res.error) throw new Error(res.error);
  return await urlToBase64(res.data!);
};

const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
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

export {};
