import { createI18n } from "vue-i18n";
import { ref } from "vue";
import zhCN from "./language/zh-CN.json";

const cachedLocale = ref("zh-CN");
const languageList = [{ label: "简体中文", tips: "Chinese (Simplified)", value: "zh-CN" }];

const i18n = createI18n({
  legacy: false,
  locale: cachedLocale.value,
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
  },
});

export { cachedLocale, languageList };
export default i18n;
