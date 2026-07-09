import { Request, Response, NextFunction } from "express";
import Bottleneck from "bottleneck";
import u from "@/utils";

/**
 * 通用接口限流中间件（基于 bottleneck，以「路由地址」为维度）
 * ============================================================
 * 特性：
 *  - 按路由 key 独立排队，不同接口互不影响
 *  - 支持「最小请求间隔」(minTime) 与「最大并发」(maxConcurrent)
 *  - 开关与速率均可通过 o_setting 表动态配置，改配置即时生效
 *  - 请求进入队列排队等待，不会直接拒绝（不返回 429），保证任务最终执行
 *
 * 配置约定（o_setting 表，key 形如 rateLimit:<routeKey>:*）：
 *  - rateLimit:<routeKey>:enable       "1" 开启 / "0" 关闭（缺省取传入的默认值）
 *  - rateLimit:<routeKey>:minTime      相邻两次请求最小间隔(ms)
 *  - rateLimit:<routeKey>:maxConcurrent 最大并发数
 *
 * 用法：
 *   router.post("/", rateLimiter("video:generate", { minTime: 60000, maxConcurrent: 1 }), handler)
 */

export interface RateLimitOptions {
  /** 相邻两次请求最小间隔(ms)，默认 0 表示不限间隔 */
  minTime?: number;
  /** 最大并发数，默认 1 */
  maxConcurrent?: number;
  /** 默认是否开启（未在 o_setting 配置时的兜底），默认 true */
  defaultEnabled?: boolean;
}

// 以 routeKey 为维度的限流器分组，跨请求共享同一进程内的队列状态
const group = new Bottleneck.Group();

// 缓存每个 routeKey 当前应用的配置，用于检测配置变更后重建限流器
const appliedConfigCache = new Map<string, string>();

async function readSetting(key: string): Promise<string | undefined> {
  try {
    const row = await u.db("o_setting").where("key", key).first();
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 读取指定 routeKey 的运行时限流配置（合并默认值与 o_setting 覆盖值）
 */
async function resolveConfig(
  routeKey: string,
  options: Required<RateLimitOptions>,
): Promise<{ enabled: boolean; minTime: number; maxConcurrent: number }> {
  const enableVal = await readSetting(`rateLimit:${routeKey}:enable`);
  const minTimeVal = await readSetting(`rateLimit:${routeKey}:minTime`);
  const maxConcVal = await readSetting(`rateLimit:${routeKey}:maxConcurrent`);

  const enabled = enableVal === undefined ? options.defaultEnabled : enableVal === "1";
  const minTime = Number(minTimeVal) >= 0 && minTimeVal !== undefined ? Number(minTimeVal) : options.minTime;
  const maxConcurrent = Number(maxConcVal) > 0 ? Number(maxConcVal) : options.maxConcurrent;

  return { enabled, minTime, maxConcurrent };
}

/**
 * 获取（或按最新配置重建）指定 routeKey 的 Bottleneck 限流器实例
 */
function getLimiter(routeKey: string, minTime: number, maxConcurrent: number): Bottleneck {
  const configSignature = `${minTime}|${maxConcurrent}`;
  const prev = appliedConfigCache.get(routeKey);

  if (prev !== configSignature) {
    // 配置变更：更新分组内该 key 的限流器参数
    group.key(routeKey).updateSettings({ minTime, maxConcurrent });
    appliedConfigCache.set(routeKey, configSignature);
  }
  return group.key(routeKey);
}

/**
 * 创建一个以路由地址为维度的限流中间件
 * @param routeKey 限流分组标识（建议使用语义化的路由标识，如 "video:generate"）
 * @param options 默认限流参数
 */
export function rateLimiter(routeKey: string, options: RateLimitOptions = {}) {
  const merged: Required<RateLimitOptions> = {
    minTime: options.minTime ?? 0,
    maxConcurrent: options.maxConcurrent ?? 1,
    defaultEnabled: options.defaultEnabled ?? true,
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    let config;
    try {
      config = await resolveConfig(routeKey, merged);
    } catch {
      // 配置读取异常时不阻塞请求，直接放行
      return next();
    }

    if (!config.enabled) {
      return next();
    }

    const limiter = getLimiter(routeKey, config.minTime, config.maxConcurrent);

    // 将 next() 的执行调度进限流队列：排队 + 间隔控制
    limiter
      .schedule(() => {
        next();
        // schedule 需要返回 Promise 以占用一个调度槽位；
        // 这里以 minTime 决定占用时长即可满足间隔限流语义
        return Promise.resolve();
      })
      .catch((err) => {
        console.error(`[rateLimiter] routeKey=${routeKey} 调度异常:`, err?.message ?? err);
        next(err);
      });
  };
}

export default rateLimiter;
