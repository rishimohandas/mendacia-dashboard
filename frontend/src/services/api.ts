import { adaptForensicReport, type ForensicReport } from "./adapter";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildUrl(path: string): string {
  const base = normalizeBaseUrl(BASE_URL);
  return `${base}${path}`;
}

async function readJsonSafe(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  try {
    if (isJson) {
      return await response.json();
    }

    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  } catch {
    return {};
  }
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  const record = isRecord(payload) ? payload : {};
  const message =
    (typeof record.message === "string" ? record.message : "") ||
    (typeof record.error === "string" ? record.error : "") ||
    fallback;
  return message;
}

function getJobId(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const raw = typeof record.job_id === "string" ? record.job_id.trim() : "";
  return raw;
}

export async function uploadVideo(file: File): Promise<{ job_id: string }> {
  if (!(file instanceof File)) {
    throw new Error("Upload failed: a valid video file is required.");
  }

  const formData = new FormData();
  formData.append("video", file);

  let response: Response;
  try {
    response = await fetch(buildUrl("/api/upload"), {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Upload failed: unable to reach backend API.");
  }

  const payload = await readJsonSafe(response);

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, "Upload request failed."));
  }

  const jobId = getJobId(payload);
  if (!jobId) {
    throw new Error("Upload failed: backend response did not include job_id.");
  }

  return { job_id: jobId };
}

export async function pollJobStatus(jobId: string): Promise<{ status: string }> {
  const normalizedJobId = jobId?.trim();
  if (!normalizedJobId) {
    throw new Error("Polling failed: jobId is required.");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(`/api/job/${encodeURIComponent(normalizedJobId)}`), {
      method: "GET",
    });
  } catch {
    throw new Error("Polling failed: unable to reach backend API.");
  }

  const payload = await readJsonSafe(response);

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, "Polling request failed."));
  }

  const record = isRecord(payload) ? payload : {};
  const status = typeof record.status === "string" && record.status.trim() ? record.status : "unknown";

  return { status };
}

export async function fetchAnalysis(jobId: string): Promise<ForensicReport> {
  const normalizedJobId = jobId?.trim();
  if (!normalizedJobId) {
    throw new Error("Fetch analysis failed: jobId is required.");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(`/api/report/${encodeURIComponent(normalizedJobId)}`), {
      method: "GET",
    });
  } catch {
    throw new Error("Fetch analysis failed: unable to reach backend API.");
  }

  const payload = await readJsonSafe(response);

  if (response.status === 202) {
    throw new Error("Analysis is not ready yet.");
  }

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, "Fetch analysis request failed."));
  }

  return adaptForensicReport(payload);
}
