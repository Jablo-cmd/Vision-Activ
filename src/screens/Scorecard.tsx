import {useEffect,useState} from "react";
import {Button,Card} from "../components/ui";
import {DIMENSION_WORKFLOWS,type AssessmentScore,type ScorecardEntry} from "../types";
import {ensureCurrentCycle,getMyOrganization,getScorecardEntries,saveAssessment,saveScorecard,logAuditEvent} from "../services/data";

export function Scorecard(){
 const[entries,setEntries]=useState<Record<string,ScorecardEntry>>({});
 const[ratings,setRatings]=useState<Record<string,number>>({});
 const[cycle,setCycle]=useState<{id:string;week_start:string;week_end:string}|null>(null);
 const[saved,setSaved]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
 useEffect(()=>{(async()=>{try{const org=await getMyOrganization();if(!org?.organization_id)throw new Error("Account is not assigned to an organisation.");const c=await ensureCurrentCycle(org.organization_id);setCycle(c);const existing=await getScorecardEntries(c.id);setEntries(Object.fromEntries(existing.map(e=>[e.dimensionId,e])));}catch(e){setError(e instanceof Error?e.message:"Unable to load scorecard.");}})();},[]);
 const update=(dimensionId:string,key:string,value:string)=>setEntries(current=>({...current,[dimensionId]:{id:current[dimensionId]?.id,dimensionId,metrics:{...(current[dimensionId]?.metrics??{}),[key]:value},evidence:current[dimensionId]?.evidence??""}}));
 const evidence=(dimensionId:string,value:string)=>setEntries(current=>({...current,[dimensionId]:{...(current[dimensionId]??{dimensionId,metrics:{}}),evidence:value}}));
 const save=async()=>{setError("");setSaved(false);setBusy(true);try{
   for(const d of DIMENSION_WORKFLOWS){
     const e=entries[d.id];const rating=ratings[d.id];
     if(!e)throw new Error("Complete every dimension before saving the weekly scorecard.");
     if(!rating)throw new Error("Give "+d.name+" a self-rating from 1 to 5.");
     if(!e.evidence?.trim())throw new Error("Add evidence for "+d.name+".");
     for(const metric of d.scorecardMetrics){const raw=String(e.metrics?.[metric]??"").trim();if(!raw)throw new Error("Enter a value for "+metric+" under "+d.name+".");const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new Error("Enter a valid non-negative number for "+metric+".");if(metric.includes("%")&&n>100)throw new Error(metric+" cannot exceed 100%.");if(/score|indicator/i.test(metric)&&n>5)throw new Error(metric+" must be between 0 and 5.");}
   }
   const org=await getMyOrganization();if(!org?.organization_id||!cycle)throw new Error("Scorecard cycle is not available.");
   const scores:AssessmentScore[]=DIMENSION_WORKFLOWS.map(d=>({dimensionId:d.id,score:ratings[d.id],evidence:entries[d.id].evidence}));
   await saveAssessment({id:crypto.randomUUID(),userId:"",type:"weekly",periodStart:cycle.week_start,periodEnd:cycle.week_end,scores,submittedAt:new Date().toISOString()},org.organization_id);
   for(const d of DIMENSION_WORKFLOWS){const e=entries[d.id];if(e)await saveScorecard(e,org.organization_id,cycle.id)}
   await logAuditEvent("weekly_scorecard_submitted","scorecard",cycle.id,{cycleId:cycle.id,periodStart:cycle.week_start});setSaved(true);
 }catch(e){setError(e instanceof Error?e.message:"Unable to save weekly scorecard.");}finally{setBusy(false)}};
 return <div className="space-y-6">
  <div><h1 className="text-3xl font-bold text-[#172B4D]">Weekly Scorecard</h1><p className="mt-2 text-[#667085]">Rate yourself 1–5, record measurable evidence, and submit the complete weekly operating position across all 12 dimensions.</p>{cycle&&<p className="mt-2 text-xs font-semibold text-[#667085]">Current cycle: {cycle.week_start} → {cycle.week_end}</p>}</div>
  {error&&<Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</Card>}
  <div className="space-y-4">{DIMENSION_WORKFLOWS.map((d,index)=><Card key={d.id} className="p-5 md:p-6">
   <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-[#F58220]">Dimension {index+1}</div><h2 className="mt-1 font-bold text-[#172B4D]">{d.name}</h2><p className="mt-1 text-sm text-[#667085]">{d.weeklyPrompt}</p></div>
   <label className="text-sm font-semibold text-[#263238] md:min-w-40">Self-rating (1–5)<select value={ratings[d.id]??""} onChange={e=>setRatings(v=>({...v,[d.id]:Number(e.target.value)}))} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">Select</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label></div>
   <div className="grid gap-3 md:grid-cols-2">{d.scorecardMetrics.map(metric=><label key={metric} className="text-sm font-semibold text-[#263238]">{metric}<input type="text" inputMode="decimal" value={String(entries[d.id]?.metrics?.[metric]??"")} onChange={e=>update(d.id,metric,e.target.value)} placeholder="Enter value" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#0072CE]"/></label>)}</div>
   <textarea aria-label={d.name+" scorecard evidence"} value={entries[d.id]?.evidence??""} onChange={e=>evidence(d.id,e.target.value)} placeholder="Evidence, variance, corrective action or context…" className="mt-4 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#0072CE]"/>
  </Card>)}</div>
  <div className="flex flex-wrap items-center justify-end gap-3">{saved&&<span className="text-sm text-emerald-700">Weekly assessment and scorecard submitted.</span>}<Button disabled={busy} onClick={save} className="bg-[#F58220] text-white hover:bg-[#D96D12]">{busy?"Submitting…":"Submit weekly position"}</Button></div>
 </div>
}