import { useNavigate } from "react-router";
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

const radarData = [
  { category: "Fear", value: 92 },
  { category: "Urgency", value: 85 },
  { category: "Bias", value: 78 },
  { category: "Synthetic", value: 45 },
  { category: "Logical", value: 68 },
  { category: "Visual", value: 88 },
];

const crossModalComparisons = [
  {
    timestamp: "0:30-1:00",
    speech: '"Chaos is spreading through our streets. People are terrified."',
    visual: "Organized peaceful protest march. No indicators of chaos or terror detected.",
    match: false,
    severity: "critical",
  },
  {
    timestamp: "1:15-1:45",
    speech: '"Unprecedented violence threatens our community."',
    visual: "Standard crowd control procedures. Police observing, no violent activity visible.",
    match: false,
    severity: "high",
  },
  {
    timestamp: "2:10-2:30",
    speech: '"This crisis demands immediate action NOW."',
    visual: "Rapid scene cuts with dramatic red color grading. Context removed.",
    match: false,
    severity: "high",
  },
];

export function ForensicLabPage() {
  const navigate = useNavigate();

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
            <Button
              className="bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export Certified PDF Report
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Bento Box Layout */}
      <main className="relative z-10 container mx-auto px-8 py-8">
        {/* Top Row */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Radar Chart */}
          <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Manipulation Signature</h3>
              <div className="px-3 py-1 bg-[#ef4444]/20 border border-[#ef4444]/40 rounded-full">
                <span className="text-xs font-bold text-[#ef4444] font-mono">CRITICAL</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis
                  dataKey="category"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
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
                  <div className="text-2xl font-bold text-[#22d3ee] mb-1">{item.value}%</div>
                  <div className="text-xs text-slate-400 font-mono">{item.category}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Manipulation Taxonomy */}
          <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6">Manipulation Taxonomy</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {[
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
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    item.severity === "critical"
                      ? "bg-[#ef4444]/10 border-[#ef4444]/30"
                      : item.severity === "high"
                      ? "bg-orange-500/10 border-orange-500/30"
                      : item.severity === "medium"
                      ? "bg-yellow-500/10 border-yellow-500/30"
                      : "bg-blue-500/10 border-blue-500/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-sm ${
                        item.severity === "critical"
                          ? "text-[#ef4444]"
                          : item.severity === "high"
                          ? "text-orange-400"
                          : item.severity === "medium"
                          ? "text-yellow-400"
                          : "text-blue-400"
                      }`}
                    >
                      {item.tag}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400 font-mono">×{item.count}</span>
                    <div
                      className={`h-2 w-2 rounded-full ${
                        item.severity === "critical"
                          ? "bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                          : item.severity === "high"
                          ? "bg-orange-500"
                          : item.severity === "medium"
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                      }`}
                    />
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
              <h3 className="text-lg font-bold text-white mb-1">
                Cross-Modal Consistency Engine
              </h3>
              <p className="text-sm text-slate-400 font-mono">
                Speech Transcript vs TwelveLabs Visual Analysis
              </p>
            </div>
            <div className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 rounded-full">
              <span className="text-xs font-bold text-orange-400 font-mono">
                5 CONTRADICTIONS
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {crossModalComparisons.map((item, idx) => (
              <div
                key={idx}
                className={`border rounded-xl overflow-hidden ${
                  item.severity === "critical"
                    ? "border-[#ef4444]/30"
                    : "border-orange-500/30"
                }`}
              >
                <div className="bg-slate-800/50 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">
                      TIMESTAMP: {item.timestamp}
                    </span>
                    {!item.match && (
                      <div className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 text-[#ef4444]" />
                        <span className="text-xs font-bold text-[#ef4444]">MISMATCH</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-xs font-mono ${
                      item.severity === "critical" ? "text-[#ef4444]" : "text-orange-400"
                    }`}
                  >
                    {item.severity.toUpperCase()}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-0 divide-x divide-slate-700/50">
                  {/* Speech Column */}
                  <div className="p-4 bg-[#1e293b]/30">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-400">S</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 font-mono">
                        SPEECH TRANSCRIPT
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 italic">{item.speech}</p>
                  </div>

                  {/* Visual Column */}
                  <div className="p-4 bg-[#1e293b]/30">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded bg-purple-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-400">V</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 font-mono">
                        VISUAL ANALYSIS
                      </span>
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
                        NARRATIVE-VISUAL CONTRADICTION DETECTED
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
                <div className="text-5xl font-bold text-[#ef4444] mb-1">84%</div>
                <div className="text-sm text-slate-400 font-mono">MANIPULATION SCORE</div>
              </div>
            </div>

            <div className="bg-[#020617]/50 border border-[#ef4444]/30 rounded-xl p-6 mb-6">
              <h4 className="text-xl font-bold text-white mb-4">
                HIGHLY MANIPULATED: SYSTEMATIC NARRATIVE DISTORTION
              </h4>
              <p className="text-slate-300 leading-relaxed mb-4">
                This media exhibits <strong className="text-[#ef4444]">systematic manipulation patterns</strong> across 
                multiple forensic dimensions. Analysis identified <strong>18 distinct manipulation techniques</strong> with 
                critical-severity emotional exploitation, visual-narrative contradictions, and context stripping.
              </p>
              <p className="text-slate-300 leading-relaxed">
                The content demonstrates deliberate design to amplify fear response while presenting 
                selective visual evidence that contradicts factual claims. <strong className="text-orange-400">Cross-modal 
                inconsistencies detected in 5 of 8 analyzed segments.</strong>
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-[#ef4444]" />
                  <span className="text-sm font-semibold text-[#ef4444]">HIGH RISK</span>
                </div>
                <p className="text-xs text-slate-400">Emotional Manipulation</p>
              </div>
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-orange-400" />
                  <span className="text-sm font-semibold text-orange-400">HIGH RISK</span>
                </div>
                <p className="text-xs text-slate-400">Visual Framing Issues</p>
              </div>
              <div className="bg-[#020617]/50 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-400">ANALYSIS COMPLETE</span>
                </div>
                <p className="text-xs text-slate-400">87% Confidence Level</p>
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
          <Button
            className="flex-1 bg-gradient-to-r from-[#22d3ee] to-cyan-600 hover:from-[#22d3ee]/90 hover:to-cyan-600/90 text-[#020617] font-bold"
          >
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
