import { Knex } from "knex";
import { db } from "@/utils/db";

/**
 * 重算某个剧本(scriptId)下所有视频轨道的时长，并清理孤儿轨道。
 *
 * 轨道时长(o_videoTrack.duration)= 该轨道下所有分镜(o_storyboard)的 duration 之和。
 * 这份「记账」原先散落在 add / batchDelete / removeFrame / merge 各处各自维护，容易漏算导致
 * o_videoTrack.duration 与实际分镜时长不一致。统一收敛到此函数，各处收尾调用即可。
 *
 * 该函数是幂等的：重复执行只会把数据校正到正确状态。
 *
 * 孤儿轨道(没有任何分镜引用)在「未被 o_video 引用」的前提下会被删除；若仍被视频引用则只把
 * 时长归零、保留记录，避免误伤已生成的视频。
 *
 * @param scriptId 剧本 id
 * @param trx 可选的 knex 事务对象；合并等需要原子性的场景传入，其它场景用默认 db。
 */
export default async function recalcTrackDuration(scriptId: number, trx?: Knex.Transaction): Promise<void> {
  const runner = trx ?? db;

  const tracks = await runner("o_videoTrack").where({ scriptId }).select("id");
  if (!tracks.length) return;

  for (const track of tracks) {
    const trackId = track.id;

    const rows = await runner("o_storyboard").where({ trackId }).select("duration");
    const total = rows.reduce((sum: number, item: any) => sum + Number(item.duration || 0), 0);

    // 无分镜引用的轨道视为孤儿：未被视频引用则删除，否则归零保留
    if (rows.length === 0) {
      const [{ videoCount }] = await runner("o_video").where({ videoTrackId: trackId }).count("* as videoCount");
      if (Number(videoCount) === 0) {
        await runner("o_videoTrack").where({ id: trackId }).delete();
        continue;
      }
    }

    await runner("o_videoTrack").where({ id: trackId }).update({ duration: total });
  }
}
