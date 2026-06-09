import { useState, useEffect } from "react";

const TRADES_KEY  = "rrj-trades-v4";
const JOURNAL_KEY = "rrj-journals-v4";
const NOTRADE_KEY = "rrj-notrade-v4";

const SESSIONS   = ["London","New York","Asia","London-NY Overlap"];
const SETUPS     = ["Trend Continuation","Reversal","Breakout","Retest","Range","News Play","Other"];
const PAIRS      = ["EUR/USD","GBP/USD","USD/JPY","NAS100","NQ (Futures)","US30","XAU/USD","BTC/USD","ETH/USD","Other"];
const MOODS      = ["🔥 Focused","😤 Frustrated","😰 Anxious","😌 Calm","😎 Confident","😵 Overloaded"];
const DAYS       = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTHS     = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const todayStr = () => new Date().toISOString().slice(0,10);
const tradeR   = (t: any) => t.outcome==="Win"?+t.rr:t.outcome==="Loss"?-(+t.rr):0;
const fmtR     = (r: number) => `${r>=0?"+":""}${parseFloat(String(r)).toFixed(2)}R`;
const fmtDate  = (d: string) => new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const getMonth = (d: string) => d.slice(0,7);
const getISOWeek = (ds: string) => {
  const d=new Date(ds+"T00:00:00"),jan4=new Date(d.getFullYear(),0,4),sw=new Date(jan4);
  sw.setDate(jan4.getDate()-(jan4.getDay()||7)+1);
  return `${d.getFullYear()}-W${String(Math.ceil(((d.getTime()-sw.getTime())/86400000+1)/7)).padStart(2,"0")}`;
};

function calcStats(trades: any[]) {
  if(!trades.length)return null;
  const wins=trades.filter(t=>t.outcome==="Win"),losses=trades.filter(t=>t.outcome==="Loss");
  const totalRR=trades.reduce((s,t)=>s+tradeR(t),0);
  const winRate=((wins.length/trades.length)*100).toFixed(1);
  const avgWin=wins.length?(wins.reduce((s,t)=>s+(+t.rr),0)/wins.length).toFixed(2):"0.00";
  const avgLoss=losses.length?(losses.reduce((s,t)=>s+(+t.rr),0)/losses.length).toFixed(2):"0.00";
  const expectancy=((+winRate/100)*(+avgWin)-(losses.length/trades.length)*(+avgLoss)).toFixed(3);
  let peak=0,maxDD=0,run=0;
  [...trades].reverse().forEach(t=>{run+=tradeR(t);if(run>peak)peak=run;if(peak-run>maxDD)maxDD=peak-run;});
  const gw=wins.reduce((s,t)=>s+(+t.rr),0),gl=losses.reduce((s,t)=>s+(+t.rr),0);
  return{wins:wins.length,losses:losses.length,be:trades.filter(t=>t.outcome==="BE").length,
    totalRR,winRate,avgWin,avgLoss,expectancy,maxDD:maxDD.toFixed(2),profitFactor:gl?(gw/gl).toFixed(2):"∞"};
}

function dirStats(trades: any[], dir: string) {
  const dt=trades.filter(t=>t.direction===dir);
  if(!dt.length)return{n:0,wins:0,losses:0,be:0,winRate:"0.0",totalR:0};
  const wins=dt.filter(t=>t.outcome==="Win").length;
  const losses=dt.filter(t=>t.outcome==="Loss").length;
  const be=dt.filter(t=>t.outcome==="BE").length;
  const totalR=dt.reduce((s,t)=>s+tradeR(t),0);
  return{n:dt.length,wins,losses,be,winRate:((wins/dt.length)*100).toFixed(1),totalR};
}

function getMonthGrid(y: number, m: number) {
  const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),cells: (number|null)[]=[];
  for(let i=0;i<first;i++)cells.push(null);
  for(let d=1;d<=days;d++)cells.push(d);
  return cells;
}
function getWeekBuckets(y: number, m: number, trades: any[]) {
  const dm: Record<number,any[]>={};
  trades.forEach(t=>{
    if(!t.date.startsWith(`${y}-${String(m+1).padStart(2,"0")}`))return;
    const d=parseInt(t.date.slice(8));
    if(!dm[d])dm[d]=[];dm[d].push(t);
  });
  const weeks: {wk:number,days:number[]}[]=[];let wk=1,days: number[]=[],total=new Date(y,m+1,0).getDate();
  for(let d=1;d<=total;d++){
    days.push(d);
    if(new Date(y,m,d).getDay()===6||d===total){weeks.push({wk,days:[...days]});wk++;days=[];}
  }
  return weeks.map(({wk,days})=>{
    const wt=days.flatMap(d=>dm[d]||[]);
    return{wk,r:wt.reduce((s,t)=>s+tradeR(t),0),trades:wt.length};
  });
}
function exportCSV(trades: any[]) {
  const h=["Date","Pair","Direction","Session","Setup","RR","Outcome","Net R","Notes"];
  const rows=[...trades].reverse().map(t=>[t.date,t.pair,t.direction,t.session,t.setup,t.rr,t.outcome,tradeR(t).toFixed(2),`"${(t.notes||"").replace(/"/g,'""')}"`]);
  const csv=[h,...rows].map(r=>r.join(",")).join("\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  const a=document.createElement("a");a.href=url;a.download="rr-journal.csv";a.click();URL.revokeObjectURL(url);
}

const Lbl=({children}: {children: React.ReactNode})=><div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"1.5px",marginBottom:"6px"}}>{children}</div>;
const Toast=({msg,type}: {msg:string,type:string})=>(
  <div style={{position:"fixed",bottom:"88px",left:"50%",transform:"translateX(-50%)",
    background:type==="error"?"rgba(255,63,94,0.15)":"rgba(0,232,122,0.12)",
    border:`1px solid ${type==="error"?"#ff3f5e":"#00e87a"}`,color:type==="error"?"#ff3f5e":"#00e87a",
    fontFamily:"'Space Mono',monospace",fontSize:"11px",letterSpacing:"1px",
    padding:"10px 20px",borderRadius:"6px",zIndex:400,whiteSpace:"nowrap",animation:"fadeUp 0.2s ease"}}>{msg}</div>
);
const DelModal=({onCancel,onConfirm}: {onCancel:()=>void,onConfirm:()=>void})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(10,10,20,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:"20px"}}>
    <div style={{background:"#161628",border:"1px solid #1e1e38",borderRadius:"12px",padding:"24px",width:"100%",maxWidth:"300px"}}>
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",color:"#dde0f0",marginBottom:"18px",lineHeight:1.7}}>Delete this trade?<br/><span style={{color:"#60607a"}}>This can't be undone.</span></div>
      <div style={{display:"flex",gap:"8px"}}>
        <button onClick={onCancel} style={{flex:1,padding:"11px",background:"#111120",color:"#60607a",border:"1px solid #1e1e38",fontSize:"11px"}}>CANCEL</button>
        <button onClick={onConfirm} style={{flex:1,padding:"11px",background:"rgba(255,63,94,0.15)",color:"#ff3f5e",border:"1px solid #ff3f5e",fontSize:"11px",fontWeight:700}}>DELETE</button>
      </div>
    </div>
  </div>
);

function RRBar({value,max}: {value:number,max:number}) {
  const pct=Math.min(Math.abs(value/(max||1))*100,100),pos=value>=0;
  return(
    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
      <div style={{flex:1,height:"3px",background:"#1a1a2e",borderRadius:"2px",overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:pos?"var(--green)":"var(--red)",borderRadius:"2px"}}/>
      </div>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",color:pos?"var(--green)":"var(--red)",minWidth:"52px",textAlign:"right"}}>{fmtR(value)}</span>
    </div>
  );
}
function MiniLine({trades,h=50,w=80}: {trades:any[],h?:number,w?:number}) {
  if(trades.length<2)return(<div style={{height:h,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>—</span></div>);
  let eq=0;
  const pts=[...trades].reverse().map((t,i)=>{eq+=tradeR(t);return{i,v:eq};});
  const mn=Math.min(0,...pts.map(p=>p.v)),mx=Math.max(...pts.map(p=>p.v)),range=mx-mn||1;
  const path=pts.map((p,i)=>`${i===0?"M":"L"}${(p.i/Math.max(pts.length-1,1))*w},${h-((p.v-mn)/range)*h}`).join(" ");
  const isPos=eq>=0;
  return(
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:`${w}px`,height:`${h}px`}}>
      <defs><linearGradient id="ml" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={isPos?"#00e87a":"#ff3f5e"} stopOpacity="0.3"/>
        <stop offset="100%" stopColor={isPos?"#00e87a":"#ff3f5e"} stopOpacity="0"/>
      </linearGradient></defs>
      <path d={path+` L${w},${h} L0,${h} Z`} fill="url(#ml)"/>
      <path d={path} fill="none" stroke={isPos?"#00e87a":"#ff3f5e"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function WinGauge({wins,be,losses}: {wins:number,be:number,losses:number}) {
  const total=wins+be+losses||1,halfC=2*Math.PI*38,cx=50,cy=50,r=38;
  const seg=(pct: number,offset: number,color: string)=>{
    const dash=(pct*halfC)/2,gap=halfC-dash,off=halfC/4+(offset*halfC)/2;
    return(<circle key={color} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
      strokeDasharray={`${dash} ${gap}`} strokeDashoffset={off} strokeLinecap="butt" transform={`rotate(-180 ${cx} ${cy})`}/>);
  };
  const lp=losses/total,bp=be/total,wp=wins/total;
  return(
    <div style={{position:"relative",width:"100px",height:"56px",overflow:"hidden"}}>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{position:"absolute",top:0,left:0}}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e38" strokeWidth="10"
          strokeDasharray={`${halfC/2} ${halfC/2}`} strokeDashoffset={halfC/4} transform={`rotate(-180 ${cx} ${cy})`}/>
        {seg(lp,0,"#ff3f5e")}{seg(bp,lp,"#f5c518")}{seg(wp,lp+bp,"#00e87a")}
      </svg>
      <div style={{position:"absolute",bottom:"2px",left:0,right:0,display:"flex",justifyContent:"space-between",padding:"0 4px"}}>
        {(([["#00e87a",wins],["#f5c518",be],["#ff3f5e",losses]] as [string,number][]).map(([c,v],i)=>(
          <div key={i} style={{width:"18px",height:"18px",borderRadius:"50%",background:c+"22",border:`1.5px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:c,fontWeight:700}}>{v}</span>
          </div>
        )))}
      </div>
    </div>
  );
}
function ScoreRing({value,max=10,color}: {value:number,max?:number,color:string}) {
  const r=20,circ=2*Math.PI*r;
  return(
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#1e1e36" strokeWidth="4"/>
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${(value/max)*circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 26 26)"/>
      <text x="26" y="30" textAnchor="middle" fill={color} fontSize="12" fontFamily="Space Mono,monospace" fontWeight="700">{value}</text>
    </svg>
  );
}

function DirectionCard({trades}: {trades:any[]}) {
  const long=dirStats(trades,"Long"),short=dirStats(trades,"Short");
  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"12px",padding:"16px",marginBottom:"10px"}}>
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"14px"}}>LONG vs SHORT BREAKDOWN</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
        {([["LONG",long,"var(--green)"],["SHORT",short,"var(--red)"]] as [string,ReturnType<typeof dirStats>,string][]).map(([label,d,c])=>(
          <div key={label} style={{background:"var(--card2)",border:`1px solid ${c}33`,borderRadius:"10px",padding:"13px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"10px"}}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:c}}/>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:c,fontWeight:700,letterSpacing:"1px"}}>{label}</span>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",marginLeft:"auto"}}>{d.n} trades</span>
            </div>
            {d.n===0?(
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)"}}>No trades yet</div>
            ):(
              <>
                <div style={{marginBottom:"8px"}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"22px",fontWeight:700,color:+d.winRate>=50?"var(--green)":"var(--red)"}}>{d.winRate}%</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>WIN RATE</div>
                </div>
                <div style={{marginBottom:"8px"}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"16px",fontWeight:700,color:d.totalR>=0?"var(--green)":"var(--red)"}}>{fmtR(d.totalR)}</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>NET R</div>
                </div>
                <div style={{display:"flex",gap:"4px",marginBottom:"8px"}}>
                  {Array.from({length:Math.min(d.n,10)}).map((_,i)=>{
                    const idx=trades.filter(t=>t.direction===(label==="LONG"?"Long":"Short"))[i];
                    if(!idx)return null;
                    const col=idx.outcome==="Win"?"var(--green)":idx.outcome==="BE"?"var(--yellow)":"var(--red)";
                    return(<div key={i} style={{width:"8px",height:"8px",borderRadius:"2px",background:col,opacity:0.8}}/>);
                  })}
                </div>
                <div style={{display:"flex",gap:"8px"}}>
                  <div style={{flex:1,textAlign:"center",background:"rgba(0,232,122,0.08)",borderRadius:"6px",padding:"5px"}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"13px",color:"var(--green)",fontWeight:700}}>{d.wins}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)"}}>W</div>
                  </div>
                  <div style={{flex:1,textAlign:"center",background:"rgba(245,197,24,0.08)",borderRadius:"6px",padding:"5px"}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"13px",color:"var(--yellow)",fontWeight:700}}>{d.be}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)"}}>BE</div>
                  </div>
                  <div style={{flex:1,textAlign:"center",background:"rgba(255,63,94,0.08)",borderRadius:"6px",padding:"5px"}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"13px",color:"var(--red)",fontWeight:700}}>{d.losses}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)"}}>L</div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportCard({period,trades,journals,noTrades}: {period:any,trades:any[],journals:any[],noTrades:any[]}) {
  const s=calcStats(trades);
  const long=dirStats(trades,"Long"),short=dirStats(trades,"Short");
  const j=journals[0]||null;
  const noTradeCount=noTrades.length;
  const accentR=s&&s.totalRR>=0?"var(--green)":"var(--red)";
  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",overflow:"hidden",marginBottom:"10px"}}>
      <div style={{padding:"14px 16px",background:"var(--card2)",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"2px"}}>{period.type.toUpperCase()} REPORT</div>
          <div style={{fontWeight:800,fontSize:"14px"}}>{period.label}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"22px",fontWeight:700,color:accentR,lineHeight:1}}>{s?fmtR(s.totalRR):"—"}</div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>NET R</div>
        </div>
      </div>
      {s?(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1px",background:"var(--border)"}}>
            {[
              {l:"TRADES",v:trades.length,c:""},
              {l:"WIN RATE",v:`${s.winRate}%`,c:+s.winRate>=50?"var(--green)":"var(--red)"},
              {l:"PROFIT FACTOR",v:s.profitFactor,c:+s.profitFactor>=1?"var(--green)":"var(--red)"},
            ].map(k=>(
              <div key={k.l} style={{background:"var(--card)",padding:"11px 12px",textAlign:"center"}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"15px",fontWeight:700,color:k.c||"var(--text)"}}>{k.v}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)",marginTop:"2px"}}>{k.l}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"1px",background:"var(--border)"}}>
            {[
              {l:"AVG WIN",v:`+${s.avgWin}R`,c:"var(--green)"},
              {l:"AVG LOSS",v:`-${s.avgLoss}R`,c:"var(--red)"},
              {l:"EXPECTANCY",v:`${+s.expectancy>=0?"+":""}${s.expectancy}R`,c:+s.expectancy>=0?"var(--green)":"var(--red)"},
              {l:"MAX DD",v:`-${s.maxDD}R`,c:"var(--red)"},
            ].map(k=>(
              <div key={k.l} style={{background:"var(--card)",padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"12px",fontWeight:700,color:k.c}}>{k.v}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"7px",color:"var(--muted)",marginTop:"2px"}}>{k.l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            {([["LONG ↑",long,"var(--green)"],["SHORT ↓",short,"var(--red)"]] as [string,ReturnType<typeof dirStats>,string][]).map(([lbl,d,c])=>(
              <div key={lbl} style={{background:"var(--card2)",borderRadius:"8px",padding:"10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:c,fontWeight:700}}>{lbl}</span>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>{d.n}T</span>
                </div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"15px",fontWeight:700,color:+d.winRate>=50?"var(--green)":"var(--red)"}}>{d.n?`${d.winRate}%`:"—"}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>win rate</div>
                {d.n>0&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",color:d.totalR>=0?"var(--green)":"var(--red)",marginTop:"3px"}}>{fmtR(d.totalR)}</div>}
              </div>
            ))}
          </div>
          {noTradeCount>0&&(
            <div style={{padding:"8px 16px",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",gap:"8px"}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--yellow)"}}>⊘ {noTradeCount} no-trade day{noTradeCount>1?"s":""} this period</span>
            </div>
          )}
          {j&&j.lessons&&(
            <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--blue)",letterSpacing:"1px",marginBottom:"4px"}}>💡 LESSON</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--text2)",lineHeight:1.6}}>{j.lessons.slice(0,100)}{j.lessons.length>100?"…":""}</div>
            </div>
          )}
        </>
      ):(
        <div style={{padding:"20px",textAlign:"center",fontFamily:"'Space Mono',monospace",fontSize:"11px",color:"var(--muted)"}}>No trades in this period.</div>
      )}
    </div>
  );
}

export default function TradingJournal() {
  const [trades,setTrades]=useState<any[]>([]);
  const [journals,setJournals]=useState<any[]>([]);
  const [noTrades,setNT]=useState<any[]>([]);
  const [loaded,setLoaded]=useState(false);

  const [view,setView]=useState("home");
  const [modal,setModal]=useState<string|null>(null);
  const [tradeForm,setTF]=useState({date:todayStr(),pair:"EUR/USD",direction:"Long",session:"London",setup:"Trend Continuation",rr:"",outcome:"Win",notes:""});
  const [jForm,setJF]=useState({date:todayStr(),type:"daily",mood:"😌 Calm",followed_plan:true,best_trade:"",mistakes:"",lessons:"",mental_score:7,discipline_score:7});
  const [editTradeId,setETI]=useState<number|null>(null);
  const [editJId,setEJI]=useState<number|null>(null);
  const [toast,setToast]=useState<{msg:string,type:string}|null>(null);
  const [delC,setDelC]=useState<number|null>(null);
  const [selectedDay,setSelDay]=useState<number|null>(null);
  const [filterOutcome,setFO]=useState("All");
  const [filterDir,setFD]=useState("All");
  const [reviewPeriod,setRP]=useState("daily");
  const [viewJournal,setVJ]=useState<any>(null);
  const [sRange,setSR]=useState("all");
  const [ntDate,setNTD]=useState(todayStr());
  const [ntNote,setNTN]=useState("");
  const [reportPeriod,setRPeriod]=useState("daily");
  const now=new Date();
  const [calYear,setCalYear]=useState(now.getFullYear());
  const [calMonth,setCalMonth]=useState(now.getMonth());

  useEffect(()=>{
    try{
      const t=localStorage.getItem(TRADES_KEY);
      const j=localStorage.getItem(JOURNAL_KEY);
      const n=localStorage.getItem(NOTRADE_KEY);
      if(t)setTrades(JSON.parse(t));
      if(j)setJournals(JSON.parse(j));
      if(n)setNT(JSON.parse(n));
    }catch{}
    setLoaded(true);
  },[]);
  useEffect(()=>{if(loaded)try{localStorage.setItem(TRADES_KEY,JSON.stringify(trades));}catch{}},[trades,loaded]);
  useEffect(()=>{if(loaded)try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(journals));}catch{}},[journals,loaded]);
  useEffect(()=>{if(loaded)try{localStorage.setItem(NOTRADE_KEY,JSON.stringify(noTrades));}catch{}},[noTrades,loaded]);

  const toast_=(msg: string,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),2400);};

  function submitTrade(){
    const rr=parseFloat(tradeForm.rr);
    if(!tradeForm.rr||isNaN(rr)||rr<=0){toast_("Enter a valid RR value","error");return;}
    if(editTradeId){setTrades(p=>p.map(t=>t.id===editTradeId?{...tradeForm,rr:rr.toFixed(2),id:editTradeId}:t));toast_("Trade updated ✓");setETI(null);}
    else{setTrades(p=>[{...tradeForm,rr:rr.toFixed(2),id:Date.now()},...p]);toast_("Trade logged ✓");}
    setTF({date:todayStr(),pair:"EUR/USD",direction:"Long",session:"London",setup:"Trend Continuation",rr:"",outcome:"Win",notes:""});
    setModal(null);
  }
  function submitJournal(){
    if(editJId){setJournals(p=>p.map(j=>j.id===editJId?{...jForm,id:editJId}:j));toast_("Journal updated ✓");setEJI(null);}
    else{setJournals(p=>[{...jForm,id:Date.now()},...p]);toast_("Journal saved ✓");}
    setJF({date:todayStr(),type:"daily",mood:"😌 Calm",followed_plan:true,best_trade:"",mistakes:"",lessons:"",mental_score:7,discipline_score:7});
    setModal(null);
  }

  const monthStr=`${calYear}-${String(calMonth+1).padStart(2,"0")}`;
  const monthTrades=trades.filter(t=>t.date.startsWith(monthStr));
  const allStats=calcStats(trades);
  const dayRMap: Record<number,{r:number,n:number,trades:any[]}>={};
  monthTrades.forEach(t=>{const d=parseInt(t.date.slice(8));if(!dayRMap[d])dayRMap[d]={r:0,n:0,trades:[]};dayRMap[d].r+=tradeR(t);dayRMap[d].n++;dayRMap[d].trades.push(t);});
  const noTradeDaySet=new Set(noTrades.filter(n=>n.date.startsWith(monthStr)).map(n=>parseInt(n.date.slice(8))));
  const grid=getMonthGrid(calYear,calMonth);
  const weekBuckets=getWeekBuckets(calYear,calMonth,trades);
  const monthStats=calcStats(monthTrades);
  const nowD=new Date();
  const ranged=sRange==="all"?trades:trades.filter(t=>{
    const d=new Date(t.date+"T00:00:00");
    if(sRange==="week"){const ws=new Date(nowD);ws.setDate(nowD.getDate()-nowD.getDay());return d>=ws;}
    if(sRange==="month")return d>=new Date(nowD.getFullYear(),nowD.getMonth(),1);
    return true;
  });
  const rangedStats=calcStats(ranged);
  const filteredTrades=(filterOutcome==="All"?trades:trades.filter(t=>t.outcome===filterOutcome))
    .filter(t=>filterDir==="All"||t.direction===filterDir);
  const maxR=trades.length?Math.max(...trades.map(t=>+t.rr)):1;

  function getReportGroups(){
    const groups: Record<string,any[]>={};
    trades.forEach(t=>{
      const k=reportPeriod==="daily"?t.date:reportPeriod==="weekly"?getISOWeek(t.date):getMonth(t.date);
      if(!groups[k])groups[k]=[];groups[k].push(t);
    });
    return Object.entries(groups).sort(([a],[b])=>b.localeCompare(a));
  }
  function getNoTradeForPeriod(key: string){
    return noTrades.filter(n=>{
      if(reportPeriod==="daily")return n.date===key;
      if(reportPeriod==="weekly")return getISOWeek(n.date)===key;
      return getMonth(n.date)===key;
    });
  }
  function getJournalsForPeriod(key: string){
    return journals.filter(j=>{
      if(reportPeriod==="daily")return j.date===key;
      if(reportPeriod==="weekly")return getISOWeek(j.date)===key;
      return getMonth(j.date)===key;
    });
  }
  function periodLabel(key: string){
    if(reportPeriod==="daily")return fmtDate(key);
    if(reportPeriod==="weekly"){const [y,w]=key.split("-W");return `Week ${w}, ${y}`;}
    const [y,m]=key.split("-");return `${MONTHS[parseInt(m)-1]} ${y}`;
  }

  function groupJournals(){
    const g: Record<string,any[]>={};
    journals.forEach(j=>{
      const k=reviewPeriod==="daily"?j.date:reviewPeriod==="weekly"?getISOWeek(j.date):getMonth(j.date);
      if(!g[k])g[k]=[];g[k].push(j);
    });
    return Object.entries(g).sort(([a],[b])=>b.localeCompare(a));
  }

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    :root{
      --bg:#0a0a14;--card:#111120;--card2:#161628;--border:#1e1e38;
      --green:#00e87a;--red:#ff3f5e;--yellow:#f5c518;--blue:#4d9eff;--purple:#a855f7;
      --muted:#60607a;--text:#dde0f0;--text2:#9090b0;
      --sidebar:220px;
    }
    body{background:var(--bg);color:var(--text);font-family:'Syne',sans-serif;min-height:100vh;}
    input,select,textarea{
      background:var(--card2);border:1px solid var(--border);color:var(--text);
      font-family:'Space Mono',monospace;font-size:12px;padding:9px 12px;border-radius:8px;
      width:100%;outline:none;transition:border-color 0.2s;
    }
    input:focus,select:focus,textarea:focus{border-color:var(--green);}
    select option{background:#161628;}
    button{cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;border:none;border-radius:8px;transition:all 0.15s;}
    button:active{transform:scale(0.97);}
    ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:var(--bg);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp 0.22s ease both;}
    input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:var(--border);border:none;padding:0;cursor:pointer;}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--green);cursor:pointer;}
    .desktop-wrap{display:flex;min-height:100vh;}
    .sidebar{width:var(--sidebar);min-height:100vh;background:var(--card);border-right:1px solid var(--border);
      position:fixed;top:0;left:0;display:flex;flex-direction:column;padding:24px 0 16px;z-index:50;}
    .sidebar-logo{padding:0 20px 24px;border-bottom:1px solid var(--border);margin-bottom:16px;}
    .sidebar-nav{display:flex;flex-direction:column;gap:2px;padding:0 8px;flex:1;}
    .sidebar-btn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;
      background:transparent;color:var(--muted);font-size:12px;letter-spacing:0.5px;width:100%;text-align:left;}
    .sidebar-btn.active{background:var(--green)22;color:var(--green);}
    .main-content{margin-left:var(--sidebar);flex:1;padding:24px;max-width:calc(100vw - var(--sidebar));}
    .main-content-inner{max-width:1100px;margin:0 auto;}
    .bottom-nav{position:fixed;bottom:0;left:0;right:0;height:70px;background:var(--card);
      border-top:1px solid var(--border);display:flex;z-index:50;}
    .bottom-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:3px;background:transparent;color:var(--muted);font-size:8px;letter-spacing:0.5px;border-radius:0;}
    @media(min-width:768px){
      .bottom-nav{display:none;}
      .mobile-only{display:none;}
      .desktop-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
      .desktop-cols-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
    }
    @media(max-width:767px){
      .sidebar{display:none;}
      .main-content{margin-left:0;padding:0 0 80px 0;max-width:100vw;}
      .main-content-inner{max-width:100%;}
      .desktop-cols{display:block;}
      .desktop-cols-3{display:block;}
    }
  `;

  const navItems=[
    {id:"home",label:"Home",icon:"⌂"},
    {id:"tradelog",label:"Trade log",icon:"≡"},
    {id:"reports",label:"Reports",icon:"📋"},
    {id:"stats",label:"Stats",icon:"◎"},
    {id:"review",label:"Review",icon:"✦"},
  ];

  if(modal==="trade")return(
    <><style>{CSS}</style>
    <div style={{maxWidth:600,margin:"0 auto",padding:"24px 18px 100px",minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
        <button onClick={()=>{setModal(null);setETI(null);setTF({date:todayStr(),pair:"EUR/USD",direction:"Long",session:"London",setup:"Trend Continuation",rr:"",outcome:"Win",notes:""});}}
          style={{padding:"8px 14px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>← BACK</button>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"3px"}}>{editTradeId?"EDIT TRADE":"LOG TRADE"}</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"13px"}} className="fade-up">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div><Lbl>DATE</Lbl><input type="date" value={tradeForm.date} onChange={e=>setTF(f=>({...f,date:e.target.value}))}/></div>
          <div><Lbl>INSTRUMENT</Lbl><select value={tradeForm.pair} onChange={e=>setTF(f=>({...f,pair:e.target.value}))}>{PAIRS.map(p=><option key={p}>{p}</option>)}</select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div><Lbl>DIRECTION</Lbl>
            <div style={{display:"flex",gap:"6px"}}>
              {["Long","Short"].map(d=>{const a=tradeForm.direction===d,c=d==="Long"?"var(--green)":"var(--red)";return(
                <button key={d} onClick={()=>setTF(f=>({...f,direction:d}))} style={{flex:1,padding:"9px 0",fontSize:"11px",background:a?c+"22":"var(--card2)",border:`1px solid ${a?c:"var(--border)"}`,color:a?c:"var(--muted)"}}>{d.toUpperCase()}</button>
              );})}
            </div>
          </div>
          <div><Lbl>SESSION</Lbl><select value={tradeForm.session} onChange={e=>setTF(f=>({...f,session:e.target.value}))}>{SESSIONS.map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        <div><Lbl>SETUP</Lbl><select value={tradeForm.setup} onChange={e=>setTF(f=>({...f,setup:e.target.value}))}>{SETUPS.map(s=><option key={s}>{s}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div><Lbl>R:R VALUE</Lbl><input type="number" step="0.1" min="0.1" placeholder="e.g. 2.5" value={tradeForm.rr} onChange={e=>setTF(f=>({...f,rr:e.target.value}))}/></div>
          <div><Lbl>OUTCOME</Lbl>
            <div style={{display:"flex",gap:"5px"}}>
              {([["Win","var(--green)"],["Loss","var(--red)"],["BE","var(--yellow)"]] as [string,string][]).map(([o,c])=>(
                <button key={o} onClick={()=>setTF(f=>({...f,outcome:o}))} style={{flex:1,padding:"9px 0",fontSize:"10px",background:tradeForm.outcome===o?c+"22":"var(--card2)",border:`1px solid ${tradeForm.outcome===o?c:"var(--border)"}`,color:tradeForm.outcome===o?c:"var(--muted)"}}>{o}</button>
              ))}
            </div>
          </div>
        </div>
        <div><Lbl>NOTES</Lbl><textarea rows={3} placeholder="Rationale, observations..." value={tradeForm.notes} onChange={e=>setTF(f=>({...f,notes:e.target.value}))} style={{resize:"vertical",lineHeight:1.6}}/></div>
        <div style={{display:"flex",gap:"10px"}}>
          <button onClick={()=>{setModal(null);setETI(null);}} style={{flex:1,padding:"14px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>CANCEL</button>
          <button onClick={submitTrade} style={{flex:2,padding:"14px",background:"var(--green)",color:"#0a0a14",fontSize:"13px",letterSpacing:"2px",fontWeight:800}}>{editTradeId?"UPDATE":"LOG TRADE"}</button>
        </div>
      </div>
    </div>
    {toast&&<Toast {...toast}/>}</>
  );

  if(modal==="journal")return(
    <><style>{CSS}</style>
    <div style={{maxWidth:600,margin:"0 auto",padding:"24px 18px 100px",minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
        <button onClick={()=>{setModal(null);setEJI(null);}} style={{padding:"8px 14px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>← BACK</button>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"3px"}}>{editJId?"EDIT ENTRY":"NEW JOURNAL ENTRY"}</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"13px"}} className="fade-up">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div><Lbl>DATE</Lbl><input type="date" value={jForm.date} onChange={e=>setJF(f=>({...f,date:e.target.value}))}/></div>
          <div><Lbl>TYPE</Lbl>
            <div style={{display:"flex",gap:"4px"}}>
              {["daily","weekly","monthly"].map(t=>(
                <button key={t} onClick={()=>setJF(f=>({...f,type:t}))} style={{flex:1,padding:"9px 0",fontSize:"9px",background:jForm.type===t?"var(--blue)22":"var(--card2)",border:`1px solid ${jForm.type===t?"var(--blue)":"var(--border)"}`,color:jForm.type===t?"var(--blue)":"var(--muted)"}}>{t.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>
        <div><Lbl>MOOD</Lbl>
          <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
            {MOODS.map(m=><button key={m} onClick={()=>setJF(f=>({...f,mood:m}))} style={{padding:"6px 11px",fontSize:"12px",background:jForm.mood===m?"var(--card2)":"transparent",border:`1px solid ${jForm.mood===m?"var(--blue)":"var(--border)"}`,color:jForm.mood===m?"var(--text)":"var(--muted)"}}>{m}</button>)}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div><Lbl>MENTAL ({jForm.mental_score}/10)</Lbl><input type="range" min="1" max="10" value={jForm.mental_score} onChange={e=>setJF(f=>({...f,mental_score:+e.target.value}))}/></div>
          <div><Lbl>DISCIPLINE ({jForm.discipline_score}/10)</Lbl><input type="range" min="1" max="10" value={jForm.discipline_score} onChange={e=>setJF(f=>({...f,discipline_score:+e.target.value}))}/></div>
        </div>
        <div><Lbl>FOLLOWED THE PLAN?</Lbl>
          <div style={{display:"flex",gap:"8px"}}>
            {([true,false] as boolean[]).map(v=><button key={String(v)} onClick={()=>setJF(f=>({...f,followed_plan:v}))} style={{flex:1,padding:"9px",fontSize:"11px",background:jForm.followed_plan===v?(v?"rgba(0,232,122,0.15)":"rgba(255,63,94,0.15)"):"var(--card2)",border:`1px solid ${jForm.followed_plan===v?(v?"var(--green)":"var(--red)"):"var(--border)"}`,color:jForm.followed_plan===v?(v?"var(--green)":"var(--red)"):"var(--muted)"}}>{v?"YES ✓":"NO ✗"}</button>)}
          </div>
        </div>
        <div><Lbl>BEST TRADE / HIGHLIGHT</Lbl><textarea rows={2} placeholder="What worked?" value={jForm.best_trade} onChange={e=>setJF(f=>({...f,best_trade:e.target.value}))} style={{resize:"vertical",lineHeight:1.6}}/></div>
        <div><Lbl>MISTAKES</Lbl><textarea rows={2} placeholder="What went wrong?" value={jForm.mistakes} onChange={e=>setJF(f=>({...f,mistakes:e.target.value}))} style={{resize:"vertical",lineHeight:1.6}}/></div>
        <div><Lbl>LESSONS</Lbl><textarea rows={2} placeholder="Key takeaways..." value={jForm.lessons} onChange={e=>setJF(f=>({...f,lessons:e.target.value}))} style={{resize:"vertical",lineHeight:1.6}}/></div>
        <div style={{display:"flex",gap:"10px"}}>
          <button onClick={()=>{setModal(null);setEJI(null);}} style={{flex:1,padding:"14px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>CANCEL</button>
          <button onClick={submitJournal} style={{flex:2,padding:"14px",background:"var(--blue)",color:"#0a0a14",fontSize:"13px",letterSpacing:"2px",fontWeight:800}}>{editJId?"UPDATE":"SAVE ENTRY"}</button>
        </div>
      </div>
    </div>
    {toast&&<Toast {...toast}/>}</>
  );

  if(modal==="day-detail"&&selectedDay!==null){
    const dayData=dayRMap[selectedDay],dayTrades=dayData?.trades||[];
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
    const isNoT=noTradeDaySet.has(selectedDay),dayStats=calcStats(dayTrades);
    return(
      <><style>{CSS}</style>
      <div style={{maxWidth:600,margin:"0 auto",padding:"24px 18px 100px",minHeight:"100vh"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
          <button onClick={()=>setModal(null)} style={{padding:"8px 14px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>← BACK</button>
          <span style={{fontWeight:800,fontSize:"16px"}}>{selectedDay} {MONTHS[calMonth]} {calYear}</span>
        </div>
        {isNoT&&<div style={{background:"rgba(245,197,24,0.1)",border:"1px solid var(--yellow)",borderRadius:"8px",padding:"10px 14px",marginBottom:"12px",fontFamily:"'Space Mono',monospace",fontSize:"11px",color:"var(--yellow)"}}>⊘ No-Trade Day</div>}
        {dayStats&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"14px"}}>
            {[{l:"NET R",v:fmtR(dayStats.totalRR),c:dayStats.totalRR>=0?"var(--green)":"var(--red)"},{l:"TRADES",v:dayTrades.length,c:"var(--text)"},{l:"WIN RATE",v:`${dayStats.winRate}%`,c:+dayStats.winRate>=50?"var(--green)":"var(--red)"}].map(s=>(
              <div key={s.l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"8px",padding:"11px"}}>
                <Lbl>{s.l}</Lbl><div style={{fontFamily:"'Space Mono',monospace",fontSize:"16px",fontWeight:700,color:s.c}}>{s.v}</div>
              </div>
            ))}
          </div>
        )}
        {dayTrades.length===0&&!isNoT&&<div style={{textAlign:"center",padding:"40px",color:"var(--muted)",fontFamily:"'Space Mono',monospace",fontSize:"11px"}}>No trades on this day.</div>}
        {dayTrades.map((trade: any)=>{
          const a=trade.outcome==="Win"?"var(--green)":trade.outcome==="BE"?"var(--yellow)":"var(--red)";
          return(
            <div key={trade.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderLeft:`3px solid ${a}`,borderRadius:"8px",padding:"13px 14px",marginBottom:"8px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                <div>
                  <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"3px"}}>
                    <span style={{fontWeight:800,fontSize:"14px"}}>{trade.pair}</span>
                    <span style={{padding:"2px 6px",borderRadius:"3px",fontSize:"9px",fontWeight:700,background:trade.direction==="Long"?"rgba(0,232,122,0.12)":"rgba(255,63,94,0.12)",color:trade.direction==="Long"?"var(--green)":"var(--red)"}}>{trade.direction.toUpperCase()}</span>
                  </div>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>{trade.session} · {trade.setup}</span>
                </div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"20px",fontWeight:700,color:a}}>{trade.outcome==="Win"?"+":trade.outcome==="BE"?"±":"-"}{trade.rr}R</div>
              </div>
              {trade.notes&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--text2)",lineHeight:1.6,background:"var(--card2)",borderRadius:"4px",padding:"7px 10px"}}>{trade.notes}</div>}
              <div style={{display:"flex",gap:"6px",marginTop:"9px"}}>
                <button onClick={()=>{setTF({...trade});setETI(trade.id);setModal("trade");}} style={{padding:"5px 12px",fontSize:"10px",background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)"}}>EDIT</button>
                <button onClick={()=>setDelC(trade.id)} style={{padding:"5px 10px",fontSize:"10px",background:"transparent",color:"var(--muted)",border:"1px solid var(--border)"}}>✕</button>
              </div>
            </div>
          );
        })}
        <button onClick={()=>{setTF({date:todayStr(),pair:"EUR/USD",direction:"Long",session:"London",setup:"Trend Continuation",rr:"",outcome:"Win",notes:"",date:dateStr} as any);setModal("trade");}} style={{width:"100%",marginTop:"8px",padding:"12px",background:"var(--green)",color:"#0a0a14",fontSize:"12px",letterSpacing:"2px",fontWeight:800}}>+ LOG TRADE FOR THIS DAY</button>
      </div>
      {delC&&<DelModal onCancel={()=>setDelC(null)} onConfirm={()=>{setTrades(p=>p.filter((t: any)=>t.id!==delC));setDelC(null);toast_("Deleted","error");}}/>}
      {toast&&<Toast {...toast}/>}</>
    );
  }

  if(modal==="journal-view"&&viewJournal){
    const j=viewJournal,tc=j.type==="daily"?"var(--green)":j.type==="weekly"?"var(--blue)":"var(--purple)";
    return(
      <><style>{CSS}</style>
      <div style={{maxWidth:600,margin:"0 auto",padding:"24px 18px 100px",minHeight:"100vh"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
          <button onClick={()=>{setModal(null);setVJ(null);}} style={{padding:"8px 14px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>← BACK</button>
        </div>
        <div className="fade-up">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"18px"}}>
            <div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",marginBottom:"4px"}}>{fmtDate(j.date)}</div>
              <div style={{fontWeight:800,fontSize:"20px"}}>{j.mood}</div>
            </div>
            <span style={{padding:"4px 10px",borderRadius:"4px",fontSize:"10px",fontWeight:700,background:tc+"22",color:tc,border:`1px solid ${tc}44`}}>{j.type.toUpperCase()}</span>
          </div>
          <div style={{display:"flex",gap:"14px",marginBottom:"18px"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><ScoreRing value={j.mental_score} color="var(--blue)"/><span style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)"}}>MENTAL</span></div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><ScoreRing value={j.discipline_score} color="var(--purple)"/><span style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)"}}>DISCIPLINE</span></div>
            <div style={{display:"flex",alignItems:"center",marginLeft:"8px"}}>
              <div style={{padding:"8px 14px",borderRadius:"6px",background:j.followed_plan?"rgba(0,232,122,0.12)":"rgba(255,63,94,0.12)",border:`1px solid ${j.followed_plan?"var(--green)":"var(--red)"}`,color:j.followed_plan?"var(--green)":"var(--red)",fontFamily:"'Space Mono',monospace",fontSize:"11px",fontWeight:700}}>{j.followed_plan?"PLAN ✓":"OFF-PLAN ✗"}</div>
            </div>
          </div>
          {([["✅ BEST TRADE",j.best_trade,"var(--green)"],["❌ MISTAKES",j.mistakes,"var(--red)"],["💡 LESSONS",j.lessons,"var(--yellow)"]] as [string,string,string][]).filter(([,v])=>v).map(([l,v,c])=>(
            <div key={l} style={{background:"var(--card2)",border:`1px solid var(--border)`,borderLeft:`3px solid ${c}`,borderRadius:"6px",padding:"12px 14px",marginBottom:"10px"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:c,letterSpacing:"1.5px",marginBottom:"6px"}}>{l}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",color:"var(--text2)",lineHeight:1.7}}>{v}</div>
            </div>
          ))}
          <div style={{display:"flex",gap:"8px",marginTop:"20px"}}>
            <button onClick={()=>{setJF({...j});setEJI(j.id);setVJ(null);setModal("journal");}} style={{flex:1,padding:"12px",background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)",fontSize:"11px"}}>EDIT</button>
            <button onClick={()=>{setJournals(p=>p.filter((x: any)=>x.id!==j.id));setVJ(null);setModal(null);toast_("Entry deleted","error");}} style={{flex:1,padding:"12px",background:"rgba(255,63,94,0.1)",color:"var(--red)",border:"1px solid var(--red)",fontSize:"11px",fontWeight:700}}>DELETE</button>
          </div>
        </div>
      </div>
      {toast&&<Toast {...toast}/>}</>
    );
  }

  const mainContent=(
    <div className="main-content-inner">
      {view==="home"&&(
        <div className="fade-up">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px",padding:"18px 16px 0"}} className="mobile-only">
            <div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"2px"}}>WELCOME BACK</div>
              <div style={{fontWeight:800,fontSize:"18px"}}>1% Trader</div>
              <div style={{fontSize:"12px",color:"var(--muted)"}}>Ready to trade?</div>
            </div>
          </div>
          <div style={{padding:"0 14px"}}>
            <div className="desktop-cols" style={{marginBottom:"10px"}}>
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"14px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}><span style={{color:"var(--green)"}}>↗</span><span style={{fontSize:"11px",color:"var(--text2)",fontWeight:600}}>Monthly R</span></div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"24px",fontWeight:700,color:monthStats&&monthStats.totalRR>=0?"var(--green)":"var(--red)",lineHeight:1.1}}>{monthStats?fmtR(monthStats.totalRR):"—"}</div>
                  <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>This month</div>
                </div>
                <MiniLine trades={monthTrades} h={50} w={80}/>
              </div>
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"14px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}><span style={{color:"var(--green)"}}>◎</span><span style={{fontSize:"11px",color:"var(--text2)",fontWeight:600}}>Profit Factor</span></div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"24px",fontWeight:700,color:"var(--text)",lineHeight:1.1}}>{allStats?.profitFactor||"—"}</div>
                  <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>Gross win / loss</div>
                </div>
                {allStats&&(
                  <svg width="52" height="52" viewBox="0 0 52 52">
                    <circle cx="26" cy="26" r="20" fill="none" stroke="#1e1e38" strokeWidth="6"/>
                    <circle cx="26" cy="26" r="20" fill="none" stroke="var(--green)" strokeWidth="6"
                      strokeDasharray={`${Math.min(+allStats.profitFactor/5,1)*125.6} 125.6`}
                      strokeDashoffset="31.4" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
            </div>
            <div className="desktop-cols" style={{marginBottom:"10px"}}>
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"14px",marginBottom:"8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}><span>🏆</span><span style={{fontSize:"11px",color:"var(--text2)",fontWeight:600}}>Winrate</span></div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"24px",fontWeight:700,color:allStats&&+allStats.winRate>=50?"var(--green)":"var(--red)",marginBottom:"2px"}}>{allStats?`${allStats.winRate}%`:"—"}</div>
                <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"8px"}}>All time</div>
                {allStats&&<WinGauge wins={allStats.wins} be={allStats.be} losses={allStats.losses}/>}
              </div>
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"14px",marginBottom:"8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}><span style={{color:"var(--green)"}}>↗</span><span style={{fontSize:"11px",color:"var(--text2)",fontWeight:600}}>Avg win/loss R</span></div>
                <div style={{display:"flex",gap:"16px",marginBottom:"6px"}}>
                  <div><div style={{fontFamily:"'Space Mono',monospace",fontSize:"18px",fontWeight:700,color:"var(--green)"}}>{allStats?`+${allStats.avgWin}R`:"—"}</div><div style={{fontSize:"9px",color:"var(--muted)"}}>avg win</div></div>
                  <div><div style={{fontFamily:"'Space Mono',monospace",fontSize:"18px",fontWeight:700,color:"var(--red)"}}>{allStats?`-${allStats.avgLoss}R`:"—"}</div><div style={{fontSize:"9px",color:"var(--muted)"}}>avg loss</div></div>
                </div>
                <div style={{fontSize:"10px",color:"var(--muted)"}}>Expectancy: <span style={{color:allStats&&+allStats.expectancy>=0?"var(--green)":"var(--red)",fontFamily:"'Space Mono',monospace"}}>{allStats?`${+allStats.expectancy>=0?"+":""}${allStats.expectancy}R`:"—"}</span></div>
              </div>
            </div>
            {/* Calendar */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"16px",marginBottom:"10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                <button onClick={()=>{if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1);}} style={{padding:"6px 12px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"14px"}}>‹</button>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",color:"var(--text)",fontWeight:700}}>{MONTHS[calMonth].toUpperCase()} {calYear}</div>
                <button onClick={()=>{if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1);}} style={{padding:"6px 12px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"14px"}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px",marginBottom:"6px"}}>
                {DAYS.map(d=><div key={d} style={{textAlign:"center",fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",padding:"4px 0"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px"}}>
                {grid.map((day,i)=>{
                  if(!day)return<div key={i}/>;
                  const dd=dayRMap[day],nt=noTradeDaySet.has(day);
                  const r=dd?dd.r:0;
                  const hasT=dd&&dd.n>0;
                  const bg=hasT?(r>0?"rgba(0,232,122,0.15)":r<0?"rgba(255,63,94,0.15)":"rgba(245,197,24,0.1)"):nt?"rgba(245,197,24,0.05)":"transparent";
                  const border=hasT?(r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"):nt?"var(--yellow)":"var(--border)";
                  const isToday=day===now.getDate()&&calMonth===now.getMonth()&&calYear===now.getFullYear();
                  return(
                    <div key={i} onClick={()=>{setSelDay(day);setModal("day-detail");}} style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:"6px",background:bg,border:`1px solid ${isToday?"var(--blue)":border}`,cursor:"pointer",position:"relative"}}>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:isToday?"var(--blue)":"var(--text2)",fontWeight:isToday?700:400}}>{day}</span>
                      {hasT&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:"7px",color:r>=0?"var(--green)":"var(--red)"}}>{r>=0?"+":""}{r.toFixed(1)}R</span>}
                      {nt&&!hasT&&<span style={{fontSize:"8px",color:"var(--yellow)"}}>⊘</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
                {weekBuckets.map(wb=>(
                  <div key={wb.wk} style={{flex:1,background:"var(--card2)",borderRadius:"6px",padding:"6px",textAlign:"center"}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"var(--muted)",marginBottom:"2px"}}>W{wb.wk}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",fontWeight:700,color:wb.r>=0?"var(--green)":"var(--red)"}}>{wb.trades?fmtR(wb.r):"—"}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* No-trade day button */}
            <button onClick={()=>setModal("notrade")} style={{width:"100%",padding:"11px",background:"rgba(245,197,24,0.08)",color:"var(--yellow)",border:"1px solid rgba(245,197,24,0.3)",fontSize:"11px",letterSpacing:"1px",marginBottom:"14px"}}>⊘ LOG NO-TRADE DAY</button>
          </div>
        </div>
      )}

      {view==="tradelog"&&(
        <div style={{padding:"18px 14px 0"}} className="fade-up">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"3px"}}>TRADE LOG</div>
            <button onClick={()=>exportCSV(trades)} style={{padding:"6px 12px",background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)",fontSize:"10px"}}>↓ CSV</button>
          </div>
          <div style={{display:"flex",gap:"6px",marginBottom:"12px",flexWrap:"wrap"}}>
            {["All","Win","Loss","BE"].map(o=>(
              <button key={o} onClick={()=>setFO(o)} style={{padding:"5px 12px",fontSize:"10px",background:filterOutcome===o?"var(--green)22":"var(--card2)",border:`1px solid ${filterOutcome===o?"var(--green)":"var(--border)"}`,color:filterOutcome===o?"var(--green)":"var(--muted)"}}>{o}</button>
            ))}
            <div style={{flex:1,minWidth:"80px"}}/>
            {["All","Long","Short"].map(d=>(
              <button key={d} onClick={()=>setFD(d)} style={{padding:"5px 12px",fontSize:"10px",background:filterDir===d?"var(--blue)22":"var(--card2)",border:`1px solid ${filterDir===d?"var(--blue)":"var(--border)"}`,color:filterDir===d?"var(--blue)":"var(--muted)"}}>{d}</button>
            ))}
          </div>
          {filteredTrades.length===0?(
            <div style={{textAlign:"center",padding:"48px",color:"var(--muted)",fontFamily:"'Space Mono',monospace",fontSize:"11px"}}>No trades yet.<br/><span style={{color:"var(--green)"}}>Tap + to log your first trade.</span></div>
          ):filteredTrades.map((trade: any)=>{
            const a=trade.outcome==="Win"?"var(--green)":trade.outcome==="BE"?"var(--yellow)":"var(--red)";
            return(
              <div key={trade.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderLeft:`3px solid ${a}`,borderRadius:"10px",padding:"13px 14px",marginBottom:"8px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"3px"}}>
                      <span style={{fontWeight:800,fontSize:"15px"}}>{trade.pair}</span>
                      <span style={{padding:"2px 6px",borderRadius:"3px",fontSize:"9px",fontWeight:700,background:trade.direction==="Long"?"rgba(0,232,122,0.12)":"rgba(255,63,94,0.12)",color:trade.direction==="Long"?"var(--green)":"var(--red)"}}>{trade.direction.toUpperCase()}</span>
                    </div>
                    <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)"}}>{fmtDate(trade.date)} · {trade.session} · {trade.setup}</span>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"20px",fontWeight:700,color:a}}>{trade.outcome==="Win"?"+":trade.outcome==="BE"?"±":"-"}{trade.rr}R</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:a}}>{trade.outcome}</div>
                  </div>
                </div>
                <RRBar value={tradeR(trade)} max={maxR}/>
                {trade.notes&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--text2)",lineHeight:1.6,marginTop:"8px",background:"var(--card2)",borderRadius:"4px",padding:"6px 10px"}}>{trade.notes}</div>}
                <div style={{display:"flex",gap:"6px",marginTop:"10px"}}>
                  <button onClick={()=>{setTF({...trade});setETI(trade.id);setModal("trade");}} style={{padding:"5px 12px",fontSize:"10px",background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)"}}>EDIT</button>
                  <button onClick={()=>setDelC(trade.id)} style={{padding:"5px 10px",fontSize:"10px",background:"transparent",color:"var(--muted)",border:"1px solid var(--border)"}}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view==="reports"&&(
        <div style={{padding:"18px 14px 0"}} className="fade-up">
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"3px",marginBottom:"14px"}}>REPORTS</div>
          <div style={{display:"flex",gap:"6px",marginBottom:"14px"}}>
            {["daily","weekly","monthly"].map(p=>(
              <button key={p} onClick={()=>setRPeriod(p)} style={{flex:1,padding:"8px 0",fontSize:"10px",background:reportPeriod===p?"var(--green)22":"var(--card)",border:`1px solid ${reportPeriod===p?"var(--green)":"var(--border)"}`,color:reportPeriod===p?"var(--green)":"var(--muted)",fontWeight:700}}>{p.toUpperCase()}</button>
            ))}
          </div>
          {getReportGroups().length===0?(
            <div style={{textAlign:"center",padding:"48px",color:"var(--muted)",fontFamily:"'Space Mono',monospace",fontSize:"11px"}}>No trades to report yet.</div>
          ):getReportGroups().map(([key,grpTrades])=>(
            <ReportCard key={key} period={{type:reportPeriod,label:periodLabel(key)}} trades={grpTrades} journals={getJournalsForPeriod(key)} noTrades={getNoTradeForPeriod(key)}/>
          ))}
        </div>
      )}

      {view==="stats"&&(
        <div style={{padding:"18px 14px 0"}} className="fade-up">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"3px"}}>STATISTICS</div>
            <div style={{display:"flex",gap:"4px"}}>
              {["all","week","month"].map(r=>(
                <button key={r} onClick={()=>setSR(r)} style={{padding:"4px 10px",fontSize:"9px",background:sRange===r?"var(--blue)22":"var(--card2)",border:`1px solid ${sRange===r?"var(--blue)":"var(--border)"}`,color:sRange===r?"var(--blue)":"var(--muted)"}}>{r.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {rangedStats?(
            <>
              <div className="desktop-cols-3" style={{marginBottom:"10px"}}>
                {[
                  {l:"TOTAL R",v:fmtR(rangedStats.totalRR),c:rangedStats.totalRR>=0?"var(--green)":"var(--red)"},
                  {l:"WIN RATE",v:`${rangedStats.winRate}%`,c:+rangedStats.winRate>=50?"var(--green)":"var(--red)"},
                  {l:"PROFIT FACTOR",v:rangedStats.profitFactor,c:+rangedStats.profitFactor>=1?"var(--green)":"var(--red)"},
                  {l:"EXPECTANCY",v:`${+rangedStats.expectancy>=0?"+":""}${rangedStats.expectancy}R`,c:+rangedStats.expectancy>=0?"var(--green)":"var(--red)"},
                  {l:"MAX DRAWDOWN",v:`-${rangedStats.maxDD}R`,c:"var(--red)"},
                  {l:"TRADES",v:ranged.length,c:"var(--text)"},
                ].map(s=>(
                  <div key={s.l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"10px",padding:"13px",marginBottom:"8px"}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",marginBottom:"6px"}}>{s.l}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"22px",fontWeight:700,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>
              <DirectionCard trades={ranged}/>
              {/* Session breakdown */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"12px",padding:"16px",marginBottom:"10px"}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"14px"}}>SESSION BREAKDOWN</div>
                {SESSIONS.map(sess=>{
                  const st=ranged.filter(t=>t.session===sess);
                  if(!st.length)return null;
                  const sr=st.reduce((s,t)=>s+tradeR(t),0);
                  const sw=st.filter(t=>t.outcome==="Win").length;
                  return(
                    <div key={sess} style={{marginBottom:"10px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--text2)"}}>{sess}</span>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)"}}>{st.length}T · {((sw/st.length)*100).toFixed(0)}% WR</span>
                      </div>
                      <RRBar value={sr} max={maxR*3}/>
                    </div>
                  );
                })}
              </div>
              {/* Setup breakdown */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"12px",padding:"16px",marginBottom:"10px"}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"14px"}}>SETUP BREAKDOWN</div>
                {SETUPS.map(setup=>{
                  const st=ranged.filter(t=>t.setup===setup);
                  if(!st.length)return null;
                  const sr=st.reduce((s,t)=>s+tradeR(t),0);
                  const sw=st.filter(t=>t.outcome==="Win").length;
                  return(
                    <div key={setup} style={{marginBottom:"10px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--text2)"}}>{setup}</span>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)"}}>{st.length}T · {((sw/st.length)*100).toFixed(0)}% WR</span>
                      </div>
                      <RRBar value={sr} max={maxR*3}/>
                    </div>
                  );
                })}
              </div>
              {/* Equity curve */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"12px",padding:"16px",marginBottom:"10px"}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"12px"}}>EQUITY CURVE</div>
                <MiniLine trades={ranged} h={80} w={300}/>
              </div>
            </>
          ):(
            <div style={{textAlign:"center",padding:"48px",color:"var(--muted)",fontFamily:"'Space Mono',monospace",fontSize:"11px"}}>No trades in this range.</div>
          )}
        </div>
      )}

      {view==="review"&&(
        <div style={{padding:"18px 14px 0"}} className="fade-up">
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"3px",marginBottom:"14px"}}>JOURNAL REVIEW</div>
          <div style={{display:"flex",gap:"6px",marginBottom:"14px"}}>
            {["daily","weekly","monthly"].map(p=>(
              <button key={p} onClick={()=>setRP(p)} style={{flex:1,padding:"8px 0",fontSize:"10px",background:reviewPeriod===p?"var(--blue)22":"var(--card)",border:`1px solid ${reviewPeriod===p?"var(--blue)":"var(--border)"}`,color:reviewPeriod===p?"var(--blue)":"var(--muted)",fontWeight:700}}>{p.toUpperCase()}</button>
            ))}
          </div>
          {groupJournals().length===0?(
            <div style={{textAlign:"center",padding:"48px",color:"var(--muted)",fontFamily:"'Space Mono',monospace",fontSize:"11px"}}>No journal entries yet.<br/><span style={{color:"var(--blue)"}}>Tap + to add a reflection.</span></div>
          ):groupJournals().map(([period,entries])=>{
            const latest=entries[0],tc=latest.type==="daily"?"var(--green)":latest.type==="weekly"?"var(--blue)":"var(--purple)";
            const avgM=(entries.reduce((s: number,e: any)=>s+e.mental_score,0)/entries.length).toFixed(1);
            const avgD=(entries.reduce((s: number,e: any)=>s+e.discipline_score,0)/entries.length).toFixed(1);
            const onPlan=entries.filter((e: any)=>e.followed_plan).length;
            const pt=trades.filter(t=>reviewPeriod==="daily"?t.date===period:reviewPeriod==="weekly"?getISOWeek(t.date)===period:getMonth(t.date)===period);
            const pr=pt.reduce((s,t)=>s+tradeR(t),0);
            return(
              <div key={period} onClick={()=>{setVJ(latest);setModal("journal-view");}} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"12px",padding:"14px 16px",marginBottom:"10px",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
                  <div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>{reviewPeriod==="daily"?fmtDate(period):period}</div>
                    <div style={{fontWeight:800,fontSize:"15px"}}>{latest.mood}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    {pt.length>0&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:"13px",fontWeight:700,color:pr>=0?"var(--green)":"var(--red)"}}>{fmtR(pr)}</span>}
                    <span style={{padding:"3px 8px",fontSize:"9px",fontWeight:700,borderRadius:"4px",background:tc+"22",color:tc,border:`1px solid ${tc}44`}}>{latest.type.toUpperCase()}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:"12px",marginBottom:latest.lessons?"10px":"0"}}>
                  {[["M",avgM,"var(--blue)"],["D",avgD,"var(--purple)"]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:"5px"}}>
                      <div style={{width:"28px",height:"3px",borderRadius:"2px",background:`linear-gradient(to right,${c} ${+v*10}%,var(--border) ${+v*10}%)`}}/>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--text2)"}}>{l}:{v}</span>
                    </div>
                  ))}
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:onPlan===entries.length?"var(--green)":"var(--muted)"}}>{onPlan}/{entries.length} ON-PLAN</span>
                </div>
                {latest.lessons&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",lineHeight:1.5,borderTop:"1px solid var(--border)",paddingTop:"8px"}}>💡 {latest.lessons.slice(0,90)}{latest.lessons.length>90?"…":""}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return(
    <><style>{CSS}</style>
    <div className="desktop-wrap">
      <div className="sidebar">
        <div className="sidebar-logo">
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"var(--muted)",letterSpacing:"3px",marginBottom:"3px"}}>1% TRADER</div>
          <div style={{fontWeight:800,fontSize:"18px",letterSpacing:"-0.5px"}}>R:R<span style={{color:"var(--green)"}}>.</span>JOURNAL</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} className={`sidebar-btn${view===n.id?" active":""}`}>
              <span style={{fontSize:"16px"}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{padding:"0 16px",marginTop:"auto"}}>
          <button onClick={()=>{setTF({date:todayStr(),pair:"EUR/USD",direction:"Long",session:"London",setup:"Trend Continuation",rr:"",outcome:"Win",notes:""});setModal("trade");}} style={{width:"100%",padding:"11px",background:"var(--green)",color:"#0a0a14",fontSize:"12px",letterSpacing:"1px",fontWeight:800,marginBottom:"8px"}}>+ LOG TRADE</button>
          <button onClick={()=>{setJF({date:todayStr(),type:"daily",mood:"😌 Calm",followed_plan:true,best_trade:"",mistakes:"",lessons:"",mental_score:7,discipline_score:7});setModal("journal");}} style={{width:"100%",padding:"11px",background:"var(--blue)22",color:"var(--blue)",border:"1px solid var(--blue)44",fontSize:"12px",letterSpacing:"1px",fontWeight:800}}>+ JOURNAL</button>
        </div>
      </div>

      <div className="main-content">
        {mainContent}
      </div>

      <div className="bottom-nav">
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)} className="bottom-nav-btn" style={{color:view===n.id?"var(--green)":"var(--muted)"}}>
            <span style={{fontSize:"18px",lineHeight:1}}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      <button className="mobile-only" onClick={()=>{if(view==="review"){setJF({date:todayStr(),type:"daily",mood:"😌 Calm",followed_plan:true,best_trade:"",mistakes:"",lessons:"",mental_score:7,discipline_score:7});setModal("journal");}else{setTF({date:todayStr(),pair:"EUR/USD",direction:"Long",session:"London",setup:"Trend Continuation",rr:"",outcome:"Win",notes:""});setModal("trade");}}}
        style={{position:"fixed",bottom:"84px",right:"20px",width:"52px",height:"52px",borderRadius:"50%",background:view==="review"?"var(--blue)":"var(--green)",color:"#0a0a14",fontSize:"22px",fontWeight:700,zIndex:100,boxShadow:`0 8px 24px ${view==="review"?"rgba(77,158,255,0.3)":"rgba(0,232,122,0.25)"}`}}>+</button>
    </div>

    {modal==="notrade"&&(
      <div style={{position:"fixed",inset:0,background:"rgba(10,10,20,0.9)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"16px 16px 0 0",padding:"24px 20px 32px",width:"100%",maxWidth:640}} className="fade-up">
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",color:"var(--muted)",letterSpacing:"2px",marginBottom:"16px"}}>LOG NO-TRADE DAY</div>
          <div style={{marginBottom:"10px"}}><Lbl>DATE</Lbl><input type="date" value={ntDate} onChange={e=>setNTD(e.target.value)}/></div>
          <div style={{marginBottom:"16px"}}><Lbl>REASON (optional)</Lbl><input placeholder="e.g. Low volatility, news day, personal..." value={ntNote} onChange={e=>setNTN(e.target.value)}/></div>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={()=>setModal(null)} style={{flex:1,padding:"13px",background:"var(--card2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:"11px"}}>CANCEL</button>
            <button onClick={()=>{if(noTrades.find(n=>n.date===ntDate)){toast_("Already logged","error");return;}setNT(p=>[{date:ntDate,note:ntNote},...p]);setNTN("");setModal(null);toast_("No-trade day logged ✓");}} style={{flex:2,padding:"13px",background:"var(--yellow)",color:"#0a0a14",fontSize:"12px",letterSpacing:"2px",fontWeight:800}}>LOG DAY</button>
          </div>
        </div>
      </div>
    )}

    {delC&&<DelModal onCancel={()=>setDelC(null)} onConfirm={()=>{setTrades(p=>p.filter((t: any)=>t.id!==delC));setDelC(null);toast_("Deleted","error");}}/>}
    {toast&&<Toast {...toast}/>}
    </>
  );
}
