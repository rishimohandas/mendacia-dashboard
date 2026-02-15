import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { Play, Sparkles, Shield, Database, Zap } from "lucide-react";
import { uploadEvidence, uploadTextContent } from "../../services/api";
import { Button } from "../components/ui/button";

export function HomePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [textInput, setTextInput] = useState("");

  const openFilePicker = () => {
    if (isUploading) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      const { job_id } = await uploadEvidence(file);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("mendacia:lastJobId", job_id);
        window.localStorage.setItem(`mendacia:jobFilename:${job_id}`, file.name);
        window.localStorage.setItem("mendacia:lastFilename", file.name);
      }
      navigate(`/citizen-view?jobId=${encodeURIComponent(job_id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed. Please try again.";
      window.alert(message);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleTextSubmit = async () => {
    const payload = textInput.trim();
    if (!payload || isUploading) {
      return;
    }

    setIsUploading(true);
    try {
      const { job_id } = await uploadTextContent(payload);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("mendacia:lastJobId", job_id);
      }
      navigate(`/citizen-view?jobId=${encodeURIComponent(job_id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed. Please try again.";
      window.alert(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
      
      {/* Scan Line Animation */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#22d3ee]/5 to-transparent h-32 animate-[scan_4s_ease-in-out_infinite]" />
      </div>

      {/* Glassmorphic Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-72 bg-[#1e293b]/30 backdrop-blur-xl border-r border-[#22d3ee]/20 z-10">
        <div className="p-6">
          {/* Logo with Glitch Effect */}
          <div className="mb-12 relative">
            <h1 className="text-3xl font-bold text-[#22d3ee] tracking-wider relative inline-block">
              MENDACIA
              <span className="absolute inset-0 text-[#ef4444] opacity-70 animate-[glitch_3s_infinite]" style={{ clipPath: 'inset(0 0 50% 0)' }}>
                MENDACIA
              </span>
            </h1>
          </div>

          {/* Recent Investigations */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Recent Investigations
            </h3>
            {[
              { id: 1, title: "protest_march_2024.mp4", risk: 84, status: "critical" },
              { id: 2, title: "news_broadcast_feb.mp4", risk: 67, status: "high" },
              { id: 3, title: "social_media_clip.mp4", risk: 42, status: "medium" },
              { id: 4, title: "interview_segment.mp4", risk: 18, status: "low" },
            ].map((item) => (
              <div
                key={item.id}
                className="group relative bg-[#1e293b]/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 hover:border-[#22d3ee]/50 transition-all cursor-pointer overflow-hidden"
              >
                {/* Thumbnail Blur */}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur-md" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2">
                    <Play className="h-4 w-4 text-[#22d3ee]" />
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        item.status === "critical"
                          ? "bg-[#ef4444]/20 text-[#ef4444]"
                          : item.status === "high"
                          ? "bg-orange-500/20 text-orange-400"
                          : item.status === "medium"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {item.risk}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono truncate">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-72 relative z-20">
        {/* Header */}
        <header className="border-b border-[#22d3ee]/10 bg-[#020617]/50 backdrop-blur-xl">
          <div className="container mx-auto px-12 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Multimodal Media Forensics</h2>
                <p className="text-sm text-slate-400 font-mono">Powered by TwelveLabs Intelligence</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-[#22d3ee]/10 border border-[#22d3ee]/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#22d3ee] animate-pulse" />
                    <span className="text-xs text-[#22d3ee] font-mono">SYSTEM ACTIVE</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Upload Zone */}
        <div className="container mx-auto px-12 py-16">
          <div className="max-w-4xl mx-auto">
            {/* Holographic Elements */}
            <div className="relative">
              {/* Floating Analysis Tags */}
              <div className="absolute -top-8 left-20 bg-[#22d3ee]/10 backdrop-blur-sm border border-[#22d3ee]/30 rounded-full px-4 py-2 animate-float">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#22d3ee]" />
                  <span className="text-xs text-[#22d3ee] font-mono">Analyzing Visuals</span>
                </div>
              </div>

              <div className="absolute -top-8 right-20 bg-[#22d3ee]/10 backdrop-blur-sm border border-[#22d3ee]/30 rounded-full px-4 py-2 animate-float-delayed">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[#22d3ee]" />
                  <span className="text-xs text-[#22d3ee] font-mono">Extracting Audio</span>
                </div>
              </div>

              {/* Main Upload + Text Input */}
              <div className="relative group">
                {/* Glow Effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[#22d3ee] via-[#22d3ee] to-[#22d3ee] rounded-2xl opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />
                
                {/* Drop Zone */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={openFilePicker}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openFilePicker();
                    }
                  }}
                  className="relative bg-[#1e293b]/30 backdrop-blur-xl border-2 border-dashed border-[#22d3ee]/50 rounded-2xl p-16 text-center group-hover:border-[#22d3ee] transition-all cursor-pointer"
                >
                  {/* Pulsing Scan Effect */}
                  <div className="absolute inset-0 bg-gradient-to-b from-[#22d3ee]/0 via-[#22d3ee]/10 to-[#22d3ee]/0 animate-pulse rounded-2xl" />
                  
                  <div className="relative z-10">
                    <div className="mb-8 relative inline-block">
                      <Shield className="h-24 w-24 text-[#22d3ee] animate-pulse" />
                      <div className="absolute inset-0 bg-[#22d3ee]/20 rounded-full blur-2xl" />
                    </div>

                    <h3 className="text-3xl font-bold text-white mb-4">
                      Upload a file below
                    </h3>
                    <p className="text-lg text-slate-400 mb-8 font-mono">
                      Upload Evidence • MP4 • PDF • TXT
                    </p>

                    <div className="flex items-center justify-center gap-6 mb-8">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Database className="h-4 w-4" />
                        <span className="font-mono">Encrypted Transfer</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Shield className="h-4 w-4" />
                        <span className="font-mono">Forensic Grade</span>
                      </div>
                    </div>

                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        openFilePicker();
                      }}
                      disabled={isUploading}
                      className="bg-[#22d3ee] hover:bg-[#22d3ee]/90 text-[#020617] px-8 py-6 text-lg font-bold rounded-lg transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] relative overflow-hidden group"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        <Play className="h-5 w-5" />
                        {isUploading ? "Uploading..." : "View Media Safety Analysis"}
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    </Button>

                    <p className="text-xs text-slate-600 mt-6 font-mono">
                      DEMO MODE • NO UPLOAD REQUIRED
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.pdf,.txt,video/mp4,application/pdf,text/plain"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>

              <div className="mt-6 rounded-2xl border border-slate-700/50 bg-[#1e293b]/40 backdrop-blur-xl p-6">
                <h4 className="text-white font-semibold mb-2">Or Paste Text Directly</h4>
                <p className="text-xs text-slate-400 font-mono mb-3">
                  Submit article text, transcript snippets, or claims without uploading a file.
                </p>
                <textarea
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  disabled={isUploading}
                  placeholder="Paste text to analyze..."
                  rows={6}
                  className="w-full rounded-lg border border-slate-700 bg-[#020617]/70 text-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/40"
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={handleTextSubmit}
                    disabled={isUploading || !textInput.trim()}
                    className="bg-[#22d3ee] hover:bg-[#22d3ee]/90 text-[#020617] font-semibold"
                  >
                    {isUploading ? "Submitting..." : "Analyze Pasted Text"}
                  </Button>
                </div>
              </div>

              {/* Processing Steps */}
              <div className="grid grid-cols-3 gap-6 mt-12">
                {[
                  { icon: Play, label: "Scene Segmentation", desc: "AI-powered frame analysis" },
                  { icon: Sparkles, label: "Cross-Modal Detection", desc: "Visual-audio consistency" },
                  { icon: Shield, label: "Forensic Report", desc: "Detailed evidence output" },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-[#1e293b]/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 text-center group hover:border-[#22d3ee]/50 transition-all"
                  >
                    <div className="h-12 w-12 mx-auto mb-4 bg-[#22d3ee]/10 rounded-lg flex items-center justify-center group-hover:bg-[#22d3ee]/20 transition-colors">
                      <step.icon className="h-6 w-6 text-[#22d3ee]" />
                    </div>
                    <h4 className="text-white font-semibold mb-2">{step.label}</h4>
                    <p className="text-xs text-slate-500 font-mono">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(0); opacity: 0; }
          50% { transform: translateY(100vh); opacity: 1; }
        }
        
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          33% { transform: translate(-2px, 2px); }
          66% { transform: translate(2px, -2px); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        .animate-float-delayed {
          animation: float-delayed 3s ease-in-out infinite;
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}
