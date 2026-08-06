import express from "express";
import { z } from "zod";
import { exec, execSync } from "child_process";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { isEletron } from "@/utils/getPath";
import u from "@/utils";
import path from "path";
import fs from "node:fs/promises";
import os from "node:os";

const router = express.Router();

const JIANYING_DRAFT_VERSION = 360000;
const JIANYING_NEW_VERSION = "75.0.0";

function generateDraftTemplate(draftId: string, canvasWidth: number, canvasHeight: number) {
  return {
    canvas_config: { background: null, height: canvasHeight, ratio: "original", width: canvasWidth },
    color_space: -1,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: "",
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: "none",
      multi_language_list: [],
      multi_language_main: "none",
      multi_language_mode: "none",
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: "",
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      use_float_render: false,
      video_mute: false,
      voice_change_sync: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    draft_type: "video",
    duration: 0,
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    function_assistant_info: {
      audio_noise_segid_list: [],
      auto_adjust: false,
      auto_adjust_fixed: false,
      auto_adjust_fixed_value: 50.0,
      auto_adjust_segid_list: [],
      auto_caption: false,
      auto_caption_segid_list: [],
      auto_caption_template_id: "",
      caption_opt: false,
      caption_opt_segid_list: [],
      color_correction: false,
      color_correction_fixed: false,
      color_correction_fixed_value: 50.0,
      color_correction_segid_list: [],
      deflicker_segid_list: [],
      enhance_quality: false,
      enhance_quality_fixed: false,
      enhance_quality_segid_list: [],
      enhance_voice_segid_list: [],
      enhande_voice: false,
      enhande_voice_fixed: false,
      eye_correction: false,
      eye_correction_segid_list: [],
      fixed_rec_applied: false,
      fps: { den: 1, num: 0 },
      normalize_loudness: false,
      normalize_loudness_audio_denoise_segid_list: [],
      normalize_loudness_fixed: false,
      normalize_loudness_segid_list: [],
      retouch: false,
      retouch_fixed: false,
      retouch_segid_list: [],
      smart_rec_applied: false,
      smart_segid_list: [],
      smooth_slow_motion: false,
      smooth_slow_motion_fixed: false,
      video_noise_segid_list: [],
    },
    group_container: null,
    id: draftId,
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: [],
    },
    last_modified_platform: {
      app_id: 0,
      app_source: "",
      app_version: "",
      device_id: "",
      hard_disk_id: "",
      mac_address: "",
      os: "",
      os_version: "",
    },
    lyrics_effects: [],
    materials: {
      ai_text_effects: [],
      ai_translates: [],
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audio_pannings: [],
      audio_pitch_shifts: [],
      audio_track_indexes: [],
      audios: [],
      beats: [],
      canvases: [],
      chromas: [],
      color_curves: [],
      common_mask: [],
      digital_human_model_dressing: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      hsl_curves: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_beautys: [],
      manual_deformations: [],
      material_animations: [],
      material_colors: [],
      multi_language_refs: [],
      placeholder_infos: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      sound_channel_mappings: [],
      speeds: [],
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: [],
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_radius: [],
      video_shadows: [],
      video_strokes: [],
      video_trackings: [],
      videos: [],
      vocal_beautifys: [],
      vocal_separations: [],
    },
    mixed_track_mode_on: false,
    mutable_config: null,
    name: "",
    new_version: JIANYING_NEW_VERSION,
    path: "",
    platform: {
      app_id: 0,
      app_source: "",
      app_version: "",
      device_id: "",
      hard_disk_id: "",
      mac_address: "",
      os: "",
      os_version: "",
    },
    relationships: [],
    render_index_track_mode_on: false,
    retouch_cover: null,
    smart_ads_info: { draft_url: "", page_from: "", routine: "" },
    source: "default",
    static_cover_image_path: "",
    time_marks: null,
    tracks: [],
    uneven_animation_template_info: {
      composition: "",
      content: "",
      order: "",
      sub_template_info_list: [],
    },
    update_time: 0,
    version: JIANYING_DRAFT_VERSION,
  };
}

function createVideoMaterial(id: string, filePath: string, duration: number, width: number, height: number) {
  return {
    audio_fade: null,
    category_id: "",
    category_name: "local",
    check_flag: 1,
    crop: { lower_left_x: 0.0, lower_left_y: 1.0, lower_right_x: 1.0, lower_right_y: 1.0, upper_left_x: 0.0, upper_left_y: 0.0, upper_right_x: 1.0, upper_right_y: 0.0 },
    duration: duration,
    extra_type_option: 0,
    formula_id: "",
    freeze: null,
    has_audio: true,
    height: height,
    id: id,
    intensifies_audio_path: "",
    intensifies_path: "",
    is_ai_generate_content: false,
    is_copyright: false,
    is_text_edit_overdub: false,
    is_unified_beauty_mode: false,
    is_user_manual_set_copyright: false,
    local_id: "",
    local_material_id: "",
    material_id: "",
    material_name: path.basename(filePath),
    material_url: "",
    matting: { flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: "", strokes: [] },
    media_path: "",
    multi_camera_info: null,
    object_locked: null,
    origin_material_id: "",
    path: filePath,
    picture_from: "none",
    picture_set_category_id: "",
    picture_set_category_name: "",
    request_id: "",
    reverse_intensifies_path: "",
    reverse_path: "",
    smart_motion: null,
    source: 0,
    source_platform: 0,
    stable: { matrix_path: "", stable_level: 0, time_range: { duration: 0, start: 0 } },
    team_id: "",
    type: "video",
    video_algorithm: { algorithms: [], deflicker: null, motion_blur_config: null, noise_reduction: null, path: "", quality_enhance: null, time_range: null },
    width: width,
  };
}

function createAudioMaterial(id: string, filePath: string, duration: number) {
  return {
    app_id: 0,
    category_id: "",
    category_name: "local",
    check_flag: 1,
    duration: duration,
    effect_id: "",
    formula_id: "",
    id: id,
    intensifies_path: "",
    is_ai_clone_tone: false,
    is_ugc: false,
    local_material_id: "",
    music_id: "",
    name: path.basename(filePath),
    path: filePath,
    query: "",
    request_id: "",
    resource_id: "",
    search_id: "",
    source_from: "",
    source_platform: 0,
    team_id: "",
    text_id: "",
    tone_category_id: "",
    tone_category_name: "",
    tone_effect_id: "",
    tone_effect_name: "",
    tone_platform: "",
    tone_second_category_id: "",
    tone_speaker: "",
    tone_type: "",
    type: "extract_music",
    video_id: "",
    wave_points: [],
  };
}

function createSpeedMaterial(id: string) {
  return {
    curve_speed: null,
    id: id,
    mode: 0,
    speed: 1.0,
    type: "speed",
  };
}

function createCanvasMaterial(id: string) {
  return {
    album_image: "",
    blur: 0.0,
    color: "",
    id: id,
    image: "",
    image_id: "",
    image_name: "",
    source_platform: 0,
    team_id: "",
    type: "canvas_color",
  };
}

function createSegment(
  materialId: string,
  speedId: string,
  canvasId: string,
  startTime: number,
  duration: number,
  sourceDuration: number,
  type: "video" | "audio",
  extraMaterialIds: string[] = [],
) {
  const segment: any = {
    cartoon: false,
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    common_keyframes: [],
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    extra_material_refs: extraMaterialIds,
    group_id: "",
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    id: u.uuid(),
    intensifies_audio: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    material_id: materialId,
    render_index: 0,
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: "", vertical_pos_layout: 0 },
    reverse: false,
    source_timerange: { duration: sourceDuration, start: 0 },
    speed: 1.0,
    target_timerange: { duration: duration, start: startTime },
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    track_render_index: 0,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  };

  return segment;
}

function getJianyingDraftsDir(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(os.homedir(), "Movies", "JianyingPro", "User Data", "Projects", "com.lveditor.draft");
  } else if (platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local", "JianyingPro", "User Data", "Projects", "com.lveditor.draft");
  }
  throw new Error("不支持的操作系统");
}

/**
 * 用 ffprobe 读取视频文件的实际时长（秒），失败时返回 null
 */
function getVideoDuration(filePath: string): number | null {
  try {
    const stdout = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8", timeout: 5000 },
    );
    const sec = parseFloat(stdout.trim());
    return isNaN(sec) ? null : sec;
  } catch {
    return null;
  }
}

function launchJianying(): void {
  const platform = process.platform;
  if (platform === "darwin") {
    const appNames = ["VideoFusion-macOS", "VideoFusion-Draft", "剪映专业版"];
    for (const name of appNames) {
      exec(`open -a "${name}" 2>/dev/null`);
    }
  } else if (platform === "win32") {
    const paths = [
      "C:\\Program Files\\JianyingPro\\JianyingPro.exe",
      "C:\\Program Files (x86)\\JianyingPro\\JianyingPro.exe",
      path.join(os.homedir(), "AppData", "Local", "JianyingPro", "Apps", "JianyingPro.exe"),
    ];
    for (const p of paths) {
      exec(`if exist "${p}" start "" "${p}"`);
    }
  }
}

export default router.post(
  "/",
  validateFields({
    projectName: z.string(),
    canvasWidth: z.number().default(1920),
    canvasHeight: z.number().default(1080),
    mediaFiles: z.array(
      z.object({
        filePath: z.string(),
        name: z.string(),
        type: z.enum(["video", "audio", "image"]),
        duration: z.number().optional(),
      }),
    ),
  }),
  async (req, res) => {
    if (!isEletron()) {
      return res.status(400).send(error("仅支持客户端打开剪映"));
    }

    try {
      const { projectName, canvasWidth, canvasHeight, mediaFiles } = req.body;

      const draftsDir = getJianyingDraftsDir();
      await fs.mkdir(draftsDir, { recursive: true });

      const draftId = u.uuid().toUpperCase();
      const draftName = `Toonflow_${projectName}`;
      const draftFolderPath = path.join(draftsDir, draftName);

      await fs.mkdir(draftFolderPath, { recursive: true });
      await fs.mkdir(path.join(draftFolderPath, "Resources"), { recursive: true });

      const draft = generateDraftTemplate(draftId, canvasWidth, canvasHeight);

      const videoSegments: any[] = [];
      const audioSegments: any[] = [];
      let currentVideoTime = 0;
      let currentAudioTime = 0;

      for (const media of mediaFiles) {
        const ossRoot = u.getPath("oss");
        const trimmedPath = media.filePath.replace(/^[/\\]+/, "");
        const absFilePath = path.join(ossRoot, trimmedPath);

        // video 类型用 ffprobe 读取实际时长，确保剪映草稿时长准确
        let durationSec = media.duration;
        if (media.type === "video" && !durationSec) {
          const realSec = getVideoDuration(absFilePath);
          if (realSec != null) durationSec = realSec;
        }
        const durationUs = Math.round((durationSec || 5) * 1_000_000);

        if (media.type === "video" || media.type === "image") {
          const materialId = u.uuid();
          const speedId = u.uuid();
          const canvasId = u.uuid();

          const videoMat = createVideoMaterial(materialId, absFilePath, durationUs, canvasWidth, canvasHeight);
          if (media.type === "image") {
            videoMat.type = "photo";
            videoMat.has_audio = false;
          }
          draft.materials.videos.push(videoMat as any);

          const speedMat = createSpeedMaterial(speedId);
          draft.materials.speeds.push(speedMat as any);

          const canvasMat = createCanvasMaterial(canvasId);
          draft.materials.canvases.push(canvasMat as any);

          const segment = createSegment(materialId, speedId, canvasId, currentVideoTime, durationUs, durationUs, "video", [speedId, canvasId]);
          videoSegments.push(segment);
          currentVideoTime += durationUs;

          if (media.type === "video") {
            const audioMatId = u.uuid();
            const audioMat = createAudioMaterial(audioMatId, absFilePath, durationUs);
            draft.materials.audios.push(audioMat as any);

            const audioSpeedId = u.uuid();
            const audioSpeedMat = createSpeedMaterial(audioSpeedId);
            draft.materials.speeds.push(audioSpeedMat as any);

            const audioSegment = createSegment(audioMatId, audioSpeedId, "", currentAudioTime, durationUs, durationUs, "audio", [audioSpeedId]);
            audioSegments.push(audioSegment);
            currentAudioTime += durationUs;
          }
        } else if (media.type === "audio") {
          const audioMatId = u.uuid();
          const audioMat = createAudioMaterial(audioMatId, absFilePath, durationUs);
          draft.materials.audios.push(audioMat as any);

          const speedId = u.uuid();
          const speedMat = createSpeedMaterial(speedId);
          draft.materials.speeds.push(speedMat as any);

          const segment = createSegment(audioMatId, speedId, "", currentAudioTime, durationUs, durationUs, "audio", [speedId]);
          audioSegments.push(segment);
          currentAudioTime += durationUs;
        }
      }

      if (videoSegments.length > 0) {
        draft.tracks.push({
          attribute: 0,
          flag: 0,
          id: u.uuid(),
          is_default_name: true,
          name: "",
          segments: videoSegments,
          type: "video",
        } as any);
      }

      if (audioSegments.length > 0) {
        draft.tracks.push({
          attribute: 0,
          flag: 0,
          id: u.uuid(),
          is_default_name: true,
          name: "",
          segments: audioSegments,
          type: "audio",
        } as any);
      }

      draft.duration = Math.max(currentVideoTime, currentAudioTime);

      await fs.writeFile(path.join(draftFolderPath, "draft_info.json"), JSON.stringify(draft));

      const now = Date.now() * 1000;
      const rootMetaPath = path.join(draftsDir, "root_meta_info.json");
      let rootMeta: any = { all_draft_store: [], draft_ids: 0, root_path: draftsDir };
      try {
        const existing = await fs.readFile(rootMetaPath, "utf-8");
        rootMeta = JSON.parse(existing);
      } catch {}

      const alreadyExists = rootMeta.all_draft_store.some((d: any) => d.draft_name === draftName);
      if (!alreadyExists) {
        rootMeta.all_draft_store.unshift({
          cloud_draft_cover: false,
          cloud_draft_sync: false,
          draft_cloud_last_action_download: false,
          draft_cloud_purchase_info: "",
          draft_cloud_template_id: "",
          draft_cloud_tutorial_info: "",
          draft_cloud_videocut_purchase_info: "",
          draft_cover: "",
          draft_fold_path: draftFolderPath,
          draft_id: draftId,
          draft_is_ai_shorts: false,
          draft_is_cloud_temp_draft: false,
          draft_is_invisible: false,
          draft_is_pippit_draft: false,
          draft_is_web_article_video: false,
          draft_json_file: path.join(draftFolderPath, "draft_info.json"),
          draft_name: draftName,
          draft_new_version: "",
          draft_root_path: draftsDir,
          draft_timeline_materials_size: 0,
          draft_type: "",
          draft_web_article_video_enter_from: "",
          pippit_avatar_url: "",
          pippit_extra_info: "",
          pippit_id: "",
          pippit_user_name: "",
          streaming_edit_draft_ready: true,
          tm_draft_cloud_completed: "",
          tm_draft_cloud_entry_id: -1,
          tm_draft_cloud_modified: 0,
          tm_draft_cloud_parent_entry_id: -1,
          tm_draft_cloud_space_id: -1,
          tm_draft_cloud_user_id: -1,
          tm_draft_create: now,
          tm_draft_modified: now,
          tm_draft_removed: 0,
          tm_duration: 0,
        });
        rootMeta.draft_ids = rootMeta.all_draft_store.length;
      } else {
        const idx = rootMeta.all_draft_store.findIndex((d: any) => d.draft_name === draftName);
        if (idx >= 0) {
          rootMeta.all_draft_store[idx].tm_draft_modified = now;
        }
      }

      await fs.writeFile(rootMetaPath, JSON.stringify(rootMeta));

      const metaInfo = {
        draft_fold_path: draftFolderPath,
        draft_id: draftId,
        draft_name: draftName,
        draft_root_path: draftsDir,
        tm_draft_create: now,
        tm_draft_modified: now,
      };
      await fs.writeFile(path.join(draftFolderPath, "draft_meta_info.json"), JSON.stringify(metaInfo));

      res.status(200).send(success({ draftPath: draftFolderPath, draftName }));

      // 响应返回后再启动剪映，避免剪映启动过快时草稿尚未完全注册
      launchJianying();
    } catch (err: any) {
      res.status(200).send(error(err.message || "创建剪映草稿失败"));
    }
  },
);
