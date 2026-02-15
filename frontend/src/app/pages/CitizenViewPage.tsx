import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AlertCircle, CheckCircle2, Shield, ChevronLeft } from "lucide-react";
import { fetchAnalysis, pollJobStatus } from "../../services/api";
import type { ForensicReport } from "../../services/adapter";
import { Button } from "../components/ui/button";

const LAST_JOB_ID_STORAGE_KEY = "mendacia:lastJobId";
const LAST_FILENAME_STORAGE_KEY = "mendacia:lastFilename";

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

type ScoreTone = {
  text: string;
  border: string;
  badge: string;
  glow: string;
  label: string;
};

function getScoreTone(score: number): ScoreTone {
  if (score <= 20) {
    return {
      text: "text-emerald-400",
      border: "border-emerald-500/30",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      glow: "from-emerald-500/20 via-emerald-400/10",
      label: "LOW RISK",
    };
  }
  if (score <= 45) {
    return {
      text: "text-orange-400",
      border: "border-orange-500/30",
      badge: "bg-orange-500/20 text-orange-300 border-orange-500/40",
      glow: "from-orange-500/20 via-orange-400/10",
      label: "MODERATE RISK",
    };
  }
  return {
    text: "text-[#ef4444]",
    border: "border-[#ef4444]/30",
    badge: "bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/40",
    glow: "from-[#ef4444]/20 via-red-500/10",
    label: "HIGH RISK",
  };
}

export function CitizenViewPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const jobIdFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("jobId") ?? "").trim();
  }, [location.search]);

  const initialStoredJobId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return (window.localStorage.getItem(LAST_JOB_ID_STORAGE_KEY) ?? "").trim();
  }, []);

  const activeJobId = (jobIdFromQuery || initialStoredJobId).trim();
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!jobIdFromQuery || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(LAST_JOB_ID_STORAGE_KEY, jobIdFromQuery);
  }, [jobIdFromQuery]);

  useEffect(() => {
    if (!activeJobId) {
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
    setStatusText("Loading media safety report...");

    const poll = async () => {
      if (isCancelled || isRequestInFlight) {
        return;
      }

      isRequestInFlight = true;
      try {
        const { status } = await pollJobStatus(activeJobId);
        const normalizedStatus = status.toLowerCase();
        setStatusText(`Analysis status: ${status}`);

        if (failedStatuses.has(normalizedStatus)) {
          throw new Error(`Analysis failed with status: ${status}`);
        }

        if (completedStatuses.has(normalizedStatus)) {
          setStatusText("Analysis complete. Loading report...");
          const liveReport = await fetchAnalysis(activeJobId);
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

        const message = error instanceof Error ? error.message : "Unable to load report.";
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
  }, [activeJobId]);

  const confidenceScore = clamp(Math.round(report?.classification.score ?? 0));
  const scoreTone = getScoreTone(confidenceScore);
  const scoreColor = scoreTone.text;
  const gaugeNeedleScore = clamp(confidenceScore);
  const credibilityScore = clamp(100 - confidenceScore);
  const categories = report?.manipulation.categories ?? [];
  const flags = report?.anomalies ?? [];
  const synthesisScore = useMemo(() => {
    if (!report) {
      return 0;
    }

    const confidences = report.manipulation.breakdown
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) {
          return null;
        }
        const confidence = (entry as { confidence?: unknown }).confidence;
        return typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null;
      })
      .filter((value): value is number => value !== null);

    const rationaleStrength = confidences.length
      ? (confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100
      : confidenceScore;
    const consistencyPenalty = clamp(flags.length * 7, 0, 25);

    return clamp(Math.round(rationaleStrength * 0.65 + confidenceScore * 0.35 + consistencyPenalty));
  }, [confidenceScore, flags.length, report]);

  const reportText = report?.human_readable_report?.trim() || "No human-readable report available.";
  const videoFilename = useMemo(() => {
    const candidate = report?.metadata.filename?.trim();
    if (candidate && candidate !== "Unknown Video") {
      return candidate;
    }
    if (typeof window !== "undefined") {
      const jobFilename = activeJobId
        ? window.localStorage.getItem(`mendacia:jobFilename:${activeJobId}`)
        : null;
      if (jobFilename) {
        return jobFilename;
      }
      const lastFilename = window.localStorage.getItem(LAST_FILENAME_STORAGE_KEY);
      if (lastFilename) {
        return lastFilename;
      }
    }
    return report?.metadata.video_id || "No report loaded";
  }, [activeJobId, report?.metadata.filename, report?.metadata.video_id]);
  const forensicPath = activeJobId ? `/forensic-lab?jobId=${encodeURIComponent(activeJobId)}` : "/forensic-lab";

  return (
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[size:50px_50px] opacity-50" />

      {/* Header */}
      <header className="relative z-10 border-b border-[#22d3ee]/10 bg-[#020617]/80 backdrop-blur-xl">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-slate-400 hover:text-white hover:bg-[#1e293b]/50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="h-8 w-px bg-slate-700" />
              <div className="flex items-center gap-3">
                <Shield className="h-7 w-7 text-[#22d3ee]" />
                <div>
                  <h1 className="text-xl font-bold text-white">MENDACIA</h1>
                  <p className="text-xs text-slate-400 font-mono">CITIZEN REPORT</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-8 py-12">
        <div className="max-w-3xl mx-auto">
          {(isLoadingReport || errorText || !activeJobId) && (
            <div className="mb-8 rounded-xl border border-[#22d3ee]/30 bg-[#1e293b]/40 backdrop-blur-xl p-4">
              <div className="flex items-center gap-3">
                {isLoadingReport ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#22d3ee] animate-pulse" />
                ) : errorText ? (
                  <AlertCircle className="h-4 w-4 text-[#ef4444]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[#22d3ee]" />
                )}
                <p className={`text-sm font-mono ${errorText ? "text-[#ef4444]" : "text-slate-300"}`}>
                  {(errorText ?? statusText) || "Upload and analyze a video to load backend-generated report data."}
                </p>
              </div>
            </div>
          )}

          {/* Video Info */}
          <div className="text-center mb-12">
            <div className="inline-block bg-[#1e293b]/50 backdrop-blur-sm border border-slate-700/50 rounded-lg px-6 py-3 mb-4">
              <p className="text-sm text-slate-400 font-mono">
                {videoFilename}
              </p>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Media Safety Analysis</h2>
          </div>

          {/* Trust Gauge - The Hero Element */}
          <div className="relative mb-16">
            {/* Glow Effect */}
            <div className={`absolute inset-0 bg-gradient-to-b ${scoreTone.glow} to-transparent blur-3xl`} />
            
            <div className={`relative bg-[#1e293b]/30 backdrop-blur-xl border rounded-3xl p-12 ${scoreTone.border}`}>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">Credibility Gauge</h3>
                <p className="text-slate-400 text-sm">Professional risk profile from backend analysis</p>
              </div>

              {/* Semi-Circle Gauge */}
              <div className="relative w-full max-w-md mx-auto mb-6">
                <svg viewBox="0 0 200 120" className="w-full">
                  <defs>
                    <linearGradient id="credibilityGauge" x1="20" y1="100" x2="180" y2="100" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="45%" stopColor="#eab308" />
                      <stop offset="70%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  {/* Background Arc */}
                  <path
                    d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="24"
                    strokeLinecap="round"
                  />
                  
                  {/* Gradient Arc */}
                  <path
                    d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="url(#credibilityGauge)"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />

                  {[0, 25, 50, 75, 100].map((tick) => {
                    const angle = (-180 + tick * 1.8) * (Math.PI / 180);
                    const x1 = 100 + Math.cos(angle) * 70;
                    const y1 = 100 + Math.sin(angle) * 70;
                    const x2 = 100 + Math.cos(angle) * 78;
                    const y2 = 100 + Math.sin(angle) * 78;
                    return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth="1.5" />;
                  })}

                  {/* Needle */}
                  <g transform={`rotate(${-180 + gaugeNeedleScore * 1.8} 100 100)`}>
                    <line
                      x1="100"
                      y1="100"
                      x2="100"
                      y2="30"
                      stroke="#e2e8f0"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="100" r="9" fill="#e2e8f0" />
                    <circle cx="100" cy="100" r="4" fill="#020617" />
                  </g>
                  
                  {/* Center Labels */}
                  <text x="20" y="115" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                    SAFE
                  </text>
                  <text x="160" y="115" fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="end">
                    DANGER
                  </text>
                </svg>
              </div>

              {/* Score Display */}
              <div className="text-center mb-6">
                <div className={`text-5xl md:text-6xl font-bold mb-2 ${scoreColor}`}>
                  {confidenceScore}%
                </div>
                <div className={`text-lg font-semibold mb-1 ${scoreColor}`}>
                  {scoreTone.label}
                </div>
                <div className="text-sm text-slate-400 font-mono">
                  Manipulation Score
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="bg-[#020617]/60 border border-slate-700/50 rounded-xl p-4 text-center">
                  <div className={`text-3xl font-bold ${scoreColor}`}>{confidenceScore}%</div>
                  <div className="text-xs text-slate-400 font-mono mt-1">MANIPULATION</div>
                </div>
                <div className="bg-[#020617]/60 border border-slate-700/50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-cyan-300">{credibilityScore}%</div>
                  <div className="text-xs text-slate-400 font-mono mt-1">CREDIBILITY</div>
                </div>
                <div className="bg-[#020617]/60 border border-slate-700/50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-purple-300">{synthesisScore}%</div>
                  <div className="text-xs text-slate-400 font-mono mt-1">SYNTHESIS SCORE</div>
                </div>
              </div>
            </div>
          </div>

          {/* Backend Report */}
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white text-center mb-8">What We Found</h3>
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#ef4444]/50 to-orange-500/50 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
              <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-[#ef4444]/30 rounded-2xl p-8">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[#ef4444]/20 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-[#ef4444]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-xl font-bold text-white">Report Overview</h4>
                      <span className="px-3 py-1 bg-[#ef4444]/20 border border-[#ef4444]/40 rounded-full text-xs font-bold text-[#ef4444] font-mono">
                        BACKEND OUTPUT
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{reportText}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/50 to-yellow-500/50 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
              <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-orange-500/30 rounded-2xl p-8">
                <div className="flex items-start gap-6">
                  <div className="h-12 w-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-xl font-bold text-white">Detected Categories</h4>
                      <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 rounded-full text-xs font-bold text-orange-400 font-mono">
                        {categories.length}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categories.length ? (
                        categories.map((category, index) => (
                          <span
                            key={`${category}-${index}`}
                            className="px-3 py-1 bg-slate-800/60 border border-slate-700/50 rounded-full text-xs text-slate-300 font-mono"
                          >
                            {category}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">No categories reported.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/50 to-[#ef4444]/50 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
              <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-8">
                <div className="flex items-start gap-6">
                  <div className="h-12 w-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-xl font-bold text-white">Consistency Flags</h4>
                      <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/40 rounded-full text-xs font-bold text-yellow-400 font-mono">
                        {flags.length}
                      </span>
                    </div>
                    <div className="space-y-3 mt-2">
                      {flags.length ? (
                        flags.map((flag) => (
                          <div key={`${flag.id}-${flag.timestamp}`} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm text-slate-200 font-semibold">{flag.type || "Inconsistency"}</p>
                              <p className="text-xs text-slate-400 font-mono">{flag.timestamp}</p>
                            </div>
                            <p className="text-xs text-slate-400">{flag.description || "No details provided."}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">No inconsistency flags were reported.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="mt-12 text-center">
            <Button
              onClick={() => navigate(forensicPath)}
              size="lg"
              className="bg-gradient-to-r from-[#22d3ee] to-cyan-600 hover:from-[#22d3ee]/90 hover:to-cyan-600/90 text-[#020617] px-8 py-6 text-lg font-bold rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)] transition-all"
            >
              <Shield className="h-5 w-5 mr-2" />
              View Detailed Analytics
            </Button>
            <p className="text-sm text-slate-500 mt-4 font-mono">
              See detailed analysis with timestamps and expert-level data
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
