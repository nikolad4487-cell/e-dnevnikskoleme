import React, { useState } from 'react';
import { Brain, AlertTriangle, ShieldCheck, CheckCircle2, Award, Zap, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface DossierAiAnalyticsTabProps {
  studentId: string;
  studentName: string;
  gpa: number;
  grades: { subject: string; value: string }[];
  absencesJustified: number;
  absencesUnjustified: number;
  conduct: string;
  pedagogicalMeasures: { type: string; explanation: string }[];
}

export function DossierAiAnalyticsTab({
  studentId,
  studentName,
  gpa,
  grades,
  absencesJustified,
  absencesUnjustified,
  conduct,
  pedagogicalMeasures
}: DossierAiAnalyticsTabProps) {
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    analysis: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_reasons: string[];
    recommendations: string[];
    mode: 'AI_GENERATED' | 'LOCAL_HEURISTICS';
  } | null>(null);

  const runAiEvaluation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName,
          gpa,
          grades,
          absencesJustified,
          absencesUnjustified,
          conduct,
          pedagogicalMeasures
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data);
        toast.success(data.mode === 'AI_GENERATED' ? 'AI stručna analiza završena.' : 'Heuristička evaluacija završena.');
      } else {
        toast.error('AI model trenutno nije dostupan.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Komunikacijska greška sa serverom.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b pb-4 items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 uppercase">AI Analitika i prevencija pada razreda</h3>
          <p className="text-xs text-gray-500 font-medium">Prediktivna evaluacija rizika, analiza uspjeha strukovnog smjera i preporuke za stručnu službu</p>
        </div>
        <button 
          type="button"
          id="run-ai-btn"
          onClick={runAiEvaluation}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#005c8d] hover:bg-[#004a70] text-white text-xs font-black uppercase tracking-wider rounded shadow transition-all cursor-pointer select-none"
        >
          {loading ? (
            <>
              <RefreshCw className="animate-spin" size={14} /> Analiziranje...
            </>
          ) : (
            <>
              <Brain size={14} /> Pokreni AI evaluaciju
            </>
          )}
        </button>
      </div>

      {!analysisResult && !loading && (
        <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/20 border border-blue-200/50 rounded-lg p-8 text-center max-w-2xl mx-auto space-y-4">
          <Brain className="text-[#005c8d]/80 mx-auto" size={48} />
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">UTS Integrirani AI Modul za prevenciju ispisa</h4>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            UTS prediktivna analitika koristi siguran server-side jezični model za provjeravanje trenutačnih zaključnih ocjena, kretanja izostanaka, upisanih pedagoških pritužbi i ponašanja srednjoškolca.
            AI ne provodi automatske administrativne odluke, već služi isključivo kao podrška i savjetnik stručnoj službi (pedagog, psiholog) pri donošenju preventivnih planova podrške.
          </p>
          <div className="pt-2">
            <button 
              type="button" 
              onClick={runAiEvaluation} 
              className="px-6 py-2 border border-[#005c8d] text-[#005c8d] hover:bg-[#005c8d]/5 text-[10px] font-black uppercase tracking-widest rounded"
            >
              Učitaj status i evaluaciju
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-dashed rounded">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-[#005c8d] rounded-full animate-spin mb-4" />
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Model učitava podatke o predmetima, izostancima i mjerama...</div>
          <div className="text-[9px] text-gray-400 font-bold uppercase mt-1">UTS AI modul pretražuje arhivske transakcije</div>
        </div>
      )}

      {analysisResult && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          
          {/* LEFT WIDGET - THE TARGET STATUS */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Risk Indicator Card */}
            <div className={`border p-6 rounded-md text-center space-y-3 shadow-sm ${
              analysisResult.risk_level === 'HIGH'
                ? "bg-red-50/50 border-red-200"
                : analysisResult.risk_level === 'MEDIUM'
                  ? "bg-amber-50/50 border-amber-200"
                  : "bg-green-50/50 border-green-200"
            }`}>
              <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest">RAZINA AKADEMSKOG RIZIKA</span>
              
              <div className="flex items-center justify-center gap-2">
                {analysisResult.risk_level === 'HIGH' && (
                  <div className="flex flex-col items-center gap-1">
                    <AlertTriangle className="text-red-600 animate-bounce" size={40} />
                    <span className="text-xl font-black text-red-700 uppercase tracking-tight">Kritičan rizik (HIGH)</span>
                  </div>
                )}
                {analysisResult.risk_level === 'MEDIUM' && (
                  <div className="flex flex-col items-center gap-1">
                    <Zap className="text-amber-500" size={36} />
                    <span className="text-xl font-black text-amber-700 uppercase tracking-tight">Povećan rizik (MEDIUM)</span>
                  </div>
                )}
                {analysisResult.risk_level === 'LOW' && (
                  <div className="flex flex-col items-center gap-1">
                    <ShieldCheck className="text-green-600" size={40} />
                    <span className="text-xl font-black text-green-700 uppercase tracking-tight">Niski rizik (LOW)</span>
                  </div>
                )}
              </div>

              <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest pt-1 border-t border-dashed">
                UTS rano upozoravanje
              </div>
            </div>

            {/* Specific AI Triggers Bullet points */}
            <div className="bg-white border rounded-md p-5 space-y-3 shadow-sm">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide border-b pb-1">Identificirani okidači rizika:</h4>
              <ul className="space-y-2">
                {analysisResult.risk_reasons.map((reason, idx) => (
                  <li key={idx} className="text-xs text-red-600 font-bold leading-normal flex items-start gap-2">
                    <span className="inline-block w-1.5 h-1.5 bg-red-600 rounded-full mt-1.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-[9px] text-[#005c8d] bg-sky-50 p-3 rounded-md font-bold uppercase border border-sky-100 text-center">
              Izvor: {analysisResult.mode === 'AI_GENERATED' ? 'Live @google/genai Model (3.5-flash)' : 'UTS deterministički lokalni pravilnik'}
            </div>
          </div>

          {/* RIGHT PANELS - COMMENTARY & SUPPORT PLAN GUIDELINES */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Narrative Overview card */}
            <div className="bg-white border p-6 rounded-md shadow-sm space-y-3">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide border-b border-gray-100 pb-2">Stručna pedagoška analiza uspjeha</h4>
              <p className="text-xs leading-relaxed text-slate-700 font-semibold whitespace-pre-wrap">{analysisResult.analysis}</p>
            </div>

            {/* Progressive counseling Action list */}
            <div className="bg-white border border-blue-200/60 p-6 rounded-md shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 border-b border-blue-100 pb-2">
                <Brain size={16} className="text-[#005c8d]" /> Preventivni plan podrške i preporuke stručnoj službi
              </h3>
              <ol className="space-y-3">
                {analysisResult.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-3 text-xs font-semibold leading-relaxed text-slate-800">
                    <span className="w-5 h-5 bg-[#005c8d] text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{i + 1}</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ol>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
