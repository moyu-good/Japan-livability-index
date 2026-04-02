/**
 * i18n.js — Japan Livability Index 三言語対応 (中文 / 日本語 / English)
 */

// ─── UI 文字列 ────────────────────────────────────────
const LANG_STRINGS = {
  ja: {
    title:          "&#x1F5FE; 日本 都道府県 宜居度指数",
    subtitle:       "47都道府県・16指標のデータ分析。あなたに合った居住地を探す。",
    btn_csv:        "CSV",
    btn_screenshot: "截図",
    btn_share:      "共有",
    weight_label:   "評価の重みづけ",
    custom_label:   "カスタム設定",
    ranking_title:  "ランキング",
    detail_empty:   "都道府県をクリックして詳細を表示",
    view_bar:       "バー",
    view_radar:     "レーダー",
    compare_label:  "\u21D4\uFE0F 比較対象を選択",
    no_compare:     "-- 比較なし --",
    legend_title:   "総合スコア",
    legend_low:     "低",
    legend_high:    "高",
    zoom_hint:      "スクロール: ズーム\u3000ドラッグ: 移動\u3000ダブルクリック: リセット",
    sample_banner:  "\u26A0 サンプルデータを表示中 \u2014 実データは data/livability_scores.json を配置してください",
    rank_label:     "位",
    score_label:    "スコア",
    overall_label:  "総合スコア",
    ranking_label:  "ランキング",
    dim_rank_label: "#",
    no_data:        "データなし",
    loading_map:    "地図データを読み込み中...",
    map_not_found:  "地図データが見つかりません",
  },
  zh: {
    title:          "&#x1F5FE; 日本都道府县宜居指数",
    subtitle:       "47个都道府县·16项指标数据分析，找到最适合你的居住地。",
    btn_csv:        "CSV",
    btn_screenshot: "截图",
    btn_share:      "分享",
    weight_label:   "评估权重",
    custom_label:   "自定义",
    ranking_title:  "排名",
    detail_empty:   "点击都道府县查看详情",
    view_bar:       "柱状图",
    view_radar:     "雷达图",
    compare_label:  "\u2194 选择对比对象",
    no_compare:     "-- 不对比 --",
    legend_title:   "综合评分",
    legend_low:     "低",
    legend_high:    "高",
    zoom_hint:      "滚轮: 缩放  拖动: 移动  双击: 重置",
    sample_banner:  "\u26A0 显示示例数据 \u2014 请放置 data/livability_scores.json 文件",
    rank_label:     "位",
    score_label:    "评分",
    overall_label:  "综合评分",
    ranking_label:  "排名",
    dim_rank_label: "#",
    no_data:        "无数据",
    loading_map:    "地图数据加载中...",
    map_not_found:  "找不到地图数据",
  },
  en: {
    title:          "&#x1F5FE; Japan Prefecture Livability Index",
    subtitle:       "47 prefectures · 16 indicators. Find the best place to live in Japan.",
    btn_csv:        "CSV",
    btn_screenshot: "Screenshot",
    btn_share:      "Share",
    weight_label:   "Evaluation Weights",
    custom_label:   "Custom",
    ranking_title:  "Rankings",
    detail_empty:   "Click a prefecture to see details",
    view_bar:       "Bar",
    view_radar:     "Radar",
    compare_label:  "\u2194 Compare with",
    no_compare:     "-- None --",
    legend_title:   "Overall Score",
    legend_low:     "Low",
    legend_high:    "High",
    zoom_hint:      "Scroll: Zoom  Drag: Pan  Dbl-click: Reset",
    sample_banner:  "\u26A0 Showing sample data \u2014 place data/livability_scores.json to use real data",
    rank_label:     "",
    score_label:    "Score",
    overall_label:  "Overall Score",
    ranking_label:  "Rank",
    dim_rank_label: "#",
    no_data:        "No data",
    loading_map:    "Loading map data...",
    map_not_found:  "Map data not found",
  },
};

// ─── 次元名 ────────────────────────────────────────────
const DIM_LABELS = {
  "経済・労働": { ja: "経済・労働", zh: "经济与劳动", en: "Economy & Work" },
  "居住・利便性": { ja: "居住・利便性", zh: "居住便利度", en: "Housing & Access" },
  "環境・安全": { ja: "環境・安全", zh: "环境与安全", en: "Environment & Safety" },
  "医療・教育": { ja: "医療・教育", zh: "医疗与教育", en: "Health & Education" },
  "将来性":     { ja: "将来性",     zh: "发展潜力",   en: "Future Potential" },
};

// ─── プリセット名 ──────────────────────────────────────
const PRESET_LABELS = {
  "デフォルト":    { ja: "デフォルト",          zh: "默认",      en: "Default" },
  "家庭向け":      { ja: "👨‍👩‍👧 家庭",               zh: "👨‍👩‍👧 家庭",   en: "👨‍👩‍👧 Family" },
  "単身経済向け":  { ja: "💼 キャリア",           zh: "💼 职场",   en: "💼 Career" },
  "退休向け":      { ja: "🌿 セカンドライフ",     zh: "🌿 退休",   en: "🌿 Retirement" },
  "カスタム":      { ja: "⚙ カスタム",           zh: "⚙ 自定义", en: "⚙ Custom" },
};

// ─── 都道府県名 ───────────────────────────────────────
// zh: 漢字は日本語と同じ（中国語話者はそのまま読める）
// en: ローマ字表記
const PREF_TRANSLATIONS = {
  "北海道":  { zh: "北海道",  en: "Hokkaido" },
  "青森県":  { zh: "青森县",  en: "Aomori" },
  "岩手県":  { zh: "岩手县",  en: "Iwate" },
  "宮城県":  { zh: "宫城县",  en: "Miyagi" },
  "秋田県":  { zh: "秋田县",  en: "Akita" },
  "山形県":  { zh: "山形县",  en: "Yamagata" },
  "福島県":  { zh: "福岛县",  en: "Fukushima" },
  "茨城県":  { zh: "茨城县",  en: "Ibaraki" },
  "栃木県":  { zh: "栃木县",  en: "Tochigi" },
  "群馬県":  { zh: "群马县",  en: "Gunma" },
  "埼玉県":  { zh: "埼玉县",  en: "Saitama" },
  "千葉県":  { zh: "千叶县",  en: "Chiba" },
  "東京都":  { zh: "东京都",  en: "Tokyo" },
  "神奈川県":{ zh: "神奈川县",en: "Kanagawa" },
  "新潟県":  { zh: "新潟县",  en: "Niigata" },
  "富山県":  { zh: "富山县",  en: "Toyama" },
  "石川県":  { zh: "石川县",  en: "Ishikawa" },
  "福井県":  { zh: "福井县",  en: "Fukui" },
  "山梨県":  { zh: "山梨县",  en: "Yamanashi" },
  "長野県":  { zh: "长野县",  en: "Nagano" },
  "岐阜県":  { zh: "岐阜县",  en: "Gifu" },
  "静岡県":  { zh: "静冈县",  en: "Shizuoka" },
  "愛知県":  { zh: "爱知县",  en: "Aichi" },
  "三重県":  { zh: "三重县",  en: "Mie" },
  "滋賀県":  { zh: "滋贺县",  en: "Shiga" },
  "京都府":  { zh: "京都府",  en: "Kyoto" },
  "大阪府":  { zh: "大阪府",  en: "Osaka" },
  "兵庫県":  { zh: "兵库县",  en: "Hyogo" },
  "奈良県":  { zh: "奈良县",  en: "Nara" },
  "和歌山県":{ zh: "和歌山县",en: "Wakayama" },
  "鳥取県":  { zh: "鸟取县",  en: "Tottori" },
  "島根県":  { zh: "岛根县",  en: "Shimane" },
  "岡山県":  { zh: "冈山县",  en: "Okayama" },
  "広島県":  { zh: "广岛县",  en: "Hiroshima" },
  "山口県":  { zh: "山口县",  en: "Yamaguchi" },
  "徳島県":  { zh: "德岛县",  en: "Tokushima" },
  "香川県":  { zh: "香川县",  en: "Kagawa" },
  "愛媛県":  { zh: "爱媛县",  en: "Ehime" },
  "高知県":  { zh: "高知县",  en: "Kochi" },
  "福岡県":  { zh: "福冈县",  en: "Fukuoka" },
  "佐賀県":  { zh: "佐贺县",  en: "Saga" },
  "長崎県":  { zh: "长崎县",  en: "Nagasaki" },
  "熊本県":  { zh: "熊本县",  en: "Kumamoto" },
  "大分県":  { zh: "大分县",  en: "Oita" },
  "宮崎県":  { zh: "宫崎县",  en: "Miyazaki" },
  "鹿児島県":{ zh: "鹿儿岛县",en: "Kagoshima" },
  "沖縄県":  { zh: "冲绳县",  en: "Okinawa" },
};

// ─── Helper functions ─────────────────────────────────

/** 現在の言語でUIテキストを取得 */
function t(key) {
  const lang = window.currentLang || "ja";
  return (LANG_STRINGS[lang] && LANG_STRINGS[lang][key])
    || LANG_STRINGS.ja[key]
    || key;
}

/** 次元の表示名を取得 */
function getDimLabel(dim) {
  const lang = window.currentLang || "ja";
  return (DIM_LABELS[dim] && DIM_LABELS[dim][lang]) || dim;
}

/** プリセットの表示ラベルを取得 */
function getPresetLabel(key) {
  const lang = window.currentLang || "ja";
  return (PRESET_LABELS[key] && PRESET_LABELS[key][lang]) || key;
}

/** 都道府県名を現在の言語で取得 */
function getPrefName(jaName) {
  const lang = window.currentLang || "ja";
  if (lang === "ja") return jaName;
  return (PREF_TRANSLATIONS[jaName] && PREF_TRANSLATIONS[jaName][lang]) || jaName;
}

/** 言語を切り替えてUIを更新 */
function setLanguage(lang) {
  window.currentLang = lang;
  try { localStorage.setItem("lang", lang); } catch (_) {}

  // 言語ボタンのactive更新
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  // data-i18n 属性を持つ静的要素を更新
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    el.innerHTML = t(key);
  });

  // html lang 属性
  document.documentElement.lang = lang === "en" ? "en" : lang === "zh" ? "zh" : "ja";

  // 動的コンポーネントを再レンダリング（app.jsの関数）
  if (typeof renderWeightPanel === "function") renderWeightPanel();
  if (typeof renderRankList === "function") renderRankList();
  if (typeof updateMapColors === "function") updateMapColors();
}

// ─── 初期化 ────────────────────────────────────────────
(function init() {
  let savedLang = "ja";
  try { savedLang = localStorage.getItem("lang") || "ja"; } catch (_) {}
  window.currentLang = ["ja", "zh", "en"].includes(savedLang) ? savedLang : "ja";
})();
