<template>
  <div class="rateLimitConfig">
    <t-alert style="margin-bottom: 16px" theme="info">
      <template #message>
        <div>{{ $t("settings.rateLimit.desc") }}</div>
        <div style="margin-top: 6px; line-height: 1.7">
          <div>· <b>{{ $t("settings.rateLimit.scope") }}</b>：{{ $t("settings.rateLimit.scopeTip") }}</div>
          <div>· <b>{{ $t("settings.rateLimit.minTime") }}</b>：{{ $t("settings.rateLimit.minTimeTip") }}</div>
          <div>· <b>{{ $t("settings.rateLimit.maxConcurrent") }}</b>：{{ $t("settings.rateLimit.maxConcurrentTip") }}</div>
          <div class="usageNote">· {{ $t("settings.rateLimit.usageNote") }}</div>
        </div>
      </template>
    </t-alert>

    <div class="toolbar">
      <t-button theme="primary" size="small" @click="openEditDialog()">
        <template #icon><t-icon name="add" /></template>
        {{ $t("settings.rateLimit.add") }}
      </t-button>
      <t-button theme="default" size="small" @click="loadList">
        <template #icon><t-icon name="refresh" /></template>
        {{ $t("settings.rateLimit.refresh") }}
      </t-button>
    </div>

    <t-table
      row-key="scope"
      :data="list"
      :columns="columns"
      :loading="loading"
      size="small"
      max-height="calc(70vh - 220px)">
      <template #scope-title>
        <span class="colTitle">
          {{ $t("settings.rateLimit.scope") }}
          <t-tooltip :content="$t('settings.rateLimit.scopeTip')"><t-icon name="help-circle" /></t-tooltip>
        </span>
      </template>
      <template #enable-title>
        <span class="colTitle">
          {{ $t("settings.rateLimit.enable") }}
          <t-tooltip :content="$t('settings.rateLimit.enableTip')"><t-icon name="help-circle" /></t-tooltip>
        </span>
      </template>
      <template #minTime-title>
        <span class="colTitle">
          {{ $t("settings.rateLimit.minTime") }}
          <t-tooltip :content="$t('settings.rateLimit.minTimeTip')"><t-icon name="help-circle" /></t-tooltip>
        </span>
      </template>
      <template #maxConcurrent-title>
        <span class="colTitle">
          {{ $t("settings.rateLimit.maxConcurrent") }}
          <t-tooltip :content="$t('settings.rateLimit.maxConcurrentTip')"><t-icon name="help-circle" /></t-tooltip>
        </span>
      </template>
      <template #enable="{ row }">
        <t-tag v-if="row.enable" theme="success" variant="light">{{ $t("settings.rateLimit.enabled") }}</t-tag>
        <t-tag v-else theme="default" variant="light">{{ $t("settings.rateLimit.disabled") }}</t-tag>
      </template>
      <template #minTime="{ row }">{{ row.minTime }} {{ $t("settings.rateLimit.ms") }}</template>
      <template #maxConcurrent="{ row }">{{ row.maxConcurrent }} {{ $t("settings.rateLimit.count") }}</template>
      <template #op="{ row }">
        <t-space size="small">
          <t-button theme="primary" variant="text" size="small" @click="openEditDialog(row)">
            {{ $t("settings.rateLimit.edit") }}
          </t-button>
        </t-space>
      </template>
    </t-table>

    <t-dialog
      v-model:visible="dialogVisible"
      :header="isEdit ? $t('settings.rateLimit.editTitle') : $t('settings.rateLimit.addTitle')"
      :confirm-btn="{ content: $t('settings.rateLimit.save'), loading: saving }"
      @confirm="handleSave"
      width="520px">
      <t-form :data="formData" label-align="top">
        <t-form-item name="scope">
          <template #label>
            <span class="colTitle">
              {{ $t("settings.rateLimit.scope") }}
              <t-tooltip :content="$t('settings.rateLimit.scopeTip')"><t-icon name="help-circle" /></t-tooltip>
            </span>
          </template>
          <t-input
            v-model="formData.scope"
            :disabled="isEdit"
            :placeholder="$t('settings.rateLimit.scopePlaceholder')"
            clearable />
        </t-form-item>
        <t-form-item name="enable">
          <template #label>
            <span class="colTitle">
              {{ $t("settings.rateLimit.enable") }}
              <t-tooltip :content="$t('settings.rateLimit.enableTip')"><t-icon name="help-circle" /></t-tooltip>
            </span>
          </template>
          <t-switch v-model="formData.enable" />
        </t-form-item>
        <t-form-item name="minTime">
          <template #label>
            <span class="colTitle">
              {{ $t("settings.rateLimit.minTime") }}
              <t-tooltip :content="$t('settings.rateLimit.minTimeTip')"><t-icon name="help-circle" /></t-tooltip>
            </span>
          </template>
          <t-input-number
            v-model="formData.minTime"
            :min="0"
            :suffix="$t('settings.rateLimit.ms')"
            :allow-input-over-limit="false"
            auto-width
            :placeholder="$t('settings.rateLimit.minTimePlaceholder')" />
        </t-form-item>
        <t-form-item name="maxConcurrent">
          <template #label>
            <span class="colTitle">
              {{ $t("settings.rateLimit.maxConcurrent") }}
              <t-tooltip :content="$t('settings.rateLimit.maxConcurrentTip')"><t-icon name="help-circle" /></t-tooltip>
            </span>
          </template>
          <t-input-number
            v-model="formData.maxConcurrent"
            :min="1"
            :suffix="$t('settings.rateLimit.count')"
            :allow-input-over-limit="false"
            auto-width
            :placeholder="$t('settings.rateLimit.maxConcurrentPlaceholder')" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import axios from "@/utils/axios";

interface RateLimitItem {
  scope: string;
  enable: boolean;
  minTime: number;
  maxConcurrent: number;
}

const list = ref<RateLimitItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);

const formData = ref<RateLimitItem>({
  scope: "",
  enable: true,
  minTime: 0,
  maxConcurrent: 1,
});

const columns = computed(() => [
  { colKey: "scope", title: $t("settings.rateLimit.scope"), ellipsis: true },
  { colKey: "enable", title: $t("settings.rateLimit.enable"), width: 100 },
  { colKey: "minTime", title: $t("settings.rateLimit.minTime"), width: 150 },
  { colKey: "maxConcurrent", title: $t("settings.rateLimit.maxConcurrent"), width: 130 },
  { colKey: "op", title: $t("settings.rateLimit.operation"), width: 90, fixed: "right" },
]);

async function loadList() {
  loading.value = true;
  try {
    const { data } = await axios.get("/setting/rateLimit/getRateLimit");
    list.value = Array.isArray(data) ? data : [];
  } catch (e) {
    window.$message.error((e as any)?.message || $t("settings.rateLimit.msg.loadFailed"));
  } finally {
    loading.value = false;
  }
}

function openEditDialog(row?: RateLimitItem) {
  if (row) {
    isEdit.value = true;
    formData.value = { ...row };
  } else {
    isEdit.value = false;
    formData.value = { scope: "", enable: true, minTime: 0, maxConcurrent: 1 };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  if (!formData.value.scope?.trim()) {
    window.$message.warning($t("settings.rateLimit.msg.scopeRequired"));
    return;
  }
  saving.value = true;
  try {
    await axios.post("/setting/rateLimit/updateRateLimit", {
      scope: formData.value.scope.trim(),
      enable: formData.value.enable,
      minTime: Number(formData.value.minTime) || 0,
      maxConcurrent: Number(formData.value.maxConcurrent) || 1,
    });
    window.$message.success($t("settings.rateLimit.msg.saved"));
    dialogVisible.value = false;
    await loadList();
  } catch (e) {
    window.$message.error((e as any)?.message || $t("settings.rateLimit.msg.saveFailed"));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadList();
});
</script>

<style lang="scss" scoped>
.rateLimitConfig {
  width: 100%;

  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .colTitle {
    display: inline-flex;
    align-items: center;
    gap: 4px;

    :deep(.t-icon) {
      color: var(--td-text-color-placeholder);
      cursor: help;
    }
  }

  .usageNote {
    margin-top: 4px;
    font-weight: 600;
  }
}
</style>
