/**
 * Japan Livability Index — Interactive Map
 *
 * 依存: D3.js v7, TopoJSON, html2canvas
 * データ: data/livability_scores.json (web/data/ にコピーして配置)
 * 地図:   web/data/japan.topojson (dataofjapan/land より)
 */

// ─── 定数 ───────────────────────────────────────────
const DIMS = ["経済・労働", "居住・利便性", "環境・安全", "医療・教育", "将来性"];
const DIM_COLORS = {
  "経済・労働": "#1a52a0",
  "居住・利便性": "#2d7040",
  "環境・安全": "#b07818",
  "医療・教育": "#c0182b",
  "将来性":     "#6d3db0",
};

// 次元の内訳説明（ツールチップ用）
const DIM_TOOLTIPS = {
  "経済・労働": "県民所得(一人当たり)\n完全失業率\n有効求人倍率\n月間実労働時間(反転)",
  "居住・利便性": "自動車保有台数(公交依存度代理)\n持ち家比率・住宅延べ面積\n家賃(1畳当たり)\n消費者物価地域差指数\n第3次産業就業者割合\n都市部通勤者割合",
  "環境・安全": "年間日照時間\n年間降水量\n犯罪発生率\n交通事故発生率",
  "医療・教育": "病院数・医師数(人口10万対)\n保育所等数(0〜5歳人口比)\n大学進学率",
  "将来性":     "人口増減率\n高齢化率(反転)\n大学数(人口10万対)",
};

// 重みプリセット（合計 = 1.0）
const PRESETS = {
  "デフォルト": {
    label: "デフォルト",
    weights: { "経済・労働": 0.20, "居住・利便性": 0.25, "環境・安全": 0.20, "医療・教育": 0.20, "将来性": 0.15 },
  },
  "家庭向け": {
    label: "👨‍👩‍👧 家庭",
    weights: { "経済・労働": 0.15, "居住・利便性": 0.25, "環境・安全": 0.15, "医療・教育": 0.35, "将来性": 0.10 },
  },
  "単身経済向け": {
    label: "💼 キャリア",
    weights: { "経済・労働": 0.40, "居住・利便性": 0.20, "環境・安全": 0.15, "医療・教育": 0.10, "将来性": 0.15 },
  },
  "退休向け": {
    label: "🌿 セカンドライフ",
    weights: { "経済・労働": 0.10, "居住・利便性": 0.20, "環境・安全": 0.30, "医療・教育": 0.30, "将来性": 0.10 },
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
let cityGeoCache = {};          // pref_code → GeoJSON (full, legacy)
let simpleGeoCache = {};        // pref_code → GeoJSON (simplified, for Leaflet)
let cityDataLoaded = false;     // city_scores.json 読み込み済みか

// ─── Leaflet 状態 ────────────────────────────────────
let leafletMap = null;          // L.Map インスタンス
let leafletCityLayer = null;    // L.GeoJSON レイヤー
let leafletLayerMap = {};       // cityCode → L.Layer（選択ハイライト用）

// ─── Hero ローテーション状態 ──────────────────────────
let heroTimer = null;
let heroIndex = 0;

// ─── データ発見リスト（Hero Banner ローテーション用）──
// dynamic: true のエントリは scoreData から動的に生成される
const DATA_DISCOVERIES = [
  // [0] 動的: 現在の重み設定での総合1位
  { dynamic: true, fn: (data) => {
      const top = data[0]; // already sorted by total_score desc
      return { pref_code: top.pref_code, label: {
        ja: `現在の重み設定で総合1位 — スコア ${top.total_score.toFixed(1)}`,
        zh: `当前权重设置总分第1 — ${top.total_score.toFixed(1)}分`,
        en: `#1 under your weight settings — score ${top.total_score.toFixed(1)}`,
      }};
  }},
  // [1] 絶対的事実: 東京の二面性
  { pref_code: "13", label: {
      ja: "原データで経済・将来性が全国1位。居住コスト（家賃・物価）は全国最高",
      zh: "东京：原始数据经济·将来性第1，居住成本全国最高",
      en: "Tokyo: economy & future #1 in raw data, housing cost highest",
  }},
  // [2] 絶対的事実: 高知の医療密度
  { pref_code: "39", label: {
      ja: "原データで人口10万対の病院数・医師数が全国1位",
      zh: "高知：原始数据每10万人医院数·医师数全国第1",
      en: "Kochi: most hospitals & doctors per 100k in raw data",
  }},
  // [3] 絶対的事実: 静岡の環境スコア
  { pref_code: "22", label: {
      ja: "東名事故率と降水量がともに全国最高水準 → 環境スコアが最低圏",
      zh: "静冈：东名高速事故率+年降水量双双全国最高，环境分垫底",
      en: "Shizuoka: highest accident rate + rainfall → bottom environment score",
  }},
  // [4] 絶対的事実: 秋田の将来性
  { pref_code: "05", label: {
      ja: "人口増減率・高齢化率がともに全国最悪水準 → 将来性16点",
      zh: "秋田：人口减少速度+老龄化率双双全国最差，将来性仅16分",
      en: "Akita: fastest depopulation + highest aging rate → future score 16/100",
  }},
  // [5] 動的: 現在の重み設定での最下位
  { dynamic: true, fn: (data) => {
      const last = data[data.length - 1];
      return { pref_code: last.pref_code, label: {
        ja: `現在の重み設定で総合最下位 — スコア ${last.total_score.toFixed(1)}`,
        zh: `当前权重设置总分最低 — ${last.total_score.toFixed(1)}分`,
        en: `Last place under your weight settings — score ${last.total_score.toFixed(1)}`,
      }};
  }},
  // [6] 絶対的事実: 沖縄
  { pref_code: "47", label: {
      ja: "統計で測れる指標は全国最下位圏 ——統計は海・文化・慢生活を測れない",
      zh: "冲绳：可测指标全部垫底——但统计测不出大海和文化",
      en: "Okinawa scores last in measurable stats — the ocean can't be ranked",
  }},
];

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
  // 市区町村は将来性・居住利便性・医療教育・環境安全の4次元を保持（指標ごとに欠損あり）
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
  const lo = Math.min(...scores), hi = Math.max(...scores);
  colorScale.domain([lo, (lo + hi) / 2, hi]);
  d3.selectAll(".prefecture")
    .attr("fill", d => {
      const code = String(d.properties.id).padStart(2, "0");
      const s = scoreMap[code];
      return s ? colorScale(s.total_score) : "#e8e4de";
    })
    .attr("aria-label", d => {
      const code = String(d.properties.id).padStart(2, "0");
      const s = scoreMap[code];
      return s ? `${s.pref_name} スコア ${s.total_score}` : "";
    });
}

// ─── ランキングリスト ────────────────────────────────
// 前回の各 pref_code のスコアを保持（count-up アニメーション用）
let _prevScores = {};

function renderRankList() {
  const list = document.getElementById("rank-list");
  const isFirstRender = list.children.length === 0;

  // FLIP Step 1: 現在の位置を記録
  const prevRects = {};
  list.querySelectorAll(".rank-item").forEach(el => {
    prevRects[el.dataset.code] = el.getBoundingClientRect();
  });

  // DOM 更新
  list.innerHTML = scoreData.map(d => `
    <div class="rank-item" onclick="selectPref('${d.pref_code}')"
         data-code="${d.pref_code}" role="listitem" tabindex="0"
         onkeydown="if(event.key==='Enter')selectPref('${d.pref_code}')">
      <div class="rank-badge ${d.rank <= 3 ? `rank-${d.rank}` : "rank-other"}">${d.rank}</div>
      <span class="rank-name">${getPrefName(d.pref_name)}</span>
      <span class="rank-score" data-code="${d.pref_code}">${d.total_score.toFixed(1)}</span>
    </div>
  `).join("");

  if (isFirstRender) {
    // 初回: stagger 入場アニメーション
    list.querySelectorAll(".rank-item").forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-10px)";
      setTimeout(() => {
        el.style.transition = "opacity 0.22s ease, transform 0.22s ease";
        el.style.opacity = "1";
        el.style.transform = "";
        setTimeout(() => { el.style.transition = ""; }, 250);
      }, i * 16);
    });
  } else {
    // 2回目以降: FLIP アニメーション
    list.querySelectorAll(".rank-item").forEach(el => {
      const code = el.dataset.code;
      const prev = prevRects[code];
      if (!prev) return;
      const curr = el.getBoundingClientRect();
      const dy = prev.top - curr.top;
      if (Math.abs(dy) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.38s cubic-bezier(0.2, 0, 0, 1)";
          el.style.transform = "";
          setTimeout(() => { el.style.transition = ""; }, 400);
        });
      });
    });

    // count-up: スコア数値アニメーション
    list.querySelectorAll(".rank-score[data-code]").forEach(el => {
      const code = el.dataset.code;
      const entry = scoreData.find(d => d.pref_code === code);
      if (!entry) return;
      const newVal = entry.total_score;
      const oldVal = _prevScores[code] ?? newVal;
      if (Math.abs(newVal - oldVal) < 0.1) return;
      const startTime = performance.now();
      const duration = 350;
      function tick(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        el.textContent = (oldVal + (newVal - oldVal) * ease).toFixed(1);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = newVal.toFixed(1);
      }
      requestAnimationFrame(tick);
    });
  }

  // 現在のスコアを次回の比較用に保存
  scoreData.forEach(d => { _prevScores[d.pref_code] = d.total_score; });

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
      ? "rgba(192,24,43,0.07)" : "";
  });
}

// ─── 都道府県別データ注記（三言語） ────────────────────
// 反直感的なスコアが生じる理由を、データに基づいて説明する。全47都道府県対応。
const PREF_NOTES = {
  "01": {
    ja: "物価水準が全国最低水準（物価地域差指数ボトム）のため居住コスト指標は優秀。一方、医療スコアは人口が広大な地域に分散するため低め。広大な面積と厳冬が生活コストの構造を作っています。",
    zh: "物价水平为全国最低（地区物价差异指数垫底），居住成本指标优秀。另一方面，由于人口分散在广阔的地域，医疗评分偏低。广袤的面积和严冬塑造了其生活成本结构。",
    en: "Housing cost scores are excellent due to the lowest price levels nationwide. However, the medical score is low because the population is spread across a vast area. The expansive territory and harsh winters shape its cost-of-living structure.",
  },
  "02": {
    ja: "将来性スコアが全国下位。人口減少・高齢化が東北の中でも特に深刻で、青森から首都圏への流出が続いています。医療の絶対数は確保されていますが、過疎化で人口当たり比率が下がっています。",
    zh: "发展潜力评分位居全国下游。在东北地区中，人口减少和老龄化尤为严重，人口持续向首都圈外流。医疗资源的绝对数量尚可，但因过疏化导致人均比例下降。",
    en: "Future potential score ranks near the bottom nationally. Population decline and aging are particularly severe even within Tohoku, with continued outflow to the Tokyo metro area. Medical resources exist in absolute numbers, but per-capita ratios decline due to depopulation.",
  },
  "03": {
    ja: "将来性スコアが全国最低水準（16点台）。人口増減率と大学数がともに低く、若者の定着が課題。一方、居住・自然環境は平均以上で、リモートワーク移住先として注目されています。",
    zh: "发展潜力评分为全国最低水平（16分）。人口增减率和大学数量均偏低，留住年轻人是一大课题。另一方面，居住和自然环境高于平均水平，作为远程办公移居地备受关注。",
    en: "Future potential score is among the lowest nationwide (16 points). Both population growth rate and number of universities are low, making youth retention a challenge. However, housing and natural environment are above average, drawing attention as a remote-work relocation destination.",
  },
  "04": {
    ja: "仙台市への一極集中が特徴。市内の医療・教育インフラは充実しているものの、県全体の人口10万対換算では医療スコアが低め。経済・将来性はともに中位圏。",
    zh: "特征是高度集中于仙台市。市内的医疗和教育基础设施完善，但从全县每10万人口的换算来看，医疗评分偏低。经济和发展潜力均处于中游水平。",
    en: "Characterized by extreme concentration in Sendai City. While the city has excellent medical and educational infrastructure, the prefecture-wide per-100K population medical score is low. Economy and future potential both rank mid-tier.",
  },
  "05": {
    ja: "居住・環境スコアは平均以上ながら、将来性は全国最低（16/100）。日本で最も急速に人口減少・高齢化が進む地域のひとつです。",
    zh: "居住和环境评分高于平均水平，但发展潜力为全国最低（16/100）。是日本人口减少和老龄化最快的地区之一。",
    en: "Housing and environment scores are above average, but future potential is the lowest nationwide (16/100). One of the fastest-declining and aging regions in Japan.",
  },
  "06": {
    ja: "年間日照時間が全国最短水準のため環境スコアが低め。自動車保有台数も統計上低く表れており、居住利便性スコアに影響しています。豊かな米どころ・農業県としての側面はこの指数では計測されません。",
    zh: "年均日照时间为全国最短水平，环境评分偏低。汽车保有量在统计上也偏低，影响了居住便利度评分。作为富饶的大米产地和农业县的优势，本指数无法衡量。",
    en: "The environment score is low due to the shortest annual sunshine hours nationwide. Low car ownership also statistically drags down the housing convenience score. Its strength as a rich rice-producing agricultural prefecture is not captured by this index.",
  },
  "07": {
    ja: "原発事故後の医療従事者・人口流出の影響が続き、医療スコアが全国最低水準（19点）。居住・環境の指標は回復傾向にありますが、将来性スコアも低く、長期的な課題が残ります。",
    zh: "核事故后医疗从业人员和人口外流的影响持续存在，医疗评分为全国最低水平（19分）。居住和环境指标呈恢复趋势，但发展潜力评分也偏低，长期课题依然存在。",
    en: "The ongoing impact of post-nuclear-accident medical staff and population outflow keeps the medical score at the lowest level nationwide (19 points). Housing and environment indicators are recovering, but the future potential score is also low, with long-term challenges remaining.",
  },
  "08": {
    ja: "首都圏のベッドタウンとして人口は多いものの、医療資源（病院数・医師数）が人口に追いついておらず医療スコアが低め。将来性は中位で、つくば市を中心とした研究学術機能が将来性を支えています。",
    zh: "作为首都圈的卫星城人口众多，但医疗资源（医院和医生数量）未能跟上人口增长，医疗评分偏低。发展潜力处于中游水平，以筑波市为中心的研究学术功能支撑着其发展潜力。",
    en: "Despite a large population as a Tokyo-area commuter hub, medical resources (hospitals, doctors) haven't kept pace, resulting in a low medical score. Future potential is mid-tier, supported by Tsukuba's research and academic functions.",
  },
  "09": {
    ja: "医療スコアが全国下位圏。宇都宮市の経済基盤は安定しているものの、広い県土に対して医療資源が分散。将来性は中位でベッドタウン機能を維持。",
    zh: "医疗评分位居全国下游。宇都宫市的经济基础稳定，但医疗资源分散在广阔的县域中。发展潜力处于中游水平，维持着卫星城功能。",
    en: "Medical score ranks in the lower tier nationally. While Utsunomiya's economic base is stable, medical resources are spread thin across the wide prefecture. Future potential is mid-tier, maintaining its commuter-town function.",
  },
  "10": {
    ja: "月間実労働時間が全国最長水準（統計上の最低スコア）。自動車産業・製造業の影響で就業者の労働時間が長く、経済・労働スコアを押し下げています。居住コストは低めで住みやすい一面も。",
    zh: "月均实际劳动时间为全国最长水平（统计上的最低评分）。受汽车产业和制造业影响，劳动者工作时间长，拉低了经济与劳动评分。居住成本较低，也有宜居的一面。",
    en: "Monthly working hours are the longest nationwide (lowest statistical score). Long work hours driven by the auto and manufacturing industries drag down the economy & work score. Low housing costs make it livable in other respects.",
  },
  "11": {
    ja: "医師数（人口10万対）が全国最低値。これは日本国内でも知られた課題で、東京への依存構造が要因。経済スコアも低め（有効求人倍率の競争が激しい首都圏）。将来性は比較的高く東京通勤圏の恩恵あり。",
    zh: "每10万人口医生数为全国最低。这是日本国内众所周知的问题，原因在于对东京的依赖结构。经济评分也偏低（首都圈有效求人倍率竞争激烈）。发展潜力相对较高，得益于东京通勤圈。",
    en: "The number of doctors per 100K population is the lowest nationwide — a well-known issue in Japan caused by dependency on Tokyo. Economy score is also low (intense job competition in the Tokyo metro area). Future potential is relatively high thanks to Tokyo commuter-belt benefits.",
  },
  "12": {
    ja: "医療スコアが全国下位。東京への医療依存が顕著で、千葉市以外の地域では医師・病院数が人口比で不足。将来性は高めで、成田空港・幕張などの経済機能が支えています。",
    zh: "医疗评分位居全国下游。对东京的医疗依赖显著，千叶市以外地区的医生和医院数量按人口比偏低。发展潜力较高，得益于成田机场和幕张等经济功能。",
    en: "Medical score ranks near the bottom. Medical dependency on Tokyo is significant — outside Chiba City, doctor and hospital counts are insufficient per capita. Future potential is high, supported by Narita Airport and Makuhari's economic functions.",
  },
  "13": {
    ja: "経済・将来性がともに全国1位。一方で居住コスト（家賃・生活物価）は全国最下位。世界有数の経済規模と、住居の狭さ・高さが同居しています。",
    zh: "经济和发展潜力均为全国第一。然而居住成本（房租和生活物价）为全国最高。世界顶级的经济规模与狭小昂贵的住房并存。",
    en: "Economy and future potential both rank #1 nationwide. However, housing costs (rent, living expenses) are the worst. World-class economic scale coexists with cramped, expensive housing.",
  },
  "14": {
    ja: "有効求人倍率と病院数（人口10万対）がともに統計上の最低値。横浜・川崎という大都市でも東京への医療・就職依存が大きく、県内資源は人口比で不足。将来性は高め。",
    zh: "有效求人倍率和每10万人口医院数均为统计上的最低值。即使是横滨和川崎这样的大城市，对东京的医疗和就业依赖也很大，县内资源按人口比不足。发展潜力较高。",
    en: "Both the job-to-applicant ratio and hospitals per 100K are statistically the lowest. Even major cities like Yokohama and Kawasaki depend heavily on Tokyo for medical care and employment. Future potential is high.",
  },
  "15": {
    ja: "居住スコアが全国上位。住宅の広さと持ち家比率の高さが寄与。コシヒカリの産地として農業基盤は安定。一方、豪雪・過疎化で将来性スコアは中位。",
    zh: "居住评分位居全国上游。住宅面积大和自有住房比率高是主要贡献因素。作为越光米产地，农业基础稳定。另一方面，由于大雪和过疏化，发展潜力评分处于中游。",
    en: "Housing score ranks among the top nationally, driven by spacious homes and high homeownership rates. Agricultural base is stable as a Koshihikari rice producer. However, heavy snowfall and depopulation keep the future potential score mid-tier.",
  },
  "16": {
    ja: "居住スコアが高く（71点）、医療スコアも全国上位（48点）。持ち家比率・住宅面積ともに全国トップクラス。富山の薬売り文化の名残で医療への意識も高い。経済は製造業依存。",
    zh: "居住评分很高（71分），医疗评分也位居全国上游（48分）。自有住房比率和住宅面积均为全国顶尖水平。富山的卖药文化传统使得医疗意识较高。经济依赖制造业。",
    en: "Housing score is high (71 points) and medical score is among the top nationally (48 points). Homeownership rate and housing area are both top-class. The traditional medicine-selling culture of Toyama keeps health awareness high. Economy depends on manufacturing.",
  },
  "17": {
    ja: "将来性スコアが全国上位（63点）。金沢市への大学・若者集積効果が人口動態を支えています。医療・居住も充実しており、全方位的に安定したスコア構成。",
    zh: "发展潜力评分位居全国上游（63分）。大学和年轻人向金泽的集聚效应支撑着人口动态。医疗和居住条件也很充实，各维度评分均衡稳定。",
    en: "Future potential score ranks high nationally (63 points). The concentration of universities and young people in Kanazawa supports population dynamics. Medical and housing scores are also strong, with a well-balanced overall profile.",
  },
  "18": {
    ja: "持ち家比率・住宅面積・共働き比率がすべて高い「福井モデル」が居住スコアを支えています。ただし自動車依存度が高く公共交通利便性は低め。経済スコアは高め（58点）。将来性は中位。",
    zh: "自有住房比率、住宅面积和双职工比率均高的「福井模式」支撑着居住评分。但汽车依赖度高，公共交通便利性偏低。经济评分较高（58分）。发展潜力处于中游。",
    en: "The 'Fukui Model' — high homeownership, spacious housing, and high dual-income household rates — supports the housing score. However, car dependency is high and public transit is limited. Economy score is high (58 points). Future potential is mid-tier.",
  },
  "19": {
    ja: "環境スコアが高い（76点）。富士山・南アルプスに囲まれた自然環境が犯罪率・事故率の低さに寄与。将来性は中位圏。",
    zh: "环境评分很高（76分）。被富士山和南阿尔卑斯山环绕的自然环境，促成了低犯罪率和低事故率。发展潜力处于中游水平。",
    en: "Environment score is high (76 points). The natural surroundings of Mt. Fuji and the Southern Alps contribute to low crime and accident rates. Future potential is mid-tier.",
  },
  "20": {
    ja: "環境スコアが高め（71点）。犯罪率・事故率が低く日照も豊か。農業・観光業に依存する産業構造から経済スコアは中位。移住先として全国的に人気の高い県。",
    zh: "环境评分较高（71分）。犯罪率和事故率低，日照充足。由于产业结构依赖农业和观光业，经济评分处于中游。是全国人气较高的移居目的地。",
    en: "Environment score is fairly high (71 points) with low crime and accident rates and abundant sunshine. Economy score is mid-tier due to reliance on agriculture and tourism. One of the most popular relocation destinations nationwide.",
  },
  "21": {
    ja: "居住スコアが高め（70点）。持ち家比率と住宅面積が大きく、生活コストも都市部より低い。飛騨高山など観光地として有名だが、経済は製造業（自動車系）が中心。",
    zh: "居住评分较高（70分）。自有住房比率和住宅面积大，生活成本低于城市地区。以飞驒高山等旅游地闻名，但经济以制造业（汽车系）为主。",
    en: "Housing score is fairly high (70 points). Homeownership and housing area are large, with lower living costs than urban areas. Famous for tourist spots like Hida-Takayama, but the economy centers on manufacturing (automotive).",
  },
  "22": {
    ja: "東名高速の交通事故件数が全国最高水準のため環境スコアが大きく低下。太平洋側の高降水量も影響しています。富士山周辺の自然景観はこの指数では計測されません。",
    zh: "由于东名高速公路交通事故数为全国最高水平，环境评分大幅下降。太平洋侧的高降水量也有影响。富士山周边的自然景观在本指数中无法衡量。",
    en: "The environment score drops significantly due to the highest traffic accident rates on the Tomei Expressway. High precipitation on the Pacific side also contributes. The scenic beauty around Mt. Fuji is not captured by this index.",
  },
  "23": {
    ja: "経済スコアが全国上位（51点）。トヨタを中心とした製造業が雇用・所得を支えています。将来性も高め（65点）。一方で居住コストは都市部としては高め。",
    zh: "经济评分位居全国上游（51分）。以丰田为中心的制造业支撑着就业和收入。发展潜力也较高（65分）。但作为城市地区，居住成本偏高。",
    en: "Economy score ranks high nationally (51 points). Toyota-centered manufacturing supports employment and income. Future potential is also high (65 points). However, housing costs are high for an urban area.",
  },
  "24": {
    ja: "居住・環境スコアともに平均以上で、生活コストは低め。伊勢神宮・真珠養殖・製造業が経済を支えるが、将来性は全国中位。",
    zh: "居住和环境评分均高于平均水平，生活成本较低。伊势神宫、珍珠养殖和制造业支撑着经济，但发展潜力处于全国中游。",
    en: "Both housing and environment scores are above average with low living costs. Ise Grand Shrine, pearl farming, and manufacturing support the economy, but future potential is mid-tier nationally.",
  },
  "25": {
    ja: "将来性スコアが高め（62点）。京都・大阪・名古屋の中間に位置し、ベッドタウンとして人口流入が続いています。環境・居住も充実。",
    zh: "发展潜力评分较高（62分）。位于京都、大阪和名古屋之间，作为卫星城持续吸引人口流入。环境和居住条件也很充实。",
    en: "Future potential score is fairly high (62 points). Located between Kyoto, Osaka, and Nagoya, it continues to attract population inflow as a commuter base. Environment and housing are also strong.",
  },
  "26": {
    ja: "将来性スコアが高め（71点）。多数の大学が集中し、大学数（人口10万対）が高い。医療スコアも58点と上位。一方、居住コストは高く（48点）観光地価格の影響あり。",
    zh: "发展潜力评分较高（71分）。大学集中，每10万人口的大学数量高。医疗评分也达58分，位居上游。但居住成本高（48分），受旅游地物价影响。",
    en: "Future potential score is high (71 points). Many universities are concentrated here, with high per-capita university density. Medical score is also high at 58. However, housing costs are high (48 points) due to tourist-area pricing.",
  },
  "27": {
    ja: "犯罪発生率が全国最高水準のため環境スコアが低い（54点）。経済規模は大きいものの、統計上の経済スコアは低め（37点）。将来性は高め（60点）で大阪万博効果も期待される。",
    zh: "由于犯罪发生率为全国最高水平，环境评分偏低（54分）。经济规模虽大，但统计上的经济评分偏低（37分）。发展潜力较高（60分），也期待大阪世博会的带动效应。",
    en: "Environment score is low (54 points) due to the highest crime rate nationally. Despite its large economic scale, the statistical economy score is low (37 points). Future potential is fairly high (60 points), with expected Osaka Expo benefits.",
  },
  "28": {
    ja: "経済スコアが低め（27点）。神戸市の工業・港湾機能は強力だが、大阪依存の就業構造が求人倍率を下げています。医療スコアは高め（42点）で六甲山系の環境も評価。",
    zh: "经济评分偏低（27分）。神户市的工业和港口功能强大，但依赖大阪的就业结构拉低了求人倍率。医疗评分较高（42分），六甲山系的环境也获得好评。",
    en: "Economy score is low (27 points). Kobe's industrial and port functions are strong, but the employment structure's dependence on Osaka drags down the job ratio. Medical score is fairly high (42 points), and the Rokko mountain range environment is well-regarded.",
  },
  "29": {
    ja: "保育所等数（0〜5歳人口比）が全国最低水準のため医療・教育スコアに影響。大阪・京都のベッドタウンとして機能しているが、子育てインフラの整備が課題として表れています。",
    zh: "保育所数量（0至5岁人口比）为全国最低水平，影响了医疗与教育评分。虽然作为大阪和京都的卫星城发挥着功能，但育儿基础设施的完善成为显著课题。",
    en: "The number of childcare facilities (per 0-5 year-old population) is the lowest nationally, affecting the health & education score. While functioning as a commuter town for Osaka and Kyoto, childcare infrastructure remains a clear challenge.",
  },
  "30": {
    ja: "環境スコアが全国最高水準（81点）。日照時間が長く犯罪率も低い。ただし医療・教育インフラは人口密度の低さから中位以下。将来性は低め（28点）で人口流出が続いています。",
    zh: "环境评分为全国最高水平（81分）。日照时间长，犯罪率低。但由于人口密度低，医疗和教育基础设施处于中游以下。发展潜力偏低（28分），人口外流持续。",
    en: "Environment score is the highest nationally (81 points) with long sunshine hours and low crime. However, medical and educational infrastructure is below average due to low population density. Future potential is low (28 points) with ongoing population outflow.",
  },
  "31": {
    ja: "人口は全国最少クラスだが、スコアは全方位的に均衡。医療・居住ともに中位で、農業・観光・ITサテライトオフィスなど多様な産業基盤を持つ。将来性は低め（28点）。",
    zh: "人口为全国最少级别，但各维度评分均衡。医疗和居住均处于中游，拥有农业、观光和IT卫星办公室等多样化的产业基础。发展潜力偏低（28分）。",
    en: "Population is among the smallest nationally, but scores are well-balanced across all dimensions. Medical and housing are both mid-tier, with a diverse industrial base including agriculture, tourism, and IT satellite offices. Future potential is low (28 points).",
  },
  "32": {
    ja: "人口10万人規模の小県ながら経済スコアは全国上位。求職者が少ないため有効求人倍率が高止まりしており、経済指標を押し上げています。",
    zh: "虽然是人口约10万规模的小县，但经济评分位居全国上游。由于求职者少，有效求人倍率居高不下，推高了经济指标。",
    en: "Despite being a small prefecture with a population of about 100,000, the economy score ranks high nationally. With few job seekers, the job-to-applicant ratio remains elevated, boosting economic indicators.",
  },
  "33": {
    ja: "全方位的に均衡したスコア構成。岡山市・倉敷市が経済・医療を牽引し、山陰山陽の中でも比較的安定した人口動態を維持。晴れの国として日照時間も十分。",
    zh: "各维度评分均衡。冈山市和仓敷市牵引着经济和医疗，在山阴山阳地区中维持着相对稳定的人口动态。作为「晴天之国」，日照时间充足。",
    en: "Well-balanced scores across all dimensions. Okayama and Kurashiki cities drive economy and medical services, maintaining relatively stable demographics within the San'in-San'yō region. Known as the 'Sunny Country' with ample sunshine.",
  },
  "34": {
    ja: "経済・医療・環境がバランスよく揃った中国地方の拠点県。広島市の都市機能が全体スコアを押し上げています。将来性は中位で移住先としての人気も高い。",
    zh: "经济、医疗和环境均衡发展的中国地方核心县。广岛市的城市功能推高了整体评分。发展潜力处于中游，作为移居目的地的人气也很高。",
    en: "A hub prefecture in the Chūgoku region with well-balanced economy, medical, and environment scores. Hiroshima City's urban functions boost the overall score. Future potential is mid-tier, and it's popular as a relocation destination.",
  },
  "35": {
    ja: "経済スコアが高め（52点）。山口県の工業集積（化学・半導体）が所得水準を支えています。将来性は低め（33点）で急速な高齢化が課題。",
    zh: "经济评分较高（52分）。山口县的工业集聚（化学和半导体）支撑着收入水平。发展潜力偏低（33分），快速老龄化是主要课题。",
    en: "Economy score is fairly high (52 points). Yamaguchi's industrial cluster (chemicals, semiconductors) supports income levels. Future potential is low (33 points), with rapid aging as the main challenge.",
  },
  "36": {
    ja: "医療スコアが高め（69点）。徳島大学医学部を中心に医師・病院の人口当たり密度が高い。経済は中位だが居住・環境スコアも上位圏。",
    zh: "医疗评分较高（69分）。以德岛大学医学部为中心，每人口医生和医院密度高。经济处于中游，但居住和环境评分也位居上游。",
    en: "Medical score is fairly high (69 points). Centered on Tokushima University's medical school, per-capita doctor and hospital density is high. Economy is mid-tier, but housing and environment scores also rank well.",
  },
  "37": {
    ja: "全体的に均衡したスコア。香川県は面積最小の都道府県であり、都市インフラが密集して効率的。医療アクセスも良好。将来性は低め（33点）で若者の県外流出が課題。",
    zh: "整体评分均衡。香川县是面积最小的都道府县，城市基础设施密集高效。医疗可及性良好。发展潜力偏低（33分），年轻人的外流是课题。",
    en: "Overall scores are well-balanced. Kagawa is the smallest prefecture by area, with densely concentrated and efficient urban infrastructure. Medical access is good. Future potential is low (33 points) with youth outflow as a challenge.",
  },
  "38": {
    ja: "環境・居住スコアは中位。愛媛は柑橘農業・造船業で経済基盤を持つが、将来性は全国下位（23点）で過疎化・高齢化が最も顕著な県のひとつ。",
    zh: "环境和居住评分处于中游。爱媛以柑橘农业和造船业为经济基础，但发展潜力位居全国下游（23分），是过疏化和老龄化最为显著的县之一。",
    en: "Environment and housing scores are mid-tier. Ehime has an economic base in citrus farming and shipbuilding, but future potential ranks near the bottom (23 points) — one of the most prominent depopulation and aging prefectures.",
  },
  "39": {
    ja: "人口10万対の病院数・医師数で全国最高水準。県の人口が少ない分、人均数値が高くなっています。",
    zh: "每10万人口的医院和医生数量为全国最高水平。由于县人口较少，人均数值相应较高。",
    en: "Hospital and doctor counts per 100K population are the highest nationwide. The small population of the prefecture results in high per-capita figures.",
  },
  "40": {
    ja: "経済スコアが全国下位（29点）。福岡市は九州の経済首都として機能しているが、統計上の賃金水準・求人倍率は首都圏に及ばず。将来性は高め（58点）で若者人口の流入が続いています。",
    zh: "经济评分位居全国下游（29分）。福冈市作为九州的经济首都发挥着功能，但统计上的工资水平和求人倍率不及首都圈。发展潜力较高（58分），年轻人口持续流入。",
    en: "Economy score ranks low nationally (29 points). Fukuoka City functions as Kyushu's economic capital, but statistical wage levels and job ratios fall short of the Tokyo metro area. Future potential is high (58 points) with ongoing youth population inflow.",
  },
  "41": {
    ja: "大学数（人口10万対）が統計上の最低値のため将来性スコアが低め。農業・製造業が主産業で居住コストは低い。医療スコアは中位圏。",
    zh: "每10万人口的大学数量为统计上的最低值，发展潜力评分偏低。农业和制造业为主要产业，居住成本低。医疗评分处于中游。",
    en: "The number of universities per 100K population is the statistical lowest, keeping future potential score low. Agriculture and manufacturing are the main industries with low housing costs. Medical score is mid-tier.",
  },
  "42": {
    ja: "医療スコアが高め（54点）。離島を多く抱えるため島嶼医療の整備が進んでおり、人口当たり医療資源が充実。将来性は低め（29点）で離島部を中心に過疎化が深刻。",
    zh: "医疗评分较高（54分）。由于拥有众多离岛，岛屿医疗体系建设完善，人均医疗资源充实。发展潜力偏低（29分），以离岛为中心的过疏化问题严重。",
    en: "Medical score is fairly high (54 points). With many remote islands, island medical infrastructure is well-developed, resulting in rich per-capita medical resources. Future potential is low (29 points) with severe depopulation centered on the islands.",
  },
  "43": {
    ja: "全方位的に中位圏で安定したスコア構成。熊本地震からの復興が進み、TSMCの熊本進出で将来性スコアも今後改善が期待されますが、現在のデータ年度では反映されていません。",
    zh: "各维度评分均处于中游水平，构成稳定。熊本地震后的重建持续推进，TSMC进驻熊本有望改善发展潜力评分，但在当前数据年度中尚未体现。",
    en: "Scores are stably mid-tier across all dimensions. Post-earthquake recovery is progressing, and TSMC's Kumamoto entry is expected to improve future potential, but this is not yet reflected in the current data year.",
  },
  "44": {
    ja: "環境スコアが高め（78点）。温泉・自然景観が豊かで犯罪率・事故率も低い。「おんせん県おおいた」の豊かな自然は犯罪・事故の低さとして統計に現れています。",
    zh: "环境评分较高（78分）。温泉和自然景观丰富，犯罪率和事故率也低。「温泉县大分」丰富的自然资源，体现为统计上的低犯罪率和低事故率。",
    en: "Environment score is high (78 points). Rich in hot springs and natural scenery with low crime and accident rates. Oita's abundant nature as the 'Onsen Prefecture' is reflected statistically in low crime and accident figures.",
  },
  "45": {
    ja: "居住・環境スコアは中位。宮崎は農業・観光が主産業で生活コストは低め。将来性は中位（37点）で移住促進施策が注目されています。",
    zh: "居住和环境评分处于中游。宫崎以农业和观光为主要产业，生活成本较低。发展潜力处于中游（37分），移居促进政策备受关注。",
    en: "Housing and environment scores are mid-tier. Miyazaki's main industries are agriculture and tourism with low living costs. Future potential is mid-tier (37 points), with relocation promotion policies drawing attention.",
  },
  "46": {
    ja: "居住・医療スコアは中位。薩摩・大隅の農業県として食料自給率は高いが、経済・将来性は低め。屋久島・奄美などの離島の豊かさはこの指数では計測されません。",
    zh: "居住和医疗评分处于中游。作为萨摩和大隅的农业县，粮食自给率高，但经济和发展潜力偏低。屋久岛和奄美等离岛的丰富资源在本指数中无法衡量。",
    en: "Housing and medical scores are mid-tier. As an agricultural prefecture (Satsuma/Ōsumi), food self-sufficiency is high, but economy and future potential are low. The richness of remote islands like Yakushima and Amami is not captured by this index.",
  },
  "47": {
    ja: "政府統計で計測できる指標（経済・居住・医療）はいずれも最下位水準。ただしこの指数は、自然景観・文化的豊かさ・生活スタイルの質を計測することができません。",
    zh: "政府统计可衡量的指标（经济、居住、医疗）均为最低水平。但本指数无法衡量自然景观、文化丰富度和生活方式的质量。",
    en: "Government-measurable indicators (economy, housing, medical) all rank at the bottom. However, this index cannot measure natural scenery, cultural richness, or quality of lifestyle.",
  },
};

function refreshDetailPanel() {
  const s = scoreData.find(d => d.pref_code === selectedPref);
  if (!s) return;
  const rankSuffix = t("rank_label");
  document.getElementById("detail-name").textContent =
    `${getPrefName(s.pref_name)} — #${s.rank}${rankSuffix} (${s.total_score.toFixed(1)})`;
  const noteObj = PREF_NOTES[selectedPref];
  const prefNote = noteObj && noteObj[window.currentLang || "ja"];
  document.getElementById("detail-dims").innerHTML = DIMS.map(dim => {
    const val = Math.round(s[`dim_${dim}`] || 0);
    return `
      <div class="dim-row">
        <span class="dim-label">
          ${getDimLabel(dim)}
          <button class="dim-info-btn" onclick="showMethodModal('${dim}')" title="指標の詳細" aria-label="${dim}の詳細">ℹ</button>
        </span>
        <div class="dim-bar-bg">
          <div class="dim-bar-fill" style="width:${val}%;background:${DIM_COLORS[dim]}"></div>
        </div>
        <span class="dim-val">${val}</span>
      </div>`;
  }).join("") + (prefNote ? `
    <div style="margin-top:0.8rem;padding:0.55rem 0.7rem;background:rgba(192,24,43,0.05);border-left:3px solid var(--accent);border-radius:0 4px 4px 0;font-size:0.78rem;color:var(--text);line-height:1.55">
      ${prefNote}
    </div>` : "");
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
      .attr("fill", "none").attr("stroke", "#ddd8cf").attr("stroke-width", 0.5);
  });

  // Axis lines and labels
  DIMS.forEach((dim, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const x2 = cx + maxR * Math.cos(angle);
    const y2 = cy + maxR * Math.sin(angle);
    svg.append("line").attr("x1", cx).attr("y1", cy).attr("x2", x2).attr("y2", y2)
      .attr("stroke", "#ddd8cf").attr("stroke-width", 0.5);
    const lx = cx + (maxR + 16) * Math.cos(angle);
    const ly = cy + (maxR + 16) * Math.sin(angle);
    svg.append("text").attr("x", lx).attr("y", ly)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#797060").attr("font-size", "8").text(getDimLabel(dim));
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
    .attr("fill", "rgba(26,82,160,0.12)").attr("stroke", "#1a52a0").attr("stroke-width", 1.5);

  // Prefecture 2 (comparison)
  if (s2) {
    svg.append("path").attr("d", makePath(s2))
      .attr("fill", "rgba(192,24,43,0.10)").attr("stroke", "#c0182b").attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3");
  }

  // Legend
  const legendY = size - 10;
  svg.append("circle").attr("cx", 10).attr("cy", legendY).attr("r", 4)
    .attr("fill", "#1a52a0");
  svg.append("text").attr("x", 18).attr("y", legendY + 1)
    .attr("fill", "#1c1a16").attr("font-size", "8").attr("dominant-baseline", "middle")
    .text(s1.pref_name);
  if (s2) {
    const offset = s1.pref_name.length * 9 + 26;
    svg.append("circle").attr("cx", offset).attr("cy", legendY).attr("r", 4)
      .attr("fill", "#c0182b");
    svg.append("text").attr("x", offset + 8).attr("y", legendY + 1)
      .attr("fill", "#1c1a16").attr("font-size", "8").attr("dominant-baseline", "middle")
      .text(s2.pref_name);
  }

  if (!s2) {
    svg.append("text").attr("x", cx).attr("y", size - 4)
      .attr("text-anchor", "middle").attr("fill", "#797060").attr("font-size", "7")
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
  updateHeroBanner(scoreData);
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

// ─── スクリーンショット（html2canvas — map + sidebar） ──────
async function takeScreenshot() {
  try {
    const target = document.querySelector(".layout");
    const canvas = await html2canvas(target, {
      backgroundColor: "#f7f4ef",
      scale: 2,
      useCORS: true,
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
  }
}

// ─── URL パラメータ共有 ──────────────────────────────
function encodeStateToURL() {
  const params = new URLSearchParams();
  const w = DIMS.map(d => Math.round(currentWeights[d] * 100)).join(",");
  params.set("w", w);
  if (selectedPref) params.set("p", selectedPref);
  if (drillPref) params.set("drill", drillPref);
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
  // drill パラメータは _pendingDrill に格納（loadData 後に実行）
  const drill = params.get("drill");
  if (drill) window._pendingDrill = drill;
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

/** 都道府県の市区町村 GeoJSON を遅延読み込み（フル解像度・未使用） */
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

/** 簡略化済み GeoJSON を遅延読み込み（Leaflet 用） */
async function ensureCityGeoSimple(prefCode) {
  if (simpleGeoCache[prefCode]) return simpleGeoCache[prefCode];
  try {
    const res = await fetch(`data/cities_simple/${prefCode}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const geojson = await res.json();
    simpleGeoCache[prefCode] = geojson;
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

/** 都道府県をドリルダウン（Leaflet 市区町村ビューへ遷移） */
async function drillDown(prefCode) {
  if (!prefCode) return;

  const [scoresOk, geo] = await Promise.all([
    ensureCityScores(),
    ensureCityGeoSimple(prefCode),
  ]);
  if (!scoresOk) return;
  if (!geo || !geo.features || geo.features.length === 0) {
    showToast("市区町村境界データが見つかりません。scripts/simplify_city_geo.py を実行してください", 4000);
    return;
  }

  drillPref = prefCode;

  // 市区町村スコアを計算
  const citiesForPref = cityRawData.filter(c => c.pref_code === prefCode);
  cityScoreData = recomputeCityScores(citiesForPref);
  cityScoreMap = Object.fromEntries(cityScoreData.map(d => [d.city_code, d]));

  // D3 SVG を隠して Leaflet を表示
  document.getElementById("map").style.visibility = "hidden";
  const leafletDiv = document.getElementById("city-leaflet-map");
  leafletDiv.style.display = "block";

  // Leaflet マップを初回のみ初期化
  if (!leafletMap) {
    leafletMap = L.map("city-leaflet-map", { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 14,
    }).addTo(leafletMap);
  }
  // 表示直後にサイズ再計算（非表示→表示の切り替え後に必要）
  leafletMap.invalidateSize();

  // 既存の市区町村レイヤーを削除
  if (leafletCityLayer) { leafletMap.removeLayer(leafletCityLayer); leafletCityLayer = null; }
  leafletLayerMap = {};

  // カラースケール
  const scores = cityScoreData.map(d => d.total_score).filter(s => s != null);
  const cityColorScale = d3.scaleQuantile()
    .domain(scores)
    .range(["#fef3e2", "#fbd78a", "#f4a44a", "#e8652a", "#c0182b"]);

  // GeoJSON レイヤーを追加
  leafletCityLayer = L.geoJSON(geo, {
    style: f => {
      const code = getCityCode(f.properties);
      const s = code ? cityScoreMap[code] : null;
      return {
        fillColor: s ? cityColorScale(s.total_score) : "#e8e4de",
        fillOpacity: 0.82,
        color: "#b0a090",
        weight: 0.7,
      };
    },
    onEachFeature: (f, layer) => {
      const code = getCityCode(f.properties);
      if (!code) return;
      leafletLayerMap[code] = layer;
      const s = cityScoreMap[code];
      if (s) {
        layer.bindTooltip(
          `<b>${s.city_name}</b><br>${s.total_score.toFixed(1)}pt &nbsp;#${s.rank_in_pref}`,
          { sticky: true, className: "city-tooltip" }
        );
      }
      layer.on("click", () => _selectCity(code));
    },
  }).addTo(leafletMap);

  // 都道府県全体にフィット（離島除外クリップ済み境界、レイアウト確定後）
  const _fitBounds = _computeClippedBounds(geo);
  setTimeout(() => {
    leafletMap.invalidateSize();
    leafletMap.fitBounds(_fitBounds, { padding: [24, 24] });
  }, 200);

  // サイドバーを市区町村ランキングに切替
  document.getElementById("drill-back").style.display = "flex";
  _renderCityRankList();

  // URL 更新
  history.replaceState(null, "", encodeStateToURL());
}

/** 都道府県ビューに戻る */
function drillBack() {
  drillPref = null;
  cityScoreData = [];
  cityScoreMap = {};
  leafletLayerMap = {};

  // Leaflet レイヤーを削除
  if (leafletCityLayer && leafletMap) {
    leafletMap.removeLayer(leafletCityLayer);
    leafletCityLayer = null;
  }

  // Leaflet を隠して D3 SVG を復元
  document.getElementById("city-leaflet-map").style.display = "none";
  document.getElementById("map").style.visibility = "visible";

  // ズームリセット
  resetMapZoom();

  // UI 復元
  document.getElementById("drill-back").style.display = "none";
  document.getElementById("detail-empty").style.display = "block";
  document.getElementById("detail-content").classList.remove("show");
  const drillBtn = document.getElementById("detail-drill-btn");
  if (drillBtn) drillBtn.style.display = "none";
  selectedPref = null;
  d3.selectAll(".prefecture").classed("selected", false);
  renderRankList();

  // URL 更新
  history.replaceState(null, "", encodeStateToURL());
}

/** 都道府県境界にズーム（通常用途：都道府県 TopoJSON 境界から算出） */
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

// _renderCityLayer は Leaflet ベースの drillDown() に統合済み

/**
 * 離島チェーン除外のためのクリップ済み Leaflet LatLngBounds を計算。
 * 各フィーチャの重心座標を 10%〜90% 分位数でクリップし、小笠原・奄美などを除外。
 */
function _computeClippedBounds(geo) {
  const centroids = geo.features.map(f => {
    const lons = [], lats = [];
    const collect = c => Array.isArray(c[0]) ? c.forEach(collect) : (lons.push(c[0]), lats.push(c[1]));
    collect(f.geometry.coordinates);
    return [
      lons.reduce((a, b) => a + b, 0) / lons.length,
      lats.reduce((a, b) => a + b, 0) / lats.length,
    ];
  });

  const lons = centroids.map(c => c[0]).sort((a, b) => a - b);
  const lats = centroids.map(c => c[1]).sort((a, b) => a - b);
  const n = lons.length;
  const lo = Math.max(0, Math.floor(n * 0.10));
  const hi = Math.min(n - 1, Math.floor(n * 0.90));

  const padLon = Math.max((lons[hi] - lons[lo]) * 0.15, 0.08);
  const padLat = Math.max((lats[hi] - lats[lo]) * 0.15, 0.08);

  return L.latLngBounds(
    [lats[lo] - padLat, lons[lo] - padLon],
    [lats[hi] + padLat, lons[hi] + padLon]
  );
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
    <div style="padding:0.45rem 0.7rem 0.5rem;background:rgba(176,120,24,0.07);border-left:3px solid #b07818;font-size:0.74rem;color:var(--muted);line-height:1.5;margin-bottom:0.3rem">
      市区町村スコア: 将来性・居住利便性・医療教育・環境安全の4次元（e-Stat 市区町村統計。居住コストは一部地域のみ）
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

  // Leaflet レイヤーのハイライト
  Object.entries(leafletLayerMap).forEach(([code, layer]) => {
    if (code === cityCode) {
      layer.setStyle({ color: "#c0182b", weight: 2.5, fillOpacity: 0.95 });
      layer.bringToFront();
    } else {
      layer.setStyle({ color: "#b0a090", weight: 0.7, fillOpacity: 0.82 });
    }
  });

  // サイドバーハイライト
  document.querySelectorAll(".rank-item").forEach(el => {
    el.style.background = el.dataset.code === cityCode
      ? "rgba(192,24,43,0.07)" : "";
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
  colorScale = d3.scaleLinear()
    .domain([Math.min(...scores), (Math.min(...scores) + Math.max(...scores)) / 2, Math.max(...scores)])
    .range(["#fef3e2", "#f4a060", "#c0182b"]);

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
        return s ? colorScale(s.total_score) : "#e8e4de";
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

// ─── ヒーローバナー ──────────────────────────────────
/** Hero Banner にデータ発見を表示（ローテーション付き） */
function updateHeroBanner(data) {
  if (!data || data.length === 0) return;

  // ドット ナビゲーションを構築
  const dotsEl = document.getElementById("hero-dots");
  if (dotsEl) {
    dotsEl.innerHTML = DATA_DISCOVERIES.map((_, i) =>
      `<span class="hero-dot${i === heroIndex ? " active" : ""}" onclick="heroGoTo(${i})"></span>`
    ).join("");
  }

  _renderHeroDiscovery(data, heroIndex);
  document.getElementById("hero-banner").classList.add("show");

  // タイマー設定（8秒ごとに次の発見へ）
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    heroIndex = (heroIndex + 1) % DATA_DISCOVERIES.length;
    _fadeHeroTo(data, heroIndex);
  }, 8000);
}

function _renderHeroDiscovery(data, idx) {
  const raw = DATA_DISCOVERIES[idx];
  const lang = window.currentLang || "ja";

  // 動的エントリの場合は fn() で解決
  let disc;
  if (raw.dynamic && typeof raw.fn === "function") {
    disc = raw.fn(data);
  } else {
    disc = raw;
  }

  const entry = data.find(d => d.pref_code === disc.pref_code);
  const rank = entry ? entry.rank : "—";

  document.getElementById("hero-rank").textContent = `#${rank}`;
  document.getElementById("hero-name").textContent = entry ? getPrefName(entry.pref_name) : (disc.pref_code || "");
  document.getElementById("hero-score").textContent = entry ? entry.total_score.toFixed(1) + "pt" : "";
  document.getElementById("hero-insight").textContent = disc.label[lang] || disc.label.ja;

  // ドット更新
  document.querySelectorAll(".hero-dot").forEach((el, i) =>
    el.classList.toggle("active", i === idx)
  );
}

function _fadeHeroTo(data, idx) {
  const banner = document.getElementById("hero-banner");
  banner.classList.add("hero-fade");
  setTimeout(() => {
    _renderHeroDiscovery(data, idx);
    banner.classList.remove("hero-fade");
    banner.classList.add("hero-fade-in");
    setTimeout(() => banner.classList.remove("hero-fade-in"), 400);
  }, 300);
}

function heroGoTo(idx) {
  if (idx === heroIndex) return;
  heroIndex = idx;
  if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
  _fadeHeroTo(scoreData, idx);
  // タイマー再起動
  heroTimer = setInterval(() => {
    heroIndex = (heroIndex + 1) % DATA_DISCOVERIES.length;
    _fadeHeroTo(scoreData, heroIndex);
  }, 8000);
}

function dismissHero() {
  if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
  document.getElementById("hero-banner").classList.remove("show");
}

// ─── 方法論モーダル ──────────────────────────────────
const DIM_DETAIL = {
  "経済・労働": {
    title: "経済・労働",
    color: "#1a52a0",
    indicators: [
      { name: "県民所得（一人当たり）", source: "内閣府 県民経済計算", year: "2021", note: "高いほど高スコア" },
      { name: "完全失業率", source: "総務省 労働力調査", year: "2020", note: "低いほど高スコア（逆転）" },
      { name: "有効求人倍率", source: "厚生労働省 職業安定業務統計", year: "2022", note: "高いほど高スコア" },
      { name: "月間実労働時間（男女平均）", source: "厚生労働省 毎月勤労統計調査", year: "2024", note: "短いほど高スコア（逆転）" },
    ],
    why: "所得・雇用の量に加え、労働時間（ワークライフバランス）も評価。長時間労働地域はペナルティを受ける。",
  },
  "居住・利便性": {
    title: "居住・利便性",
    color: "#2d7040",
    indicators: [
      { name: "自動車保有台数（公共交通依存度の代理）", source: "自動車検査登録情報協会", year: "2014", note: "低いほど高スコア（逆転）— ⚠ e-Stat上の最終取得年度" },
      { name: "持ち家比率", source: "総務省 住宅・土地統計調査", year: "2023", note: "高いほど高スコア" },
      { name: "住宅延べ面積（一人当たり）", source: "総務省 住宅・土地統計調査", year: "2023", note: "広いほど高スコア" },
      { name: "家賃（1畳当たり）", source: "総務省 住宅・土地統計調査", year: "2024", note: "低いほど高スコア（逆転）" },
      { name: "消費者物価地域差指数（家賃除く）", source: "総務省 小売物価統計調査", year: "2024", note: "低いほど高スコア（逆転）" },
      { name: "第3次産業就業者割合", source: "総務省 国勢調査（F表 F01203）", year: "2020", note: "高いほど高スコア — 商業・サービス集積の代理指標" },
      { name: "都市部通勤者割合", source: "総務省 国勢調査（F表 F02701）", year: "2020", note: "高いほど高スコア — 公共交通利便性の代理指標" },
    ],
    why: "住居の広さ・所有安定性・家賃・全体物価・公共交通利便性・商業集積度を統合評価。※ 自動車保有台数・都市部通勤者割合を公共交通の代理指標として採用しているため、このスコアは都市型ライフスタイルを重視する傾向があります。農村・島嶼部では公共交通不足が車依存を生む地理的制約を反映しているため、不利になりやすい点に注意してください。",
  },
  "環境・安全": {
    title: "環境・安全",
    color: "#b07818",
    indicators: [
      { name: "年間日照時間", source: "気象庁 気象統計", year: "2024", note: "長いほど高スコア" },
      { name: "年間降水量", source: "気象庁 気象統計", year: "2024", note: "少ないほど高スコア（逆転）" },
      { name: "犯罪発生率（人口10万対）", source: "警察庁 犯罪統計", year: "2023", note: "低いほど高スコア（逆転）" },
      { name: "交通事故発生率（人口10万対）", source: "警察庁 交通統計", year: "2024", note: "低いほど高スコア（逆転）" },
    ],
    why: "気候の快適さと日常安全性を統合。どちらも生活環境の基盤として居住判断に直接影響する。",
  },
  "医療・教育": {
    title: "医療・教育",
    color: "#c0182b",
    indicators: [
      { name: "病院数（人口10万対）", source: "厚生労働省 医療施設調査", year: "2023", note: "多いほど高スコア" },
      { name: "医師数（人口10万対）", source: "厚生労働省 医師・歯科医師・薬剤師統計", year: "2022", note: "多いほど高スコア" },
      { name: "保育所等数（0〜5歳人口10万対）", source: "文部科学省 学校基本調査", year: "2020", note: "多いほど高スコア — 子育て支援の代理指標" },
      { name: "高等学校卒業者の大学進学率", source: "文部科学省 学校基本調査", year: "2023", note: "高いほど高スコア — 地域の教育機会" },
    ],
    why: "医療アクセス・子育て支援・教育機会を統合。ライフステージを問わず居住地選択の核心となる要素。",
  },
  "将来性": {
    title: "将来性",
    color: "#6d3db0",
    indicators: [
      { name: "人口増減率", source: "総務省 住民基本台帳", year: "2023", note: "増加ほど高スコア" },
      { name: "高齢化率（65歳以上割合）", source: "総務省 統計局 e-Stat", year: "2024", note: "低いほど高スコア（逆転）" },
      { name: "大学数（人口10万対）", source: "文部科学省 学校基本調査", year: "2024", note: "多いほど高スコア — 知的産業基盤・若者定着の先行指標" },
    ],
    why: "地域の持続可能性・活力を測定。大学密度は若者・高度人材定着と産業高度化の先行指標として採用。",
  },
};

function showMethodModal(dim) {
  const detail = DIM_DETAIL[dim];
  if (!detail) return;
  document.getElementById("method-modal-title").innerHTML =
    `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${detail.color};margin-right:6px"></span>${detail.title}`;
  document.getElementById("method-modal-body").innerHTML = `
    <p style="color:var(--muted);font-size:0.82rem;margin-bottom:0.8rem">${detail.why}</p>
    <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:0.3rem 0.4rem;color:var(--muted)">指標</th>
          <th style="text-align:left;padding:0.3rem 0.4rem;color:var(--muted)">出典</th>
          <th style="text-align:left;padding:0.3rem 0.4rem;color:var(--muted)">年度</th>
          <th style="text-align:left;padding:0.3rem 0.4rem;color:var(--muted)">方向</th>
        </tr>
      </thead>
      <tbody>
        ${detail.indicators.map(ind => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.35rem 0.4rem">${ind.name}</td>
            <td style="padding:0.35rem 0.4rem;color:var(--muted)">${ind.source}</td>
            <td style="padding:0.35rem 0.4rem;color:var(--muted)">${ind.year}</td>
            <td style="padding:0.35rem 0.4rem;color:var(--muted)">${ind.note}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <p style="color:var(--muted);font-size:0.75rem;margin-top:1rem;padding-top:0.8rem;border-top:1px solid var(--border);line-height:1.6">
      各指標はmin-max正規化（0〜100）で標準化し、同一次元内の指標を等重平均で集計しています。
      複数年度のデータが混在しているため、絶対値ではなく都道府県間の相対比較としてご利用ください。
      データ出典: e-Stat（政府統計の総合窓口）・気象庁・警察庁。都道府県単位の集計値であり、市区町村・都市部の評価ではありません。
    </p>`;
  document.getElementById("method-modal").classList.add("show");
}

function closeMethodModal() {
  document.getElementById("method-modal").classList.remove("show");
}

// ─── スクリーンショットモード ────────────────────────
async function enterScreenshotMode() {
  document.body.classList.add("screenshot-mode");
  await takeScreenshot();
  document.body.classList.remove("screenshot-mode");
}

function exitScreenshotMode() {
  document.body.classList.remove("screenshot-mode");
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
  updateHeroBanner(scoreData);
  // 言語初期化（保存済み言語を反映）
  if (typeof setLanguage === "function") {
    setLanguage(window.currentLang || "ja");
  } else {
    renderWeightPanel();
    renderRankList();
  }
  loadMap();

  // URL パラメータで指定された都道府県を選択 / ドリルダウンを復元
  if (window._pendingDrill) {
    const drill = window._pendingDrill;
    window._pendingDrill = null;
    setTimeout(() => drillDown(drill), 300);
  } else if (selectedPref) {
    setTimeout(() => selectPref(selectedPref), 100);
  }
}

// ─── 起動 ────────────────────────────────────────────
loadData();
