import { useNavigate } from "react-router";
import { Volume2, Eye, AlertTriangle, ArrowRight, Shield, ChevronLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export function CitizenViewPage() {
  const navigate = useNavigate();
  const trustScore = 16; // 84% manipulation = 16% trust

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
            <Button
              onClick={() => navigate("/forensic-lab")}
              className="bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30"
            >
              Unlock Full Forensic Evidence
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-8 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Video Info */}
          <div className="text-center mb-12">
            <div className="inline-block bg-[#1e293b]/50 backdrop-blur-sm border border-slate-700/50 rounded-lg px-6 py-3 mb-4">
              <p className="text-sm text-slate-400 font-mono">protest_march_2024.mp4</p>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Media Safety Analysis</h2>
            <p className="text-slate-400">Simple breakdown for everyone</p>
          </div>

          {/* Trust Gauge - The Hero Element */}
          <div className="relative mb-16">
            {/* Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#ef4444]/20 via-orange-500/10 to-transparent blur-3xl" />
            
            <div className="relative bg-[#1e293b]/30 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-12">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">Trust Gauge</h3>
                <p className="text-slate-400 text-sm">How reliable is this content?</p>
              </div>

              {/* Semi-Circle Gauge */}
              <div className="relative w-full max-w-md mx-auto mb-8">
                <svg viewBox="0 0 200 120" className="w-full">
                  {/* Background Arc */}
                  <path
                    d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Colored Segments */}
                  {/* Red Zone (0-30) */}
                  <path
                    d="M 20 100 A 80 80 0 0 1 62 35"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Orange Zone (30-60) */}
                  <path
                    d="M 62 35 A 80 80 0 0 1 100 20"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Yellow Zone (60-80) */}
                  <path
                    d="M 100 20 A 80 80 0 0 1 138 35"
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Green Zone (80-100) */}
                  <path
                    d="M 138 35 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Needle */}
                  <g transform={`rotate(${-90 + (trustScore * 1.8)} 100 100)`}>
                    <line
                      x1="100"
                      y1="100"
                      x2="100"
                      y2="40"
                      stroke="#22d3ee"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="100" r="8" fill="#22d3ee" />
                    <circle cx="100" cy="100" r="4" fill="#020617" />
                  </g>
                  
                  {/* Center Labels */}
                  <text x="20" y="115" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                    DANGER
                  </text>
                  <text x="160" y="115" fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="end">
                    SAFE
                  </text>
                </svg>

                {/* Score Display */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-8">
                  <div className="text-center">
                    <div className="text-6xl font-bold text-[#ef4444] mb-2">
                      {84}%
                    </div>
                    <div className="text-lg font-semibold text-[#ef4444] mb-1">
                      MANIPULATION DETECTED
                    </div>
                    <div className="text-sm text-slate-400 font-mono">
                      Trust Rating: LOW
                    </div>
                  </div>
                </div>
              </div>

              {/* Traffic Light Indicator */}
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-[#ef4444] shadow-[0_0_20px_rgba(239,68,68,0.5)]" />
                  <span className="text-sm text-slate-400 font-mono">RED ALERT</span>
                </div>
                <div className="h-6 w-px bg-slate-700" />
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-slate-700" />
                  <span className="text-sm text-slate-600 font-mono">CAUTION</span>
                </div>
                <div className="h-6 w-px bg-slate-700" />
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-slate-700" />
                  <span className="text-sm text-slate-600 font-mono">SAFE</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key Findings Cards */}
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white text-center mb-8">What We Found</h3>

            {/* Finding 1: Emotional Language */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#ef4444]/50 to-orange-500/50 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
              <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-[#ef4444]/30 rounded-2xl p-8">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="h-16 w-16 rounded-2xl bg-[#ef4444]/20 flex items-center justify-center">
                      <Volume2 className="h-8 w-8 text-[#ef4444]" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-xl font-bold text-white">Tone Check</h4>
                      <span className="px-3 py-1 bg-[#ef4444]/20 border border-[#ef4444]/40 rounded-full text-xs font-bold text-[#ef4444] font-mono">
                        SCARE TACTICS
                      </span>
                    </div>
                    <p className="text-lg text-slate-300 mb-4">
                      Aggressive & Fear-based language detected
                    </p>
                    <p className="text-sm text-slate-400">
                      The video uses words like "crisis," "disaster," and "terror" to make you feel scared 
                      and worried. This is a common manipulation technique.
                    </p>
                    
                    {/* Fear Meter */}
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-500 font-mono">FEAR LEVEL</span>
                        <span className="text-xs font-bold text-[#ef4444]">HIGH</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-500 to-[#ef4444] rounded-full w-[85%]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Finding 2: Exaggerated Visuals */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/50 to-yellow-500/50 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
              <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-orange-500/30 rounded-2xl p-8">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="h-16 w-16 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                      <Eye className="h-8 w-8 text-orange-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-xl font-bold text-white">Visual Check</h4>
                      <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 rounded-full text-xs font-bold text-orange-400 font-mono">
                        20x INFLATED
                      </span>
                    </div>
                    <p className="text-lg text-slate-300 mb-4">
                      Crowd size appears digitally inflated
                    </p>
                    <p className="text-sm text-slate-400">
                      The images shown are edited to look more dramatic than reality. Close-ups and 
                      camera angles make small groups look like massive crowds.
                    </p>
                    
                    {/* VS Icon */}
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 flex-1 bg-slate-800/50 rounded-lg p-3">
                          <Volume2 className="h-5 w-5 text-slate-400" />
                          <span className="text-xs text-slate-300 font-mono">WHAT THEY SAY</span>
                        </div>
                        <div className="text-xl font-bold text-orange-400">VS</div>
                        <div className="flex items-center gap-2 flex-1 bg-slate-800/50 rounded-lg p-3">
                          <Eye className="h-5 w-5 text-slate-400" />
                          <span className="text-xs text-slate-300 font-mono">WHAT WE SEE</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Finding 3: False Crisis Framing */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/50 to-[#ef4444]/50 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
              <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-8">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="h-16 w-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
                      <AlertTriangle className="h-8 w-8 text-yellow-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-xl font-bold text-white">Mismatch Alert</h4>
                      <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/40 rounded-full text-xs font-bold text-yellow-400 font-mono">
                        FACT CHECK
                      </span>
                    </div>
                    <p className="text-lg text-slate-300 mb-4">
                      What you hear doesn't match what is shown
                    </p>
                    <p className="text-sm text-slate-400">
                      The narrator talks about "violent chaos" but the video shows peaceful, organized 
                      protesters. This mismatch is designed to make you feel more alarmed than you should.
                    </p>
                    
                    {/* Inconsistency Bar */}
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-400" />
                        <div className="flex-1">
                          <div className="text-xs text-slate-500 font-mono mb-1">INCONSISTENCY LEVEL</div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full w-[78%]" />
                          </div>
                        </div>
                        <span className="text-xs font-bold text-yellow-400">78%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="mt-12 text-center">
            <Button
              onClick={() => navigate("/forensic-lab")}
              size="lg"
              className="bg-gradient-to-r from-[#22d3ee] to-cyan-600 hover:from-[#22d3ee]/90 hover:to-cyan-600/90 text-[#020617] px-8 py-6 text-lg font-bold rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)] transition-all"
            >
              <Shield className="h-5 w-5 mr-2" />
              Unlock Full Forensic Evidence
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
