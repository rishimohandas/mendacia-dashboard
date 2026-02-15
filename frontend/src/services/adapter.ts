export type Severity = "low" | "medium" | "high";

export interface ForensicReport {
  metadata: {
    video_id: string;
    filename: string;
    duration: string;
  };
  classification: {
    label: string;
    score: number;
    explanation: string;
  };
  manipulation: {
    categories: string[];
    breakdown: object[];
  };
  scenes: Array<{
    id: number;
    timestamp: string;
    visual: string;
    audio: string;
    objects: string[];
  }>;
  anomalies: Array<{
    id: number;
    timestamp: string;
    type: string;
    description: string;
    severity: Severity;
  }>;
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_DURATION = "00:00";
const DEFAULT_TIMESTAMP = "00:00";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) {
      return null;
    }
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfidenceScore(value: unknown): number {
  const numeric = toNumber(value);
  if (numeric === null) {
    return 0;
  }

  const fromPercentString = typeof value === "string" && value.includes("%");
  const scaled = !fromPercentString && numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;

  return clamp(Math.round(scaled), 0, 100);
}

function parseClockToSeconds(value: string): number | null {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_TIMESTAMP;
  }

  const rounded = Math.round(value * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded - minutes * 60;
  const hasFraction = Math.abs(seconds - Math.round(seconds)) > 1e-6;

  const minutePart = String(minutes).padStart(2, "0");
  const secondPart = hasFraction
    ? seconds.toFixed(1).padStart(4, "0")
    : String(Math.round(seconds)).padStart(2, "0");

  return `${minutePart}:${secondPart}`;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return DEFAULT_TIMESTAMP;
    }

    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-", 2);
      const start = normalizeTimestamp(startRaw);
      const end = normalizeTimestamp(endRaw);
      return `${start}-${end}`;
    }

    const clockSeconds = parseClockToSeconds(trimmed);
    if (clockSeconds !== null) {
      return formatSeconds(clockSeconds);
    }

    const numeric = toNumber(trimmed);
    return numeric === null ? DEFAULT_TIMESTAMP : formatSeconds(numeric);
  }

  const numeric = toNumber(value);
  return numeric === null ? DEFAULT_TIMESTAMP : formatSeconds(numeric);
}

function normalizeSeverity(value: unknown): Severity {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0.67) {
      return "high";
    }
    if (value >= 0.34) {
      return "medium";
    }
    return "low";
  }

  const normalized = asString(value).toLowerCase();
  if (!normalized) {
    return "low";
  }
  if (normalized === "critical") {
    return "high";
  }
  if (normalized.includes("high")) {
    return "high";
  }
  if (normalized.includes("med")) {
    return "medium";
  }
  if (normalized.includes("low")) {
    return "low";
  }
  return "low";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asString(entry))
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function toObjectArray(value: unknown): object[] {
  return asArray(value)
    .filter((entry): entry is UnknownRecord => isRecord(entry))
    .map((entry) => ({ ...entry }));
}

function extractFilename(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/\\/g, "/");
  const basename = normalized.split("/").filter(Boolean).pop() ?? "";
  return basename || raw;
}

function normalizeDuration(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes(":")) {
      const seconds = parseClockToSeconds(trimmed);
      return seconds === null ? DEFAULT_DURATION : formatSeconds(seconds);
    }

    const numeric = toNumber(trimmed);
    return numeric === null ? DEFAULT_DURATION : formatSeconds(numeric);
  }

  const numeric = toNumber(value);
  return numeric === null ? null : formatSeconds(numeric);
}

function getPayloadRoot(apiData: unknown): UnknownRecord {
  const root = asRecord(apiData);
  const nestedData = asRecord(root.data);
  const nestedReport = asRecord(root.report);

  if (
    Object.keys(nestedData).length > 0 &&
    (nestedData.video_id !== undefined || nestedData.scenes !== undefined || nestedData.inconsistency_flags !== undefined)
  ) {
    return nestedData;
  }

  if (Object.keys(nestedReport).length > 0) {
    return nestedReport;
  }

  return root;
}

function getDurationFromScenes(scenes: unknown[]): string {
  let maxEndSeconds: number | null = null;

  for (const sceneRaw of scenes) {
    const scene = asRecord(sceneRaw);
    const endCandidate =
      scene.end_time ?? scene.end ?? scene.timestamp ?? scene.time ?? scene.stop_time ?? scene.endTime;
    const end = toNumber(endCandidate);
    if (end === null) {
      continue;
    }
    maxEndSeconds = maxEndSeconds === null ? end : Math.max(maxEndSeconds, end);
  }

  return maxEndSeconds === null ? DEFAULT_DURATION : formatSeconds(maxEndSeconds);
}

export function adaptForensicReport(apiData: unknown): ForensicReport {
  const root = getPayloadRoot(apiData);
  const metadataBlock = asRecord(root.metadata);
  const classificationBlock = asRecord(root.classification);
  const manipulationBlock = asRecord(root.manipulation);
  const moduleA = asRecord(root.moduleA_result);

  const rawScenes = asArray(root.scenes ?? root.scene_summaries ?? root.timeline);

  const rawAnomalies = Array.isArray(root.anomalies)
    ? root.anomalies
    : Array.isArray(root.inconsistency_flags)
      ? root.inconsistency_flags
      : Array.isArray(root.cross_modal_inconsistencies)
        ? root.cross_modal_inconsistencies
        : [];

  const videoId = asString(metadataBlock.video_id ?? root.video_id ?? root.id, "unknown-video");
  const filename =
    extractFilename(
      metadataBlock.filename ??
        root.filename ??
        root.file_name ??
        root.video_filename ??
        root.video_name ??
        root.video_path,
    ) || "Unknown Video";

  const duration =
    normalizeDuration(
      metadataBlock.duration ??
        root.duration ??
        root.duration_seconds ??
        root.video_duration_seconds ??
        root.video_duration,
    ) ?? getDurationFromScenes(rawScenes);

  const label = asString(
    (isRecord(root.classification) ? root.classification.label : undefined) ??
      classificationBlock.label ??
      root.classification_label ??
      (typeof root.classification === "string" ? root.classification : undefined),
    "unknown",
  );

  const score = normalizeConfidenceScore(
    (isRecord(root.classification) ? root.classification.score : undefined) ??
      (isRecord(root.classification) ? root.classification.confidence : undefined) ??
      classificationBlock.score ??
      classificationBlock.confidence ??
      root.confidence_score ??
      root.confidence ??
      root.score,
  );

  const explanation = asString(
    (isRecord(root.classification) ? root.classification.explanation : undefined) ??
      (isRecord(root.classification) ? root.classification.reason : undefined) ??
      classificationBlock.explanation ??
      root.classification_explanation ??
      root.explanation ??
      root.summary,
    "",
  );

  const categories = toStringArray(
    manipulationBlock.categories ?? root.manipulation_categories_detected ?? moduleA.manipulation_categories_detected,
  );

  const breakdown = toObjectArray(manipulationBlock.breakdown ?? root.breakdown ?? moduleA.rationales);

  const scenes = rawScenes.map((sceneRaw, index) => {
    const scene = asRecord(sceneRaw);
    const start = toNumber(scene.start_time ?? scene.start ?? scene.startTime);
    const end = toNumber(scene.end_time ?? scene.end ?? scene.endTime);

    let timestamp = normalizeTimestamp(scene.timestamp ?? scene.time);
    if (timestamp === DEFAULT_TIMESTAMP && start !== null && end !== null) {
      timestamp = `${formatSeconds(start)}-${formatSeconds(end)}`;
    } else if (timestamp === DEFAULT_TIMESTAMP && start !== null) {
      timestamp = formatSeconds(start);
    }

    const idNumber = toNumber(scene.id ?? scene.scene_number ?? scene.scene_id);
    const id = idNumber !== null && idNumber > 0 ? Math.round(idNumber) : index + 1;

    return {
      id,
      timestamp,
      visual: asString(scene.visual ?? scene.visual_summary ?? scene.summary ?? scene.description, ""),
      audio: asString(scene.audio ?? scene.spoken_transcript ?? scene.transcript ?? scene.narration, ""),
      objects: toStringArray(scene.objects ?? scene.detected_objects ?? scene.tags ?? scene.keywords),
    };
  });

  const anomalies = rawAnomalies.map((anomalyRaw, index) => {
    const anomaly = asRecord(anomalyRaw);
    const idNumber = toNumber(anomaly.id ?? anomaly.flag_id ?? anomaly.anomaly_id);
    const id = idNumber !== null && idNumber > 0 ? Math.round(idNumber) : index + 1;

    return {
      id,
      timestamp: normalizeTimestamp(
        anomaly.timestamp ?? anomaly.time ?? anomaly.at ?? anomaly.start_time ?? anomaly.start,
      ),
      type: asString(anomaly.type ?? anomaly.flag_type ?? anomaly.category, "unknown"),
      description: asString(anomaly.description ?? anomaly.detail ?? anomaly.message ?? anomaly.explanation, ""),
      severity: normalizeSeverity(anomaly.severity ?? anomaly.level ?? anomaly.risk),
    };
  });

  return {
    metadata: {
      video_id: videoId,
      filename,
      duration,
    },
    classification: {
      label,
      score,
      explanation,
    },
    manipulation: {
      categories,
      breakdown,
    },
    scenes,
    anomalies,
  };
}
