import Bottleneck from "bottleneck";
import u from "@/utils";

/**
 * 通用限流调度器（基于 bottleneck，以任意 key 为维度）
 * ============================================================
 * 适用于「非 HTTP 层」的限流场景，例如：
 *  - 单个请求内部批量提交任务（如 batchGenerateVideo 的 for 循环）
 *  - 后台异步任务提交（fire-and-forget）
 *  - 对第三方供应商 API 的调用速率控制
 *
 * 与路由中间件不同，本调度器直接包裹「真正执行的异步函数」，
 * 保证被包裹的函数按 key 串行排队并满足最小间隔 / 最大并发限制。
 *
 * 配置约定（o_setting 表，key 形如 rateLimit:<scopeKey>:*）：
 *  - rateLimit:<scopeKey>:enable        "1" 开启 / "0" 关闭（缺省取默认值）
 *  - rateLimit:<scopeKey>:minTime       相邻两次执行最小间隔(ms)
 *  - rateLimit:<scopeKey>:maxConcurrent 最大并发数
 */

export interface ScheduleOptions {
  /** 相邻两次执行最小间隔(ms)，默认 0 */
  minTime?: number;
  /** 最大并发数，默认 1 */
  maxConcurrent?: number;
  /** 未在 o_setting 配置时的默认开关，默认 true */
  defaultEnabled?: boolean;
}

const group = new Bottleneck.Group();
const appliedConfigCache = new Map<string, string>();

async function readSetting(key: string): Promise<string | undefined> {
  try {
    const row = await u.db("o_setting").where("key", key).first();
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

async function resolveConfig(
  scopeKey: string,
  options: Required<ScheduleOptions>,
): Promise<{ enabled: boolean; minTime: number; maxConcurrent: number }> {
  const enableVal = await readSetting(`rateLimit:${scopeKey}:enable`);
  const minTimeVal = await readSetting(`rateLimit:${scopeKey}:minTime`);
  const maxConcVal = await readSetting(`rateLimit:${scopeKey}:maxConcurrent`);

  const enabled = enableVal === undefined ? options.defaultEnabled : enableVal === "1";
  const minTime = minTimeVal !== undefined && Number(minTimeVal) >= 0 ? Number(minTimeVal) : options.minTime;
  const maxConcurrent = Number(maxConcVal) > 0 ? Number(maxConcVal) : options.maxConcurrent;

  return { enabled, minTime, maxConcurrent };
}

function getLimiter(scopeKey: string, minTime: number, maxConcurrent: number): Bottleneck {
  const signature = `${minTime}|${maxConcurrent}`;
  if (appliedConfigCache.get(scopeKey) !== signature) {
    group.key(scopeKey).updateSettings({ minTime, maxConcurrent });
    appliedConfigCache.set(scopeKey, signature);
  }
  return group.key(scopeKey);
}

/**
 * 按 scopeKey 限流调度一个异步任务。
 * 若该 scope 未开启限流，则直接执行；否则进入队列排队 + 间隔控制。
 *
 * @param scopeKey 限流分组标识（如 "video:submit:agnes"）
 * @param fn 真正要执行的异步函数
 * @param options 默认限流参数
 */
export async function schedule<T>(scopeKey: string, fn: () => Promise<T>, options: ScheduleOptions = {}): Promise<T> {
  const merged: Required<ScheduleOptions> = {
    minTime: options.minTime ?? 0,
    maxConcurrent: options.maxConcurrent ?? 1,
    defaultEnabled: options.defaultEnabled ?? true,
  };

  let config;
  try {
    config = await resolveConfig(scopeKey, merged);
  } catch {
    return fn();
  }

  if (!config.enabled) {
    return fn();
  }

  const limiter = getLimiter(scopeKey, config.minTime, config.maxConcurrent);
  return limiter.schedule(fn);
}

export default { schedule };
