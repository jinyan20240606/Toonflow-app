<template>
  <t-card class="storyboard">
    <div class="titleBar dragHandle pr">
      <div class="title">{{ $t("workbench.production.node.storyboard.title") }}</div>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <div class="content">
      <t-empty v-if="!storyboard.length" style="margin-top: 16px"></t-empty>
      <t-checkbox-group v-model="selectedIds">
        <div class="frameGrid">
          <template v-for="(item, index) in storyboard" :key="item.id">
            <div class="frameItem" @mouseenter="setHoveredFrame(index)" @mouseleave="setHoveredFrame(null)">
              <div class="addBetween addBetween--left" :class="{ expanded: hoveredIndex === index }">
                <t-button
                  theme="primary"
                  variant="outline"
                  shape="circle"
                  @click.stop="editStoryboaryImage(item, [index > 0 ? storyboard[index - 1]?.src || '' : '', item.src || ''], index - 1)">
                  <template #icon><i-plus /></template>
                </t-button>
              </div>

              <div class="frameCard">
                <div
                  class="frameImage"
                  :style="{
                    width: `${200 * gridScale}px`,
                    height: `${200 * gridScale}px`,
                  }">
                  <div class="ac frameCheckbox" :style="{ transform: `scale(${styleMaxSize})` }">
                    <t-checkbox :checked="selectedIds.includes(item.id!)" @click.stop :key="item?.id || index" :value="item.id" />
                    <t-tag class="frameTypeTag" :style="{ backgroundColor: tagColors[index % tagColors.length] }">
                      S{{ String(index + 1).padStart(2, "0") }}
                    </t-tag>
                  </div>

                  <t-image
                    v-if="item.src && item.state == '已完成'"
                    :src="item.src"
                    fit="contain"
                    class="frameImg"
                    @click="editStoryboaryImage(item, [item.src])">
                    <template #overlayContent>
                      <div class="imageToolsWrap show">
                        <ImageTools :style="{ transform: `scale(${styleMaxSize})` }" :src="item.src" position="br" />
                      </div>
                    </template>
                  </t-image>
                  <div v-else class="generatingPlaceholder" @click="item.state === '生成中' ? undefined : editStoryboaryImage(item, [])">
                    <template v-if="item.state === '生成中'">
                      <t-loading size="small" />
                      <t-tag class="cancelGenerationBtn" theme="danger" size="small" @click.stop="cancelGenerationFn(item)">
                        {{ $t("workbench.cornerScape.cancelGeneration") }}
                      </t-tag>
                    </template>
                    <t-tooltip v-else-if="item.state == '生成失败'" :content="item?.reason">
                      <span style="color: #ff4d4f">生成失败</span>
                    </t-tooltip>
                    <t-empty v-else size="small" :title="$t('workbench.production.node.storyboard.notGenerated')" />
                  </div>
                  <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.deleteNode')">
                    <div class="remove ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="removeFn(item.id!)">
                      <i-delete theme="outline" size="18" fill="#fff" />
                    </div>
                  </t-tooltip>
                  <t-tooltip theme="primary" :content="$t('workbench.production.node.storyboard.editNode')">
                    <div class="editNode ac" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop="editInfo(item)">
                      <i-edit theme="outline" size="18" fill="#fff" />
                    </div>
                  </t-tooltip>
                </div>
              </div>
              <div class="addBetween addBetween--right" :class="{ expanded: hoveredIndex === index }">
                <t-button
                  theme="primary"
                  variant="outline"
                  shape="circle"
                  @click.stop="
                    editStoryboaryImage(item, [item.src || '', index < (storyboard?.length ?? 0) - 1 ? storyboard[index + 1]?.src || '' : ''], index)
                  ">
                  <template #icon><i-plus /></template>
                </t-button>
              </div>
            </div>
          </template>
        </div>
      </t-checkbox-group>

      <div class="scaleControl">
        <span>{{ $t("workbench.production.node.storyboard.scaleRatio") }}</span>
        <t-input-number v-model="gridScale" :min="0.1" :max="3" :step="0.1" :decimal-places="1" size="small" style="width: 120px" />
      </div>
      <div class="ac" style="gap: 6px; margin-bottom: 6px; flex-wrap: wrap">
        <t-tag theme="primary" variant="light">{{ $t("workbench.production.node.storyboard.selectedCount", { count: selectedIds.length }) }}</t-tag>
        <t-button size="small" :disabled="!storyboard.length" theme="default" variant="outline" @click="selectedIds = []">
          {{ $t("workbench.production.node.storyboard.clearSelection") }}
        </t-button>
        <t-button size="small" :disabled="!storyboard.length" theme="default" variant="outline" @click="selectAll">
          {{ $t("workbench.production.node.storyboard.selectAll") }}
        </t-button>
        <t-button theme="danger" size="small" :disabled="!storyboard.length || !selectedIds.length" @click="handleDeleteSelected">批量删除</t-button>
        <t-button theme="primary" size="small" :disabled="!canMergeSelected" @click="handleMerge">合并分镜</t-button>
      </div>
      <div class="ac" style="gap: 10px">
        <t-button block @click="previewAll" :disabled="!storyboard.length">{{ $t("workbench.production.node.storyboard.gridPreview") }}</t-button>
        <t-button block @click="batchGenerateImage" :disabled="!storyboard.length || !selectedIds.length" :loading="generateLoading">
          {{ $t("workbench.production.node.storyboard.generateImage") }}
        </t-button>

        <!-- <t-button block @click="batchGenerateImage" :disabled="!storyboard.length" :loading="generateLoading">
          {{ $t("workbench.production.node.storyboard.batchGenerateImage") }}
        </t-button> -->
      </div>
    </div>
    <editImage v-model="visible" v-if="visible" :flowData="currentRow" type="storyboard" @save="save" />
    <t-image-viewer
      v-model:visible="previewVisible"
      v-if="previewVisible"
      :images="previewImages"
      :onClose="closePreview"
      :onDownload="downLoadImage"
      :imageScale="{ max: 10, min: 0.1 }" />
  </t-card>
</template>

<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core";
import editImage from "../components/editImage/index.vue";
import { LoadingPlugin } from "tdesign-vue-next";
import { Handle, Position, type Edge } from "@vue-flow/core";
import axios from "@/utils/axios";
import type { AssetItem, Storyboard } from "../utils/flowBuilder.js";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
const { project } = storeToRefs(projectStore());
const { episodesId } = storeToRefs(productionAgentStore());

const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
    source: string;
  };
  assetsData: AssetItem[];
}>();

const storyboard = defineModel<Storyboard[]>({ required: true });

const visible = ref(false);
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);
const gridScale = useLocalStorage("storyboardGridScale", 1);

const hoveredIndex = ref<number | null>(null);
const selectedIds = ref<number[]>([]);

function setHoveredFrame(index: number | null) {
  hoveredIndex.value = index;
}

function selectAll() {
  selectedIds.value = storyboard.value.map((s) => s.id!).filter(Boolean);
}

const selectedStoryboardItems = computed(() => storyboard.value.filter((item) => selectedIds.value.includes(item.id!)));
const selectedStoryboardIndexes = computed(() =>
  selectedIds.value.map((id) => storyboard.value.findIndex((item) => item.id === id)).filter((index) => index >= 0).sort((a, b) => a - b),
);
const canMergeSelected = computed(() => {
  if (selectedIds.value.length < 2) return false;
  if (selectedStoryboardItems.value.length !== selectedIds.value.length) return false;
  const allNeedImage = selectedStoryboardItems.value.every((item) => Number(item.shouldGenerateImage) === 1);
  if (!allNeedImage) return false;
  return selectedStoryboardIndexes.value.every((index, i) => i === 0 || index === selectedStoryboardIndexes.value[i - 1] + 1);
});

function handleDeleteSelected() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmBatchDeleteBody", { index: selectedIds.value.length }),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        if (!selectedIds.value.length) {
          dialog.destroy();
          return window.$message.error($t("workbench.production.node.storyboard.pleaseSelectImage"));
        }
        axios.post("/production/storyboard/batchDelete", {
          ids: selectedIds.value,
          projectId: project.value?.id,
        });
        storyboard.value = storyboard.value.filter((i) => !selectedIds.value.includes(i.id!));
        selectedIds.value = [];
        window.$message.success($t("workbench.production.node.storyboard.deleteSuccess"));
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}

function handleMerge() {
  if (!canMergeSelected.value) {
    return window.$message.warning("仅支持合并列表中连续选中的非多参分镜");
  }

  const ids = [...selectedIds.value];
  const selectedItems = storyboard.value.filter((s) => ids.includes(s.id!));
  const sorted = ids.map((id) => selectedItems.find((s) => s.id === id)).filter(Boolean) as Storyboard[];
  const firstIndex = storyboard.value.findIndex((s) => s.id === ids[0]);

  const mergedDesc = sorted.map((s, i) => `【镜${i + 1}】${s.videoDesc || ""}`).join("\n");
  const totalDuration = sorted.reduce((sum, s) => sum + Number(s.duration || 0), 0);
  const inheritedPrompt = sorted[0]?.prompt || "";

  const formData = reactive({
    videoDesc: mergedDesc,
    duration: totalDuration,
  });

  const bodyVNode = () =>
    h("div", { class: "editInfoForm" }, [
      h("div", { class: "editInfoField", style: "font-size:12px;color:var(--td-text-color-secondary);margin-bottom:12px" }, [
        h("div", {}, "合并后将保留第一条分镜的 prompt 作为首帧参考，视频描述与时长按新的片段重新生成。"),
      ]),
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, "合并后的画面描述"),
        h(resolveComponent("t-textarea"), {
          value: formData.videoDesc,
          placeholder: "请编辑合并后的画面描述",
          autosize: { minRows: 4, maxRows: 10 },
          "onUpdate:value": (v: string) => (formData.videoDesc = v),
        }),
      ]),
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, "时长（秒）"),
        h(resolveComponent("t-input-number"), {
          value: formData.duration,
          min: 1,
          max: 60,
          "onUpdate:value": (v: number) => (formData.duration = Number(v || 0)),
          style: "width: 120px",
        }),
      ]),
      h("div", { class: "editInfoField", style: "font-size:12px;color:var(--td-text-color-secondary)" }, [
        h("label", { class: "editInfoLabel" }, "首帧参考 prompt："),
        h("div", { style: "white-space:pre-wrap;line-height:1.6" }, inheritedPrompt || "第一条分镜暂无 prompt，将留空等待后续补充"),
      ]),
      h("div", { class: "editInfoField", style: "font-size:12px;color:var(--td-text-color-secondary)" }, [
        h("label", { class: "editInfoLabel" }, "被合并的分镜："),
        h(
          "ul",
          { style: "padding-left:16px;margin:4px 0" },
          sorted.map((s) =>
            h(
              "li",
              {},
              `S${String(storyboard.value.indexOf(s) + 1).padStart(2, "0")} — ${s.videoDesc?.slice(0, 40) || s.prompt?.slice(0, 40) || "无描述"}...`,
            ),
          ),
        ),
      ]),
    ]);

  const confirmDialog = DialogPlugin.confirm({
    header: `合并分镜（${ids.length}条 → 1条）`,
    body: bodyVNode,
    width: 560,
    confirmBtn: {
      content: "确认合并",
      theme: "primary",
      loading: false,
    },
    onConfirm: async () => {
      if (!formData.videoDesc.trim()) {
        return window.$message.warning("请填写合并后的画面描述");
      }
      if (Number(formData.duration) <= 0) {
        return window.$message.warning("请填写正确的时长");
      }
      confirmDialog.update({ confirmBtn: { content: "合并中...", loading: true } });
      try {
        const { data } = await axios.post("/production/storyboard/mergeStoryboard", {
          ids,
          projectId: project.value?.id,
          videoDesc: formData.videoDesc.trim(),
          duration: Number(formData.duration),
        });
        storyboard.value = storyboard.value.filter((s) => !ids.includes(s.id!));
        const insertIndex = firstIndex === -1 ? 0 : firstIndex;
        storyboard.value.splice(insertIndex, 0, {
          id: data.id,
          trackId: data.trackId,
          track: data.track,
          prompt: data.prompt,
          duration: data.duration,
          state: data.state,
          videoDesc: data.videoDesc,
          src: data.src,
          associateAssetsIds: data.associateAssetsIds,
          shouldGenerateImage: data.shouldGenerateImage,
        } as Storyboard);
        selectedIds.value = [];
        window.$message.success("合并成功，已保留第一条 prompt 作为首帧参考");
      } catch (e: any) {
        window.$message.error(e?.message || "合并失败");
      } finally {
        confirmDialog.update({ confirmBtn: { content: "确认合并", loading: false } });
        confirmDialog.destroy();
      }
    },
  });
}

const currentRow = ref<{
  flowId?: number | null;
  resultImages: { src: string; prompt: string }[];
  referanceImages: string[];
}>({
  flowId: null,
  resultImages: [],
  referanceImages: [],
});

const tagColors = ["#5bccb3", "#9c7cfc", "#fbbf24", "#5b9afc", "#e86b6b", "#7cb8fc", "#e8a855", "#34d399"];

function closePreview() {
  previewImages.value = [];
}
async function downLoadImage() {
  LoadingPlugin(true);
  const allIds = (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const res = await axios.post(
      "/production/storyboard/downPreviewImage",
      {
        storyboardIds: allIds,
      },
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(res as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboardImagePreview-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
async function previewAll() {
  LoadingPlugin(true);
  const allIds = (storyboard.value ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const { data } = await axios.post("/production/storyboard/previewImage", {
      storyboardIds: allIds,
      projectId: project.value?.id,
    });
    previewImages.value = [data];
    previewVisible.value = true;
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}
const currentRowStoryboardInfo = ref<{ id: number | null; insertAfterIndex: number | null }>({
  id: null,
  insertAfterIndex: null,
});
const styleMaxSize = computed(() => {
  if (gridScale.value <= 1) return gridScale.value;
  else 1;
});
const generateLoading = ref(false);
async function batchGenerateImage() {
  if (!selectedIds.value.length) return window.$message.warning("请先选择分镜面板");
  generateLoading.value = true;
  try {
    await productionAgentStore().batchGenerateStoryboard(selectedIds.value, true);
    window.$message.success($t("workbench.production.node.storyboard.batchGenerateSuccess"));
    storyboard.value.forEach((item) => {
      if (selectedIds.value.includes(item.id!)) {
        item.reason = "";
      }
    });
    selectedIds.value = [];
  } catch (e: any) {
    const message = e?.message || $t("workbench.production.node.storyboard.batchGenerateFailed");
    storyboard.value.forEach((item) => {
      if (selectedIds.value.includes(item.id!)) {
        item.reason = message;
      }
    });
    window.$message.error(message);
  } finally {
    generateLoading.value = false;
  }
}

async function cancelGenerationFn(item: Storyboard) {
  try {
    await axios.post("/production/storyboard/cancelStoryboardGenerate", {
      ids: [item.id],
    });
    item.state = "生成失败";
    window.$message.success($t("workbench.cornerScape.cancelSuccess"));
  } catch {
    window.$message.error($t("workbench.cornerScape.cancelFailed"));
  }
}
function previewRow(item: Storyboard) {
  if (!item.src) return;
  previewImages.value = [item.src];
  previewVisible.value = true;
}
function editInfo(item: Storyboard) {
  const formData = reactive({
    prompt: item.prompt ?? "",
    videoDesc: item?.videoDesc ?? "",
  });

  const bodyVNode = () =>
    h("div", { class: "editInfoForm" }, [
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, $t("workbench.production.node.storyboard.prompt")),
        h(resolveComponent("t-textarea"), {
          value: formData.prompt,
          placeholder: $t("workbench.production.node.storyboard.promptPlaceholder"),
          autosize: { minRows: 3, maxRows: 6 },
          "onUpdate:value": (v: string) => (formData.prompt = v),
        }),
      ]),
      h("div", { class: "editInfoField" }, [
        h("label", { class: "editInfoLabel" }, $t("workbench.production.node.storyboard.videoDesc")),
        h(resolveComponent("t-textarea"), {
          value: formData.videoDesc,
          placeholder: $t("workbench.production.node.storyboard.videoDescPlaceholder"),
          autosize: { minRows: 3, maxRows: 6 },
          "onUpdate:value": (v: string) => (formData.videoDesc = v),
        }),
      ]),
    ]);

  const confirmDialog = DialogPlugin.confirm({
    header: $t("workbench.production.node.storyboard.editInfo"),
    body: bodyVNode,
    width: 480,
    confirmBtn: {
      content: $t("common.submit"),
      theme: "primary",
      loading: false,
    },
    onConfirm: async () => {
      confirmDialog.update({ confirmBtn: { content: $t("common.submitting"), loading: true } });
      try {
        await axios.post("/production/storyboard/editStoryboardInfo", {
          id: item.id,
          prompt: formData.prompt,
          videoDesc: formData.videoDesc,
        });
        item.prompt = formData.prompt;
        item.videoDesc = formData.videoDesc;
        window.$message.success($t("common.editSuccess"));
      } catch (e) {
        window.$message.error((e as any)?.message || $t("common.editFailed"));
      } finally {
        confirmDialog.update({ confirmBtn: { content: $t("common.submit"), loading: false } });
        confirmDialog.destroy();
      }
    },
  });
}
async function removeFn(id: number) {
  try {
    await axios.post("/production/storyboard/batchDelete", {
      ids: [id],
      projectId: project.value?.id,
    });
    storyboard.value = storyboard.value.filter((i) => i.id !== id);
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
    window.$message.success($t("workbench.production.node.storyboard.deleteSuccess"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
  }
}
async function save({ imageUrl, flowId }: { imageUrl: string; flowId: number }) {
  if (!imageUrl) return;

  const { id, insertAfterIndex } = currentRowStoryboardInfo.value;

  // 插入模式：在两张图之间新增一条分镜
  if (id === null && insertAfterIndex !== null) {
    const newFrame: Storyboard = {
      duration: 0,
      prompt: "",
      src: imageUrl,
      videoDesc: "",
      shouldGenerateImage: 1,
      state: "已完成",
    } as Storyboard;
    const { data } = await axios.post("/production/storyboard/addStoryboard", {
      ...newFrame,
      projectId: project.value?.id,
      scriptId: episodesId.value,
      flowId,
    });

    storyboard.value.splice(insertAfterIndex + 1, 0, { ...newFrame, id: data.id!, flowId });
    productionAgentStore().setFlowData();
    return;
  }

  // 更新模式：更新对应分镜的 src
  const target = storyboard.value.find((s) => s.id === id);
  if (target) {
    target.src = imageUrl;
    target.state = "已完成";
    target.flowId = flowId;
  }
  await axios.post("/production/storyboard/updateStoryboardUrl", {
    id,
    url: imageUrl,
    flowId,
  });
}
function editStoryboaryImage(item: Storyboard, images: string[], insertAfterIndex: number | null = null) {
  currentRowStoryboardInfo.value = {
    id: insertAfterIndex == null ? item?.id! : null,
    insertAfterIndex,
  };
  currentRow.value = {
    flowId: item?.flowId ?? null,
    resultImages: [],
    referanceImages: [],
  };

  if (currentRowStoryboardInfo.value.id) {
    let imagesPush: string[] = [];

    if (item.associateAssetsIds && item.associateAssetsIds.length > 0) {
      const assetsImages: string[] = [];
      for (const id of item.associateAssetsIds) {
        // 先查顶层 asset
        const asset = props.assetsData.find((a) => a.id === id);
        if (asset) {
          if (asset.src) assetsImages.push(asset.src);
          continue;
        }
        // 再查 derive
        for (const a of props.assetsData) {
          const derive = a.derive?.find((d) => d.id === id);
          if (derive) {
            if (derive.src) assetsImages.push(derive.src);
            break;
          }
        }
      }
      imagesPush = imagesPush.concat(assetsImages);
    }
    currentRow.value.referanceImages = imagesPush;
    currentRow.value.resultImages = [{ src: images.length ? images[0] : "", prompt: item.prompt ?? "" }];
  } else {
    currentRow.value.referanceImages = images.filter(Boolean);
  }
  visible.value = true;
}

watch(
  () => episodesId.value,
  () => {
    selectedIds.value = [];
  },
);
</script>

<style lang="scss" scoped>
.storyboard {
  min-width: 500px;
  max-width: 100vw;
  user-select: text;
  cursor: default;

  .titleBar {
    cursor: grab;
    user-select: none;
  }
  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .content {
    margin-top: 12px;
  }

  .frameGrid {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0;
  }

  .frameItem {
    position: relative;
    display: inline-flex;
    align-items: flex-start;
    margin: 4px;
  }

  .addBetween {
    position: absolute;
    z-index: 10;
    top: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    span {
      line-height: 1;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    &.expanded {
      opacity: 1;
      pointer-events: auto;
    }
    &--left {
      transform: translate(calc(-50% - 4px), -50%);
    }
    &--right {
      transform: translate(calc(50% + 4px), -50%);
      right: 0;
    }
  }

  .frameCard {
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .frameImage {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    transition: opacity 0.2s ease;
    &:hover {
      .remove,
      .editNode {
        opacity: 1;
      }
    }
    .remove {
      position: absolute;
      top: 3px;
      right: 3px;
      z-index: 9999;
      padding: 5px;
      border-radius: 10px;
      background-color: rgba(220, 50, 50, 0.7);
      cursor: pointer;
      opacity: 0;
      transform-origin: top right;
      &:hover {
        background-color: rgba(220, 50, 50, 1);
      }
    }
    .editNode {
      position: absolute;
      bottom: 3px;
      left: 3px;
      z-index: 9999;
      padding: 5px;
      border-radius: 10px;
      background-color: rgba(24, 144, 255, 0.7);
      cursor: pointer;
      transform-origin: bottom left;
      opacity: 0;
      &:hover {
        background-color: rgba(24, 144, 255, 1);
      }
    }
  }

  .generatingPlaceholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: var(--td-bg-color-container-hover, #f5f5f5);
    font-size: 12px;

    .cancelGenerationBtn {
      cursor: pointer;
    }
  }

  .frameImg {
    width: 100%;
    height: 100%;
    object-fit: cover;
    .imageToolsWrap {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    &:hover {
      .imageToolsWrap {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }

  .frameCheckbox {
    position: absolute;
    left: 3px;
    top: 3px;
    z-index: 3;
    transform-origin: top left;
  }

  .frameTypeTag {
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border: none;
    z-index: 2;
    padding: 0 4px;
    line-height: 18px;
    border-radius: 3px;
  }

  .frameTag {
    position: absolute;
    right: 8px;
    bottom: 8px;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: none;
  }

  .scaleControl {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--td-text-color-primary, #333);
  }

  .frameInfo {
    margin-top: 6px;
    font-size: 12px;
    color: var(--td-text-color-primary, #333);
    line-height: 1.4;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
:deep(.t-image__wrapper) {
  background-color: transparent !important;
}
.editInfoForm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.editInfoField {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editInfoLabel {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
</style>
