import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Shield, ChevronLeft, FileDown, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

import { fetchAnalysis, pollJobStatus } from "../../services/api";
import type { ForensicReport } from "../../services/adapter";

type UiSeverity = "critical" | "high" | "medium" | "low";

type RadarPoint = {
  category: string;
  value: number;
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

const demoRadarData: RadarPoint[] = [
  { category: "Fear", value: 92 },
  { category: "Urgency", value: 85 },
  { category: "Bias", value: 78 },
  { category: "Synthetic", value: 45 },
  { category: "Logical", value: 68 },
  { category: "Visual", value: 88 },
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

export function ForensicLabPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const jobId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("jobId") ?? "").trim();
  }, [location.search]);

  const isLiveMode = jobId.length > 0;
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

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

  const trustScore = clamp(Math.round(report?.classification.score ?? 84));
  const dominantSeverity = getDominantSeverity(report);
  const verdictHeadline = report
    ? (report.classification.label || "unknown").replace(/[-_]/g, " ").toUpperCase()
    : "HIGHLY MANIPULATED: SYSTEMATIC NARRATIVE DISTORTION";

  const radarData = useMemo<RadarPoint[]>(() => {
    if (!report) {
      return demoRadarData;
    }

    const highCount = report.anomalies.filter((item) => item.severity === "high").length;
    const mediumCount = report.anomalies.filter((item) => item.severity === "medium").length;
    const lowCount = report.anomalies.filter((item) => item.severity === "low").length;
    const sceneCoverage = report.scenes.length
      ? (report.scenes.filter((scene) => scene.objects.length > 0).length / report.scenes.length) * 100
      : 0;

    return [
      { category: "Fear", value: trustScore },
      { category: "Urgency", value: clamp(report.anomalies.length * 18) },
      { category: "Bias", value: clamp(report.manipulation.categories.length * 20) },
      { category: "Synthetic", value: clamp(highCount * 25 + mediumCount * 15) },
      { category: "Logical", value: clamp(100 - (highCount * 22 + mediumCount * 12 + lowCount * 6)) },
      { category: "Visual", value: clamp(Math.round(sceneCoverage)) },
    ];
  }, [report, trustScore]);

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
                onClick={() => navigate("/citizen-view")}
                className="text-slate-400 hover:text-white hover:bg-[#1e293b]/50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Simple View
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
            <Button className="bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30">
              <FileDown className="h-4 w-4 mr-2" />
              Export Certified PDF Report
            </Button>
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
          {/* Radar Chart */}
          <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Manipulation Signature</h3>
              <div className="px-3 py-1 bg-[#ef4444]/20 border border-[#ef4444]/40 rounded-full">
                <span className="text-xs font-bold text-[#ef4444] font-mono">{dominantSeverity.toUpperCase()}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="category" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#94a3b8" }} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#22d3ee"
                  fill="#22d3ee"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {radarData.slice(0, 3).map((item) => (
                <div key={item.category} className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-[#22d3ee] mb-1">{Math.round(item.value)}%</div>
                  <div className="text-xs text-slate-400 font-mono">{item.category}</div>
                </div>
              ))}
            </div>
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
          <div className="absolute -inset-1 bg-gradient-to-r from-[#ef4444] via-orange-500 to-[#ef4444] rounded-2xl opacity-30 blur-xl" />

          <div className="relative bg-gradient-to-br from-[#ef4444]/20 to-[#ef4444]/5 backdrop-blur-xl border-2 border-[#ef4444]/50 rounded-2xl p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-[#ef4444]/30 flex items-center justify-center">
                    <AlertCircle className="h-7 w-7 text-[#ef4444]" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-[#ef4444] mb-1">FINAL VERDICT</h3>
                    <p className="text-sm text-slate-400 font-mono">Expert System Analysis</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-5xl font-bold text-[#ef4444] mb-1">{trustScore}%</div>
                <div className="text-sm text-slate-400 font-mono">MANIPULATION SCORE</div>
              </div>
            </div>

            <div className="bg-[#020617]/50 border border-[#ef4444]/30 rounded-xl p-6 mb-6">
              <h4 className="text-xl font-bold text-white mb-4">{verdictHeadline}</h4>
              <p className="text-slate-300 leading-relaxed mb-4">
                {primaryExplanation} Analysis identified{" "}
                <strong className="text-[#ef4444]">{detectedTechniqueCount} distinct manipulation techniques</strong> with
                multi-signal forensic evidence.
              </p>
              <p className="text-slate-300 leading-relaxed">
                {secondaryExplanation}{" "}
                <strong className="text-orange-400">
                  Cross-modal inconsistencies detected in {contradictionCount} of {Math.max(analyzedSegmentCount, 1)} segments.
                </strong>
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-[#ef4444]" />
                  <span className="text-sm font-semibold text-[#ef4444]">HIGH RISK</span>
                </div>
                <p className="text-xs text-slate-400">{report?.manipulation.categories[0] || "Emotional Manipulation"}</p>
              </div>
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-orange-400" />
                  <span className="text-sm font-semibold text-orange-400">HIGH RISK</span>
                </div>
                <p className="text-xs text-slate-400">{report?.anomalies[0]?.type || "Visual Framing Issues"}</p>
              </div>
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-400">ANALYSIS COMPLETE</span>
                </div>
                <p className="text-xs text-slate-400">{trustScore}% Confidence Level</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-4 mt-8">
          <Button
            onClick={() => navigate("/citizen-view")}
            variant="outline"
            className="flex-1 border-slate-700 text-slate-300 hover:bg-[#1e293b]/50"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            View Simple Report
          </Button>
          <Button className="flex-1 bg-gradient-to-r from-[#22d3ee] to-cyan-600 hover:from-[#22d3ee]/90 hover:to-cyan-600/90 text-[#020617] font-bold">
            <FileDown className="h-4 w-4 mr-2" />
            Export Certified PDF Report
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
