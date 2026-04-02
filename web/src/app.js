/**
 * Japan Livability Index — Interactive Map
 *
 * 依存: D3.js v7, TopoJSON, html2canvas
 * データ: data/livability_scores.json (web/data/ にコピーして配置)
 * 地図:   web/data/japan.topojson (dataofjapan/land より)
 */

// ─── 定数 ───────────────────────────────────────────
const DIMS = ["経済力", "生活利便性", "環境快適度", "社会安全度", "将来性"];
const DIM_COLORS = {
  "経済力":     "#388bfd",
  "生活利便性": "#3fb950",
  "環境快適度": "#d29922",
  "社会安全度": "#f78166",
  "将来性":     "#bc8cff",
};

// 次元の内訳説明（ツールチップ用）
const DIM_TOOLTIPS = {
  "経済力":     "県民所得(一人当たり)\n完全失業率\n有効求人倍率",
  "生活利便性": "自動車保有台数(交通利便性の代理)\n持ち家比率・住宅延べ面積\n家賃(1畳当たり)・収入対家賃比",
  "環境快適度": "年間日照時間\n年間降水量",
  "社会安全度": "犯罪発生率・交通事故発生率\n病院数・医師数(人口10万対)",
  "将来性":     "人口増減率\n転入超過率\n高齢化率(反転)",
};

// 重みプリセット（合計 = 1.0）
const PRESETS = {
  "デフォルト": {
    label: "デフォルト",
    weights: { "経済力": 0.25, "生活利便性": 0.30, "環境快適度": 0.20, "社会安全度": 0.10, "将来性": 0.15 },
  },
  "家庭向け": {
    label: "👨‍👩‍👧 家庭",
    weights: { "経済力": 0.15, "生活利便性": 0.35, "環境快適度": 0.20, "社会安全度": 0.20, "将来性": 0.10 },
  },
  "単身経済向け": {
    label: "💼 キャリア",
    weights: { "経済力": 0.40, "生活利便性": 0.30, "環境快適度": 0.10, "社会安全度": 0.10, "将来性": 0.10 },
  },
  "退休向け": {
    label: "🌿 セカンドライフ",
    weights: { "経済力": 0.10, "生活利便性": 0.25, "環境快適度": 0.35, "社会安全度": 0.20, "将来性": 0.10 },
  },
};

// ─── 状態 ───────────────────────────────────────────
let rawData = [];           // 元データ（dim_ スコア保持）
let scoreData = [];         // 現在の重みで再計算済みデータ
let currentPreset = "デフォルト";
let currentWeights = { ...PRESETS["デフォルト"].weights };
let selectedPref = null;
let comparePref = null;     // 比較対象の都道府県コード
let colorScale = null;
let scoreMap = {};          // pref_code → score entry
let svgReady = false;       // 地図 SVG がレンダリング済みか
let usingSampleData = false;
let currentDetailView = "bar"; // "bar" or "radar"
let mapZoom = null;         // d3.zoom インスタンス
let mapSvg = null;          // 地図 SVG selection
let mapProjection = null;   // d3 projection（ドリルダウン用に保持）
let mapPath = null;         // d3 path generator
let prefGeoFeatures = {};   // pref_code → GeoJSON feature（ズーム境界計算用）

// ─── ドリルダウン状態 ────────────────────────────────
let drillPref = null;           // ドリルダウン中の都道府県コード
let cityRawData = [];           // city_scores.json 全体
let cityScoreData = [];         // 現在ドリルイン中の都道府県のスコア
let cityScoreMap = {};          // city_code → city entry
let cityGeoCache = {};          // pref_code → GeoJSON FeatureCollection（遅延読み込みキャッシュ）
let cityDataLoaded = false;     // city_scores.json 読み込み済みか

// ─── サンプルデータ（決定論的、シード固定） ─────────
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateSampleData() {
  const PREFS = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県",
    "栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県",
    "石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県",
    "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県",
    "岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
    "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
  ];
  const rng = seededRng(42);
  return PREFS.map((name, i) => {
    const dims = {};
    DIMS.forEach(d => {
      dims[`dim_${d}`] = Math.round(rng() * 60 + 25);
    });
    return {
      pref_code: String(i + 1).padStart(2, "0"),
      pref_name: name,
      ...dims,
    };
  });
}

// ─── Toast ──────────────────────────────────────────
function showToast(message, durationMs = 2000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), durationMs);
}

// ─── Sample data banner ─────────────────────────────
function showSampleBanner() {
  if (sessionStorage.getItem("banner-dismissed")) return;
  document.getElementById("sample-banner").classList.add("show");
}
function dismissBanner() {
  document.getElementById("sample-banner").classList.remove("show");
  sessionStorage.setItem("banner-dismissed", "1");
}

// ─── スコア再計算 ────────────────────────────────────
function recomputeScores(base, weights) {
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return base.map(d => {
    const total = DIMS.reduce((sum, dim) => {
      const w = (weights[dim] || 0) / totalW;
      return sum + w * (d[`dim_${dim}`] || 0);
    }, 0);
    return { ...d, total_score: Math.round(total * 10) / 10 };
  })
  .sort((a, b) => b.total_score - a.total_score)
  .map((d, i) => ({ ...d, rank: i + 1 }));
}

// ─── 市区町村スコア再計算 ─────────────────────────────
function recomputeCityScores(cities) {
  // 市区町村は将来性・生活利便性の一部のみ保持
  const availDims = DIMS.filter(dim => cities.some(c => c[`dim_${dim}`] != null));
  if (availDims.length === 0) {
    return cities.map((c, i) => ({ ...c, total_score: 50, rank_in_pref: i + 1 }));
  }
  const totalW = availDims.reduce((s, dim) => s + (currentWeights[dim] || 0), 0) || 1;
  return cities
    .map(c => {
      const total = availDims.reduce((sum, dim) => {
        const w = (currentWeights[dim] || 0) / totalW;
        return sum + w * (c[`dim_${dim}`] != null ? c[`dim_${dim}`] : 50);
      }, 0);
      return { ...c, total_score: Math.round(total * 10) / 10 };
    })
    .sort((a, b) => b.total_score - a.total_score)
    .map((d, i) => ({ ...d, rank_in_pref: i + 1 }));
}

// ─── 地図カラー更新 ──────────────────────────────────
function updateMapColors() {
  if (!svgReady || !colorScale) return;
  const scores = scoreData.map(d => d.total_score);
  colorScale.domain([Math.min(...scores), Math.max(...scores)]);
  d3.selectAll(".prefecture")
    .attr("fill", d => {
      const code = String(d.properties.id).padStart(2, "0");
      const s = scoreMap[code];
      return s ? colorScale(s.total_score) : "#2d333b";
    })
    .attr("aria-label", d => {
      const code = String(d.properties.id).padStart(2, "0");
      const s = scoreMap[code];
      return s ? `${s.pref_name} スコア ${s.total_score}` : "";
    });
}

// ─── ランキングリスト ────────────────────────────────
function renderRankList() {
  const list = document.getElementById("rank-list");
  list.innerHTML = scoreData.map(d => `
    <div class="rank-item" onclick="selectPref('${d.pref_code}')"
         data-code="${d.pref_code}" role="listitem" tabindex="0"
         onkeydown="if(event.key==='Enter')selectPref('${d.pref_code}')">
      <div class="rank-badge ${d.rank <= 3 ? `rank-${d.rank}` : "rank-other"}">${d.rank}</div>
      <span class="rank-name">${getPrefName(d.pref_name)}</span>
      <span class="rank-score">${d.total_score.toFixed(1)}</span>
    </div>
  `).join("");
  if (selectedPref) refreshDetailPanel();
  updateCompareDropdown();
}

// ─── 詳細パネル ──────────────────────────────────────
function selectPref(code) {
  if (drillPref) return;  // ドリルダウン中は都道府県選択を無効化
  selectedPref = code;
  d3.selectAll(".prefecture").classed("selected", d =>
    (String(d.properties.id).padStart(2, "0")) === code
  );
  document.getElementById("detail-empty").style.display = "none";
  document.getElementById("detail-content").classList.add("show");
  refreshDetailPanel();
  document.getElementById("detail-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelectorAll(".rank-item").forEach(el => {
    el.style.background = el.dataset.code === code
      ? "rgba(56,139,253,0.12)" : "";
  });
}

function refreshDetailPanel() {
  const s = scoreData.find(d => d.pref_code === selectedPref);
  if (!s) return;
  const rankSuffix = t("rank_label");
  document.getElementById("detail-name").textContent =
    `${getPrefName(s.pref_name)} — #${s.rank}${rankSuffix} (${s.total_score.toFixed(1)})`;
  document.getElementById("detail-dims").innerHTML = DIMS.map(dim => {
    const val = Math.round(s[`dim_${dim}`] || 0);
    const tip = DIM_TOOLTIPS[dim] || "";
    return `
      <div class="dim-row">
        <span class="dim-label">
          ${getDimLabel(dim)}
          ${tip ? `<span class="dim-info" title="${tip}">ℹ</span>` : ""}
        </span>
        <div class="dim-bar-bg">
          <div class="dim-bar-fill" style="width:${val}%;background:${DIM_COLORS[dim]}"></div>
        </div>
        <span class="dim-val">${val}</span>
      </div>`;
  }).join("");
  // view-toggle を有効化（_selectCity が非表示にする場合がある）
  document.getElementById("view-toggle").style.visibility = "visible";
  // ドリルダウンボタン
  const drillBtn = document.getElementById("detail-drill-btn");
  if (drillBtn) drillBtn.style.display = "flex";
  if (currentDetailView === "radar") renderRadarChart();
}

// ─── 詳細ビュー切替 ─────────────────────────────────
function setDetailView(view) {
  currentDetailView = view;
  document.querySelectorAll("#view-toggle button").forEach(b => b.classList.remove("active"));
  document.querySelectorAll("#view-toggle button").forEach(b => {
    if (b.dataset.view === view) b.classList.add("active");
  });
  const dimEl = document.getElementById("detail-dims");
  const radarEl = document.getElementById("radar-container");
  if (view === "bar") {
    dimEl.style.display = "block";
    radarEl.classList.remove("show");
  } else {
    dimEl.style.display = "none";
    radarEl.classList.add("show");
    renderRadarChart();
  }
}

// ─── レーダーチャート ────────────────────────────────
function renderRadarChart() {
  const container = document.getElementById("radar-container");
  container.innerHTML = "";
  const s1 = scoreData.find(d => d.pref_code === selectedPref);
  if (!s1) {
    container.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:1rem">都道府県を選択してください</div>';
    return;
  }
  const s2 = comparePref ? scoreData.find(d => d.pref_code === comparePref) : null;

  const size = 220;
  const cx = size / 2, cy = size / 2;
  const maxR = size / 2 - 30;
  const n = DIMS.length;
  const angleSlice = (Math.PI * 2) / n;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${size} ${size}`)
    .attr("width", size).attr("height", size);

  // Grid circles
  [25, 50, 75, 100].forEach(v => {
    const r = (v / 100) * maxR;
    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill", "none").attr("stroke", "#30363d").attr("stroke-width", 0.5);
  });

  // Axis lines and labels
  DIMS.forEach((dim, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const x2 = cx + maxR * Math.cos(angle);
    const y2 = cy + maxR * Math.sin(angle);
    svg.append("line").attr("x1", cx).attr("y1", cy).attr("x2", x2).attr("y2", y2)
      .attr("stroke", "#30363d").attr("stroke-width", 0.5);
    const lx = cx + (maxR + 16) * Math.cos(angle);
    const ly = cy + (maxR + 16) * Math.sin(angle);
    svg.append("text").attr("x", lx).attr("y", ly)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#9ca3af").attr("font-size", "8").text(getDimLabel(dim));
  });

  function makePath(entry) {
    return DIMS.map((dim, i) => {
      const val = (entry[`dim_${dim}`] || 0) / 100;
      const angle = angleSlice * i - Math.PI / 2;
      const x = cx + maxR * val * Math.cos(angle);
      const y = cy + maxR * val * Math.sin(angle);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    }).join("") + "Z";
  }

  // Prefecture 1
  svg.append("path").attr("d", makePath(s1))
    .attr("fill", "rgba(56,139,253,0.2)").attr("stroke", "#388bfd").attr("stroke-width", 1.5);

  // Prefecture 2 (comparison)
  if (s2) {
    svg.append("path").attr("d", makePath(s2))
      .attr("fill", "rgba(247,129,102,0.15)").attr("stroke", "#f78166").attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3");
  }

  // Legend
  const legendY = size - 10;
  svg.append("circle").attr("cx", 10).attr("cy", legendY).attr("r", 4)
    .attr("fill", "#388bfd");
  svg.append("text").attr("x", 18).attr("y", legendY + 1)
    .attr("fill", "#e6edf3").attr("font-size", "8").attr("dominant-baseline", "middle")
    .text(s1.pref_name);
  if (s2) {
    const offset = s1.pref_name.length * 9 + 26;
    svg.append("circle").attr("cx", offset).attr("cy", legendY).attr("r", 4)
      .attr("fill", "#f78166");
    svg.append("text").attr("x", offset + 8).attr("y", legendY + 1)
      .attr("fill", "#e6edf3").attr("font-size", "8").attr("dominant-baseline", "middle")
      .text(s2.pref_name);
  }

  if (!s2) {
    svg.append("text").attr("x", cx).attr("y", size - 4)
      .attr("text-anchor", "middle").attr("fill", "#9ca3af").attr("font-size", "7")
      .text("もう1つ選択して比較");
  }
}

// ─── 比較ドロップダウン ─────────────────────────────
function updateCompareDropdown() {
  const sel = document.getElementById("compare-select");
  const currentVal = sel.value;
  sel.innerHTML = `<option value="">${t("no_compare")}</option>` +
    scoreData.map(d =>
      `<option value="${d.pref_code}" ${d.pref_code === currentVal ? "selected" : ""}>` +
      `#${d.rank} ${getPrefName(d.pref_name)} (${d.total_score.toFixed(1)})</option>`
    ).join("");
}
function onCompareChange(code) {
  comparePref = code || null;
  if (currentDetailView === "radar") renderRadarChart();
  if (code && currentDetailView === "bar") setDetailView("radar");
}

// ─── 重みパネル ──────────────────────────────────────
function renderWeightPanel() {
  const btns = document.getElementById("preset-buttons");
  btns.innerHTML = Object.entries(PRESETS).map(([key]) => `
    <button class="preset-btn ${key === currentPreset ? "active" : ""}"
            onclick="applyPreset('${key}')">${getPresetLabel(key)}</button>
  `).join("") + `
    <button class="preset-btn ${currentPreset === "カスタム" ? "active" : ""}"
            onclick="switchToCustom()">${getPresetLabel("カスタム")}</button>`;

  const sliders = document.getElementById("custom-sliders");
  sliders.innerHTML = DIMS.map(dim => {
    const pct = Math.round(currentWeights[dim] * 100);
    return `
      <div class="slider-row">
        <span class="slider-dim">${getDimLabel(dim)}</span>
        <input type="range" min="0" max="100" value="${pct}"
               oninput="onSliderChange('${dim}', this.value)"
               id="slider-${dim.replace(/\s/g,'-')}"
               aria-label="${dim}の重み" aria-valuetext="${pct}%" />
        <span class="slider-pct" id="pct-${dim.replace(/\s/g,'-')}">${pct}%</span>
      </div>`;
  }).join("") + `<div class="weight-total" id="weight-total">合計: 100%</div>`;
}

function applyPreset(key) {
  currentPreset = key;
  currentWeights = { ...PRESETS[key].weights };
  onWeightsChanged();
  DIMS.forEach(dim => {
    const el = document.getElementById(`slider-${dim.replace(/\s/g,'-')}`);
    const pctEl = document.getElementById(`pct-${dim.replace(/\s/g,'-')}`);
    if (el) {
      el.value = Math.round(currentWeights[dim] * 100);
      el.setAttribute("aria-valuetext", Math.round(currentWeights[dim] * 100) + "%");
    }
    if (pctEl) pctEl.textContent = Math.round(currentWeights[dim] * 100) + "%";
  });
  renderWeightPanel();
}

function switchToCustom() {
  currentPreset = "カスタム";
  const toggle = document.getElementById("custom-toggle");
  toggle.classList.add("open");
  toggle.setAttribute("aria-expanded", "true");
  document.getElementById("custom-sliders").classList.add("show");
  renderWeightPanel();
}

function toggleCustomSliders() {
  const toggle = document.getElementById("custom-toggle");
  const panel = document.getElementById("custom-sliders");
  const isOpen = toggle.classList.toggle("open");
  panel.classList.toggle("show");
  toggle.setAttribute("aria-expanded", String(isOpen));
}

function onSliderChange(dim, val) {
  currentWeights[dim] = parseInt(val) / 100;
  currentPreset = "カスタム";
  const pctEl = document.getElementById(`pct-${dim.replace(/\s/g,'-')}`);
  const sliderEl = document.getElementById(`slider-${dim.replace(/\s/g,'-')}`);
  if (pctEl) pctEl.textContent = val + "%";
  if (sliderEl) sliderEl.setAttribute("aria-valuetext", val + "%");
  const total = DIMS.reduce((s, d) => s + Math.round(currentWeights[d] * 100), 0);
  const totalEl = document.getElementById("weight-total");
  if (totalEl) {
    totalEl.textContent = `合計: ${total}%`;
    totalEl.classList.toggle("error", total !== 100);
  }
  document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(".preset-btn:last-child")?.classList.add("active");
  onWeightsChanged();
}

function onWeightsChanged() {
  scoreData = recomputeScores(rawData, currentWeights);
  scoreMap = Object.fromEntries(scoreData.map(d => [d.pref_code, d]));
  renderRankList();
  updateMapColors();
  if (currentDetailView === "radar" && selectedPref) renderRadarChart();
}

// ─── CSV ダウンロード ────────────────────────────────
function downloadCSV() {
  const header = ["rank", "pref_name", "total_score", ...DIMS.map(d => `dim_${d}`)];
  const rows = scoreData.map(d =>
    [d.rank, d.pref_name, d.total_score.toFixed(1),
     ...DIMS.map(dim => Math.round(d[`dim_${dim}`] || 0))].join(",")
  );
  const csv = "\uFEFF" + header.join(",") + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "livability_scores.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("✅ CSVダウンロード開始");
}

// ─── スクリーンショット ──────────────────────────────
async function takeScreenshot() {
  const btn = document.getElementById("btn-screenshot");
  btn.disabled = true;
  btn.querySelector(".btn-icon").textContent = "⏳";
  try {
    const canvas = await html2canvas(document.body, {
      backgroundColor: "#0d1117",
      scale: 2,
    });
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "livability_index.png";
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("✅ 画像をダウンロードしました");
    });
  } catch {
    showToast("❌ スクリーンショットに失敗しました", 3000);
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-icon").textContent = "📸";
  }
}

// ─── URL パラメータ共有 ──────────────────────────────
function encodeStateToURL() {
  const params = new URLSearchParams();
  const w = DIMS.map(d => Math.round(currentWeights[d] * 100)).join(",");
  params.set("w", w);
  if (selectedPref) params.set("p", selectedPref);
  return `${location.origin}${location.pathname}?${params}`;
}

function decodeStateFromURL() {
  const params = new URLSearchParams(location.search);
  const w = params.get("w");
  if (w) {
    const parts = w.split(",").map(Number);
    if (parts.length === DIMS.length && parts.every(n => !isNaN(n))) {
      DIMS.forEach((dim, i) => { currentWeights[dim] = parts[i] / 100; });
      currentPreset = "カスタム";
    }
  }
  const p = params.get("p");
  if (p) selectedPref = p;
}

function shareURL() {
  const url = encodeStateToURL();
  navigator.clipboard.writeText(url).then(() => {
    showToast("✅ URLをコピーしました");
  }).catch(() => {
    // Fallback for older browsers
    const input = document.createElement("input");
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    showToast("✅ URLをコピーしました");
  });
}

// ─── ドリルダウン ────────────────────────────────────

/** city_scores.json を遅延読み込み */
async function ensureCityScores() {
  if (cityDataLoaded) return true;
  try {
    const res = await fetch("data/city_scores.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cityRawData = await res.json();
    cityDataLoaded = true;
    return true;
  } catch {
    showToast("市区町村データ未生成。scripts/ を参照してください", 4000);
    return false;
  }
}

/** 都道府県の市区町村 GeoJSON を遅延読み込み */
async function ensureCityGeo(prefCode) {
  if (cityGeoCache[prefCode]) return cityGeoCache[prefCode];
  try {
    const res = await fetch(`data/cities/${prefCode}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const geojson = await res.json();
    cityGeoCache[prefCode] = geojson;
    return geojson;
  } catch {
    return null;
  }
}

/** 都道府県コードから N03_007 プロパティ対応の city_code を取得 */
function getCityCode(props) {
  const raw = props.city_code || props.N03_007;
  return raw ? String(raw).padStart(5, "0") : null;
}

/** 都道府県をドリルダウン（市区町村ビューへ遷移） */
async function drillDown(prefCode) {
  if (!prefCode) return;

  // データ読み込み（並列）
  const [scoresOk, geo] = await Promise.all([
    ensureCityScores(),
    ensureCityGeo(prefCode),
  ]);
  if (!scoresOk) return;
  if (!geo || !geo.features || geo.features.length === 0) {
    showToast("市区町村境界データが見つかりません。download_city_topo.py を実行してください", 4000);
    return;
  }

  drillPref = prefCode;

  // 現都道府県の市区町村スコアを計算
  const citiesForPref = cityRawData.filter(c => c.pref_code === prefCode);
  cityScoreData = recomputeCityScores(citiesForPref);
  cityScoreMap = Object.fromEntries(cityScoreData.map(d => [d.city_code, d]));

  // 地図を都道府県に拡大
  _zoomToPref(prefCode);

  // 市区町村レイヤーを描画
  _renderCityLayer(prefCode, geo);

  // サイドバーを市区町村ランキングに切替
  document.getElementById("drill-back").style.display = "flex";
  _renderCityRankList();
}

/** 都道府県ビューに戻る */
function drillBack() {
  drillPref = null;
  cityScoreData = [];
  cityScoreMap = {};

  // 市区町村パスを削除
  if (mapSvg) mapSvg.select(".map-g").selectAll(".city-path").remove();

  // ズームリセット
  resetMapZoom();

  // UI 復元
  document.getElementById("drill-back").style.display = "none";
  document.getElementById("detail-empty").style.display = "block";
  document.getElementById("detail-content").classList.remove("show");
  selectedPref = null;
  d3.selectAll(".prefecture").classed("selected", false);
  renderRankList();
}

/** 都道府県境界にズーム */
function _zoomToPref(prefCode) {
  const feature = prefGeoFeatures[prefCode];
  if (!feature || !mapSvg || !mapZoom || !mapPath) return;

  const w = +mapSvg.attr("width");
  const h = +mapSvg.attr("height");
  const [[x0, y0], [x1, y1]] = mapPath.bounds(feature);
  const scale = Math.min(8, 0.85 / Math.max((x1 - x0) / w, (y1 - y0) / h));
  const tx = w / 2 - scale * (x0 + x1) / 2;
  const ty = h / 2 - scale * (y0 + y1) / 2;

  mapSvg.transition().duration(750).call(
    mapZoom.transform,
    d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}

/** 市区町村コロプレスレイヤーを描画 */
function _renderCityLayer(prefCode, geo) {
  const g = mapSvg.select(".map-g");
  g.selectAll(".city-path").remove();

  const scores = cityScoreData.map(d => d.total_score);
  const cityColorScale = d3.scaleSequential()
    .domain([Math.min(...scores), Math.max(...scores)])
    .interpolator(d3.interpolateRdYlGn);

  g.selectAll(".city-path")
    .data(geo.features)
    .enter().append("path")
    .attr("class", "city-path")
    .attr("d", mapPath)
    .attr("fill", f => {
      const code = getCityCode(f.properties);
      const s = code ? cityScoreMap[code] : null;
      return s ? cityColorScale(s.total_score) : "#3d434b";
    })
    .attr("stroke", "#1a1f27")
    .attr("stroke-width", 0.3)
    .on("mousemove", (event, f) => _showCityTooltip(event, f))
    .on("mouseleave", hideTooltip)
    .on("click", (_, f) => {
      const code = getCityCode(f.properties);
      if (code) _selectCity(code);
    });
}

/** 市区町村ランキングをサイドバーに表示 */
function _renderCityRankList() {
  const prefEntry = scoreMap[drillPref];
  const prefDisplay = prefEntry ? getPrefName(prefEntry.pref_name) : drillPref;

  document.getElementById("drill-back-label").textContent = prefDisplay;

  const list = document.getElementById("rank-list");
  list.innerHTML = `
    <div class="drill-header">
      <span class="drill-pref-name">${prefDisplay}</span>
      <span class="drill-city-count">${cityScoreData.length} 市区町村</span>
    </div>
  ` + cityScoreData.map(d => `
    <div class="rank-item" onclick="_selectCity('${d.city_code}')"
         data-code="${d.city_code}" role="listitem" tabindex="0"
         onkeydown="if(event.key==='Enter')_selectCity('${d.city_code}')">
      <div class="rank-badge rank-other">${d.rank_in_pref}</div>
      <span class="rank-name">${d.city_name}</span>
      <span class="rank-score">${d.total_score.toFixed(1)}</span>
    </div>
  `).join("");
}

/** 市区町村を選択してパネルに詳細表示 */
function _selectCity(cityCode) {
  const s = cityScoreMap[cityCode];
  if (!s) return;

  // 選択ハイライト
  mapSvg.select(".map-g").selectAll(".city-path")
    .classed("selected", f => getCityCode(f.properties) === cityCode);

  // サイドバーハイライト
  document.querySelectorAll(".rank-item").forEach(el => {
    el.style.background = el.dataset.code === cityCode
      ? "rgba(56,139,253,0.12)" : "";
  });

  // 詳細パネル
  const availDims = DIMS.filter(dim => s[`dim_${dim}`] != null);
  document.getElementById("detail-name").textContent =
    `${s.city_name} (${s.pref_name}) — #${s.rank_in_pref} (${s.total_score.toFixed(1)})`;

  document.getElementById("detail-dims").innerHTML =
    `<div class="city-data-note">※ 市区町村データ: ${availDims.map(d => getDimLabel(d)).join("・")} のみ</div>` +
    availDims.map(dim => {
      const val = Math.round(s[`dim_${dim}`] || 0);
      return `
        <div class="dim-row">
          <span class="dim-label">${getDimLabel(dim)}</span>
          <div class="dim-bar-bg">
            <div class="dim-bar-fill" style="width:${val}%;background:${DIM_COLORS[dim]}"></div>
          </div>
          <span class="dim-val">${val}</span>
        </div>`;
    }).join("");

  document.getElementById("detail-empty").style.display = "none";
  document.getElementById("detail-content").classList.add("show");
  // ドリルダウン中は view-toggle を無効化
  document.getElementById("view-toggle").style.visibility = "hidden";
}

/** 市区町村ホバーツールチップ */
function _showCityTooltip(event, f) {
  const code = getCityCode(f.properties);
  const s = code ? cityScoreMap[code] : null;
  if (!s) return;

  const tip = document.getElementById("tooltip");
  tip.style.display = "block";
  const [mx, my] = d3.pointer(event, document.getElementById("map-container"));
  tip.style.left = (mx + 14) + "px";
  tip.style.top  = (my - 8)  + "px";
  tip.innerHTML = `
    <div class="t-name">${s.city_name}</div>
    <div class="t-row"><span>スコア</span><span>${s.total_score.toFixed(1)}</span></div>
    <div class="t-row"><span>県内${t("ranking_label")}</span><span>#${s.rank_in_pref}</span></div>`;
}

// ─── 地図 ────────────────────────────────────────────
async function loadMap() {
  const mapEl = document.getElementById("map");
  const w = mapEl.clientWidth || 700;
  const headerH = document.querySelector("header")?.offsetHeight || 60;
  const h = Math.min(mapEl.clientHeight, window.innerHeight - headerH) || 600;
  const svg = d3.select("#map").append("svg")
    .attr("width", w).attr("height", h)
    .attr("role", "img").attr("aria-label", "日本都道府県スコア地図");

  // ズーム用グループ（全パスをここに追加することでズーム変換が適用される）
  const g = svg.append("g").attr("class", "map-g");

  // d3.zoom: ホイールズーム・ドラッグパン・ダブルクリックリセット
  mapSvg = svg;
  mapZoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
  svg.call(mapZoom);
  svg.on("dblclick.zoom", () => {
    svg.transition().duration(500).call(mapZoom.transform, d3.zoomIdentity);
  });

  const scores = scoreData.map(d => d.total_score);
  colorScale = d3.scaleSequential()
    .domain([Math.min(...scores), Math.max(...scores)])
    .interpolator(d3.interpolateRdYlGn);

  try {
    const topo = await d3.json("data/japan.topojson");
    document.getElementById("map-loading").style.display = "none";
    const geojson = topojson.feature(topo, topo.objects.japan);
    const projection = d3.geoMercator().fitSize([w, h], geojson);
    const path = d3.geoPath().projection(projection);

    // ドリルダウン用に保持
    mapProjection = projection;
    mapPath = path;
    geojson.features.forEach(f => {
      prefGeoFeatures[String(f.properties.id).padStart(2, "0")] = f;
    });

    g.selectAll(".prefecture")
      .data(geojson.features)
      .enter().append("path")
      .attr("class", "prefecture")
      .attr("d", path)
      .attr("fill", d => {
        const code = String(d.properties.id).padStart(2, "0");
        const s = scoreMap[code];
        return s ? colorScale(s.total_score) : "#2d333b";
      })
      .attr("aria-label", d => {
        const code = String(d.properties.id).padStart(2, "0");
        const s = scoreMap[code];
        return s ? `${s.pref_name} スコア ${s.total_score}` : "";
      })
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseleave", hideTooltip)
      .on("click", (_, d) => selectPref(String(d.properties.id).padStart(2, "0")));

    svgReady = true;
  } catch {
    document.getElementById("map-loading").style.display = "none";
    document.getElementById("map-error").style.display = "flex";
    svg.append("text")
      .attr("x", w / 2).attr("y", h / 2 - 20)
      .attr("text-anchor", "middle").attr("fill", "#9ca3af").attr("font-size", "13")
      .text("↑ TopJSONを配置するとインタラクティブ地図が表示されます");
  }
}

// ─── ズームリセット ──────────────────────────────────
function resetMapZoom() {
  if (mapSvg && mapZoom) {
    mapSvg.transition().duration(500).call(mapZoom.transform, d3.zoomIdentity);
  }
}

// ─── ツールチップ ────────────────────────────────────
function showTooltip(event, d) {
  const code = String(d.properties.id).padStart(2, "0");
  const s = scoreMap[code];
  if (!s) return;
  const tip = document.getElementById("tooltip");
  tip.style.display = "block";
  // d3.pointer でズーム変換に依存しない座標を取得
  const [mx, my] = d3.pointer(event, document.getElementById("map-container"));
  tip.style.left = (mx + 14) + "px";
  tip.style.top = (my - 8) + "px";
  tip.innerHTML = `
    <div class="t-name">${getPrefName(s.pref_name)}</div>
    <div class="t-row"><span>${t("overall_label")}</span><span>${s.total_score.toFixed(1)}</span></div>
    <div class="t-row"><span>${t("ranking_label")}</span><span>#${s.rank}</span></div>`;
}
function hideTooltip() {
  document.getElementById("tooltip").style.display = "none";
}

// ─── データ読み込み ──────────────────────────────────
async function loadData() {
  // URL パラメータから状態を復元
  decodeStateFromURL();

  try {
    const res = await fetch("data/livability_scores.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawData = await res.json();
    usingSampleData = false;
  } catch {
    rawData = generateSampleData();
    usingSampleData = true;
    showSampleBanner();
  }
  scoreData = recomputeScores(rawData, currentWeights);
  scoreMap = Object.fromEntries(scoreData.map(d => [d.pref_code, d]));
  // 言語初期化（保存済み言語を反映）
  if (typeof setLanguage === "function") {
    setLanguage(window.currentLang || "ja");
  } else {
    renderWeightPanel();
    renderRankList();
  }
  loadMap();

  // URL パラメータで指定された都道府県を選択
  if (selectedPref) {
    setTimeout(() => selectPref(selectedPref), 100);
  }
}

// ─── 起動 ────────────────────────────────────────────
loadData();
