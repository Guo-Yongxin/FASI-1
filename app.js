import { modelData } from "./data/model-data.js";
import {
  makeSurvivalCurve,
  predictFastiOsFromRaw,
  riskGroupFromLp,
} from "./model.js";

const form = document.getElementById("risk-form");
const intervalSummary = document.getElementById("interval-summary");
const statusMessage = document.getElementById("status-message");
const resultsSection = document.getElementById("results-section");
const resultCards = document.getElementById("result-cards");
const chartContainer = document.getElementById("chart-container");
const calculationDetails = document.getElementById("calculation-details");
const fields = {
  age: form.elements.namedItem("age"),
  smoke: form.elements.namedItem("smoke"),
  stage: form.elements.namedItem("stage"),
  p16: form.elements.namedItem("p16"),
  rtStartDate: form.elements.namedItem("rtStartDate"),
  rtEndDate: form.elements.namedItem("rtEndDate"),
  preBloodDate: form.elements.namedItem("preBloodDate"),
  postBloodDate: form.elements.namedItem("postBloodDate"),
  hbPre: form.elements.namedItem("hbPre"),
  albPre: form.elements.namedItem("albPre"),
  lyPre: form.elements.namedItem("lyPre"),
  moPre: form.elements.namedItem("moPre"),
  albPost: form.elements.namedItem("albPost"),
  lyPost: form.elements.namedItem("lyPost"),
  moPost: form.elements.namedItem("moPost"),
};

const smokeLabels = {
  "0": "Never",
  "1": "Current",
  "2": "Former",
};

const stageLabels = {
  "1": "Stage I-II",
  "2": "Stage III-IV",
};

const p16Labels = {
  "0": "Negative",
  "1": "Positive",
  "2": "Not tested",
};

function parseDateInput(value) {
  return new Date(`${value}T00:00:00`);
}

function diffDays(startValue, endValue) {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  const diff = end.getTime() - start.getTime();
  return Math.round(diff / 86400000);
}

function formatFixed(value, digits = 4) {
  return Number(value).toFixed(digits);
}

function formatPercent(value, digits = 2) {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function setStatus(message, tone = "info") {
  statusMessage.className = `status-box ${tone === "error" ? "status-error" : "status-info"}`;
  statusMessage.innerHTML = message;
  statusMessage.classList.remove("is-hidden");
}

function updateIntervalSummary() {
  const intervalPost = diffDays(fields.rtEndDate.value, fields.postBloodDate.value);
  const dt = diffDays(fields.preBloodDate.value, fields.postBloodDate.value);
  intervalSummary.innerHTML = `interval_post*: <strong>${intervalPost}</strong> days<br />Blood sampling interval: <strong>${dt}</strong> days`;
}

function getRawInputValues() {
  const intervalPost = diffDays(fields.rtEndDate.value, fields.postBloodDate.value);
  const dt = diffDays(fields.preBloodDate.value, fields.postBloodDate.value);
  return {
    p16: fields.p16.value,
    Stage0: fields.stage.value,
    Age: Number(fields.age.value),
    Smoke: fields.smoke.value,
    interval_post: intervalPost,
    dt,
    HB_pre: Number(fields.hbPre.value),
    ALB_pre: Number(fields.albPre.value),
    ALB_post: Number(fields.albPost.value),
    LY_pre: Number(fields.lyPre.value),
    LY_post: Number(fields.lyPost.value),
    MO_pre: Number(fields.moPre.value),
    MO_post: Number(fields.moPost.value),
  };
}

function buildResultCard(label, value, color = "#0f172a") {
  return `
    <article class="result-card">
      <div class="result-card-label">${label}</div>
      <div class="result-card-value" style="color:${color};">${value}</div>
    </article>
  `;
}

function linePath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function renderChart(curve, prediction, riskColor) {
  const width = 980;
  const height = 560;
  const margin = { top: 30, right: 28, bottom: 72, left: 86 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMax = 120;

  const xScale = (value) => margin.left + (value / xMax) * plotWidth;
  const yScale = (value) => margin.top + (1 - value) * plotHeight;

  const path = linePath(curve.map((point) => ({ x: xScale(point.time), y: yScale(point.survival) })));
  const xTicks = Array.from({ length: 11 }, (_, index) => index * 12);
  const yTicks = Array.from({ length: 6 }, (_, index) => index * 0.2);
  const markers = [
    { label: "3y / 5y", x: 36, y: 1 - prediction.OSrisk36 },
    { label: "3y / 5y", x: 60, y: 1 - prediction.OSrisk60 },
  ];

  chartContainer.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Individual overall survival curve">
      ${xTicks
        .map(
          (tick) => `
            <line class="grid-line" x1="${xScale(tick)}" y1="${margin.top}" x2="${xScale(tick)}" y2="${margin.top + plotHeight}" />
            <text class="axis-tick" x="${xScale(tick)}" y="${height - margin.bottom + 28}" text-anchor="middle">${tick}</text>
          `
        )
        .join("")}
      ${yTicks
        .map(
          (tick) => `
            <line class="grid-line" x1="${margin.left}" y1="${yScale(tick)}" x2="${margin.left + plotWidth}" y2="${yScale(tick)}" />
            <text class="axis-tick" x="${margin.left - 16}" y="${yScale(tick) + 5}" text-anchor="end">${tick.toFixed(1)}</text>
          `
        )
        .join("")}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" />
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" />
      <path class="curve-line" d="${path}" stroke="${riskColor}" />
      ${markers
        .map(
          (marker) => `
            <circle class="curve-marker" cx="${xScale(marker.x)}" cy="${yScale(marker.y)}" r="8.5" />
          `
        )
        .join("")}
      <g transform="translate(${margin.left}, 14)">
        <line class="legend-line" x1="0" y1="0" x2="32" y2="0" stroke="${riskColor}" />
        <text class="legend-text" x="42" y="5">OS probability</text>
        <circle class="curve-marker" cx="178" cy="0" r="7.5" />
        <text class="legend-text" x="196" y="5">3y / 5y</text>
      </g>
      <text class="axis-label" x="${margin.left + plotWidth / 2}" y="${height - 18}" text-anchor="middle">Months</text>
      <text class="axis-label" transform="translate(24 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">
        Overall survival probability
      </text>
    </svg>
  `;
}

function renderTableBlock(title, columns, row, formatters = {}, caption = "") {
  const headerHtml = columns.map((column) => `<th>${column}</th>`).join("");
  const bodyHtml = columns
    .map((column) => {
      const formatter = formatters[column];
      const value = formatter ? formatter(row[column]) : row[column];
      return `<td>${value}</td>`;
    })
    .join("");

  return `
    <section class="table-block">
      <h3 class="table-title">${title}</h3>
      <div class="table-wrap">
        <table class="centered-table">
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>
            <tr>${bodyHtml}</tr>
          </tbody>
        </table>
      </div>
      ${caption ? `<p class="table-caption">${caption}</p>` : ""}
    </section>
  `;
}

function renderCalculationDetails(context) {
  const rawInputs = {
    Age: context.raw.Age,
    "Smoking history": smokeLabels[context.raw.Smoke],
    p16: p16Labels[context.raw.p16],
    "TNM Stage": stageLabels[context.raw.Stage0],
    "interval_post*": context.raw.interval_post,
    "dt*": context.raw.dt,
    HB_pre: context.raw.HB_pre,
    ALB_pre: context.raw.ALB_pre,
    LY_pre: context.raw.LY_pre,
    MO_pre: context.raw.MO_pre,
    ALB_post: context.raw.ALB_post,
    LY_post: context.raw.LY_post,
    MO_post: context.raw.MO_post,
  };

  const derivedPredictors = {
    "HB_pre_w*": context.cleaned.HB_pre_w,
    ALB_pre_w: context.cleaned.ALB_pre_w,
    ALB_post_w: context.cleaned.ALB_post_w,
    LY_pre_w: context.cleaned.LY_pre_w,
    LY_post_w: context.cleaned.LY_post_w,
    MO_pre_w: context.cleaned.MO_pre_w,
    MO_post_w: context.cleaned.MO_post_w,
    LMR_pre_w: context.cleaned.LMR_pre_w,
    LMR_post_w: context.cleaned.LMR_post_w,
    Delta_LMR_A: context.cleaned.LMR_A_w,
    LMR_dt: context.cleaned.LMR_dt_w,
    Delta_ALB_L: context.cleaned.ALB_L_w,
  };

  const predictionInputs = {
    Age: context.rowCleaned.Age,
    "Smoking history": context.rowCleaned.Smoke,
    p16: context.rowCleaned.p16,
    "TNM Stage": context.rowCleaned.Stage0,
    interval_post: context.rowCleaned.interval_post,
    HB_pre_w: context.rowCleaned.HB_pre_w,
    ALB_pre_w: context.rowCleaned.ALB_pre_w,
    Delta_ALB_L: context.rowCleaned.ALB_L_w,
    LMR_pre_w: context.rowCleaned.LMR_pre_w,
    LMR_dt: context.rowCleaned.LMR_dt_w,
  };

  const predictionOutputs = {
    "Risk stratification": context.riskGroup,
    "Risk score": context.prediction.lp,
    "OS risk at 3 years": context.prediction.OSrisk36,
    "OS risk at 5 years": context.prediction.OSrisk60,
  };

  const floatColumns = (columns) =>
    Object.fromEntries(columns.map((column) => [column, (value) => formatFixed(value, 4)]));

  calculationDetails.innerHTML =
    renderTableBlock("Raw inputs", Object.keys(rawInputs), rawInputs, {}, "*, See the 'How dates and sampling intervals are defined' section for details.") +
    renderTableBlock(
      "Derived processed predictors",
      Object.keys(derivedPredictors),
      derivedPredictors,
      floatColumns(Object.keys(derivedPredictors)),
      "_ w, All blood variables were winsorised at the 1st and 99th percentiles to limit the influence of extreme outliers (if required)."
    ) +
    renderTableBlock(
      "Prediction inputs",
      Object.keys(predictionInputs),
      predictionInputs,
      floatColumns(["Age", "interval_post", "HB_pre_w", "ALB_pre_w", "Delta_ALB_L", "LMR_pre_w", "LMR_dt"])
    ) +
    renderTableBlock(
      "Prediction outputs",
      Object.keys(predictionOutputs),
      predictionOutputs,
      {
        "Risk score": (value) => formatFixed(value, 4),
        "OS risk at 3 years": (value) => formatFixed(value, 4),
        "OS risk at 5 years": (value) => formatFixed(value, 4),
      }
    );
}

function renderPrediction(context) {
  const riskColor = context.riskGroup === "High risk" ? "#d62728" : "#1f77b4";

  resultCards.innerHTML = [
    buildResultCard("Risk stratification", context.riskGroup, riskColor),
    buildResultCard("Risk score", formatFixed(context.prediction.lp, 4)),
    buildResultCard("OS risk at 3 years", formatPercent(context.prediction.OSrisk36)),
    buildResultCard("OS risk at 5 years", formatPercent(context.prediction.OSrisk60)),
  ].join("");

  renderChart(context.curve, context.prediction, riskColor);
  renderCalculationDetails(context);

  resultsSection.classList.remove("is-hidden");
  statusMessage.classList.add("is-hidden");
}

function handleSubmit(event) {
  event.preventDefault();

  try {
    const raw = getRawInputValues();
    const { prediction, cleaned, rowCleaned } = predictFastiOsFromRaw(raw, modelData, [36, 60]);
    const riskGroup = riskGroupFromLp(prediction.lp, modelData);
    const curve = makeSurvivalCurve(prediction.lp, modelData, 120);
    renderPrediction({
      raw,
      prediction,
      cleaned,
      rowCleaned,
      riskGroup,
      curve,
    });
  } catch (error) {
    resultsSection.classList.add("is-hidden");
    setStatus(error.message, "error");
  }
}

["rtEndDate", "preBloodDate", "postBloodDate"].forEach((fieldName) => {
  fields[fieldName].addEventListener("change", updateIntervalSummary);
});

form.addEventListener("submit", handleSubmit);
updateIntervalSummary();
