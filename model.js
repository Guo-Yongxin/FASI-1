const RCS_COL1 =
  "rcs(LMR_dt_w, c(-0.088823529, -0.037810232, -0.008348214))LMR_dt_w";
const RCS_COL2 =
  "rcs(LMR_dt_w, c(-0.088823529, -0.037810232, -0.008348214))LMR_dt_w'";

export function normalizeCat(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Missing categorical value: ${value}`);
  }
  if (Math.abs(numericValue - Math.round(numericValue)) > 1e-12) {
    throw new Error(`Categorical value is not integer-like: ${value}`);
  }
  return String(Math.round(numericValue));
}

export function winsorizeValue(value, lo, hi) {
  return Math.min(Math.max(Number(value), Number(lo)), Number(hi));
}

function posCube(value) {
  return Math.max(value, 0) ** 3;
}

export function rcsBasis3Knots(value, knotsList) {
  const [k1, k2, k3] = knotsList.map(Number);
  const x = Number(value);
  const b1 = x;
  const b2 =
    (posCube(x - k1) +
      (((k2 - k1) * posCube(x - k3) - (k3 - k1) * posCube(x - k2)) / (k3 - k2))) /
    (k3 - k1) ** 2;
  return [b1, b2];
}

export function baselineSurvivalAtTime(time, data) {
  const t = Number(time);
  const baseline = data.baseline;
  if (t <= baseline[0].time) {
    return baseline[0].survival;
  }
  if (t >= baseline[baseline.length - 1].time) {
    return baseline[baseline.length - 1].survival;
  }

  for (let index = 0; index < baseline.length - 1; index += 1) {
    const left = baseline[index];
    const right = baseline[index + 1];
    if (t >= left.time && t <= right.time) {
      if (right.time === left.time) {
        return left.survival;
      }
      const ratio = (t - left.time) / (right.time - left.time);
      return left.survival + ratio * (right.survival - left.survival);
    }
  }

  return baseline[baseline.length - 1].survival;
}

export function computeCleanedPredictorsFromRaw(rowRaw, data) {
  const hbPre = Number(rowRaw.HB_pre);
  const albPre = Number(rowRaw.ALB_pre);
  const albPost = Number(rowRaw.ALB_post);
  const lyPre = Number(rowRaw.LY_pre);
  const lyPost = Number(rowRaw.LY_post);
  const moPre = Number(rowRaw.MO_pre);
  const moPost = Number(rowRaw.MO_post);
  const dt = Number(rowRaw.dt);

  if (dt <= 0) {
    throw new Error("dt must be > 0.");
  }
  if (moPre <= 0 || moPost <= 0) {
    throw new Error("MO_pre and MO_post must be > 0.");
  }
  if (albPre <= 0 || albPost <= 0) {
    throw new Error("ALB_pre and ALB_post must be > 0.");
  }

  const hbPreW = winsorizeValue(hbPre, data.winsor.HB_pre.p01, data.winsor.HB_pre.p99);
  const albPreW = winsorizeValue(albPre, data.winsor.ALB_pre.p01, data.winsor.ALB_pre.p99);
  const albPostW = winsorizeValue(albPost, data.winsor.ALB_post.p01, data.winsor.ALB_post.p99);
  const lyPreW = winsorizeValue(lyPre, data.winsor.LY_pre.p01, data.winsor.LY_pre.p99);
  const lyPostW = winsorizeValue(lyPost, data.winsor.LY_post.p01, data.winsor.LY_post.p99);
  const moPreW = winsorizeValue(moPre, data.winsor.MO_pre.p01, data.winsor.MO_pre.p99);
  const moPostW = winsorizeValue(moPost, data.winsor.MO_post.p01, data.winsor.MO_post.p99);

  const lmrPreW = lyPreW / moPreW;
  const lmrPostW = lyPostW / moPostW;
  const lmrAW = lmrPostW - lmrPreW;
  const lmrDtW = lmrAW / dt;
  const albLW = Math.log(albPostW) - Math.log(albPreW);

  return {
    HB_pre_w: hbPreW,
    ALB_pre_w: albPreW,
    ALB_post_w: albPostW,
    LY_pre_w: lyPreW,
    LY_post_w: lyPostW,
    MO_pre_w: moPreW,
    MO_post_w: moPostW,
    LMR_pre_w: lmrPreW,
    LMR_post_w: lmrPostW,
    LMR_A_w: lmrAW,
    LMR_dt_w: lmrDtW,
    ALB_L_w: albLW,
  };
}

export function buildDesignRowCleaned(row, data) {
  const x = Object.fromEntries(data.xColOrder.map((column) => [column, 0]));

  x.Age = Number(row.Age);
  x.interval_post = Number(row.interval_post);
  x.LMR_pre_w = Number(row.LMR_pre_w);
  x.ALB_pre_w = Number(row.ALB_pre_w);
  x.ALB_L_w = Number(row.ALB_L_w);
  x.HB_pre_w = Number(row.HB_pre_w);

  const p16 = normalizeCat(row.p16);
  const stage0 = normalizeCat(row.Stage0);
  const smoke = normalizeCat(row.Smoke);

  if (p16 === "1") {
    x.p161 = 1;
  } else if (p16 === "2") {
    x.p162 = 1;
  } else if (p16 !== "0") {
    throw new Error(`Invalid p16: ${p16}`);
  }

  if (stage0 === "2") {
    x.Stage02 = 1;
  } else if (stage0 !== "1") {
    throw new Error(`Invalid Stage0: ${stage0}`);
  }

  if (smoke === "1") {
    x.Smoke1 = 1;
  } else if (smoke === "2") {
    x.Smoke2 = 1;
  } else if (smoke !== "0") {
    throw new Error(`Invalid Smoke: ${smoke}`);
  }

  const [b1, b2] = rcsBasis3Knots(Number(row.LMR_dt_w), data.meta.rcs.knots);
  x[RCS_COL1] = b1;
  x[RCS_COL2] = b2;

  return x;
}

export function predictFastiOsCleaned(row, data, times = [36, 60]) {
  const designRow = buildDesignRowCleaned(row, data);
  const coefficients = data.coefficients;
  const coefficientKeyMap = {
    p161: "p16=1",
    p162: "p16=2",
    Stage02: "Stage0=2",
    Smoke1: "Smoke=1",
    Smoke2: "Smoke=2",
    [RCS_COL1]: "LMR_dt_w",
    [RCS_COL2]: "LMR_dt_w'",
  };
  const lpRaw = data.xColOrder.reduce((sum, column) => {
    const coefficientKey = coefficientKeyMap[column] ?? column;
    return sum + Number(designRow[column]) * Number(coefficients[coefficientKey] ?? 0);
  }, 0);
  const lp = lpRaw - Number(data.meta.center);
  const result = { lp };

  times.forEach((time) => {
    const baseline = baselineSurvivalAtTime(Number(time), data);
    result[`OSrisk${Number(time)}`] = 1 - baseline ** Math.exp(lp);
  });

  return result;
}

export function predictFastiOsFromRaw(rowRaw, data, times = [36, 60]) {
  const cleaned = computeCleanedPredictorsFromRaw(rowRaw, data);
  const rowCleaned = {
    p16: rowRaw.p16,
    Stage0: rowRaw.Stage0,
    Age: Number(rowRaw.Age),
    Smoke: rowRaw.Smoke,
    interval_post: Number(rowRaw.interval_post),
    LMR_pre_w: cleaned.LMR_pre_w,
    ALB_pre_w: cleaned.ALB_pre_w,
    ALB_L_w: cleaned.ALB_L_w,
    HB_pre_w: cleaned.HB_pre_w,
    LMR_dt_w: cleaned.LMR_dt_w,
  };
  const prediction = predictFastiOsCleaned(rowCleaned, data, times);
  return { prediction, cleaned, rowCleaned };
}

export function makeSurvivalCurve(lp, data, maxTime = 120) {
  const curve = [];
  for (let time = 0; time <= maxTime; time += 1) {
    const baseline = baselineSurvivalAtTime(time, data);
    const survival = baseline ** Math.exp(lp);
    curve.push({
      time,
      survival,
      risk: 1 - survival,
    });
  }
  return curve;
}

export function riskGroupFromLp(lp, data) {
  return Number(lp) >= Number(data.lpCutoffs.median) ? "High risk" : "Low risk";
}
