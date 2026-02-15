import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Shield, ChevronLeft, FileDown, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { jsPDF } from "jspdf";

import { fetchAnalysis, pollJobStatus } from "../../services/api";
import type { ForensicReport } from "../../services/adapter";

type UiSeverity = "critical" | "high" | "medium" | "low";

type CategoryMagnitudePoint = {
  category: string;
  magnitude: number;
  fill: string;
};

type CrossModalComparison = {
  timestamp: string;
  speech: string;
  visual: string;
  match: boolean;
  severity: UiSeverity;
  type?: string;
  description?: string;
};

type TaxonomyItem = {
  tag: string;
  count: number;
  severity: UiSeverity;
};

const demoCategoryMagnitudeData: CategoryMagnitudePoint[] = [
  { category: "Fear amplification", magnitude: 84, fill: "#ef4444" },
  { category: "Urgency framing", magnitude: 72, fill: "#f97316" },
  { category: "Context stripping", magnitude: 66, fill: "#f59e0b" },
];

const demoCrossModalComparisons: CrossModalComparison[] = [
  {
    timestamp: "00:30-01:00",
    speech: '"Chaos is spreading through our streets. People are terrified."',
    visual: "Organized peaceful protest march. No indicators of chaos or terror detected.",
    match: false,
    severity: "critical",
  },
  {
    timestamp: "01:15-01:45",
    speech: '"Unprecedented violence threatens our community."',
    visual: "Standard crowd control procedures. Police observing, no violent activity visible.",
    match: false,
    severity: "high",
  },
  {
    timestamp: "02:10-02:30",
    speech: '"This crisis demands immediate action NOW."',
    visual: "Rapid scene cuts with dramatic red color grading. Context removed.",
    match: false,
    severity: "high",
  },
];

const demoTaxonomyItems: TaxonomyItem[] = [
  { tag: "#FearAmplification", count: 8, severity: "critical" },
  { tag: "#UrgencyFraming", count: 6, severity: "critical" },
  { tag: "#ContextStripping", count: 5, severity: "high" },
  { tag: "#CherryPicking", count: 4, severity: "high" },
  { tag: "#VisualInflation", count: 4, severity: "high" },
  { tag: "#EmotionalExploitation", count: 3, severity: "medium" },
  { tag: "#FalseDilemma", count: 2, severity: "medium" },
  { tag: "#SceneSplicing", count: 3, severity: "medium" },
  { tag: "#NarrativeMismatch", count: 5, severity: "critical" },
  { tag: "#SyntheticPattern", count: 2, severity: "low" },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function toUiSeverity(severity: "low" | "medium" | "high"): UiSeverity {
  if (severity === "high") {
    return "critical";
  }
  return severity;
}

function getDominantSeverity(report: ForensicReport | null): UiSeverity {
  if (!report) {
    return "critical";
  }

  if (report.anomalies.some((item) => item.severity === "high")) {
    return "critical";
  }
  if (report.anomalies.some((item) => item.severity === "medium")) {
    return "high";
  }
  if (report.anomalies.some((item) => item.severity === "low")) {
    return "medium";
  }
  return "low";
}

function formatCategoryTag(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return normalized ? `#${normalized}` : "#Unknown";
}

function severityBorderClass(severity: UiSeverity): string {
  if (severity === "critical") {
    return "border-[#ef4444]/30";
  }
  if (severity === "high") {
    return "border-orange-500/30";
  }
  if (severity === "medium") {
    return "border-yellow-500/30";
  }
  return "border-blue-500/30";
}

function severityPanelClass(severity: UiSeverity): string {
  if (severity === "critical") {
    return "bg-[#ef4444]/10 border-[#ef4444]/30";
  }
  if (severity === "high") {
    return "bg-orange-500/10 border-orange-500/30";
  }
  if (severity === "medium") {
    return "bg-yellow-500/10 border-yellow-500/30";
  }
  return "bg-blue-500/10 border-blue-500/30";
}

function severityTextClass(severity: UiSeverity): string {
  if (severity === "critical") {
    return "text-[#ef4444]";
  }
  if (severity === "high") {
    return "text-orange-400";
  }
  if (severity === "medium") {
    return "text-yellow-400";
  }
  return "text-blue-400";
}

function severityDotClass(severity: UiSeverity): string {
  if (severity === "critical") {
    return "bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.5)]";
  }
  if (severity === "high") {
    return "bg-orange-500";
  }
  if (severity === "medium") {
    return "bg-yellow-500";
  }
  return "bg-blue-500";
}

function getSeverityColor(severity: UiSeverity): string {
  if (severity === "critical") {
    return "text-[#ef4444]";
  }
  if (severity === "high") {
    return "text-orange-400";
  }
  if (severity === "medium") {
    return "text-yellow-400";
  }
  return "text-emerald-400";
}

type VerdictTone = {
  text: string;
  bg: string;
  border: string;
  glow: string;
  label: string;
};

function getVerdictTone(score: number): VerdictTone {
  if (score <= 20) {
    return {
      text: "text-emerald-400",
      bg: "bg-emerald-500/20",
      border: "border-emerald-500/50",
      glow: "from-emerald-500 via-emerald-400 to-emerald-500",
      label: "LOW RISK",
    };
  }
  if (score <= 45) {
    return {
      text: "text-orange-400",
      bg: "bg-orange-500/20",
      border: "border-orange-500/50",
      glow: "from-orange-500 via-amber-500 to-orange-500",
      label: "ELEVATED RISK",
    };
  }
  return {
    text: "text-[#ef4444]",
    bg: "bg-[#ef4444]/20",
    border: "border-[#ef4444]/50",
    glow: "from-[#ef4444] via-orange-500 to-[#ef4444]",
    label: "HIGH RISK",
  };
}

function getBarColor(magnitude: number): string {
  if (magnitude >= 70) {
    return "#ef4444";
  }
  if (magnitude >= 45) {
    return "#f97316";
  }
  if (magnitude >= 20) {
    return "#f59e0b";
  }
  return "#22c55e";
}

function createExportPayload(report: ForensicReport, jobId: string) {
  return {
    generated_at: new Date().toISOString(),
    job_id: jobId || report.metadata.video_id,
    video_id: report.metadata.video_id,
    filename: report.metadata.filename,
    classification: report.classification,
    manipulation: report.manipulation,
    anomalies: report.anomalies,
    scenes: report.scenes,
    human_readable_report: report.human_readable_report,
    ethical_note: report.ethical_note,
  };
}

export function ForensicLabPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const jobId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("jobId") ?? "").trim();
  }, [location.search]);

  const isLiveMode = jobId.length > 0;
  const citizenViewPath = jobId ? `/citizen-view?jobId=${encodeURIComponent(jobId)}` : "/citizen-view";
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("mendacia:lastJobId", jobId);
  }, [jobId]);

  useEffect(() => {
    if (!isLiveMode) {
      setReport(null);
      setIsLoadingReport(false);
      setStatusText("");
      setErrorText(null);
      return;
    }

    let isCancelled = false;
    let isRequestInFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const completedStatuses = new Set(["finished", "completed", "done", "success", "succeeded"]);
    const failedStatuses = new Set(["error", "failed", "failure"]);

    setReport(null);
    setErrorText(null);
    setIsLoadingReport(true);
    setStatusText("Starting live analysis...");

    const poll = async () => {
      if (isCancelled || isRequestInFlight) {
        return;
      }

      isRequestInFlight = true;
      try {
        const { status } = await pollJobStatus(jobId);
        const normalizedStatus = status.toLowerCase();
        setStatusText(`Analysis status: ${status}`);

        if (failedStatuses.has(normalizedStatus)) {
          throw new Error(`Analysis failed with status: ${status}`);
        }

        if (completedStatuses.has(normalizedStatus)) {
          setStatusText("Analysis complete. Fetching report...");
          const liveReport = await fetchAnalysis(jobId);

          if (isCancelled) {
            return;
          }

          setReport(liveReport);
          setIsLoadingReport(false);
          setStatusText("Report loaded.");
          if (intervalId) {
            clearInterval(intervalId);
          }
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load analysis.";
        if (message.toLowerCase().includes("not ready")) {
          setStatusText("Analysis finished. Waiting for report finalization...");
          return;
        }

        setErrorText(message);
        setIsLoadingReport(false);
        if (intervalId) {
          clearInterval(intervalId);
        }
      } finally {
        isRequestInFlight = false;
      }
    };

    void poll();
    intervalId = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      isCancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isLiveMode, jobId]);

  const manipulationScore = clamp(Math.round(report?.classification.score ?? 84));
  const credibilityScore = clamp(100 - manipulationScore);
  const dominantSeverity = getDominantSeverity(report);
  const severityColorClass = getSeverityColor(dominantSeverity);
  const verdictTone = getVerdictTone(manipulationScore);

  const categoryMagnitudeData = useMemo<CategoryMagnitudePoint[]>(() => {
    if (!report) {
      return demoCategoryMagnitudeData;
    }

    const confidenceByCategory = new Map<string, number>();

    for (const entry of report.manipulation.breakdown) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }
      const categoryRaw = (entry as { category?: unknown }).category;
      const confidenceRaw = (entry as { confidence?: unknown }).confidence;
      const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";
      const confidence = typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw) ? confidenceRaw : 0;
      if (!category) {
        continue;
      }
      const magnitude = clamp(Math.round(confidence * 100));
      const previous = confidenceByCategory.get(category);
      confidenceByCategory.set(category, previous === undefined ? magnitude : Math.max(previous, magnitude));
    }

    if (!confidenceByCategory.size) {
      for (const category of report.manipulation.categories) {
        const trimmed = category.trim();
        if (!trimmed || confidenceByCategory.has(trimmed)) {
          continue;
        }
        confidenceByCategory.set(trimmed, clamp(Math.round(manipulationScore * 0.85)));
      }
    }

    if (!confidenceByCategory.size) {
      confidenceByCategory.set("No strong category signals", manipulationScore);
    }

    return Array.from(confidenceByCategory.entries())
      .map(([category, magnitude]) => ({
        category,
        magnitude,
        fill: getBarColor(magnitude),
      }))
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 8);
  }, [manipulationScore, report]);

  const synthesisScore = useMemo(() => {
    if (!report) {
      return clamp(Math.round(manipulationScore * 0.9));
    }

    const magnitudes = categoryMagnitudeData.map((item) => item.magnitude);
    const averageMagnitude = magnitudes.length
      ? magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length
      : manipulationScore;
    const severityWeight = report.anomalies.reduce((sum, anomaly) => {
      if (anomaly.severity === "high") {
        return sum + 16;
      }
      if (anomaly.severity === "medium") {
        return sum + 10;
      }
      return sum + 5;
    }, 0);

    return clamp(Math.round(averageMagnitude * 0.7 + manipulationScore * 0.3 + severityWeight * 0.25));
  }, [categoryMagnitudeData, manipulationScore, report]);

  const taxonomyItems = useMemo<TaxonomyItem[]>(() => {
    if (!report) {
      return demoTaxonomyItems;
    }

    const counts = new Map<string, number>();
    for (const category of report.manipulation.categories) {
      const trimmed = category.trim();
      if (!trimmed) {
        continue;
      }
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }

    if (!counts.size) {
      return [{ tag: "#NoSignalsDetected", count: 0, severity: "low" }];
    }

    return Array.from(counts.entries()).map(([category, count]) => ({
      tag: formatCategoryTag(category),
      count,
      severity: dominantSeverity,
    }));
  }, [dominantSeverity, report]);

  const crossModalComparisons = useMemo<CrossModalComparison[]>(() => {
    if (!report) {
      return demoCrossModalComparisons;
    }

    if (!report.anomalies.length) {
      return [];
    }

    return report.anomalies.map((anomaly, index) => {
      const relatedScene = report.scenes.length ? report.scenes[index % report.scenes.length] : undefined;

      return {
        timestamp: anomaly.timestamp,
        speech: relatedScene?.audio || anomaly.description || "No speech evidence available.",
        visual: relatedScene?.visual || "No visual evidence available.",
        match: false,
        severity: toUiSeverity(anomaly.severity),
        type: anomaly.type,
        description: anomaly.description,
      };
    });
  }, [report]);

  const contradictionCount = crossModalComparisons.length;
  const analyzedSegmentCount = report?.scenes.length ?? 8;
  const detectedTechniqueCount = report?.manipulation.categories.length ?? 18;
  const primaryExplanation =
    report?.classification.explanation ||
    "This media exhibits systematic manipulation patterns across multiple forensic dimensions.";
  const secondaryExplanation = report
    ? `Cross-modal inconsistencies detected in ${contradictionCount} of ${Math.max(analyzedSegmentCount, 1)} analyzed segments.`
    : "The content demonstrates deliberate design to amplify fear response while presenting selective visual evidence that contradicts factual claims.";

  const handleExportReport = () => {
    if (!report) {
      window.alert("No report available to export yet.");
      return;
    }

    const payload = createExportPayload(report, jobId);
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const marginX = 48;
    let cursorY = 56;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Mendacia Forensic Report", marginX, cursorY);
    cursorY += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date(payload.generated_at).toLocaleString()}`, marginX, cursorY);
    cursorY += 16;
    doc.text(`Video ID: ${payload.video_id}`, marginX, cursorY);
    cursorY += 16;
    doc.text(`Filename: ${payload.filename || "Unknown"}`, marginX, cursorY);
    cursorY += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Classification", marginX, cursorY);
    cursorY += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Label: ${payload.classification.label}`, marginX, cursorY);
    cursorY += 14;
    doc.text(`Manipulation Score: ${payload.classification.score}`, marginX, cursorY);
    cursorY += 14;
    doc.text(`Explanation: ${payload.classification.explanation}`, marginX, cursorY);
    cursorY += 22;

    const categoryLine = payload.manipulation.categories.length
      ? payload.manipulation.categories.join(", ")
      : "None reported";
    doc.setFont("helvetica", "bold");
    doc.text("Detected Categories", marginX, cursorY);
    cursorY += 14;
    doc.setFont("helvetica", "normal");
    const categoryWrapped = doc.splitTextToSize(categoryLine, 520);
    doc.text(categoryWrapped, marginX, cursorY);
    cursorY += categoryWrapped.length * 14 + 10;

    doc.setFont("helvetica", "bold");
    doc.text("Human-Readable Report", marginX, cursorY);
    cursorY += 14;
    doc.setFont("helvetica", "normal");
    const reportText = payload.human_readable_report || "No narrative available.";
    const reportWrapped = doc.splitTextToSize(reportText, 520);
    doc.text(reportWrapped, marginX, cursorY);
    cursorY += reportWrapped.length * 14 + 10;

    doc.setFont("helvetica", "bold");
    doc.text("Consistency Flags", marginX, cursorY);
    cursorY += 14;
    doc.setFont("helvetica", "normal");
    if (payload.anomalies.length) {
      payload.anomalies.forEach((flag) => {
        const line = `${flag.timestamp} | ${flag.type} | ${flag.severity.toUpperCase()} - ${flag.description}`;
        const wrapped = doc.splitTextToSize(line, 520);
        doc.text(wrapped, marginX, cursorY);
        cursorY += wrapped.length * 14 + 6;
      });
    } else {
      doc.text("No inconsistency flags reported.", marginX, cursorY);
      cursorY += 14;
    }

    if (payload.ethical_note) {
      cursorY += 10;
      doc.setFont("helvetica", "bold");
      doc.text("Ethical Note", marginX, cursorY);
      cursorY += 14;
      doc.setFont("helvetica", "normal");
      const noteWrapped = doc.splitTextToSize(payload.ethical_note, 520);
      doc.text(noteWrapped, marginX, cursorY);
    }

    doc.save(`${payload.video_id || "forensic-report"}-report.pdf`);
  };

  const metricDetails: Record<string, { title: string; description: string }> = {
    manipulation: {
      title: "Manipulation %",
      description:
        "Derived from the backend confidence score. It blends inconsistency severity, category count, and rationale confidence to estimate manipulation likelihood.",
    },
    credibility: {
      title: "Credibility %",
      description:
        "Computed as 100 - manipulation score. Higher credibility indicates fewer manipulation signals detected in this report.",
    },
    synthesis: {
      title: "Synthesis Score",
      description:
        "Aggregated signal strength across category magnitudes and anomaly severity. It summarizes how strong and consistent the detected signals are.",
    },
  };

  return (
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

      {/* Header */}
      <header className="relative z-10 border-b border-[#22d3ee]/10 bg-[#020617]/90 backdrop-blur-xl sticky top-0">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(citizenViewPath)}
                className="text-slate-400 hover:text-white hover:bg-[#1e293b]/50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Simple View
              </Button>
              <Button
                onClick={handleExportReport}
                className="bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export Report
              </Button>
              <div className="h-8 w-px bg-slate-700" />
              <div className="flex items-center gap-3">
                <Shield className="h-7 w-7 text-[#22d3ee]" />
                <div>
                  <h1 className="text-xl font-bold text-white">MENDACIA FORENSIC REPORT</h1>
                  <p className="text-xs text-slate-400 font-mono">EXPERT ANALYSIS MODULE</p>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 font-mono">LIVE FORENSIC ANALYSIS</div>
          </div>
        </div>
      </header>

      {/* Main Content - Bento Box Layout */}
      <main className="relative z-10 container mx-auto px-8 py-8">
        {isLiveMode && (isLoadingReport || errorText) && (
          <div className="mb-6 rounded-xl border border-[#22d3ee]/30 bg-[#1e293b]/40 backdrop-blur-xl p-4">
            <div className="flex items-center gap-3">
              {isLoadingReport ? (
                <div className="h-2.5 w-2.5 rounded-full bg-[#22d3ee] animate-pulse" />
              ) : (
                <AlertCircle className="h-4 w-4 text-[#ef4444]" />
              )}
              <p className={`text-sm font-mono ${errorText ? "text-[#ef4444]" : "text-slate-300"}`}>
                {errorText ?? statusText}
              </p>
            </div>
          </div>
        )}

        {/* Top Row */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Category Magnitude Chart */}
          <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Manipulation Category Magnitude</h3>
              <div className={`px-3 py-1 rounded-full border ${verdictTone.bg} ${verdictTone.border}`}>
                <span className={`text-xs font-bold font-mono ${verdictTone.text}`}>{manipulationScore}% MANIPULATION</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryMagnitudeData} margin={{ top: 8, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
                <XAxis dataKey="category" tick={{ fill: "#94a3b8", fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={55} />
                <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: "rgba(30, 41, 59, 0.5)" }}
                  contentStyle={{
                    background: "#020617",
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    borderRadius: "0.75rem",
                    color: "#e2e8f0",
                    fontFamily: "monospace",
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  formatter={(value) => [`${value}%`, "Magnitude"]}
                />
                <Bar dataKey="magnitude" radius={[6, 6, 0, 0]}>
                  {categoryMagnitudeData.map((entry) => (
                    <Cell key={entry.category} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { key: "manipulation", label: "Manipulation %", value: manipulationScore, color: verdictTone.text },
                { key: "credibility", label: "Credibility %", value: credibilityScore, color: "text-cyan-300" },
                { key: "synthesis", label: "Synthesis Score", value: synthesisScore, color: "text-purple-300" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveMetric((prev) => (prev === item.key ? null : item.key))}
                  className="bg-slate-800/50 rounded-lg p-3 text-center border border-transparent hover:border-slate-500/60 hover:bg-slate-800/70 transition-colors"
                >
                  <div className={`text-2xl font-bold mb-1 ${item.color}`}>{Math.round(item.value)}%</div>
                  <div className="text-xs text-slate-400 font-mono">{item.label}</div>
                </button>
              ))}
            </div>
            {activeMetric ? (
              <div className="mt-4 rounded-xl border border-slate-700/60 bg-[#0f172a]/70 p-4">
                <p className="text-sm text-slate-200 font-semibold mb-1">{metricDetails[activeMetric].title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{metricDetails[activeMetric].description}</p>
              </div>
            ) : null}
          </div>

          {/* Manipulation Taxonomy */}
          <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6">Manipulation Taxonomy</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {taxonomyItems.map((item, idx) => (
                <div key={`${item.tag}-${idx}`} className={`flex items-center justify-between p-3 rounded-lg border ${severityPanelClass(item.severity)}`}>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-sm ${severityTextClass(item.severity)}`}>{item.tag}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400 font-mono">x{item.count}</span>
                    <div className={`h-2 w-2 rounded-full ${severityDotClass(item.severity)}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cross-Modal Consistency Engine */}
        <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Cross-Modal Consistency Engine</h3>
              <p className="text-sm text-slate-400 font-mono">Speech Transcript vs TwelveLabs Visual Analysis</p>
            </div>
            <div className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 rounded-full">
              <span className="text-xs font-bold text-orange-400 font-mono">
                {contradictionCount} CONTRADICTION{contradictionCount === 1 ? "" : "S"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {crossModalComparisons.map((item, idx) => (
              <div key={idx} className={`border rounded-xl overflow-hidden ${severityBorderClass(item.severity)}`}>
                <div className="bg-slate-800/50 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">TIMESTAMP: {item.timestamp}</span>
                    {!item.match && (
                      <div className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 text-[#ef4444]" />
                        <span className="text-xs font-bold text-[#ef4444]">MISMATCH</span>
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-mono ${severityTextClass(item.severity)}`}>{item.severity.toUpperCase()}</span>
                </div>

                <div className="grid md:grid-cols-2 gap-0 divide-x divide-slate-700/50">
                  {/* Speech Column */}
                  <div className="p-4 bg-[#1e293b]/30">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-400">S</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 font-mono">SPEECH TRANSCRIPT</span>
                    </div>
                    <p className="text-sm text-slate-300 italic">{item.speech}</p>
                  </div>

                  {/* Visual Column */}
                  <div className="p-4 bg-[#1e293b]/30">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded bg-purple-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-400">V</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 font-mono">VISUAL ANALYSIS</span>
                    </div>
                    <p className="text-sm text-slate-300">{item.visual}</p>
                  </div>
                </div>

                {/* Connector Line */}
                {!item.match && (
                  <div className="bg-amber-500/10 px-4 py-2 border-t border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                      <span className="text-xs text-amber-400 font-mono">
                        {(item.type || "NARRATIVE-VISUAL CONTRADICTION DETECTED").toUpperCase()}
                      </span>
                    </div>
                    {item.description ? <p className="text-xs text-slate-300 mt-2">{item.description}</p> : null}
                  </div>
                )}
              </div>
            ))}

            {crossModalComparisons.length === 0 ? (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-300 font-mono">
                No cross-modal inconsistencies detected for this report.
              </div>
            ) : null}
          </div>
        </div>

        {/* Verdict Block */}
        <div className="relative">
          {/* Dramatic Glow */}
          <div className={`absolute -inset-1 bg-gradient-to-r ${verdictTone.glow} rounded-2xl opacity-30 blur-xl`} />

          <div className={`relative backdrop-blur-xl border-2 rounded-2xl p-8 ${verdictTone.bg} ${verdictTone.border}`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${verdictTone.bg} ${verdictTone.border}`}>
                    <AlertCircle className={`h-7 w-7 ${verdictTone.text}`} />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold mb-1 ${verdictTone.text}`}>FINAL VERDICT</h3>
                    <p className="text-sm text-slate-400 font-mono">Expert System Analysis</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-5xl font-bold mb-1 ${verdictTone.text}`}>{manipulationScore}%</div>
                <div className="text-sm text-slate-300 font-mono">MANIPULATION SCORE</div>
              </div>
            </div>

            <div className={`bg-[#020617]/50 border rounded-xl p-6 mb-6 ${verdictTone.bg} ${verdictTone.border}`}>
              <h4 className="text-xl font-bold text-white mb-4">{report?.classification.explanation || primaryExplanation}</h4>
              <p className="text-slate-300 leading-relaxed mb-4">
                {primaryExplanation} Analysis identified{" "}
                <strong className={verdictTone.text}>{detectedTechniqueCount} distinct manipulation techniques</strong> with
                multi-signal forensic evidence.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-orange-400">{secondaryExplanation}</strong>
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {manipulationScore <= 20 ? (
                    <CheckCircle2 className={`h-5 w-5 ${verdictTone.text}`} />
                  ) : (
                    <XCircle className={`h-5 w-5 ${verdictTone.text}`} />
                  )}
                  <span className={`text-sm font-semibold ${verdictTone.text}`}>{verdictTone.label}</span>
                </div>
                <p className="text-xs text-slate-400">{report?.manipulation.categories[0] || "Emotional Manipulation"}</p>
              </div>
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {contradictionCount === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className={`h-5 w-5 ${verdictTone.text}`} />
                  )}
                  <span className={`text-sm font-semibold ${contradictionCount === 0 ? "text-emerald-400" : verdictTone.text}`}>
                    {contradictionCount === 0 ? "PASSING CHECK" : "MISMATCH DETECTED"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{report?.anomalies[0]?.type || "Visual Framing Issues"}</p>
              </div>
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-purple-300" />
                  <span className="text-sm font-semibold text-purple-300">SYNTHESIS SCORE</span>
                </div>
                <p className="text-xs text-slate-400">{synthesisScore}% Aggregated Confidence</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-4 mt-8">
          <Button
            onClick={() => navigate(citizenViewPath)}
            className="flex-1 bg-[#1e293b]/50 hover:bg-[#1e293b] text-white border border-slate-700"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            View Simple Report
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="flex-1 bg-[#1e293b]/50 hover:bg-[#1e293b] text-white border border-slate-700"
          >
            Analyze New Media
          </Button>
        </div>
      </main>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
}
