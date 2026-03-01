import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area, ComposedChart, ReferenceLine } from "recharts";
import _ from "lodash";

/* ── SEEING-THEORY INSPIRED DESIGN TOKENS ── */
/* Per-chapter accent palette — saturated, clear, one per section */
const SC = {
  home:"#4F9CF9", s1:"#7C6FF7", s2:"#A78BFA",
  s3:"#2CC4A0",   s4:"#3ABFF8", s5:"#F5A623",
  s6:"#F26B6B",   s7:"#1DD2AF", s8:"#52C77F",
  ref:"#8699B5",  appA:"#F5895A", appB:"#B57BEE", ai:"#2DD4BF"
};

/* Dark base (keeps existing dark feel, but with tighter contrast ratios) */
const C = {
  bg:"#07090F",       bgCard:"#0C1220",    bgCard2:"#101828",
  bgStep:"#0A111E",   bgActive:"#0F1D35",
  text:"#EDF0FA",     textDim:"#7A8BAA",   textMuted:"#3A4B6A",
  border:"#182444",   borderLight:"#111E36",
  accent:"#4F9CF9",
  green:"#3FB950",    red:"#F26B6B",
  orange:"#F5A623",   purple:"#B57BEE",    yellow:"#E3B040",
};


/* Inject global keyframes once */
const GLOBAL_CSS = `
  @keyframes fadeUp   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes pop      { 0%{opacity:0;transform:scale(.82) translateY(-6px)} 60%{transform:scale(1.04) translateY(1px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes shimmer  { 0%{background-position:200% center} 100%{background-position:-200% center} }
  @keyframes dotPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.35)} }
  .st-step { transition: border-color .2s, opacity .2s, background .2s; }
  .st-step:hover { opacity: .85 !important; }
  input[type=range] { cursor: pointer; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a2845; border-radius: 4px; }
`;

function XGBoostExplainer() {
  const [activeStep, setActiveStep] = useState(0);
  const [nSplits,    setNSplits]    = useState(0);
  const [s1,         setS1]         = useState(15);
  const S2  = 22;
  const ETA = 0.3;

  const svgRef  = useRef(null);
  const dragRef = useRef(false);

  /* ── demand data (30 weeks) ── */
  const DATA = useMemo(() => {
    const raw = [28,27.5,29,28.5,30,32,35,34,33.5,36,
                 38,37.5,36.5,39,40,38.5,37,41,43,42,
                 40.5,44,46,45,43.5,47,48.5,47.5,46,49];
    return raw.map((v, i) => ({ week: i + 1, demand: Math.round(v * 1000) }));
  }, []);

  /* ── leaf assignment ── */
  const getLeaf = (week, ns, s1v) => {
    if (ns === 0) return 0;
    if (week <= s1v) return 1;
    if (ns < 2) return 2;
    return week <= S2 ? 3 : 4;
  };

  /* ── leaf means ── */
  const computeLeafMeans = useCallback((ns, s1v) => {
    const b = [0,1,2,3,4].map(() => ({ sum: 0, n: 0 }));
    DATA.forEach(d => {
      const g = getLeaf(d.week, ns, s1v);
      b[g].sum += d.demand; b[g].n++;
    });
    return b.map(x => x.n ? Math.round(x.sum / x.n) : 0);
  }, [DATA]);

  /* ── RMSE ── */
  const computeRMSE = useCallback((ns, s1v) => {
    const means = computeLeafMeans(ns, s1v);
    const mse = DATA.reduce((acc, d) => {
      const g = getLeaf(d.week, ns, s1v);
      return acc + (d.demand - means[g]) ** 2;
    }, 0) / DATA.length;
    return Math.round(Math.sqrt(mse));
  }, [DATA, computeLeafMeans]);

  /* live RMSE values (update as s1 moves) */
  const rmse0 = useMemo(() => computeRMSE(0, s1), [computeRMSE, s1]);
  const rmse1 = useMemo(() => computeRMSE(1, s1), [computeRMSE, s1]);
  const rmse2 = useMemo(() => computeRMSE(2, s1), [computeRMSE, s1]);

  /* ── Tree 1 predictions (full 2-split tree) ── */
  const tree1Pred = useMemo(() => {
    const means = computeLeafMeans(2, s1);
    return DATA.map(d => ({ ...d, pred: means[getLeaf(d.week, 2, s1)] }));
  }, [DATA, computeLeafMeans, s1]);

  /* ── Residuals ── */
  const residuals = useMemo(() =>
    tree1Pred.map(d => ({ week: d.week, res: d.demand - d.pred }))
  , [tree1Pred]);

  /* ── Tree 2: depth-1 on residuals at fixed split=20 ── */
  const tree2 = useMemo(() => {
    const SPLIT = 20;
    const early = residuals.filter(r => r.week <= SPLIT);
    const late  = residuals.filter(r => r.week >  SPLIT);
    const earlyMean = Math.round(early.reduce((a,r)=>a+r.res,0)/early.length);
    const lateMean  = Math.round(late.reduce((a,r)=>a+r.res,0)/late.length);
    return { split: SPLIT, earlyMean, lateMean };
  }, [residuals]);

  /* ── Ensemble predictions ── */
  const ensemblePred = useMemo(() =>
    tree1Pred.map(d => {
      const t2 = d.week <= tree2.split ? tree2.earlyMean : tree2.lateMean;
      return { ...d, ensemble: Math.round(d.pred + ETA * t2) };
    })
  , [tree1Pred, tree2]);

  const rmseEnsemble = useMemo(() => {
    const mse = ensemblePred.reduce((a,d)=>a+(d.demand-d.ensemble)**2, 0) / ensemblePred.length;
    return Math.round(Math.sqrt(mse));
  }, [ensemblePred]);

  /* ── SVG layout ── */
  const W=580, H=290, ML=56, MR=16, MT=28, MB=42;
  const iW = W - ML - MR;
  const iH = H - MT - MB;
  const xs = w  => ML + (w - 1) / 29 * iW;
  const ys = v  => MT + iH - (v - 26000) / (51000 - 26000) * iH;

  /* mouse → week (clamped 2–28) */
  const xToWeek = clientX => {
    if (!svgRef.current) return s1;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = (clientX - rect.left - ML) / iW;
    return Math.round(Math.max(2, Math.min(28, 1 + frac * 29)));
  };
  const onMove = e => { if (dragRef.current) setS1(xToWeek(e.clientX)); };
  const onUp   = () => { dragRef.current = false; };

  /* ── palette ── */
  const C = {
    bg: '#0f172a', panel: '#1e293b', border: '#334155',
    text: '#e2e8f0', muted: '#64748b', accent: '#4f46e5',
    leaf: ['#94a3b8','#6366f1','#10b981','#f59e0b','#ef4444'],
  };

  /* ── shared demand axes ── */
  const DemandAxes = () => (
    <>
      <line x1={ML} y1={MT} x2={ML} y2={MT+iH} stroke={C.border} strokeWidth={1.5}/>
      <line x1={ML} y1={MT+iH} x2={ML+iW} y2={MT+iH} stroke={C.border} strokeWidth={1.5}/>
      {[27,30,33,36,39,42,45,48].map(v => (
        <g key={v}>
          <line x1={ML-3} y1={ys(v*1000)} x2={ML} y2={ys(v*1000)} stroke={C.muted} strokeWidth={1}/>
          <text x={ML-6} y={ys(v*1000)+4} textAnchor="end" fontSize={8.5} fill={C.muted}>{v}k</text>
        </g>
      ))}
      {[1,5,10,15,20,25,30].map(w => (
        <g key={w}>
          <line x1={xs(w)} y1={MT+iH} x2={xs(w)} y2={MT+iH+4} stroke={C.muted} strokeWidth={1}/>
          <text x={xs(w)} y={MT+iH+15} textAnchor="middle" fontSize={8.5} fill={C.muted}>Wk {w}</text>
        </g>
      ))}
      <text x={ML+iW/2} y={H-2} textAnchor="middle" fontSize={9.5} fill={C.muted}>Week</text>
      <text x={12} y={MT+iH/2} textAnchor="middle" fontSize={9.5} fill={C.muted}
        transform={`rotate(-90,12,${MT+iH/2})`}>Demand (units)</text>
    </>
  );

  /* ══════════════════════════════════════════
     STEP 0 — Decision Tree (interactive scatter)
     ══════════════════════════════════════════ */
  const TreeStep = () => {
    const curRMSE  = [rmse0, rmse1, rmse2][nSplits];
    const prevRMSE = nSplits === 0 ? null : nSplits === 1 ? rmse0 : rmse1;
    const means    = computeLeafMeans(nSplits, s1);

    return (
      <div>
        {/* controls */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
          <div style={{background:'#1e1b4b',borderRadius:8,padding:'5px 14px',
                       color:'#a5b4fc',fontSize:13,fontWeight:700}}>
            RMSE: {curRMSE.toLocaleString()}
            {prevRMSE && (
              <span style={{color:'#4ade80',marginLeft:8,fontSize:11}}>
                {'↓'} from {prevRMSE.toLocaleString()}
              </span>
            )}
          </div>
          {nSplits < 2 && (
            <button onClick={() => setNSplits(n => n + 1)}
              style={{background:C.accent,color:'#fff',border:'none',borderRadius:7,
                      padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:600}}>
              + Add split
            </button>
          )}
          {nSplits > 0 && (
            <span style={{fontSize:11,color:C.muted}}>
              drag purple line to adjust split
            </span>
          )}
          {nSplits > 0 && (
            <button onClick={() => { setNSplits(0); setS1(15); }}
              style={{background:'transparent',color:C.muted,border:`1px solid ${C.border}`,
                      borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11}}>
              Reset
            </button>
          )}
        </div>

        {/* scatter SVG */}
        <svg width={W} height={H} ref={svgRef}
          onMouseMove={onMove} onMouseUp={onUp}
          style={{display:'block', userSelect:'none',
                  cursor: dragRef.current ? 'col-resize' : 'default'}}>
          <DemandAxes/>

          {/* leaf region shading */}
          {nSplits >= 1 && (
            <rect x={ML} y={MT} width={xs(s1)-ML} height={iH}
              fill={C.leaf[1]} opacity={0.08} rx={2}/>
          )}
          {nSplits === 1 && (
            <rect x={xs(s1)} y={MT} width={ML+iW-xs(s1)} height={iH}
              fill={C.leaf[2]} opacity={0.08} rx={2}/>
          )}
          {nSplits >= 2 && (
            <>
              <rect x={xs(s1)} y={MT} width={xs(S2)-xs(s1)} height={iH}
                fill={C.leaf[3]} opacity={0.08} rx={2}/>
              <rect x={xs(S2)} y={MT} width={ML+iW-xs(S2)} height={iH}
                fill={C.leaf[4]} opacity={0.08} rx={2}/>
            </>
          )}

          {/* leaf mean lines + value labels */}
          {nSplits === 0 && means[0] > 0 && (
            <>
              <line x1={ML} y1={ys(means[0])} x2={ML+iW} y2={ys(means[0])}
                stroke={C.leaf[0]} strokeWidth={2} strokeDasharray="6,4" opacity={0.8}/>
              <text x={ML+iW-4} y={ys(means[0])-5} textAnchor="end"
                fontSize={8.5} fill={C.leaf[0]}>{(means[0]/1000).toFixed(1)}k avg</text>
            </>
          )}
          {nSplits >= 1 && means[1] > 0 && (
            <>
              <line x1={ML} y1={ys(means[1])} x2={xs(s1)} y2={ys(means[1])}
                stroke={C.leaf[1]} strokeWidth={2} strokeDasharray="6,4" opacity={0.85}/>
              <text x={(ML+xs(s1))/2} y={ys(means[1])-5} textAnchor="middle"
                fontSize={8} fill={C.leaf[1]}>{(means[1]/1000).toFixed(1)}k</text>
            </>
          )}
          {nSplits === 1 && means[2] > 0 && (
            <>
              <line x1={xs(s1)} y1={ys(means[2])} x2={ML+iW} y2={ys(means[2])}
                stroke={C.leaf[2]} strokeWidth={2} strokeDasharray="6,4" opacity={0.85}/>
              <text x={(xs(s1)+ML+iW)/2} y={ys(means[2])-5} textAnchor="middle"
                fontSize={8} fill={C.leaf[2]}>{(means[2]/1000).toFixed(1)}k</text>
            </>
          )}
          {nSplits >= 2 && means[3] > 0 && (
            <>
              <line x1={xs(s1)} y1={ys(means[3])} x2={xs(S2)} y2={ys(means[3])}
                stroke={C.leaf[3]} strokeWidth={2} strokeDasharray="6,4" opacity={0.85}/>
              <text x={(xs(s1)+xs(S2))/2} y={ys(means[3])-5} textAnchor="middle"
                fontSize={8} fill={C.leaf[3]}>{(means[3]/1000).toFixed(1)}k</text>
            </>
          )}
          {nSplits >= 2 && means[4] > 0 && (
            <>
              <line x1={xs(S2)} y1={ys(means[4])} x2={ML+iW} y2={ys(means[4])}
                stroke={C.leaf[4]} strokeWidth={2} strokeDasharray="6,4" opacity={0.85}/>
              <text x={(xs(S2)+ML+iW)/2} y={ys(means[4])-5} textAnchor="middle"
                fontSize={8} fill={C.leaf[4]}>{(means[4]/1000).toFixed(1)}k</text>
            </>
          )}

          {/* data points — color changes with CSS transition */}
          {DATA.map(d => {
            const g = getLeaf(d.week, nSplits, s1);
            return (
              <circle key={d.week} cx={xs(d.week)} cy={ys(d.demand)} r={5.5}
                fill={C.leaf[g]} stroke="#0f172a" strokeWidth={1.3}
                style={{ transition: 'fill 0.45s ease' }}/>
            );
          })}

          {/* S1 — draggable split line */}
          {nSplits >= 1 && (
            <g onMouseDown={e => { e.preventDefault(); dragRef.current = true; }}
               style={{ cursor: 'col-resize' }}>
              <line x1={xs(s1)} y1={MT} x2={xs(s1)} y2={MT+iH}
                stroke={C.leaf[1]} strokeWidth={2.5} strokeDasharray="7,4"/>
              {/* drag handle pill */}
              <rect x={xs(s1)-14} y={MT+iH/2-11} width={28} height={22}
                fill={C.leaf[1]} rx={6} opacity={0.95}/>
              <text x={xs(s1)} y={MT+iH/2+5} textAnchor="middle" fontSize={12}
                fill="#fff" style={{ pointerEvents:'none' }}>↔</text>
              <text x={xs(s1)} y={MT-9} textAnchor="middle" fontSize={8} fill={C.leaf[1]}>
                Wk {s1}
              </text>
            </g>
          )}

          {/* S2 — fixed split line */}
          {nSplits >= 2 && (
            <>
              <line x1={xs(S2)} y1={MT} x2={xs(S2)} y2={MT+iH}
                stroke={C.leaf[3]} strokeWidth={2} strokeDasharray="5,4" opacity={0.85}/>
              <text x={xs(S2)} y={MT-9} textAnchor="middle" fontSize={8} fill={C.leaf[3]}>
                Wk {S2}
              </text>
            </>
          )}
        </svg>

        {/* leaf chips */}
        {nSplits >= 1 && (
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>
            <span style={{background:C.leaf[1]+'25',color:C.leaf[1],
                          borderRadius:5,padding:'2px 9px',fontSize:11}}>
              Wk 1–{s1}: {means[1].toLocaleString()}
            </span>
            {nSplits === 1 && (
              <span style={{background:C.leaf[2]+'25',color:C.leaf[2],
                            borderRadius:5,padding:'2px 9px',fontSize:11}}>
                Wk {s1+1}–30: {means[2].toLocaleString()}
              </span>
            )}
            {nSplits >= 2 && (
              <>
                <span style={{background:C.leaf[3]+'25',color:C.leaf[3],
                              borderRadius:5,padding:'2px 9px',fontSize:11}}>
                  Wk {s1+1}–{S2}: {means[3].toLocaleString()}
                </span>
                <span style={{background:C.leaf[4]+'25',color:C.leaf[4],
                              borderRadius:5,padding:'2px 9px',fontSize:11}}>
                  Wk {S2+1}–30: {means[4].toLocaleString()}
                </span>
              </>
            )}
          </div>
        )}

        <p style={{fontSize:12,color:C.muted,marginTop:8,lineHeight:1.6}}>
          {nSplits === 0 && 'One global mean for all 30 weeks. Click "+ Add split" to divide the data into groups.'}
          {nSplits === 1 && `Split at Week ${s1}. Drag the purple handle left or right — watch RMSE update live as the groups change.`}
          {nSplits >= 2 && `Two splits, three leaf groups. RMSE fell ${rmse0.toLocaleString()} \u2192 ${rmse1.toLocaleString()} \u2192 ${rmse2.toLocaleString()}. Each split reduces unexplained variance.`}
        </p>
      </div>
    );
  };

  /* ══════════════════════════════════════════
     STEP 1 — Residual bar chart
     ══════════════════════════════════════════ */
  const ResidualStep = () => {
    const rH=280, rMT=22, rMB=42, rIH=rH-rMT-rMB;
    const resMax = Math.max(...residuals.map(r => Math.abs(r.res)));
    const yr = v => rMT + rIH/2 - (v / resMax) * (rIH/2 - 8);

    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
          <div style={{background:'#1e1b4b',borderRadius:8,padding:'5px 14px',
                       color:'#a5b4fc',fontSize:13,fontWeight:700}}>
            Residual RMSE: {rmse2.toLocaleString()}
          </div>
          <span style={{fontSize:11,color:C.muted}}>Residual = Actual − Tree 1 Prediction</span>
        </div>

        <svg width={W} height={rH} style={{display:'block'}}>
          <line x1={ML} y1={rMT} x2={ML} y2={rMT+rIH} stroke={C.border} strokeWidth={1.5}/>
          <line x1={ML} y1={rMT+rIH} x2={ML+iW} y2={rMT+rIH} stroke={C.border} strokeWidth={1.5}/>
          {/* zero line */}
          <line x1={ML} y1={yr(0)} x2={ML+iW} y2={yr(0)}
            stroke="#475569" strokeWidth={1} strokeDasharray="4,3"/>
          <text x={ML-6} y={yr(0)+4} textAnchor="end" fontSize={8} fill={C.muted}>0</text>

          {/* y ticks */}
          {[-resMax*0.8, -resMax*0.4, resMax*0.4, resMax*0.8].map((v,i) => (
            <g key={i}>
              <line x1={ML-3} y1={yr(v)} x2={ML} y2={yr(v)} stroke={C.muted} strokeWidth={1}/>
              <text x={ML-6} y={yr(v)+4} textAnchor="end" fontSize={8} fill={C.muted}>
                {v>=0?'+':''}{Math.round(v/1000)}k
              </text>
            </g>
          ))}

          {/* x ticks */}
          {[1,5,10,15,20,25,30].map(w => (
            <g key={w}>
              <line x1={xs(w)} y1={rMT+rIH} x2={xs(w)} y2={rMT+rIH+4} stroke={C.muted} strokeWidth={1}/>
              <text x={xs(w)} y={rMT+rIH+15} textAnchor="middle" fontSize={8.5} fill={C.muted}>Wk {w}</text>
            </g>
          ))}

          {/* residual bars */}
          {residuals.map(r => {
            const bH = Math.abs(yr(r.res) - yr(0));
            const bY = r.res >= 0 ? yr(r.res) : yr(0);
            return (
              <rect key={r.week} x={xs(r.week)-6} y={bY} width={12} height={bH}
                fill={r.res >= 0 ? C.leaf[1] : C.leaf[4]} opacity={0.8} rx={2}/>
            );
          })}

          <text x={ML+iW/2} y={rH-3} textAnchor="middle" fontSize={9.5} fill={C.muted}>Week</text>
          <text x={12} y={rMT+rIH/2} textAnchor="middle" fontSize={9.5} fill={C.muted}
            transform={`rotate(-90,12,${rMT+rIH/2})`}>Residual (units)</text>
        </svg>

        <div style={{display:'flex',gap:12,marginTop:6,fontSize:11}}>
          <span><span style={{color:C.leaf[1]}}>■</span> Under-prediction (actual higher)</span>
          <span><span style={{color:C.leaf[4]}}>■</span> Over-prediction (actual lower)</span>
        </div>
        <p style={{fontSize:12,color:C.muted,marginTop:8,lineHeight:1.6}}>
          After Tree 1 predicts a flat mean per leaf, systematic gaps remain.
          Tree 2 will train directly on these residuals to correct them.
        </p>
      </div>
    );
  };

  /* ══════════════════════════════════════════
     STEP 2 — Boost Round 1
     ══════════════════════════════════════════ */
  const BoostStep = () => {
    const rH=280, rMT=22, rMB=42, rIH=rH-rMT-rMB;
    const resMax = Math.max(...residuals.map(r => Math.abs(r.res)));
    const yr = v => rMT + rIH/2 - (v / resMax) * (rIH/2 - 8);
    const { split, earlyMean, lateMean } = tree2;

    /* RMSE of residuals before and after tree2 correction */
    const rmseResidBefore = Math.round(Math.sqrt(
      residuals.reduce((a,r)=>a+r.res**2, 0) / residuals.length
    ));
    const rmseResidAfter = Math.round(Math.sqrt(
      residuals.reduce((a,r)=>{
        const pred = r.week <= split ? earlyMean : lateMean;
        return a + (r.res - pred)**2;
      }, 0) / residuals.length
    ));

    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
          <div style={{background:'#1e1b4b',borderRadius:8,padding:'5px 14px',
                       color:'#a5b4fc',fontSize:13,fontWeight:700}}>
            Residual RMSE: {rmseResidBefore.toLocaleString()} {'\u2192'} {rmseResidAfter.toLocaleString()}
          </div>
          <span style={{fontSize:11,color:C.muted}}>
            Tree 2 splits residuals at Wk {split}
          </span>
        </div>

        <svg width={W} height={rH} style={{display:'block'}}>
          <line x1={ML} y1={rMT} x2={ML} y2={rMT+rIH} stroke={C.border} strokeWidth={1.5}/>
          <line x1={ML} y1={rMT+rIH} x2={ML+iW} y2={rMT+rIH} stroke={C.border} strokeWidth={1.5}/>
          <line x1={ML} y1={yr(0)} x2={ML+iW} y2={yr(0)}
            stroke="#475569" strokeWidth={1} strokeDasharray="4,3"/>
          <text x={ML-6} y={yr(0)+4} textAnchor="end" fontSize={8} fill={C.muted}>0</text>

          {[1,5,10,15,20,25,30].map(w => (
            <g key={w}>
              <line x1={xs(w)} y1={rMT+rIH} x2={xs(w)} y2={rMT+rIH+4} stroke={C.muted} strokeWidth={1}/>
              <text x={xs(w)} y={rMT+rIH+15} textAnchor="middle" fontSize={8.5} fill={C.muted}>Wk {w}</text>
            </g>
          ))}

          {/* faded residual bars */}
          {residuals.map(r => {
            const bH = Math.abs(yr(r.res) - yr(0));
            const bY = r.res >= 0 ? yr(r.res) : yr(0);
            return (
              <rect key={r.week} x={xs(r.week)-6} y={bY} width={12} height={bH}
                fill={r.res >= 0 ? C.leaf[1] : C.leaf[4]} opacity={0.35} rx={2}/>
            );
          })}

          {/* Tree 2 mean correction lines */}
          <line x1={ML} y1={yr(earlyMean)} x2={xs(split)} y2={yr(earlyMean)}
            stroke="#10b981" strokeWidth={2.5} strokeDasharray="6,3"/>
          <line x1={xs(split)} y1={yr(lateMean)} x2={ML+iW} y2={yr(lateMean)}
            stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="6,3"/>
          <text x={(ML+xs(split))/2} y={yr(earlyMean)-6} textAnchor="middle"
            fontSize={8} fill="#10b981">{(earlyMean/1000).toFixed(1)}k</text>
          <text x={(xs(split)+ML+iW)/2} y={yr(lateMean)-6} textAnchor="middle"
            fontSize={8} fill="#f59e0b">{(lateMean/1000).toFixed(1)}k</text>

          {/* split line */}
          <line x1={xs(split)} y1={rMT} x2={xs(split)} y2={rMT+rIH}
            stroke="#fff" strokeWidth={1.5} strokeDasharray="4,4" opacity={0.35}/>
          <text x={xs(split)} y={rMT-7} textAnchor="middle" fontSize={8} fill="#94a3b8">
            Wk {split}
          </text>

          <text x={ML+iW/2} y={rH-3} textAnchor="middle" fontSize={9.5} fill={C.muted}>Week</text>
          <text x={12} y={rMT+rIH/2} textAnchor="middle" fontSize={9.5} fill={C.muted}
            transform={`rotate(-90,12,${rMT+rIH/2})`}>Residual (units)</text>
        </svg>

        <div style={{display:'flex',gap:14,marginTop:6,fontSize:11,flexWrap:'wrap'}}>
          <span><span style={{color:C.leaf[1]}}>■</span> Under-pred residual</span>
          <span><span style={{color:C.leaf[4]}}>■</span> Over-pred residual</span>
          <span><span style={{color:'#10b981'}}>─</span> Tree 2 (early wks)</span>
          <span><span style={{color:'#f59e0b'}}>─</span> Tree 2 (late wks)</span>
        </div>
        <p style={{fontSize:12,color:C.muted,marginTop:8,lineHeight:1.6}}>
          Tree 2 trains on the leftover residuals. It learns correction values for each half of the season.
          Each new tree in XGBoost corrects what the previous trees got wrong — residual RMSE falls from{' '}
          {rmseResidBefore.toLocaleString()} to {rmseResidAfter.toLocaleString()}.
        </p>
      </div>
    );
  };

  /* ══════════════════════════════════════════
     STEP 3 — Ensemble
     ══════════════════════════════════════════ */
  const EnsembleStep = () => (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
        <div style={{background:'#14532d',borderRadius:8,padding:'5px 14px',
                     color:'#4ade80',fontSize:13,fontWeight:700}}>
          Final RMSE: {rmseEnsemble.toLocaleString()}
          <span style={{color:'#86efac',marginLeft:8,fontSize:11}}>
            {'\u2193'} from {rmse0.toLocaleString()} (baseline)
          </span>
        </div>
      </div>

      <svg width={W} height={H} style={{display:'block'}}>
        <DemandAxes/>

        {/* actual demand dots */}
        {ensemblePred.map(d => (
          <circle key={d.week} cx={xs(d.week)} cy={ys(d.demand)} r={4.5}
            fill="#94a3b8" opacity={0.75} stroke="#0f172a" strokeWidth={1}/>
        ))}

        {/* Tree 1 only (step function, dashed) */}
        {ensemblePred.map((d,i) => {
          if (i === 0) return null;
          const prev = ensemblePred[i-1];
          if (Math.abs(d.pred - prev.pred) > 4000) return null; // skip leaf jumps
          return (
            <line key={d.week}
              x1={xs(prev.week)} y1={ys(prev.pred)}
              x2={xs(d.week)}    y2={ys(d.pred)}
              stroke={C.leaf[1]} strokeWidth={1.5} opacity={0.55} strokeDasharray="4,3"/>
          );
        })}

        {/* Ensemble (Tree1 + ETA*Tree2) */}
        {ensemblePred.map((d,i) => {
          if (i === 0) return null;
          const prev = ensemblePred[i-1];
          if (Math.abs(d.ensemble - prev.ensemble) > 4000) return null;
          return (
            <line key={d.week}
              x1={xs(prev.week)} y1={ys(prev.ensemble)}
              x2={xs(d.week)}    y2={ys(d.ensemble)}
              stroke="#10b981" strokeWidth={2.5} opacity={0.95}/>
          );
        })}
      </svg>

      <div style={{display:'flex',gap:14,marginTop:6,fontSize:11}}>
        <span><span style={{color:'#94a3b8'}}>●</span> Actual demand</span>
        <span><span style={{color:C.leaf[1]}}>- -</span> Tree 1 only ({rmse2.toLocaleString()})</span>
        <span><span style={{color:'#10b981'}}>─</span> Ensemble ({rmseEnsemble.toLocaleString()})</span>
      </div>

      <p style={{fontSize:12,color:C.muted,marginTop:8,lineHeight:1.6}}>
        The ensemble adds Tree 2's corrections (scaled by learning rate {ETA}) on top of Tree 1.
        RMSE improves from {rmse0.toLocaleString()} (flat mean) {'\u2192'} {rmse2.toLocaleString()} (Tree 1) {'\u2192'} {rmseEnsemble.toLocaleString()} (2 trees).
        Real XGBoost stacks hundreds of such trees, each shaving off a little more error.
      </p>
    </div>
  );

  /* ── step metadata ── */
  const STEPS = [
    { icon:'🌳', label:'Decision Tree' },
    { icon:'📉', label:'Residuals'     },
    { icon:'➕', label:'Boost Round 1' },
    { icon:'🎯', label:'Ensemble'      },
  ];
  const stepContent = [
    <TreeStep      key="tree"/>,
    <ResidualStep  key="res"/>,
    <BoostStep     key="boost"/>,
    <EnsembleStep  key="ens"/>,
  ];

  /* ── shell ── */
  return (
    <div style={{background:C.bg,borderRadius:14,padding:'22px 24px',
                 color:C.text,maxWidth:640,fontFamily:'system-ui,sans-serif'}}>
      <h3 style={{margin:'0 0 3px',fontSize:18,fontWeight:700,color:'#f1f5f9'}}>
        🌲 How XGBoost Learns
      </h3>
      <p style={{margin:'0 0 16px',fontSize:12,color:C.muted}}>
        XGBoost builds trees in sequence — each one corrects the mistakes of the last.
      </p>

      {/* step tabs */}
      <div style={{display:'flex',gap:6,marginBottom:10}}>
        {STEPS.map((s,i) => (
          <button key={i}
            onClick={() => { setActiveStep(i); if (i === 0) setNSplits(0); }}
            style={{flex:1,padding:'8px 4px',borderRadius:9,border:'none',cursor:'pointer',
                    background:activeStep===i ? C.accent : '#1e293b',
                    color:activeStep===i ? '#fff' : C.muted,
                    fontSize:11,fontWeight:activeStep===i ? 700 : 400,
                    transition:'all 0.2s',lineHeight:1.4}}>
            <div style={{fontSize:16}}>{s.icon}</div>
            {s.label}
          </button>
        ))}
      </div>

      {/* progress bar */}
      <div style={{display:'flex',gap:4,marginBottom:16}}>
        {STEPS.map((_,i) => (
          <div key={i} style={{flex:1,height:3,borderRadius:2,
            background:i<=activeStep ? C.accent : '#1e293b',
            transition:'background 0.3s'}}/>
        ))}
      </div>

      {stepContent[activeStep]}
    </div>
  );
}

/* ── DATA ── */
function genDemand(weeks=104){
  const d=[],base=50000,sp=[.85,.78,.80,.88,.95,1.0,1.08,1.35,1.1,.95,.9,1.25];
  let lv=base;
  for(let w=0;w<weeks;w++){
    const m=Math.floor((w%52)/4.33),s=sp[Math.min(m,11)];
    lv=lv*.98+base*.02+Math.sin(w*7.3)*800;
    const noise=Math.sin(w*13.7+2)*9000,spike=(w%17===0||w%23===0)?22000:0;
    d.push({week:w+1,month:m+1,sales:Math.max(10000,Math.round(lv*s+noise+spike)),year:w<52?1:2});
  }
  return d;
}
const DATA=genDemand(104),TRAIN=DATA.slice(0,78),TEST=DATA.slice(78);

/* ── MODELS ── */
function seasonalNaive(tr,te){
  return te.map((d,i)=>{const j=tr.length-52+(i%52);return{...d,forecast:j>=0?tr[j].sales:tr[tr.length-1].sales};});
}
function etsWithParams(tr,te,a=.3){
  let l=tr[0].sales;const ss=Array(52).fill(0);
  for(let i=0;i<Math.min(52,tr.length);i++)ss[i]=tr[i].sales;
  const avg=_.mean(ss.filter(v=>v>0));
  for(let i=0;i<52;i++)ss[i]=ss[i]>0?ss[i]/avg:1;
  for(let i=0;i<tr.length;i++){const si=i%52,nl=a*(tr[i].sales/(ss[si]||1))+(1-a)*l;ss[si]=.15*(tr[i].sales/(nl||1))+.85*ss[si];l=nl;}
  return te.map((d,i)=>({...d,forecast:Math.max(0,Math.round(l*(ss[((tr.length+i)%52)]||1)))}));
}
function hybridModel(tr,te){
  const etsBase=etsWithParams(tr,te),hStart=Math.floor(tr.length*.7);
  const tFold=tr.slice(0,hStart),vFold=tr.slice(hStart),etsValid=etsWithParams(tFold,vFold);
  const rMap={};
  vFold.forEach((d,i)=>{const k=`${d.month}_${d.week%4}`;if(!rMap[k])rMap[k]=[];rMap[k].push(d.sales-(etsValid[i]?.forecast||d.sales));});
  return te.map((d,i)=>{const k=`${d.month}_${d.week%4}`,c=rMap[k]?_.mean(rMap[k])*.65:0;return{...d,forecast:Math.max(0,Math.round((etsBase[i]?.forecast||d.sales)+c))};});
}
function hybridComponents(tr,te){
  const etsBase=etsWithParams(tr,te),hyb=hybridModel(tr,te);
  return te.map((d,i)=>({week:d.week,actual:d.sales,ets:etsBase[i]?.forecast||0,xgb:(hyb[i]?.forecast||0)-(etsBase[i]?.forecast||0),error:d.sales-(hyb[i]?.forecast||0)}));
}
function calcRMSE(a,f){if(!a.length)return 0;return Math.round(Math.sqrt(_.mean(a.map((d,i)=>Math.pow(d.sales-(f[i]?.forecast||0),2)))));}

const SN_PRED=seasonalNaive(TRAIN,TEST),ETS_PRED=etsWithParams(TRAIN,TEST),HYB_PRED=hybridModel(TRAIN,TEST);
const SN_RMSE=calcRMSE(TEST,SN_PRED),ETS_RMSE=calcRMSE(TEST,ETS_PRED),HYB_RMSE=calcRMSE(TEST,HYB_PRED);

/* ══════════════════════════════════════════════
   BASE UI COMPONENTS
══════════════════════════════════════════════ */
function MathBlock({children}){
  return(
    <div style={{background:"#040710",border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.purple}`,borderRadius:8,padding:"16px 20px",margin:"16px 0",overflowX:"auto"}}>
      <pre style={{fontFamily:"'Fira Code','Courier New',monospace",fontSize:12.5,color:"#c9b1ff",margin:0,lineHeight:2}}>{children}</pre>
    </div>
  );
}
function Quote({children,source}){
  return(
    <blockquote style={{borderLeft:`3px solid ${C.yellow}`,margin:"20px 0",padding:"12px 20px",background:"rgba(227,176,64,.07)",borderRadius:"0 8px 8px 0"}}>
      <p style={{color:C.text,fontStyle:"italic",margin:0,lineHeight:1.75,fontSize:14}}>{children}</p>
      {source&&<cite style={{color:C.textDim,fontSize:12,display:"block",marginTop:8}}>— {source}</cite>}
    </blockquote>
  );
}
function DR({children}){
  return(
    <div style={{background:`${C.accent}0D`,border:`1px solid ${C.accent}40`,borderRadius:8,padding:"14px 18px",margin:"16px 0",display:"flex",gap:12,alignItems:"flex-start"}}>
      <span style={{fontSize:18,flexShrink:0}}>🎯</span>
      <div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{children}</div>
    </div>
  );
}
function Callout({icon,color,title,children}){
  return(
    <div style={{background:`${color}10`,border:`1px solid ${color}40`,borderRadius:8,padding:"14px 18px",margin:"16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span>{icon}</span><strong style={{color,fontSize:13}}>{title}</strong>
      </div>
      <div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{children}</div>
    </div>
  );
}
function KeyTakeaways({items,accent}){
  const col=accent||C.green;
  return(
    <div style={{background:C.bgCard2,border:`1px solid ${col}35`,borderRadius:12,padding:"22px 26px",margin:"32px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>
        <span style={{fontSize:16}}>★</span>
        <h4 style={{color:col,margin:0,fontSize:12,letterSpacing:2,textTransform:"uppercase"}}>Key Takeaways</h4>
      </div>
      {items.map((item,i)=>(
        <div key={i} style={{display:"flex",gap:12,marginBottom:14,alignItems:"flex-start"}}>
          <span style={{color:col,fontWeight:"bold",flexShrink:0,fontSize:13}}>{i+1}.</span>
          <p style={{color:C.text,margin:0,lineHeight:1.72,fontSize:14}}>{item}</p>
        </div>
      ))}
    </div>
  );
}
function SectionHero({num,title,subtitle,accent}){
  const col=accent||C.accent;
  return(
    <div style={{background:`linear-gradient(140deg,${col}18 0%,${C.bgCard} 60%)`,border:`1px solid ${col}30`,borderRadius:16,padding:"38px 34px 30px",marginBottom:36,animation:"fadeUp .45s ease"}}>
      <div style={{color:col,fontSize:11,fontWeight:700,letterSpacing:4,textTransform:"uppercase",marginBottom:10}}>{num}</div>
      <h1 style={{color:C.text,fontSize:27,fontWeight:800,margin:"0 0 12px",lineHeight:1.18}}>{title}</h1>
      {subtitle&&<p style={{color:C.textDim,margin:0,lineHeight:1.68,fontSize:14,maxWidth:580}}>{subtitle}</p>}
    </div>
  );
}
function SubHeader({id,children,accent}){
  const col=accent||C.accent;
  return(
    <h3 id={id} style={{color:col,fontSize:15,fontWeight:700,margin:"32px 0 12px",paddingBottom:8,borderBottom:`1px solid ${C.borderLight}`,letterSpacing:.3}}>
      {children}
    </h3>
  );
}
function H4({children,accent}){return(<h4 style={{color:accent||C.orange,fontSize:14,margin:"18px 0 8px",fontWeight:600}}>{children}</h4>);}
function P({children,style}){return(<p style={{color:C.text,lineHeight:1.8,marginBottom:14,fontSize:14,...(style||{})}}>{children}</p>);}
function TableBlock({headers,rows,caption}){
  return(
    <div style={{margin:"20px 0"}}>
      <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5}}>
          <thead>
            <tr>{headers.map((h,i)=><th key={i} style={{background:C.bgCard2,color:C.accent,padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${C.border}`,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr key={i} style={{background:i%2===0?C.bgCard:C.bg}}>
                {row.map((cell,j)=><td key={j} style={{padding:"9px 14px",color:j===0?C.text:C.textDim,borderTop:`1px solid ${C.borderLight}`,lineHeight:1.5,verticalAlign:"top",fontSize:j===0?13:12}}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption&&<p style={{color:C.textMuted,fontSize:11.5,textAlign:"center",margin:"8px 0 0",fontStyle:"italic"}}>{caption}</p>}
    </div>
  );
}
function FigCap({num,children}){
  return(<p style={{color:C.textDim,fontSize:12,textAlign:"center",margin:"6px 0 24px",fontStyle:"italic"}}><strong style={{color:C.textMuted}}>Figure {num}. </strong>{children}</p>);
}
function AppLink({url,label,desc}){
  return(
    <div style={{background:C.bgCard2,border:`1px solid ${C.green}35`,borderRadius:8,padding:"14px 18px",margin:"14px 0",display:"flex",alignItems:"flex-start",gap:12}}>
      <span style={{fontSize:20,flexShrink:0}}>🚀</span>
      <div>
        <p style={{margin:"0 0 4px",color:C.text,fontSize:13,fontWeight:600}}>{label}</p>
        {desc&&<p style={{margin:"0 0 4px",color:C.textDim,fontSize:12}}>{desc}</p>}
        <a href={url} target="_blank" rel="noreferrer" style={{color:C.green,fontSize:12,wordBreak:"break-all"}}>{url}</a>
      </div>
    </div>
  );
}
function RMSEBadge({label,value,color}){
  return(
    <div style={{background:C.bgCard2,border:`1px solid ${color}40`,borderRadius:8,padding:"12px 16px",textAlign:"center",flex:1,minWidth:120}}>
      <div style={{color:C.textDim,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:3}}>{label}</div>
      <div style={{color,fontSize:20,fontWeight:800,fontFamily:"monospace"}}>{Number(value).toLocaleString()}</div>
      <div style={{color:C.textMuted,fontSize:10,marginTop:2}}>RMSE</div>
    </div>
  );
}
function Slider({label,min,max,step,value,onChange,accent}){
  const col=accent||C.accent;
  return(
    <div style={{margin:"10px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <span style={{color:C.textDim,fontSize:12}}>{label}</span>
        <strong style={{color:col,fontSize:13,fontFamily:"monospace"}}>{value}</strong>
      </div>
      <input type="range" min={min} max={max} step={step||1} value={value} onChange={e=>onChange(+e.target.value)} style={{width:"100%",accentColor:col,height:4}}/>
    </div>
  );
}

/* ── VizCard — position:relative so ResultPop can overlay ── */
function VizCard({children,minH,accent}){
  const col=accent||C.border;
  return(
    <div style={{position:"relative",background:C.bgCard,border:`1px solid ${col}30`,borderRadius:12,padding:"18px 20px",minHeight:minH||340,overflow:"hidden"}}>
      {/* Subtle dot-grid background (Seeing Theory aesthetic) */}
      <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(circle,${C.borderLight} 1px,transparent 1px)`,backgroundSize:"22px 22px",opacity:.35,pointerEvents:"none"}}/>
      <div style={{position:"relative"}}>{children}</div>
    </div>
  );
}

/* ── ResultPop — animated overlay badge that appears after simulation runs ── */
function ResultPop({show,value,label,sub,color}){
  if(!show)return null;
  const col=color||C.accent;
  return(
    <div style={{position:"absolute",top:14,right:14,background:`${col}`,borderRadius:12,padding:"12px 18px",animation:"pop .35s cubic-bezier(.34,1.56,.64,1)",zIndex:20,boxShadow:`0 6px 28px ${col}55`,minWidth:110,textAlign:"center",pointerEvents:"none"}}>
      <div style={{color:"rgba(0,0,0,.7)",fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:2}}>{label}</div>
      <div style={{color:"#000",fontSize:22,fontWeight:900,fontFamily:"monospace",lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{color:"rgba(0,0,0,.6)",fontSize:10,marginTop:3}}>{sub}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   SCROLLY SECTION — Seeing Theory split-panel
   KEY FIXES:
   1. viz called as Viz({accent}) not <Viz/> to preserve
      inner component state across step changes
   2. key only on the fade wrapper per active step
   3. steps stabilized with useMemo in each chapter
══════════════════════════════════════════════ */
function ScrollySection({steps,accent}){
  const [active,setActive]=useState(0);
  const col=accent||C.accent;
  const Viz=steps[active]?.viz;
  const prev=()=>setActive(a=>Math.max(0,a-1));
  const next=()=>setActive(a=>Math.min(steps.length-1,a+1));

  return(
    <div style={{display:"flex",gap:0,margin:"36px 0 8px",alignItems:"flex-start",borderRadius:14,overflow:"hidden",border:`1px solid ${C.border}`}}>

      {/* ─── LEFT: step text list ─── */}
      <div style={{flex:"0 0 36%",maxWidth:420,borderRight:`1px solid ${C.border}`,overflowY:"auto",maxHeight:520}}>
        {steps.map((step,i)=>(
          <div key={i} className="st-step" onClick={()=>setActive(i)}
            style={{padding:"20px 22px",cursor:"pointer",opacity:i===active?1:.42,
              background:i===active?C.bgActive:"transparent",
              borderLeft:`3px solid ${i===active?col:"transparent"}`,
              transition:"all .2s"}}>
            {step.label&&(
              <div style={{color:col,fontSize:10,fontWeight:700,letterSpacing:2.5,textTransform:"uppercase",marginBottom:7,opacity:i===active?1:.7}}>
                {String(i+1).padStart(2,"0")} — {step.label}
              </div>
            )}
            <div style={{color:i===active?C.text:C.textDim,fontSize:13.5,lineHeight:1.75}}>{step.text}</div>
            {i===active&&(
              <div style={{marginTop:14,display:"flex",gap:8}}>
                {active>0&&(
                  <button onClick={e=>{e.stopPropagation();prev();}}
                    style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${col}50`,background:"transparent",color:col,cursor:"pointer",fontSize:11}}>
                    ← Back
                  </button>
                )}
                {active<steps.length-1&&(
                  <button onClick={e=>{e.stopPropagation();next();}}
                    style={{padding:"5px 14px",borderRadius:6,border:"none",background:col,color:"#000",cursor:"pointer",fontSize:11,fontWeight:700}}>
                    Next →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── RIGHT: sticky viz panel ─── */}
      <div style={{flex:1,position:"sticky",top:56,alignSelf:"flex-start",display:"flex",flexDirection:"column",gap:0}}>
        {/* Chapter label + dot nav header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:`1px solid ${C.border}`,background:C.bgCard2}}>
          <div style={{display:"flex",gap:6}}>
            {steps.map((_,i)=>(
              <button key={i} onClick={()=>setActive(i)}
                title={steps[i]?.label||`Step ${i+1}`}
                style={{width:i===active?28:8,height:8,borderRadius:4,background:i===active?col:C.textMuted,border:"none",cursor:"pointer",transition:"all .25s",padding:0,opacity:i===active?1:.5}}>
              </button>
            ))}
          </div>
          <span style={{color:col,fontSize:11,fontWeight:600,background:`${col}18`,padding:"3px 10px",borderRadius:10}}>
            {steps[active]?.label||`Step ${active+1}`} · {active+1}/{steps.length}
          </span>
        </div>
        {/* Viz area — note: Viz called as function to preserve inner component state */}
        <div key={active} style={{padding:"18px 20px",minHeight:380,animation:"fadeIn .25s ease",position:"relative",background:C.bgCard}}>
          <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(circle,${C.borderLight} 1px,transparent 1px)`,backgroundSize:"22px 22px",opacity:.3,pointerEvents:"none"}}/>
          <div style={{position:"relative"}}>
            {Viz&&Viz({accent:col})}
          </div>
        </div>
      </div>
    </div>
  );
}
/* ── n2.jsx — SIMULATIONS WITH ResultPop + EXISTING WIDGETS ── */

/* ═══════════════════════
   SIM 1 — ETS EXPLORER
   ResultPop shows RMSE as α changes
═══════════════════════ */
function ETSExplorer({accent}){
  const col=accent||SC.s3;
  const [alpha,setAlpha]=useState(.3);
  const pred=useMemo(()=>etsWithParams(TRAIN,TEST,alpha),[alpha]);
  const rmse=useMemo(()=>calcRMSE(TEST,pred),[pred]);
  const chartData=TEST.map((d,i)=>({week:d.week,actual:d.sales,forecast:pred[i]?.forecast||0}));
  const interp=alpha<.2?"Long memory — slow to adapt":alpha<=.5?"Balanced smoothing":"Short memory — reacts fast";
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={Number(rmse).toLocaleString()} label="Current RMSE" sub={interp} color={col}/>
      <Slider label="Smoothing factor α" min={.05} max={.95} step={.05} value={alpha} onChange={setAlpha} accent={col}/>
      <div style={{display:"flex",gap:10,margin:"10px 0"}}>
        <div style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",flex:1}}>
          <div style={{color:C.textDim,fontSize:11,marginBottom:2}}>α = {alpha}</div>
          <div style={{color:col,fontSize:13,fontWeight:600}}>{interp}</div>
        </div>
        <div style={{background:C.bgCard2,border:`1px solid ${col}40`,borderRadius:8,padding:"10px 16px",flex:1,textAlign:"center"}}>
          <div style={{color:C.textDim,fontSize:11,marginBottom:2}}>vs. Naïve baseline</div>
          <div style={{color:rmse<SN_RMSE?C.green:C.red,fontSize:13,fontWeight:700}}>
            {rmse<SN_RMSE?"✓ Beats naïve":"✗ Worse than naïve"}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
          <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8}} formatter={v=>Number(v).toLocaleString()}/>
          <Legend wrapperStyle={{fontSize:11}}/>
          <Line type="monotone" dataKey="actual" stroke={C.textDim} strokeWidth={1.5} dot={false} name="Actual"/>
          <Line type="monotone" dataKey="forecast" stroke={col} strokeWidth={2.5} dot={false} name={`ETS α=${alpha}`}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════
   SIM 2 — LEAKAGE DEMO
   ResultPop shows RMSE + delta
═══════════════════════ */
function LeakageDemo({accent}){
  const col=accent||SC.s4;
  const [split,setSplit]=useState("temporal");
  const leakedData=useMemo(()=>{
    const shuffled=[...DATA].sort(()=>Math.sin(Math.random()*99)-.5);
    return{train:shuffled.slice(0,78),test:shuffled.slice(78)};
  },[]);
  const leakedPred=useMemo(()=>hybridModel(leakedData.train,leakedData.test),[leakedData]);
  const leakedRMSE=useMemo(()=>calcRMSE(leakedData.test,leakedPred),[leakedData,leakedPred]);
  const isTemp=split==="temporal";
  const shownRMSE=isTemp?HYB_RMSE:leakedRMSE;
  const delta=Math.round(Math.abs(HYB_RMSE-leakedRMSE));
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={Number(shownRMSE).toLocaleString()}
        label={isTemp?"Correct RMSE":"Leaked RMSE"}
        sub={isTemp?"Temporal split ✓":`${Number(delta).toLocaleString()} units off`}
        color={isTemp?col:C.red}/>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {["temporal","random"].map(s=>(
          <button key={s} onClick={()=>setSplit(s)}
            style={{flex:1,padding:"11px 0",borderRadius:8,border:`2px solid ${s===split?(s==="temporal"?col:C.red):C.border}`,
              background:s===split?(s==="temporal"?`${col}20`:`${C.red}20`):C.bgCard2,
              color:s===split?(s==="temporal"?col:C.red):C.textDim,cursor:"pointer",fontSize:12.5,fontWeight:s===split?700:400,transition:"all .2s"}}>
            {s==="temporal"?"✅  Temporal Split":"⚠️  Random (Leakage)"}
          </button>
        ))}
      </div>
      <div style={{background:C.bgCard2,border:`2px solid ${isTemp?col:C.red}40`,borderRadius:10,padding:"18px 22px",marginBottom:14}}>
        <div style={{color:isTemp?col:C.red,fontSize:12,marginBottom:10}}>
          {isTemp?"Training: weeks 1–78  •  Test: weeks 79–104":"Training & test randomly shuffled — future data in training set"}
        </div>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <div style={{fontSize:40,fontWeight:800,color:isTemp?col:C.red,fontFamily:"monospace"}}>{Number(shownRMSE).toLocaleString()}</div>
          <div>
            <div style={{color:C.text,fontSize:13,fontWeight:600}}>{isTemp?"Temporal split (correct)":"Random split (data leaked)"}</div>
            <div style={{color:C.textDim,fontSize:12}}>RMSE on held-out test set</div>
          </div>
        </div>
      </div>
      {!isTemp&&<Callout icon="⚠️" color={C.red} title="Data Leakage Detected">
        The model saw future demand during training. The leaked RMSE is artificially {leakedRMSE<HYB_RMSE?"lower":"comparable"} — this model would fail in production. Always use temporal splits.
      </Callout>}
      {isTemp&&<Callout icon="✅" color={col} title="Clean Temporal Split">
        Training strictly precedes test data. RMSE reflects true out-of-sample performance.
      </Callout>}
    </div>
  );
}

/* ═══════════════════════
   SIM 3 — DEMAND GENERATOR
   ResultPop shows winner model
═══════════════════════ */
function DemandGenerator({accent}){
  const col=accent||SC.s2;
  const [trend,setTrend]=useState(0);
  const [seas,setSeas]=useState(.3);
  const [noise,setNoise]=useState(.15);
  const [spikes,setSpikes]=useState(1);
  const synth=useMemo(()=>{
    const d=[],base=40000;
    for(let w=0;w<52;w++){
      const t=1+trend*w/51,s=1+seas*Math.sin(2*Math.PI*w/52-Math.PI/2);
      const n=1+(Math.random()-.5)*noise*2,sp=(spikes>0&&w%Math.round(52/spikes)===0)?1.45:1;
      d.push({week:w+1,sales:Math.max(5000,Math.round(base*t*s*n*sp))});
    }
    return d;
  },[trend,seas,noise,spikes]);
  const snTr=synth.slice(0,39),snTe=synth.slice(39);
  const snPred=useMemo(()=>seasonalNaive(snTr,snTe),[synth]);
  const etsPred=useMemo(()=>etsWithParams(snTr,snTe),[synth]);
  const snR=useMemo(()=>calcRMSE(snTe,snPred),[snPred]);
  const etsR=useMemo(()=>calcRMSE(snTe,etsPred),[etsPred]);
  const winner=snR<etsR?"Seasonal Naïve":"ETS";
  const chartData=synth.map((d,i)=>({week:d.week,actual:d.sales,...(i>=39?{sn:snPred[i-39]?.forecast,ets:etsPred[i-39]?.forecast}:{})}));
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={winner} label="Best Model" sub={`RMSE: ${Math.min(snR,etsR).toLocaleString()}`} color={col}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <Slider label="📈 Trend" min={-.02} max={.04} step={.01} value={trend} onChange={setTrend} accent={col}/>
        <Slider label="〰 Seasonality" min={0} max={.8} step={.1} value={seas} onChange={setSeas} accent={col}/>
        <Slider label="🔀 Noise" min={0} max={.5} step={.05} value={noise} onChange={setNoise} accent={col}/>
        <Slider label="⚡ Spikes/yr" min={0} max={6} step={1} value={spikes} onChange={setSpikes} accent={col}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <RMSEBadge label="Seasonal Naïve" value={snR} color={snR<etsR?col:C.textMuted}/>
        <RMSEBadge label="ETS" value={etsR} color={etsR<snR?col:C.textMuted}/>
      </div>
      <ResponsiveContainer width="100%" height={175}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
          <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
          <Legend wrapperStyle={{fontSize:10}}/>
          <ReferenceLine x={39} stroke={C.yellow} strokeDasharray="4 2"/>
          <Line type="monotone" dataKey="actual" stroke={C.textDim} strokeWidth={1.5} dot={false} name="Generated"/>
          <Line type="monotone" dataKey="sn" stroke={C.orange} strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="S-Naïve"/>
          <Line type="monotone" dataKey="ets" stroke={col} strokeWidth={2} dot={false} name="ETS"/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════
   SIM 4 — DECOMPOSITION LAB
   Toggle ETS / XGB / Error layers
═══════════════════════ */
function DecompositionLab({accent}){
  const col=accent||SC.s5;
  const [showETS,setShowETS]=useState(true);
  const [showXGB,setShowXGB]=useState(false);
  const [showErr,setShowErr]=useState(false);
  const comp=useMemo(()=>hybridComponents(TRAIN,TEST),[]);
  const dominated=showXGB?"XGB Residual":showErr?"Error":"ETS Baseline";
  const Tog=({label,active,onTog,color})=>(
    <button onClick={onTog}
      style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${active?color:C.border}`,
        background:active?`${color}22`:C.bgCard2,color:active?color:C.textDim,
        cursor:"pointer",fontSize:12,fontWeight:active?700:400,transition:"all .2s"}}>
      {label}
    </button>
  );
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={showETS||showXGB||showErr} value={dominated} label="Visible Layer" sub="Toggle layers below" color={col}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Tog label="📊 ETS Baseline" active={showETS} onTog={()=>setShowETS(s=>!s)} color={col}/>
        <Tog label="⚡ XGB Residual" active={showXGB} onTog={()=>setShowXGB(s=>!s)} color={C.purple}/>
        <Tog label="❌ Error" active={showErr} onTog={()=>setShowErr(s=>!s)} color={C.red}/>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={comp}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
          <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8}} formatter={v=>Number(v).toLocaleString()}/>
          <Legend wrapperStyle={{fontSize:11}}/>
          <Line type="monotone" dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} name="Actual"/>
          {showETS&&<Area type="monotone" dataKey="ets" fill={`${col}20`} stroke={col} strokeWidth={2} dot={false} name="ETS Baseline"/>}
          {showXGB&&<Bar dataKey="xgb" fill={C.purple} opacity={.65} name="XGB Residual"/>}
          {showErr&&<Line type="monotone" dataKey="error" stroke={C.red} strokeWidth={1} dot={false} strokeDasharray="3 2" name="Residual Error"/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════
   SIM 5 — PROFIT CALCULATOR
   ResultPop shows best-profit model
═══════════════════════ */
function ProfitCalculator({accent}){
  const col=accent||SC.s6;
  const [stockout,setStockout]=useState(80);
  const [overstock,setOverstock]=useState(20);
  const results=useMemo(()=>{
    function calcProfit(pred){
      return TEST.reduce((sum,d,i)=>{
        const err=(pred[i]?.forecast||0)-d.sales;
        return sum+(err>0?-err*overstock:err*stockout);
      },0);
    }
    return[
      {label:"Seasonal Naïve",rmse:SN_RMSE,profit:calcProfit(SN_PRED),color:C.textDim},
      {label:"ETS",rmse:ETS_RMSE,profit:calcProfit(ETS_PRED),color:SC.s3},
      {label:"Hybrid ETS+XGB",rmse:HYB_RMSE,profit:calcProfit(HYB_PRED),color:col},
    ];
  },[stockout,overstock]);
  const best=results.reduce((a,b)=>a.profit>b.profit?a:b);
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={best.label.replace("Hybrid ETS+XGB","Hybrid").replace("Seasonal Naïve","S-Naïve")}
        label="Profit Winner" sub={`${best.profit>=0?"+":""}${(best.profit/1000).toFixed(1)}k`}
        color={best.color==="C.textDim"?col:best.color}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <Slider label={`💸 Stockout $/unit`} min={10} max={200} step={10} value={stockout} onChange={setStockout} accent={C.red}/>
        <Slider label={`📦 Overstock $/unit`} min={10} max={200} step={10} value={overstock} onChange={setOverstock} accent={C.orange}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {results.map(r=>(
          <div key={r.label} style={{flex:1,minWidth:110,background:C.bgCard2,
            border:`2px solid ${r.profit===best.profit?r.color:C.border}`,
            borderRadius:8,padding:"12px 14px",textAlign:"center",transition:"all .3s"}}>
            <div style={{color:C.textDim,fontSize:10,marginBottom:3}}>{r.label}</div>
            <div style={{color:r.color,fontSize:17,fontWeight:800,fontFamily:"monospace"}}>
              {r.profit>=0?"+":""}{(r.profit/1000).toFixed(1)}k
            </div>
            <div style={{color:C.textMuted,fontSize:10,marginTop:2}}>RMSE {r.rmse.toLocaleString()}</div>
            {r.profit===best.profit&&<div style={{color:r.color,fontSize:10,marginTop:4,fontWeight:700}}>★ BEST</div>}
          </div>
        ))}
      </div>
      <Callout icon="💡" color={col} title="The RMSE Paradox">
        Try stockout $200 / overstock $10 — the RMSE winner may not be the profit winner. Business costs should drive model selection, not accuracy metrics alone.
      </Callout>
    </div>
  );
}

/* ─────────────────────────────────────────────
   EXISTING INTERACTIVE WIDGETS
───────────────────────────────────────────── */
function XGBoostTutorial({accent}){
  const col=accent||SC.s5;
  const [tab,setTab]=useState(0);
  const tabs=["Residuals","Tree Building","Boosting Rounds","Final Ensemble"];
  const boostData=useMemo(()=>{
    const base=TEST.slice(0,20),rounds=[],lr=.3;
    let preds=base.map(()=>TRAIN[TRAIN.length-1].sales);
    for(let r=0;r<4;r++){
      const res=base.map((d,i)=>d.sales-preds[i]);
      const treePred=res.map(v=>v*lr);
      preds=preds.map((p,i)=>p+treePred[i]);
      rounds.push(base.map((d,i)=>({week:d.week,actual:d.sales,pred:Math.round(preds[i]),residual:Math.round(res[i])})));
    }
    return rounds;
  },[]);
  const descs=[
    "XGBoost starts with an initial prediction (last observed value). Residuals = Actual − Predicted. These errors are what the first tree must learn to correct.",
    "A shallow regression tree (max depth 3-6) is fit to predict residuals. The tree learns which features (week, month, lag) explain the errors.",
    "Each new tree corrects residuals left by the previous ensemble. Learning rate (η=0.3) scales each correction. Ensemble = Σ (lr × tree_k).",
    "Final predictions sum all tree outputs. XGBoost adds L1/L2 regularization to control overfitting by penalizing leaf weight magnitude.",
  ];
  const curr=boostData[tab];
  const roundRMSE=Math.round(Math.sqrt(_.mean(curr.map(d=>Math.pow(d.actual-d.pred,2)))));
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={Number(roundRMSE).toLocaleString()} label={`Round ${tab+1} RMSE`} sub="of 20 test weeks" color={col}/>
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {tabs.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)}
            style={{padding:"6px 13px",borderRadius:20,border:`1.5px solid ${i===tab?col:C.border}`,
              background:i===tab?`${col}20`:C.bgCard2,color:i===tab?col:C.textDim,
              cursor:"pointer",fontSize:11.5,fontWeight:i===tab?700:400}}>
            {i+1}. {t}
          </button>
        ))}
      </div>
      <P><strong style={{color:col}}>Step {tab+1}:</strong> {descs[tab]}</P>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={curr}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
          <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
          <Legend wrapperStyle={{fontSize:11}}/>
          <Line type="monotone" dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} name="Actual"/>
          <Line type="monotone" dataKey="pred" stroke={col} strokeWidth={2} dot={false} name={`Prediction Rnd ${tab+1}`}/>
          {tab===1&&<Bar dataKey="residual" fill={C.purple} opacity={.55} name="Residuals"/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function EvaluationLab({accent}){
  const col=accent||SC.s6;
  const [metric,setMetric]=useState("RMSE");
  const [splitWk,setSplitWk]=useState(78);
  const metrics=["RMSE","MAE","MAPE","Bias"];
  const tr=useMemo(()=>DATA.slice(0,splitWk),[splitWk]);
  const te=useMemo(()=>DATA.slice(splitWk),[splitWk]);
  const sp=useMemo(()=>seasonalNaive(tr,te),[tr,te]);
  const ep=useMemo(()=>etsWithParams(tr,te),[tr,te]);
  const hp=useMemo(()=>hybridModel(tr,te),[tr,te]);
  const calc=useCallback((pred,actual)=>{
    if(!actual.length)return"—";
    const pairs=actual.map((d,i)=>({a:d.sales,f:pred[i]?.forecast||0}));
    switch(metric){
      case"MAE":return Math.round(_.mean(pairs.map(p=>Math.abs(p.a-p.f)))).toLocaleString();
      case"MAPE":return(_.mean(pairs.map(p=>Math.abs(p.a-p.f)/p.a))*100).toFixed(1)+"%";
      case"Bias":return Math.round(_.mean(pairs.map(p=>p.f-p.a))).toLocaleString();
      default:return Math.round(Math.sqrt(_.mean(pairs.map(p=>Math.pow(p.a-p.f,2))))).toLocaleString();
    }
  },[metric]);
  const chartData=useMemo(()=>DATA.map((d,i)=>({week:d.week,actual:d.sales,...(i>=splitWk?{sn:sp[i-splitWk]?.forecast,ets:ep[i-splitWk]?.forecast,hybrid:hp[i-splitWk]?.forecast}:{})})),[sp,ep,hp,splitWk]);
  const hybridVal=calc(hp,te);
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={hybridVal} label={`Hybrid ${metric}`} sub={`Split @ wk ${splitWk}`} color={col}/>
      <Slider label={`Train/Test split (week ${splitWk})`} min={40} max={90} step={1} value={splitWk} onChange={setSplitWk} accent={col}/>
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        {metrics.map(m=>(
          <button key={m} onClick={()=>setMetric(m)}
            style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${m===metric?col:C.border}`,
              background:m===metric?`${col}20`:C.bgCard2,color:m===metric?col:C.textDim,cursor:"pointer",fontSize:11}}>
            {m}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {[{l:"S-Naïve",v:calc(sp,te),c:C.textDim},{l:"ETS",v:calc(ep,te),c:SC.s3},{l:"Hybrid",v:hybridVal,c:col}].map(r=>(
          <div key={r.l} style={{flex:1,background:C.bgCard2,border:`1px solid ${r.c}40`,borderRadius:8,padding:"9px 12px",textAlign:"center"}}>
            <div style={{color:C.textDim,fontSize:10,marginBottom:2}}>{r.l}</div>
            <div style={{color:r.c,fontSize:15,fontWeight:700,fontFamily:"monospace"}}>{r.v}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
          <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}}/>
          <Legend wrapperStyle={{fontSize:10}}/>
          <ReferenceLine x={splitWk} stroke={C.yellow} strokeDasharray="4 2"/>
          <Line dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} name="Actual"/>
          <Line dataKey="sn" stroke={C.textDim} strokeWidth={1} dot={false} strokeDasharray="3 2" name="S-Naïve"/>
          <Line dataKey="ets" stroke={SC.s3} strokeWidth={1.5} dot={false} name="ETS"/>
          <Line dataKey="hybrid" stroke={col} strokeWidth={2} dot={false} name="Hybrid"/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActionLab({accent}){
  const col=accent||SC.s7;
  const [z,setZ]=useState(1.65);
  const [override,setOverride]=useState(0);
  const sigma=useMemo(()=>Math.round(Math.sqrt(_.mean(TEST.map((d,i)=>Math.pow(d.sales-(HYB_PRED[i]?.forecast||0),2))))),[]);
  const lt=4;
  const ss=Math.round(z*sigma*Math.sqrt(lt));
  const adjForecasts=useMemo(()=>TEST.slice(0,12).map((d,i)=>({week:d.week,actual:d.sales,model:HYB_PRED[i]?.forecast||0,adjusted:Math.round((HYB_PRED[i]?.forecast||0)*(1+override/100))})),[override]);
  const modelRMSE=Math.round(Math.sqrt(_.mean(adjForecasts.map(d=>Math.pow(d.actual-d.model,2)))));
  const adjRMSE=Math.round(Math.sqrt(_.mean(adjForecasts.map(d=>Math.pow(d.actual-d.adjusted,2)))));
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={Number(ss).toLocaleString()+" u"} label="Safety Stock" sub={`z=${z}, LT=${lt}wk`} color={col}/>
      <SubHeader accent={col}>Safety Stock</SubHeader>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Slider label={`Service level z = ${z}`} min={1.0} max={2.5} step={.05} value={z} onChange={setZ} accent={col}/>
        <div style={{background:C.bgCard2,border:`1px solid ${col}40`,borderRadius:8,padding:"12px 16px"}}>
          <div style={{color:C.textDim,fontSize:11,marginBottom:3}}>Safety Stock formula</div>
          <div style={{color:col,fontSize:12,fontFamily:"monospace"}}>{z} × {sigma.toLocaleString()} × √{lt}</div>
          <div style={{color:col,fontSize:22,fontWeight:800,marginTop:4}}>{ss.toLocaleString()} units</div>
        </div>
      </div>
      <SubHeader accent={col}>Override Lab</SubHeader>
      <Slider label={`Analyst override: ${override>0?"+":""}${override}%`} min={-30} max={30} step={5} value={override} onChange={setOverride} accent={col}/>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <RMSEBadge label="Model RMSE" value={modelRMSE} color={SC.s3}/>
        <RMSEBadge label="Adjusted RMSE" value={adjRMSE} color={adjRMSE<modelRMSE?col:C.red}/>
      </div>
      {Math.abs(override)>0&&(
        <Callout icon={adjRMSE<modelRMSE?"✅":"⚠️"} color={adjRMSE<modelRMSE?col:C.red}
          title={adjRMSE<modelRMSE?"Override Improved Accuracy":"Override Hurt Accuracy"}>
          {adjRMSE<modelRMSE?"Your override reduced RMSE — this encodes domain knowledge the model missed.":"Your override increased RMSE — consider whether you have real evidence for this adjustment."}
        </Callout>
      )}
    </div>
  );
}

/**
 * ChatBot
 * - Existing tabs: chat / glossary / practice (unchanged behavior)
 * - Adds NEW tab: ai
 * - Adds Anthropic call via fetch (browser) using VITE_ANTHROPIC_API_KEY
 *
 * NOTE: In production, calling Anthropic directly from the browser is not recommended.
 * Use a server proxy to protect your key. This is a “demo” setup only.
 */
function ChatBot({ accent }) {
  const col = accent || SC.ai;

  const [tab, setTab] = useState("chat");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([
    {
      role: "bot",
      text:
        "Hi! Ask me anything about demand forecasting. Or switch to the Glossary tab to look up key terms, or Practice to test yourself by chapter.",
    },
  ]);
  const [openTerm, setOpenTerm] = useState(null);
  const [openCh, setOpenCh] = useState(null);

  // ✅ 1) NEW AI state
  const [aiMsgs, setAiMsgs] = useState([
    {
      role: "bot",
      text:
        "Ask me anything — I can explain concepts, work through the math, or generate practice questions on any topic.",
    },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  /* ── KNOWLEDGE BASE (chat) ── */
  const KB = [
    {
      k: ["rmse", "root mean"],
      r:
        "RMSE (Root Mean Squared Error) = √mean(errors²). It penalizes large errors more than small ones because errors are squared. Units are the same as demand. Always compare your model's RMSE against seasonal naïve as a sanity check.",
    },
    {
      k: ["mae", "mean absolute"],
      r:
        "MAE (Mean Absolute Error) = mean of |actual − forecast|. Easier to interpret than RMSE and treats all errors equally regardless of size. Use MAE when large errors aren't disproportionately costly.",
    },
    {
      k: ["mape", "percentage"],
      r:
        "MAPE (Mean Absolute Percentage Error) = mean(|error/actual|) × 100%. It's intuitive because it gives you a percentage. Downside: it breaks when actual demand is zero or near-zero, and it's asymmetric.",
    },
    {
      k: ["bias"],
      r:
        "Bias = mean(forecast − actual). Positive bias means you're consistently over-forecasting. Negative bias means you're under-forecasting. A model can have low RMSE but still have bad bias — always check both.",
    },
    {
      k: ["ets", "exponential smoothing"],
      r:
        "ETS stands for Error, Trend, Seasonality. It's a state-space model that updates its estimate of the level, trend, and seasonal pattern at each time step. The α parameter controls how much weight goes to recent observations versus older history.",
    },
    {
      k: ["alpha", "smoothing"],
      r:
        "Alpha (α) in ETS controls the smoothing speed. High α (above 0.6) means the model reacts quickly to recent demand but produces volatile forecasts. Low α (below 0.2) gives slow, stable forecasts that take longer to adapt to real shifts in demand.",
    },
    {
      k: ["xgboost", "gradient boost", "tree", "boosting"],
      r:
        "XGBoost builds regression trees one at a time, where each tree tries to correct the prediction errors of the previous trees. It needs a feature matrix (lag values, calendar features, promotions) to work well on demand data.",
    },
    {
      k: ["hybrid", "combine", "ensemble"],
      r:
        "The hybrid ETS+XGBoost model works in two steps: first ETS fits the seasonal baseline, then XGBoost is trained on the residuals (the errors ETS makes). The final forecast adds them together. This way you get the interpretability of ETS plus the pattern-catching of ML.",
    },
    {
      k: ["safety stock", "service level", "stockout", "reorder"],
      r:
        "Safety stock = z × σ_demand × √(lead time). The z-score comes from your target service level: 1.28 for 90%, 1.65 for 95%, 2.05 for 98%. Higher service levels require more inventory. Safety stock absorbs the uncertainty that the forecast can't predict.",
    },
    {
      k: ["leakage", "data leak", "future", "random split"],
      r:
        "Data leakage happens when future information leaks into model training. In time series, this usually means using a random train/test split instead of a temporal one. The model learns from future data and looks artificially accurate. Always split so training data comes strictly before test data in time.",
    },
    {
      k: ["seasonal naive", "naive", "benchmark", "baseline"],
      r:
        "Seasonal naïve simply predicts that next week's demand will equal the same week from last year. It sounds trivial but is surprisingly hard to beat consistently. If your ML model can't outperform seasonal naïve, you need to revisit your features or model setup.",
    },
    {
      k: ["overfit", "overfitting"],
      r:
        "Overfitting means the model learned the noise in training data, not the real pattern. Signs: training RMSE is much lower than test RMSE. Fixes: reduce max tree depth, increase regularization, use more training data, or apply early stopping.",
    },
    {
      k: ["newsvendor", "critical ratio", "underage", "overage"],
      r:
        "The Newsvendor model gives the optimal order quantity as the demand quantile equal to Cu/(Cu+Co), where Cu is the stockout cost per unit and Co is the overstock cost per unit. If stockouts cost $80 and overstock costs $20, you stock to the 80th percentile of demand.",
    },
    {
      k: ["lag", "feature", "autocorrelation"],
      r:
        "Lag features are past demand values used as predictors. Lag-1 is last week's sales; lag-52 is the same week last year. They're the most important features for demand ML models because demand is autocorrelated — knowing last week's sales tells you something about this week's.",
    },
    {
      k: ["backtesting", "cross validation", "expanding window"],
      r:
        "Backtesting for time series uses an expanding window: fix a start date, train on everything up to a cutoff, forecast the next h periods, then move the cutoff forward and repeat. Report the average RMSE across all windows — this gives a more reliable estimate than a single train/test split.",
    },
  ];

  const respond = (q) => {
    const ql = q.toLowerCase();
    /* Natural language: practice/question for chapter N */
    const chNum = ql.match(/chapter\s*(\d)/);
    const wantsPractice = /(question|practice|quiz|problem|test\s*me|sample)/i.test(ql);
    const wantsGlossary =
      /(glossary|define|definition|what\s+is|what\s+does|what\s+are|explain\s+the\s+term|look\s+up)/i.test(
        ql
      );

    if (chNum && wantsPractice) {
      const n = chNum[1];
      const chKey = Object.keys(PRACTICE).find((k) => k.includes(`Ch ${n}`));
      setTimeout(() => {
        setTab("practice");
        if (chKey) setOpenCh(chKey);
      }, 200);
      return `Opening the Practice tab for Chapter ${n}! Click any question below to reveal the model answer.`;
    }

    if (wantsGlossary) {
      const termHit = GLOSSARY.findIndex(
        (g) =>
          ql.includes(g.term.toLowerCase()) ||
          g.short
            .toLowerCase()
            .split(" ")
            .some((w) => w.length > 3 && ql.includes(w))
      );
      setTimeout(() => {
        setTab("glossary");
        if (termHit >= 0) setOpenTerm(termHit);
      }, 200);
      return termHit >= 0
        ? `Switching to Glossary — highlighting the entry for "${GLOSSARY[termHit].term}". Click to expand the full definition.`
        : "Switching to the Glossary tab. Click any term to see its full definition.";
    }

    if (wantsPractice && !chNum) {
      setTimeout(() => setTab("practice"), 200);
      return "Switching to the Practice tab! Pick a chapter and click questions to reveal model answers.";
    }

    const m = KB.find((k) => k.k.some((kw) => ql.includes(kw)));
    return m
      ? m.r
      : 'Good question! Try asking about RMSE, ETS, XGBoost, safety stock, data leakage, or seasonal naïve. You can also say things like "give me a practice question for Chapter 3" or "define data leakage".';
  };

  function send() {
    if (!input.trim()) return;
    const q = input.trim();
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "bot", text: respond(q) }]);
    setInput("");
  }

    const askAI = async (userMsg) => {
    setAiLoading(true);
    try {
        const ql = (userMsg || "").toLowerCase();

        const META_KEYWORDS = [
        "summarize","summary","overview","what is this","what does this cover",
        "what topics","table of contents","chapters","about this","this textbook","this website",
        "what can you","what do you cover","explain this",
        "simulation","simulations","graph","graphs","chart","charts","interactive","explainer","explorers",
        "appendix","dataset","how is this built","design","theme","dark","audience","who is this for",
        "how do i use","user guide","visual"
        ];

        const isMeta = META_KEYWORDS.some(k => ql.includes(k));

        /* ── keyword retrieval from KB / GLOSSARY / PRACTICE ── */
        const kbHits = KB
        .filter((k) => k.k.some((kw) => ql.includes(kw)))
        .map((k) => k.r)
        .join("\n");

        const glossHits = GLOSSARY
        .filter(
            (g) =>
            ql.includes(g.term.toLowerCase()) ||
            g.short.toLowerCase().split(" ").some((w) => w.length > 3 && ql.includes(w))
        )
        .map((g) => `${g.term}: ${g.def}`)
        .join("\n");

        const chMatch = ql.match(/chapter\s*(\d)/);
        const practiceHits = chMatch
        ? (
            Object.entries(PRACTICE).find(([k]) => k.includes(`Ch ${chMatch[1]}`))?.[1] ?? []
            )
            .map((p) => `Q: ${p.q}\nA: ${p.a}`)
            .join("\n\n")
        : "";

        /* ── choose context: meta gets full textbook overview, otherwise KB chunks ── */
        const context = isMeta
        ? TEXTBOOK_META
        : [
            kbHits       && `## Relevant concepts\n${kbHits}`,
            glossHits    && `## Glossary entries\n${glossHits}`,
            practiceHits && `## Practice problems\n${practiceHits}`,
            ]
            .filter(Boolean)
            .join("\n\n");

        const system = `You are a teaching assistant for a supply chain demand forecasting textbook.
    Answer questions based on the textbook content provided below.
    If the answer is in the textbook content, use it directly.
    If not, answer from general knowledge but note it's not covered in this textbook.
    Keep answers concise and student-friendly. Use numbers in examples where helpful.

    ${context
    ? `TEXTBOOK CONTENT RETRIEVED FOR THIS QUESTION:\n${context}`
    : "No specific textbook section matched — answer from general knowledge."}`;

        const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            system,
            messages: [{ role: "user", content: userMsg }],
        }),
        });

        const data = await res.json();
        return data?.content?.[0]?.text ?? "No response received.";
    } catch (e) {
        return "Couldn't reach AI: " + (e?.message || String(e));
    } finally {
        setAiLoading(false);
    }
    };


  const sendAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const q = aiInput.trim();
    setAiInput("");
    setAiMsgs((m) => [...m, { role: "user", text: q }]);
    const reply = await askAI(q);
    setAiMsgs((m) => [...m, { role: "bot", text: reply }]);
  };

const TEXTBOOK_META = `
TEXTBOOK: "From Forecasts to Decisions — A Practical Guide to Demand Forecasting for Early-Career Analysts"
COURSE: CP194 Capstone · Minerva University
FORMAT: Interactive web textbook (React/JSX, dark-themed, Seeing Theory-inspired scrolly layout)
STRUCTURE: 8 chapters + 2 appendices + References + AI Tutor chapter + Home page
INTERACTIVE FEATURES: 5 simulators, 8 scrolly step-by-step walkthroughs, AI chatbot with 4 modes, glossary, practice problems

═══════════════════════════════════════
AUDIENCE GUIDANCE (from the Home page)
═══════════════════════════════════════
- Business Analyst / Manager: Read Chapters 1, 6, 7 first. Focus on text and Key Takeaways. Skip MathBlocks. Use Glossary tab for unfamiliar terms.
- Data Analyst (new to forecasting): Work Chapters 1–5 in order, interact with every simulation. Then read 6–8 for production context.
- ML Engineer / Data Scientist: Skim Chapters 1–3, deep-dive Chapters 4–5 and Appendix A (code) + Appendix B (math). Focus on hybrid architecture and backtesting.
- Academic Reviewer / Instructor: Start with Chapter 1 framing, then References and Appendix B for methodological rigour.

══════════════
CHAPTER GUIDE
══════════════

CHAPTER 1 — Why Forecasting Matters (accent: purple #7C6FF7)
Purpose: Reframe forecasting as decision support, not prediction.
Key concepts: The Oracle Fallacy (demanding certainty from a probabilistic tool), decision framing, cost asymmetry (stockouts cost 3–8× more than overstock), forecasting hierarchy (accuracy degrades at finer granularity and longer horizons).
Scrolly steps: Oracle Fallacy + error bar chart → Decision framing table (inventory/promotions/capacity/supplier) → Cost Asymmetry (links to ProfitCalculator) → Forecasting Hierarchy table (aggregate to daily MAPE).
Sections: 1.1 What Makes a Good Forecast (calibrated, decision-relevant, timely, explainable) · 1.2 Three Forecasting Paradigms (statistical vs. ML vs. judgmental) with trade-off table.
Key quote: "All models are wrong, but some are useful." — George Box (1976)
Key takeaways: Forecasts are decision tools not oracles · cost asymmetry drives model selection · aggregate beats disaggregate accuracy · hybrid models outperform pure approaches.

CHAPTER 2 — Demand Data Literacy (accent: violet #A78BFA)
Purpose: Teach how to read, decompose, and engineer features from demand data.
Key concepts: Time series decomposition (Level, Trend, Seasonality, Noise) · feature engineering for ML · data quality issues (stockout-induced zeros, outliers, stale data) · lag features and autocorrelation.
Scrolly steps: Time Series Anatomy (4-panel decomposition chart: raw/level/seasonal/noise) → Feature Engineering table (lag features, rolling stats, calendar, promotions, interactions) → Data Quality issues → Demand Generator simulation.
Sections: 2.1 The Four Components of Demand · 2.2 Why Lag Features Dominate (lag-1 = last week, lag-52 = same week last year) · 2.3 Handling Zeros (stockout zeros ≠ real zero demand — impute with seasonal mean) · 2.4 Rolling Statistics.
Feature matrix includes: sales_lag_1, sales_lag_52, rolling_mean_4wk, rolling_std_8wk, month, week_of_year, is_holiday, promo_flag, discount_pct, month×promo_flag interaction.

CHAPTER 3 — Baseline Models (accent: teal #2CC4A0)
Purpose: Build intuition for statistical models and when simple beats complex.
Key concepts: ETS (Error, Trend, Seasonality) state-space model · alpha (α) smoothing parameter · seasonal naïve as benchmark · when naïve wins (short history, stable series, intermittent demand).
Scrolly steps: Seasonal Naïve explanation → ETS mechanics → Alpha trade-off (high α = reactive, low α = stable) → ETS Explorer simulation.
Sections: 3.1 Seasonal Naïve (predicts same week last year) · 3.2 ETS Architecture (α updates level, β updates trend, γ updates seasonal) · 3.3 Reading the ETS Explorer.
The ETS Explorer simulation: slider for α (0.05 to 0.95), live RMSE badge, chart comparing actual vs. ETS forecast, "Beats naïve" indicator. RMSE is computed on 26 held-out test weeks.

CHAPTER 4 — Advanced ML Models (accent: sky #3ABFF8)
Purpose: Introduce XGBoost for demand forecasting and the hybrid ETS+XGBoost architecture.
Key concepts: XGBoost (gradient boosting, sequential tree building, residual learning, learning rate η=0.3) · hybrid ETS+XGBoost (ETS fits seasonal baseline, XGBoost trains on residuals, final = ETS + XGBoost correction) · overfitting (train RMSE << test RMSE → reduce depth, increase regularization) · decomposition layers.
Scrolly steps: Why XGBoost → Residuals concept → Boosting round mechanics → Hybrid stacking → Decomposition Lab.
Simulations in this chapter:
  - XGBoostExplainer: 4-step visual walkthrough (Decision Tree scatter with draggable split threshold + live RMSE · Residual bar chart · Boost Round 1 correction lines · Ensemble prediction line). Points animate color on split. RMSE always decreasing across steps.
  - XGBoostTutorial: 4-tab walkthrough (Residuals · Tree Building · Boosting Rounds · Final Ensemble) with live RMSE badge per round.
  - DecompositionLab: toggleable layers (ETS Baseline area chart · XGB Residual bars · Error line) on actual demand.
  - DemandGenerator: synthetic demand with 4 sliders (trend, seasonality, noise, spikes/yr) comparing Seasonal Naïve vs ETS live.

CHAPTER 5 — Model Evaluation (accent: orange #F5A623)
Purpose: Teach correct evaluation methodology — metrics, temporal splits, backtesting, data leakage.
Key concepts: RMSE, MAE, MAPE, Bias — differences and when to use each · temporal train/test split (weeks 1–78 train, 79–104 test) · data leakage from random splits · expanding window backtesting · Diebold-Mariano test for significance.
Scrolly steps: Metric comparison → Temporal split rationale → Leakage Demo simulation → Backtesting methodology.
Simulations in this chapter:
  - LeakageDemo: toggle between Temporal Split (correct) and Random Split (leakage). Shows RMSE difference — the leaked RMSE is artificially lower. Red warning callout on leakage.
  - EvaluationLab: slider for train/test split week (40–90), metric selector (RMSE/MAE/MAPE/Bias), live comparison of S-Naïve / ETS / Hybrid across all metrics, chart showing all three forecasts on test period.
Key data: Dataset is 104 weeks of synthetic retail demand. Train: weeks 1–78, Test: weeks 79–104.
Model RMSE on test set: Seasonal Naïve (SN_RMSE), ETS (ETS_RMSE), Hybrid ETS+XGB (HYB_RMSE — lowest).

CHAPTER 6 — Communicating Forecasts (accent: red/salmon #F26B6B)
Purpose: Translate model output into stakeholder-facing communication.
Key concepts: Uncertainty quantification (prediction intervals, not just point forecasts) · scenario planning (optimistic/base/pessimistic) · translating RMSE into business language · post-mortems · distinguishing model failure vs. data failure vs. external shock.
Scrolly steps: Point forecasts vs. intervals → Scenario framing → Stakeholder language → Post-mortem structure.
Sections: 6.1 Why Point Forecasts Mislead · 6.2 Scenario Planning Framework · 6.3 The Post-Mortem Protocol · 6.4 Analyst Override Lab.
Simulation — ActionLab: Safety stock calculator (z slider 1.0–2.5, formula z × σ × √LT displayed live) + Override Lab (analyst adjustment ±30%, RMSE of model vs. adjusted shown, callout if override helps or hurts accuracy).

CHAPTER 7 — Inventory Decisions (accent: cyan #1DD2AF)
Purpose: Connect forecast output to inventory optimization decisions.
Key concepts: Safety stock formula (z × σ_demand × √lead_time) · service level z-scores (1.28=90%, 1.65=95%, 2.05=98%) · EOQ (Economic Order Quantity = √(2DS/H)) · Newsvendor model (critical ratio = Cu/(Cu+Co)) · lead time square-root relationship.
Scrolly steps: Safety stock mechanics → Lead time effects → Newsvendor model → Profit-optimal ordering.
Simulations in this chapter:
  - SafetyStockExplorer: sliders for service level z (1.0–2.5) and lead time (1–12 weeks), live safety stock calculation displayed.
  - EOQExplorer: sliders for annual demand D, ordering cost S, and holding cost H per unit. Live EOQ calculation + total cost breakdown.
  - ProfitCalculator (also in Ch 1): sliders for stockout cost and overstock cost per unit, compares profit of Seasonal Naïve / ETS / Hybrid — shows that RMSE winner ≠ profit winner when costs are asymmetric.

CHAPTER 8 — Forecast Process Design (accent: green #52C77F)
Purpose: Production forecasting systems, governance, and analyst credibility.
Key concepts: Five-layer forecasting stack (data ingestion → feature engineering → model training → evaluation & monitoring → decision integration) · model governance (weekly RMSE monitoring, +20% drift alert, quarterly retrain) · forecast cadence matching decision frequency · champion-challenger testing · building credibility with prediction intervals and blame-free post-mortems.
Scrolly steps: The Forecasting Stack diagram → Model Governance checklist → Forecast Cadence table → Building Credibility (Tetlock quote).
Sections: 8.1 Minimal Production Pipeline (Python pseudocode for full weekly pipeline) · 8.2 Common Pitfalls Reference table (data leakage / overfit XGBoost / missing seasonality / single split / no bias monitoring / stale model — each with symptom and fix).
Key quote: "The value of keeping score is not to embarrass forecasters but to identify those whose methods are worth emulating." — Tetlock & Gardner, Superforecasting (2015)

══════════════════════════════
APPENDICES & ADDITIONAL PAGES
══════════════════════════════

APPENDIX A — Code Reference
Python implementation snippets for: ETS (statsmodels), XGBoost (xgboost library), lag feature engineering, temporal train/test split, RMSE/MAE/MAPE/Bias calculation, expanding window backtesting loop, safety stock formula.

APPENDIX B — Mathematical Foundations
Formal math for: ETS state-space equations (α, β, γ parameters), XGBoost objective function (L2 regularization, gradient/Hessian), RMSE/MAE/MAPE/Bias formulas, safety stock derivation (normality assumption, z-score), Newsvendor critical ratio derivation, Diebold-Mariano test statistic.

REFERENCES PAGE
Key citations including: Box-Jenkins (1976), Hyndman & Athanasopoulos "Forecasting: Principles and Practice", Chen & Guestrin XGBoost paper (2016), Tetlock & Gardner "Superforecasting" (2015), Silver "The Signal and the Noise", Makridakis M-competitions papers.

AI TUTOR CHAPTER (ChAI)
Documents the design of the textbook's AI assistant: 3 fixed-input tabs (Quick Ask, Glossary, Practice Problems) + 1 live AI tab (Anthropic Claude Haiku via RAG). Explains the RAG architecture: keyword retrieval from KB/GLOSSARY/PRACTICE → context injection into system prompt → Claude answers grounded in textbook content.

══════════════════════════════
ALL INTERACTIVE SIMULATIONS
══════════════════════════════
1. ETS Explorer (Ch 3): α slider → live RMSE + forecast chart. Shows "Beats naïve" indicator.
2. Demand Generator (Ch 2/4): 4 sliders (trend, seasonality, noise, spikes) → synthetic demand + S-Naïve vs ETS comparison.
3. Leakage Demo (Ch 5): Toggle temporal vs. random split → RMSE difference reveals leakage magnitude.
4. Decomposition Lab (Ch 4): Toggle ETS baseline / XGB residual / error layers on the hybrid model output.
5. Profit Calculator (Ch 1/7): Stockout and overstock cost sliders → profit comparison across 3 models (shows RMSE ≠ profit winner).
6. XGBoostTutorial (Ch 4): 4-tab boosting round walkthrough with live RMSE per round.
7. XGBoostExplainer (Ch 4): Visual 4-step explainer — draggable split threshold scatter, residual bars, boost round, ensemble. RMSE updates live.
8. Evaluation Lab (Ch 5): Moveable train/test split + metric selector (RMSE/MAE/MAPE/Bias) across all 3 models.
9. ActionLab (Ch 6/7): Safety stock calculator + analyst override RMSE comparison.
10. EOQExplorer (Ch 7): D/S/H sliders → live EOQ calculation.
11. SafetyStockExplorer (Ch 7): z and lead time sliders → live safety stock.

══════════════════════════
UNDERLYING DATASET
══════════════════════════
Synthetic retail demand: 104 weeks, base ~50,000 units/week, with 12-month seasonality, slow trend, noise, and periodic spikes every 17 and 23 weeks. Generated deterministically (no Math.random — uses sin/cos harmonics). Train: weeks 1–78, Test: weeks 79–104.

══════════════════════════
DESIGN STYLE
══════════════════════════
Dark-themed (#07090F background), Seeing Theory-inspired split-panel scrolly layout (text left, sticky viz right). Each chapter has a unique accent color. Dot-grid backgrounds on viz cards. Animated transitions (fadeUp, fadeIn, pop). Built as a single-file React JSX app using Recharts for charts and pure SVG for custom visualizations.
`;

  /* ── GLOSSARY ── */
  const GLOSSARY = [
    {
      term: "RMSE",
      short: "Root Mean Squared Error",
      def:
        "A forecast accuracy metric. RMSE = √mean(errors²). It penalizes large errors more than small ones because errors are squared before averaging. Units match the demand variable.",
    },
    {
      term: "MAE",
      short: "Mean Absolute Error",
      def:
        "MAE = mean(|actual − forecast|). Treats all errors equally regardless of size. More interpretable than RMSE for non-technical audiences.",
    },
    {
      term: "MAPE",
      short: "Mean Absolute Pct Error",
      def:
        "MAPE = mean(|error/actual|) × 100%. Expresses accuracy as a percentage. Breaks down when actual values are zero or near-zero.",
    },
    {
      term: "Bias",
      short: "Systematic forecast offset",
      def:
        "Bias = mean(forecast − actual). Positive means you're consistently over-forecasting; negative means under-forecasting. A model can have good RMSE and bad bias at the same time.",
    },
    {
      term: "ETS",
      short: "Error, Trend, Seasonality",
      def:
        "A family of state-space exponential smoothing models. ETS updates its estimate of level, trend, and seasonal factors at every time step using smoothing parameters α, β, and γ.",
    },
    {
      term: "α (alpha)",
      short: "ETS smoothing parameter",
      def:
        "Controls how much weight recent observations get. High α (>0.6): reacts fast to new demand, volatile forecasts. Low α (<0.2): slow to adapt, stable forecasts.",
    },
    {
      term: "XGBoost",
      short: "Gradient boosted trees",
      def:
        "An ML algorithm that builds decision trees sequentially. Each tree tries to correct the errors of all previous trees. Needs a feature matrix (lags, calendar features) to work on demand data.",
    },
    {
      term: "Hybrid Model",
      short: "ETS + XGBoost stacked",
      def:
        "ETS fits the seasonal baseline. XGBoost is trained on the residuals (ETS errors). Final forecast = ETS baseline + XGBoost correction. Combines statistical structure with ML flexibility.",
    },
    {
      term: "Safety Stock",
      short: "Buffer inventory",
      def:
        "Extra inventory held to absorb forecast error during lead time. Formula: z × σ_demand × √(lead time). The z-score comes from your target service level (e.g., 1.65 for 95%).",
    },
    {
      term: "Service Level",
      short: "Stockout probability target",
      def:
        "The probability of not running out of stock during a replenishment cycle. 95% service level means you stock out in 1 of 20 cycles on average.",
    },
    {
      term: "Data Leakage",
      short: "Future data in training",
      def:
        "When information about the test period accidentally enters the training set. In time series, this usually happens from random train/test splits instead of temporal ones. Makes models look artificially accurate.",
    },
    {
      term: "Temporal Split",
      short: "Time-ordered train/test",
      def:
        "Splitting data so all training examples come before all test examples in time. The only correct way to evaluate time series models. Prevents data leakage.",
    },
    {
      term: "Seasonal Naïve",
      short: "Benchmark: same wk last yr",
      def:
        "Predicts demand = same week last year. Surprisingly strong baseline. If your model can't consistently beat this, revisit your approach.",
    },
    {
      term: "Overfitting",
      short: "Learned noise, not signal",
      def:
        "The model fits training data too closely and fails on new data. Train RMSE is much lower than test RMSE. Fixes: regularization, less model complexity, more data.",
    },
    {
      term: "Lag Feature",
      short: "Past demand as predictor",
      def:
        "Using past demand values (e.g., demand 1 week ago, demand 52 weeks ago) as input features for ML models. The most important class of features for demand forecasting.",
    },
    {
      term: "Lead Time",
      short: "Replenishment delay",
      def:
        "The time between placing an order and receiving it. Longer lead times require more safety stock because you have more exposure to demand uncertainty.",
    },
    {
      term: "Newsvendor",
      short: "Optimal order qty model",
      def:
        "Classic inventory model: order Q* = F⁻¹(Cu/(Cu+Co)) where Cu is stockout cost and Co is overstock cost per unit. If stockout is costlier, order above the demand mean.",
    },
    {
      term: "Backtesting",
      short: "Time series evaluation",
      def:
        "Evaluating a model by simulating past forecasting decisions. Use an expanding window: train on weeks 1-52, test on weeks 53-56, then train on 1-56, test on 57-60, and so on.",
    },
    {
      term: "Concept Drift",
      short: "Demand pattern shift",
      def:
        "When the underlying demand pattern changes over time, making a trained model less accurate. Requires retraining. Example: a new competitor launching or a supply disruption.",
    },
    {
      term: "Diebold-Mariano",
      short: "RMSE significance test",
      def:
        "A statistical test to determine if the RMSE difference between two models is statistically significant. Important with short test sets where even 15% RMSE improvements may not be significant.",
    },
  ];

  /* ── PRACTICE PROBLEMS ── */
  const PRACTICE = {
    "Ch 1 — Why Forecasting": [
      {
        q: "Your model has RMSE of 4,200. Stockout costs $60/unit, overstock costs $15/unit. Should you optimize for RMSE or profit? Explain.",
        a:
          "Optimize for profit. RMSE treats over- and under-forecasting symmetrically, but here stockout costs 4x more. The profit-optimal model stocks to the 80th percentile (critical ratio = 60/(60+15) = 0.8), not the mean. RMSE minimization may not achieve this.",
      },
      {
        q: "What is the 'oracle fallacy' and why does it matter for how you present forecasts to stakeholders?",
        a:
          "The oracle fallacy is expecting a forecast to be a precise, certain prediction. It matters because stakeholders who hold this expectation will lose trust when forecasts miss, even when misses are statistically normal. Communicating uncertainty upfront sets the right expectations.",
      },
    ],
    "Ch 2 — Data Literacy": [
      {
        q: "Your lag-52 feature has very high XGBoost feature importance. What does this tell you about the demand series?",
        a:
          "It means demand is strongly seasonal with a 52-week (annual) cycle. The best predictor of this week's sales is the same week last year. This is common in retail. It also means seasonal naïve will be a strong baseline — hard to beat.",
      },
      {
        q: "You see zero demand in several weeks. Before concluding 'no one wanted the product,' what should you check?",
        a:
          "Check for stockouts. Zero demand in the data often means zero inventory was available, not zero customer interest. Stockout-induced zeros must be imputed (e.g., with the seasonal mean) before modelling, otherwise you train on artificially depressed demand.",
      },
    ],
    "Ch 3 — Baseline Models": [
      {
        q: "ETS with α=0.05 vs α=0.85: which adapts faster to a sudden demand spike? Which is more stable during quiet periods?",
        a:
          "α=0.85 adapts faster (it weights recent observations heavily), so it responds to the spike more quickly. α=0.05 is more stable during quiet periods because it gives almost equal weight to all history, smoothing out noise. The trade-off: α=0.85 reacts to noise too, not just real shifts.",
      },
      {
        q: "In what three situations would seasonal naïve outperform a well-tuned ETS model?",
        a:
          "(1) Very short training history: less than 2 years of data means ETS can't estimate seasonal indices reliably. (2) Extremely stable series: no year-over-year growth means last year is the best predictor. (3) Intermittent demand: ETS struggles with many zeros; seasonal naïve at least gets the zeros right.",
      },
    ],
    "Ch 4 — Advanced ML": [
      {
        q: "Why does the hybrid ETS+XGB model chain the two models rather than simply averaging their forecasts?",
        a:
          "Chaining is theoretically cleaner. ETS handles the systematic seasonal pattern, and XGBoost is trained specifically on the residuals ETS leaves behind. This means XGBoost focuses only on the unexplained variation, not the seasonal pattern ETS already captured. Averaging would make both models redundantly forecast the same pattern.",
      },
      {
        q: "You set XGBoost max_depth=10 and n_estimators=2000. Training RMSE = 1,200. Test RMSE = 8,900. What's happening and how do you fix it?",
        a:
          "Classic overfitting. The model memorized training data noise. Fix: reduce max_depth (try 3-6), increase regularization (reg_lambda), use early stopping on a validation set, and optionally add subsample <1.0 for stochastic boosting.",
      },
    ],
    "Ch 5 — Evaluation": [
      {
        q: "Your model has RMSE 4,100 on temporal split but RMSE 1,800 on random split. What happened?",
        a:
          "Data leakage. The random split allowed future demand patterns to enter the training set, making the model look artificially accurate. The temporal split gives the true out-of-sample RMSE. The 1,800 figure is meaningless for production use.",
      },
      {
        q: "You run backtesting across 8 windows and get RMSE values: [3200, 4100, 2900, 5600, 3400, 4800, 3100, 4400]. Should you report 3,938 as your expected RMSE? What else should you report?",
        a:
          "Report mean RMSE = 3,938 AND standard deviation = 880. The high variance (ranging from 2,900 to 5,600) tells you model performance is inconsistent across time periods. This matters as much as the average. Stakeholders should know that in some periods the model is much worse than average.",
      },
    ],
    "Ch 6 — Communicating": [
      {
        q: "A CFO asks: 'How confident are you in next quarter's forecast?' How do you answer without using the word RMSE?",
        a:
          "Something like: 'Based on our historical accuracy, we'd expect the actual figure to land within about ±12% of the forecast in 8 out of 10 quarters. We've built three scenarios — base, upside, and downside — so you can see the range of outcomes we're planning for.'",
      },
      {
        q: "Your forecast was 45,000 units; actual was 58,000. In a post-mortem review, you find the model had no promotional flag for a flash sale that week. Is this a model failure?",
        a:
          "No, it's a data failure. The model couldn't predict an event it had no information about. The fix is adding a promotional calendar as a feature, not changing the model algorithm. Distinguishing data failures from model failures is critical for knowing what to improve.",
      },
    ],
    "Ch 7 — Inventory": [
      {
        q: "Lead time doubles from 4 to 8 weeks. Assuming σ_demand stays constant, by what factor does safety stock change?",
        a:
          "Safety stock = z × σ × √LT. If LT doubles from 4 to 8, √LT goes from √4=2 to √8=2.83. So safety stock increases by a factor of 2.83/2 = 1.41, or about 41%. Lead time has a square-root relationship with safety stock, not a linear one.",
      },
      {
        q: "Stockout cost is $120/unit, overstock cost is $30/unit. What is the Newsvendor critical ratio, and at what demand percentile should you set your order quantity?",
        a:
          "Critical ratio = 120/(120+30) = 0.80. Order Q* at the 80th percentile of the demand distribution. Since stockouts cost 4x more, you want to be stocked in 80% of scenarios, holding more buffer than if costs were equal.",
      },
    ],
    "Ch 8 — Process": [
      {
        q: "Your model's RMSE increased 35% this month vs. the 13-week average. List the first three things you check.",
        a:
          "(1) Data pipeline: did the feature engineering run correctly? Missing or malformed lag features are the most common culprit. (2) External events: was there a promotion, stockout, or external shock that week that the model couldn't predict? (3) Concept drift: has the underlying demand pattern shifted (new competitor, seasonal regime change)?",
      },
      {
        q: "You're asked to build a forecasting system for 500 SKUs. You have 2 years of weekly sales history. What's the minimum viable pipeline architecture?",
        a:
          "Feature engineering (lags, calendar), a single XGBoost model trained across all SKUs with a SKU-ID feature (or separate ETS per SKU for high-velocity items), temporal backtesting across 5+ windows, weekly retraining, and a monitoring dashboard tracking RMSE and bias per SKU. Start simple before adding complexity.",
      },
    ],
  };

  // ✅ 3) Tab button includes "ai"
  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "7px 16px",
        borderRadius: 20,
        border: `1.5px solid ${tab === id ? col : C.border}`,
        background: tab === id ? `${col}22` : C.bgCard2,
        color: tab === id ? col : C.textDim,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: tab === id ? 700 : 400,
        transition: "all .2s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <TabBtn id="chat" label="💬 Ask" />
        <TabBtn id="glossary" label="📖 Glossary" />
        <TabBtn id="practice" label="✏️ Practice" />
        <TabBtn id="ai" label="🤖 Ask AI" />
      </div>

      {/* ── CHAT TAB ── */}
      {tab === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", height: 360 }}>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingRight: 4,
            }}
          >
            {msgs.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.role === "user" ? `${col}25` : C.bgCard2,
                  border: `1px solid ${m.role === "user" ? col : C.border}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: C.text,
                  lineHeight: 1.65,
                  animation: "fadeUp .2s ease",
                }}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {["What is α in ETS?", "How does XGBoost work?", "What causes data leakage?", "When does seasonal naïve win?"].map(
              (c, i) => (
                <button
                  key={i}
                  onClick={() => setInput(c)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 10,
                    border: `1px solid ${col}40`,
                    background: `${col}10`,
                    color: col,
                    cursor: "pointer",
                    fontSize: 10,
                  }}
                >
                  {c}
                </button>
              )
            )}
          </div>

          <div style={{ display: "flex", gap: 7 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask anything about forecasting…"
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bgCard2,
                color: C.text,
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={send}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                background: col,
                color: "#000",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Ask
            </button>
          </div>
        </div>
      )}

      {/* ── GLOSSARY TAB ── */}
      {tab === "glossary" && (
        <div style={{ overflowY: "auto", maxHeight: 400 }}>
          <div style={{ color: C.textDim, fontSize: 12, marginBottom: 12 }}>
            Click any term to see the full definition.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {GLOSSARY.map((g, i) => (
              <div
                key={i}
                onClick={() => setOpenTerm(openTerm === i ? null : i)}
                style={{
                  background: openTerm === i ? `${col}18` : C.bgCard2,
                  border: `1px solid ${openTerm === i ? col : C.border}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  cursor: "pointer",
                  transition: "all .2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: col, fontSize: 12, fontWeight: 700 }}>{g.term}</div>
                    <div style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>{g.short}</div>
                  </div>
                  <span style={{ color: C.textMuted, fontSize: 12 }}>{openTerm === i ? "▲" : "▼"}</span>
                </div>
                {openTerm === i && (
                  <div
                    style={{
                      color: C.text,
                      fontSize: 12.5,
                      lineHeight: 1.65,
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: `1px solid ${col}30`,
                      animation: "fadeIn .2s ease",
                    }}
                  >
                    {g.def}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRACTICE TAB ── */}
      {tab === "practice" && (
        <div style={{ overflowY: "auto", maxHeight: 440 }}>
          <div style={{ color: C.textDim, fontSize: 12, marginBottom: 12 }}>
            Two practice problems per chapter. Click a question to reveal the answer.
          </div>
          {Object.entries(PRACTICE).map(([chapter, problems]) => (
            <div key={chapter} style={{ marginBottom: 14 }}>
              <div
                onClick={() => setOpenCh(openCh === chapter ? null : chapter)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: openCh === chapter ? `${col}18` : C.bgCard2,
                  border: `1px solid ${openCh === chapter ? col : C.border}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  cursor: "pointer",
                  transition: "all .2s",
                  marginBottom: openCh === chapter ? 6 : 0,
                }}
              >
                <span style={{ color: openCh === chapter ? col : C.text, fontWeight: 600, fontSize: 13 }}>
                  {chapter}
                </span>
                <span style={{ color: C.textMuted, fontSize: 12 }}>{openCh === chapter ? "▲" : "▼"}</span>
              </div>
              {openCh === chapter &&
                problems.map((p, pi) => <PracticeCard key={pi} problem={p} col={col} idx={pi} />)}
            </div>
          ))}
        </div>
      )}

      {/* ✅ 4) AI TAB */}
      {tab === "ai" && (
        <div style={{ display: "flex", flexDirection: "column", height: 360 }}>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingRight: 4,
            }}
          >
            {aiMsgs.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.role === "user" ? `${col}25` : C.bgCard2,
                  border: `1px solid ${m.role === "user" ? col : C.border}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: C.text,
                  lineHeight: 1.65,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            ))}

            {aiLoading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: C.bgCard2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: C.textDim,
                }}
              >
                Thinking…
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {["Explain ETS vs XGBoost", "Give me a safety stock question", "What is the bullwhip effect?", "Why does MAPE fail?"].map(
              (c, i) => (
                <button
                  key={i}
                  onClick={() => setAiInput(c)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 10,
                    border: `1px solid ${col}40`,
                    background: `${col}10`,
                    color: col,
                    cursor: "pointer",
                    fontSize: 10,
                  }}
                >
                  {c}
                </button>
              )
            )}
          </div>

          <div style={{ display: "flex", gap: 7 }}>
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendAI()}
              placeholder="Ask anything…"
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bgCard2,
                color: C.text,
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={sendAI}
              disabled={aiLoading}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                background: aiLoading ? "#334155" : col,
                color: "#000",
                border: "none",
                cursor: aiLoading ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {aiLoading ? "…" : "Ask"}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

export { ChatBot };

function PracticeCard({problem,col,idx}){
  const [showAns,setShowAns]=useState(false);
  return(
    <div style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:6,animation:"fadeIn .2s ease"}}>
      <div style={{color:C.text,fontSize:13,lineHeight:1.65,marginBottom:10}}>
        <strong style={{color:col}}>Q{idx+1}.</strong> {problem.q}
      </div>
      <button onClick={()=>setShowAns(s=>!s)}
        style={{padding:"5px 14px",borderRadius:6,border:`1px solid ${col}40`,background:`${col}15`,
          color:col,cursor:"pointer",fontSize:11,fontWeight:600}}>
        {showAns?"Hide Answer":"Show Answer"}
      </button>
      {showAns&&(
        <div style={{color:C.textDim,fontSize:12.5,lineHeight:1.7,marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`,animation:"fadeIn .2s ease"}}>
          {problem.a}
        </div>
      )}
    </div>
  );
}

/* ── n3.jsx — ChHome, Ch1, Ch2, Ch3 ── */

function ChHome(){
  return(
    <div style={{animation:"fadeUp .4s ease"}}>
      <div style={{background:`linear-gradient(140deg,${SC.home}1A 0%,${C.bg} 55%)`,border:`1px solid ${SC.home}30`,borderRadius:20,padding:"54px 40px 46px",marginBottom:36,textAlign:"center"}}>
        <div style={{color:SC.home,fontSize:11,fontWeight:700,letterSpacing:5,textTransform:"uppercase",marginBottom:14}}>CP194 Capstone · Minerva University</div>
        <h1 style={{color:C.text,fontSize:34,fontWeight:900,margin:"0 0 14px",lineHeight:1.12}}>From Forecasts to Decisions</h1>
        <p style={{color:C.textDim,fontSize:15,maxWidth:500,margin:"0 auto 30px",lineHeight:1.72}}>A Practical Guide to Demand Forecasting for Early-Career Analysts</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:32}}>
          {["8 Chapters","5 Simulations","AI Tutor","Code + Math Appendix"].map(b=>(
            <span key={b} style={{background:`${SC.home}18`,border:`1px solid ${SC.home}35`,color:SC.home,borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:600}}>{b}</span>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14,marginBottom:32}}>
        {[
          {col:SC.s1,ch:"Ch 1",title:"Why Forecasting Matters",desc:"Forecasting as decision support, not oracle"},
          {col:SC.s2,ch:"Ch 2",title:"Demand Data Literacy",desc:"Decomposition, feature engineering, quality"},
          {col:SC.s3,ch:"Ch 3",title:"Baseline Models",desc:"Moving averages, seasonal naïve, ETS"},
          {col:SC.s4,ch:"Ch 4",title:"Advanced ML Models",desc:"XGBoost, hybrid ETS+XGB, decomposition"},
          {col:SC.s5,ch:"Ch 5",title:"Model Evaluation",desc:"Metrics, backtesting, data leakage"},
          {col:SC.s6,ch:"Ch 6",title:"Communicating Forecasts",desc:"Uncertainty, scenarios, stakeholder translation"},
          {col:SC.s7,ch:"Ch 7",title:"Inventory Decisions",desc:"Safety stock, Newsvendor, profit-optimal"},
          {col:SC.s8,ch:"Ch 8",title:"Forecast Process",desc:"Pipelines, governance, analyst credibility"},
        ].map(c=>(
          <div key={c.ch} style={{background:C.bgCard,border:`1px solid ${c.col}28`,borderRadius:10,padding:"18px 20px",borderLeft:`3px solid ${c.col}`}}>
            <div style={{color:c.col,fontSize:9.5,fontWeight:700,letterSpacing:2.5,textTransform:"uppercase",marginBottom:5}}>{c.ch}</div>
            <div style={{color:C.text,fontSize:13.5,fontWeight:700,marginBottom:5}}>{c.title}</div>
            <div style={{color:C.textDim,fontSize:12,lineHeight:1.5}}>{c.desc}</div>
          </div>
        ))}
      </div>

      <div style={{background:C.bgCard,border:`1px solid ${SC.home}30`,borderRadius:12,padding:"22px 26px",marginBottom:24}}>
        <h3 style={{color:SC.home,margin:"0 0 16px",fontSize:13,letterSpacing:1,textTransform:"uppercase"}}>📖 How to Use This Textbook</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
          {[
            {icon:"🎯",role:"Business Analyst / Manager",guide:"Read Chapters 1, 6, and 7 first. Focus on the text and Key Takeaways — skip the MathBlock and code appendices. Use the chatbot Glossary tab to look up any unfamiliar term as you go.",color:SC.s1},
            {icon:"📊",role:"Data Analyst (new to forecasting)",guide:"Work through Chapters 1–5 in order, interacting with every simulation. Run the ETS Explorer (Ch 3) and LeakageDemo (Ch 5) until the concepts click. Then read Ch 6–8 for production context.",color:SC.s3},
            {icon:"🤖",role:"ML Engineer / Data Scientist",guide:"Skim Chapters 1–3 to anchor terminology, then deep-dive Chapters 4–5 and Appendix A (code) and Appendix B (math). Pay attention to the hybrid architecture details and the backtesting methodology.",color:SC.s5},
            {icon:"🎓",role:"Academic Reviewer / Instructor",guide:"Start with the Academic Abstract and Chapter 1 framing, then review the References section and Appendix B (math) for methodological rigour. The AI Tutor chapter documents the tool's design rationale.",color:SC.s8},
          ].map(g=>(
            <div key={g.role} style={{background:C.bgCard2,border:`1px solid ${g.color}30`,borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${g.color}`}}>
              <div style={{fontSize:20,marginBottom:6}}>{g.icon}</div>
              <div style={{color:g.color,fontSize:11,fontWeight:700,marginBottom:6}}>{g.role}</div>
              <div style={{color:C.textDim,fontSize:11.5,lineHeight:1.65}}>{g.guide}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.borderLight}`,color:C.textDim,fontSize:11.5,lineHeight:1.65}}>
          <strong style={{color:SC.home}}>All readers:</strong> The 💬 AI Tutor (bottom of every page) supports three modes — ask free-form questions, browse the Glossary by clicking any term, or say <em>"give me a practice question for Chapter 3"</em> to test yourself.
        </div>
      </div>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"22px 26px"}}>
        <h3 style={{color:SC.home,margin:"0 0 14px",fontSize:13,letterSpacing:1,textTransform:"uppercase"}}>Model Performance at a Glance</h3>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:14}}>
          <RMSEBadge label="Seasonal Naïve" value={SN_RMSE} color={C.textDim}/>
          <RMSEBadge label="ETS" value={ETS_RMSE} color={SC.s3}/>
          <RMSEBadge label="Hybrid ETS+XGB" value={HYB_RMSE} color={SC.home}/>
        </div>
        <P>Trained on 78 weeks of synthetic retail demand, evaluated on 26 weeks held out. The hybrid model achieves {Math.round((1-HYB_RMSE/SN_RMSE)*100)}% lower RMSE than seasonal naïve by combining ETS's seasonal structure with XGBoost's residual learning.</P>
      </div>
    </div>
  );
}

/* ═════════════════ CHAPTER 1 ═════════════════ */
function Ch1(){
  const col=SC.s1;
  /* BUG FIX: steps wrapped in useMemo to prevent recreation on each render */
  const steps=useMemo(()=>[
    {label:"The Oracle Fallacy",
     text:"Most newcomers expect forecasts to be accurate predictions. This is the Oracle Fallacy — demanding certainty from a probabilistic tool. A forecast is not a promise. It's a probability distribution compressed into a single number. Judge forecasts by the decisions they support, not by whether the number was exactly right.",
     viz:()=>(
       <div>
         <P>Forecast errors are not failures. They carry information. Systematic patterns in the errors point to model gaps, while random scatter is just irreducible uncertainty.</P>
         <ResponsiveContainer width="100%" height={210}>
           <BarChart data={TEST.slice(0,20).map((d,i)=>({week:d.week,error:d.sales-(HYB_PRED[i]?.forecast||0)}))}>
             <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
             <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
             <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
             <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
             <Bar dataKey="error" fill={col} name="Hybrid Forecast Error"/>
           </BarChart>
         </ResponsiveContainer>
       </div>
     )},
    {label:"Decision Framing",
     text:"Forecasts exist to reduce decision uncertainty. The right question isn't 'was the forecast correct?' It's 'did this forecast lead to better decisions than we would have made otherwise?' Think of every forecast as a decision-support tool, not a grade.",
     viz:()=>(
       <TableBlock headers={["Decision","Without Forecast","With Forecast"]}
         rows={[
           ["Inventory replenishment","Fixed reorder point (over/under-stock)","Dynamic safety stock + lead time model"],
           ["Promotional planning","Flat budget, arbitrary allocation","Demand-adjusted spend by SKU/region"],
           ["Capacity planning","Peak-season guessing","Probabilistic staffing bands"],
           ["Supplier negotiations","Spot purchasing, no leverage","Committed volume contracts at discount"],
         ]}/>
     )},
    {label:"Cost Asymmetry",
     text:"Stockouts and overstock don't cost the same. A missed sale typically costs 3-8x more than holding excess inventory, once you factor in margin loss and customer churn. RMSE treats both directions equally, which is often wrong for real business decisions.",
     viz:({accent})=>(<ProfitCalculator accent={accent}/>)},
    {label:"The Forecasting Hierarchy",
     text:"Accuracy degrades in predictable ways: aggregate forecasts beat disaggregate ones, short horizons beat long ones, and stable products beat volatile SKUs. Forecast at the aggregate level where you can be accurate, and disaggregate only where the decision requires it.",
     viz:()=>(
       <TableBlock headers={["Level","Horizon","Typical MAPE","Use Case"]}
         rows={[
           ["Total revenue","12 months","~5%","Annual budgeting"],
           ["Product family","3 months","~12%","Capacity planning"],
           ["SKU-location","4 weeks","~25%","Replenishment orders"],
           ["Daily SKU","7 days","~40%","Dynamic pricing"],
         ]}/>
     )},
  ],[]);

  return(
    <div>
      <SectionHero num="Chapter 1" title="Why Forecasting Matters" subtitle="Forecasting is not about predicting the future with certainty — it's about making better decisions under uncertainty. This chapter reframes what forecasting is for." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>1.1 What Makes a Good Forecast?</SubHeader>
      <P>A good forecast isn't one that turns out to be right in hindsight. It's one that was well-calibrated, honest about uncertainty, and useful to the decision-maker at the time. Usefulness is the standard, not retrospective accuracy.</P>
      <Quote source="George Box (1976)">All models are wrong, but some are useful.</Quote>
      <P>Useful forecasts share four properties: (1) calibrated — stated confidence intervals contain the true outcome at the stated frequency; (2) decision-relevant — they answer the question the decision-maker actually faces; (3) timely — available before the decision deadline; (4) explainable — stakeholders understand why the forecast changed.</P>
      <SubHeader accent={col}>1.2 The Three Forecasting Paradigms</SubHeader>
      <TableBlock
        headers={["Paradigm","Assumption","Strength","Weakness"]}
        rows={[
          ["Statistical","Data generating process is stable and estimable","Interpretable, calibrated intervals","Fails in structural breaks"],
          ["Machine Learning","Patterns in features predict outcomes","Captures complex nonlinear interactions","Overfit risk, opaque"],
          ["Judgmental","Domain knowledge adds signal","Captures events not in history","Anchoring bias, inconsistency"],
        ]}
        caption="Table 1.1 — Three forecasting paradigms and their trade-offs"/>
      <KeyTakeaways accent={col} items={[
        "A forecast is a decision-support tool, not an oracle. Evaluate it by the quality of decisions it enables, not point accuracy alone.",
        "Cost asymmetry matters: stockout costs typically exceed overstock costs by 3–8×. Model selection should reflect your specific cost structure.",
        "Accuracy degrades at finer granularity and longer horizons. Build hierarchical architectures that aggregate where accuracy is highest.",
        "Hybrid models combining statistical structure + ML flexibility outperform pure approaches on most real-world demand series.",
      ]}/>
    </div>
  );
}

/* ═════════════════ CHAPTER 2 ═════════════════ */
function Ch2(){
  const col=SC.s2;
  const decomp=useMemo(()=>{
    const base=50000;
    // Compute rolling 4-wk mean as "level", seasonal deviation, and residual noise
    const arr=DATA.slice(0,52);
    return arr.map((d,i)=>{
      const wnd=arr.slice(Math.max(0,i-3),i+1);
      const level=Math.round(wnd.reduce((s,x)=>s+x.sales,0)/wnd.length);
      const trend=Math.round(base*(1+d.week*.001));
      const seasonal=Math.round(d.sales/Math.max(1,level)*100-100); // seasonal index %
      const noise=d.sales-level;
      return{week:d.week,actual:d.sales,level,trend,seasonal,noise};
    });
  },[]);

  const steps=useMemo(()=>[
    {label:"Time Series Anatomy",
     text:"Every demand series has four components: level (L), trend (T), seasonality (S), and irregular noise (ε). Before building a model, decompose the series. Understanding which components dominate (trend, seasonality, or noise) is what guides your model choice.",
     viz:()=>(
       <div>
         <div style={{color:C.textDim,fontSize:11,marginBottom:8,textAlign:"center"}}>Four components of a demand time series — Week 1–52</div>
         <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
           {[
             {key:"actual",label:"Raw Demand",color:col,height:110},
             {key:"level",label:"Level (4-wk rolling avg)",color:C.orange,height:110},
             {key:"seasonal",label:"Seasonal Deviation (%)",color:C.purple,height:110},
             {key:"noise",label:"Irregular Noise",color:C.red,height:110},
           ].map(({key,label,color,height})=>(
             <div key={key}>
               <div style={{color,fontSize:10,fontWeight:700,marginBottom:2,textAlign:"center"}}>{label}</div>
               <ResponsiveContainer width="100%" height={height}>
                 <AreaChart data={decomp} margin={{top:4,right:4,bottom:4,left:0}}>
                   <CartesianGrid strokeDasharray="2 2" stroke={C.borderLight}/>
                   <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:8}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
                   <YAxis stroke={C.textMuted} tick={{fontSize:8}} tickFormatter={v=>key==="seasonal"?v+"%":(v/1000).toFixed(0)+"k"} width={70} label={{value:"Units (k)",angle:-90,position:"InsideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
                   <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:4,fontSize:11}} formatter={v=>key==="seasonal"?v+"%":Number(v).toLocaleString()}/>
                   <Area type="monotone" dataKey={key} fill={`${color}18`} stroke={color} strokeWidth={1.5} dot={false}/>
                 </AreaChart>
               </ResponsiveContainer>
             </div>
           ))}
         </div>
       </div>
     )},
    {label:"Feature Engineering",
     text:"ML models treat demand forecasting as supervised regression: given feature vector X_t, predict Y_{t+h}. The quality of your feature matrix sets the ceiling for any ML model. Lag features are the most valuable, especially lag-1 (last week) and lag-52 (same week last year).",
     viz:()=>(
       <TableBlock headers={["Feature Type","Example","Why It Matters"]}
         rows={[
           ["Lag features","sales_lag_1, sales_lag_52","Autocorrelation: past demand predicts future"],
           ["Rolling stats","rolling_mean_4wk, rolling_std_8wk","Trend signal + demand volatility"],
           ["Calendar","month, week_of_year, is_holiday","Seasonal pattern encoding"],
           ["Promotions","promo_flag, discount_pct","Demand uplift from marketing events"],
           ["Interactions","month × promo_flag","Seasonal sensitivity to promotions"],
         ]}/>
     )},
    {label:"Autocorrelation",
     text:"High lag-1 autocorrelation means demand is sticky (persistence). High lag-52 autocorrelation signals strong annual seasonality. Both patterns suggest ETS or seasonal models will perform well.",
     viz:()=>(
       <div>
         <P style={{marginBottom:8}}>Autocorrelation function (ACF) measures how strongly current demand correlates with its own past values at various lags.</P>
         <ResponsiveContainer width="100%" height={200}>
           <BarChart data={[1,4,8,13,26,52].map(lag=>({lag:`Lag ${lag}`,corr:Math.max(-.2,Math.min(.95,DATA.slice(lag).reduce((s,d,i)=>{const m=_.mean(DATA.map(x=>x.sales));return s+(d.sales-m)*(DATA[i].sales-m);},0)/DATA.reduce((s,d)=>{const m=_.mean(DATA.map(x=>x.sales));return s+Math.pow(d.sales-m,2);},0)))}))}>
             <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
             <XAxis dataKey="lag" stroke={C.textMuted} tick={{fontSize:10}}/>
             <YAxis stroke={C.textMuted} tick={{fontSize:9}} domain={[-.3,1]}/>
             <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}}/>
             <ReferenceLine y={0} stroke={C.textMuted}/>
             <Bar dataKey="corr" fill={col} name="Autocorrelation"/>
           </BarChart>
         </ResponsiveContainer>
       </div>
     )},
    {label:"Data Quality Checks",
     text:"Before modelling, audit your data: (1) Missing values — stockouts mask true demand, impute with seasonal mean; (2) Outliers — flag with ±3σ rule; (3) Structural breaks — promotions, COVID discontinuities; (4) Aggregation issues — ensure date/SKU/location keys align consistently.",
     viz:()=>(
       <Callout icon="⚠️" color={C.orange} title="Common Data Quality Issues">
         <div style={{lineHeight:2.1}}>
           <div>• <strong>Zero sales ≠ zero demand</strong> — stockouts mask true demand. Impute from similar periods.</div>
           <div>• <strong>Aggregation mismatches</strong> — weekly model fed daily data without re-aggregation.</div>
           <div>• <strong>Timezone/fiscal week drift</strong> — ISO week vs. retail fiscal week definitions.</div>
           <div>• <strong>Price contamination</strong> — revenue series contaminated by price changes; use volume.</div>
         </div>
       </Callout>
     )},
  ],[decomp]);

  return(
    <div>
      <SectionHero num="Chapter 2" title="Demand Data Literacy" subtitle="Before selecting a model, understand your data. Decomposition, feature engineering, and data quality checks are the highest-ROI investment in forecast accuracy." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>2.1 Multiplicative vs. Additive Decomposition</SubHeader>
      <P>When seasonal fluctuations grow proportionally with the level (Christmas peaks are always ~30% above average), use multiplicative decomposition. When seasonal swings are constant in absolute terms, use additive.</P>
      <MathBlock>{`Additive:       Y_t = L_t + T_t + S_t + ε_t
Multiplicative: Y_t = L_t × T_t × S_t × ε_t

Rule of thumb: if seasonal range grows with level → multiplicative
              if seasonal range is stable       → additive`}</MathBlock>
      <SubHeader accent={col}>2.2 Feature Engineering for ML Models</SubHeader>
      <MathBlock>{`Feature matrix X_t = [
  sales_lag_1,    # previous week (autocorrelation)
  sales_lag_4,    # 4 weeks ago
  sales_lag_52,   # same week last year (seasonality)
  rolling_mean_4, # 4-week smoothed trend
  rolling_std_8,  # 8-week demand volatility
  month,          # 1–12
  week_of_year,   # 1–52 (seasonal position)
  is_holiday,     # binary flag
  promo_flag      # binary promotion indicator
]`}</MathBlock>
      <KeyTakeaways accent={col} items={[
        "Decompose your series before modelling. Identify whether seasonality is additive or multiplicative — this determines your model family.",
        "Lag features (especially lag-1 and lag-52 for weekly data) are the most important predictors for ML demand models.",
        "Data quality issues — stockout-induced zeros, outliers, structural breaks — must be addressed before modelling. No model overcomes dirty data.",
        "Stationarity matters for ARIMA but not for ETS or XGBoost. Know which assumptions your chosen model makes.",
      ]}/>
    </div>
  );
}

/* ═════════════════ CHAPTER 3 ═════════════════ */
function Ch3(){
  const col=SC.s3;
  /* BUG FIX 1: steps in useMemo prevents re-creation causing ScrollySection state loss */
  /* BUG FIX 2: renamed `window` → `wnd` to avoid strict-mode shadowing of browser global */
  const steps=useMemo(()=>[
    {label:"Moving Averages",
     text:"A k-period moving average smooths noise by averaging the k most recent observations. It gives equal weight to recent history. Neither captures trend nor seasonality well — use as a denoising step, not a standalone forecast. The 4-week MA visibly lags demand turning points.",
     viz:()=>{
       /* FIX: was `const window = ...` — now renamed `wnd` */
       const maData=DATA.slice(0,52).map((d,i)=>{
         const wnd=DATA.slice(Math.max(0,i-3),i+1);
         return{week:d.week,actual:d.sales,ma4:Math.round(_.mean(wnd.map(w=>w.sales)))};
       });
       return(
         <ResponsiveContainer width="100%" height={240}>
           <LineChart data={maData}>
             <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
             <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
             <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
             <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
             <Legend wrapperStyle={{fontSize:11}}/>
             <Line type="monotone" dataKey="actual" stroke={C.textDim} strokeWidth={1.5} dot={false} name="Actual"/>
             <Line type="monotone" dataKey="ma4" stroke={col} strokeWidth={2.5} dot={false} name="4-Week Moving Avg"/>
           </LineChart>
         </ResponsiveContainer>
       );
     }},
    {label:"Seasonal Naïve",
     text:"The seasonal naïve forecast sets the prediction equal to the same period last year: ŷ_{t+h} = y_{t+h-m} where m = 52 (weekly). Despite its simplicity, it is a remarkably strong baseline — consistently hard to beat. Any model must demonstrate sustained improvement over this benchmark.",
     viz:()=>(
       <div>
         <div style={{display:"flex",gap:10,marginBottom:12}}>
           <RMSEBadge label="Seasonal Naïve RMSE" value={SN_RMSE} color={col}/>
           <RMSEBadge label="ETS RMSE" value={ETS_RMSE} color={SC.s2}/>
           <RMSEBadge label="Hybrid RMSE" value={HYB_RMSE} color={SC.s4}/>
         </div>
         <ResponsiveContainer width="100%" height={200}>
           <LineChart data={TEST.map((d,i)=>({week:d.week,actual:d.sales,sn:SN_PRED[i]?.forecast||0}))}>
             <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
             <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
             <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
             <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
             <Legend wrapperStyle={{fontSize:11}}/>
             <Line type="monotone" dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} name="Actual"/>
             <Line type="monotone" dataKey="sn" stroke={col} strokeWidth={2} dot={false} strokeDasharray="5 2" name="Seasonal Naïve"/>
           </LineChart>
         </ResponsiveContainer>
       </div>
     )},
    {label:"ETS Model",
     text:"ETS (Error, Trend, Seasonality) is a state-space model that learns level, trend, and seasonal indices from data. The α smoothing parameter controls the trade-off between stability (low α) and responsiveness (high α). Use the interactive explorer to feel this trade-off live.",
     viz:({accent})=>(<ETSExplorer accent={accent}/>)},
    {label:"When Baselines Win",
     text:"Complex models don't always win. Seasonal Naïve outperforms ETS when: the series is extremely stable year-over-year with no trend; the training set is short (<2 years); or demand is highly intermittent. Always benchmark against seasonal naïve before declaring any model successful.",
     viz:()=>(
       <div>
         <Callout icon="💡" color={col} title="The M4 Competition Finding (2018)">
           A simple combination of statistical methods outperformed most pure ML approaches in 100,000 time series. Simplicity + smart combination often beats complexity.
         </Callout>
         <TableBlock headers={["Situation","Recommended Baseline"]}
           rows={[
             ["Strong annual seasonality, stable trend","Seasonal Naïve"],
             ["Growing or declining trend","Holt's Linear (ETS A,A,N)"],
             ["Trend + seasonality","Holt-Winters (ETS A,A,A)"],
             ["Intermittent demand","Croston's method"],
             ["Unknown structure","Average of SN + ETS"],
           ]}/>
       </div>
     )},
  ],[]);

  return(
    <div>
      <SectionHero num="Chapter 3" title="Baseline Models" subtitle="Before reaching for complex ML models, master the baselines. Moving averages, seasonal naïve, and ETS are interpretable, fast, and surprisingly competitive." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>3.1 ETS Mathematics</SubHeader>
      <P>ETS models update three state variables at each time step using exponential smoothing. For multiplicative seasonality (ETS M,A,M):</P>
      <MathBlock>{`Level:    L_t = α × (y_t / S_{t-m}) + (1 - α) × (L_{t-1} + T_{t-1})
Trend:    T_t = β × (L_t - L_{t-1}) + (1 - β) × T_{t-1}
Seasonal: S_t = γ × (y_t / L_t) + (1 - γ) × S_{t-m}
Forecast: ŷ_{t+h} = (L_t + h·T_t) × S_{t+h-m(⌊(h-1)/m⌋+1)}

Parameters: α ∈ (0,1) level smoothing
            β ∈ (0,1) trend damping
            γ ∈ (0,1) seasonal updating
            m = 52 (weekly seasonal period)`}</MathBlock>
      <SubHeader accent={col}>3.2 Interactive ETS Explorer</SubHeader>
      <P>Drag α to see the smoothing memory trade-off live. Watch RMSE update and observe whether the forecast over- or under-reacts to demand swings.</P>
      <VizCard accent={col}><ETSExplorer accent={col}/></VizCard>
      <FigCap num="3.1">ETS Explorer — α controls how much weight to place on the most recent observation vs. the long-run level.</FigCap>
      <KeyTakeaways accent={col} items={[
        "Seasonal naïve (same period last year) is a strong baseline. Consistent improvement over it is the minimum bar for any model you deploy.",
        "ETS α is the key lever: low α (0.05–0.2) for long-memory, stable smoothing; high α (0.6+) for reactive, short-memory adaptation.",
        "ETS handles multiplicative seasonality natively — the seasonal index scales with level, which is correct for most retail demand.",
        "Always benchmark at least two baselines (moving average + seasonal naïve) before evaluating complex models. Establish the performance floor first.",
      ]}/>
    </div>
  );
}
/* ── n4.jsx — Ch4, Ch5, Ch6, Ch7 ── */

function Ch4(){
  const col=SC.s4;
  const steps=useMemo(()=>[
    {label:"Why ML for Demand?",
     text:"Statistical models assume a fixed mathematical form. But real demand is messier. A promotion during a holiday week might generate 2.5x the lift of a regular weekday promotion. Gradient boosting picks up those kinds of nonlinear interactions directly from data.",
     viz:()=>(
       <TableBlock headers={["Aspect","ETS / ARIMA","XGBoost"]}
         rows={[
           ["Model form","Parametric (fixed structure)","Non-parametric (learned from data)"],
           ["Feature inputs","Time index only","Rich matrix: lags, calendar, promotions"],
           ["Interactions","Not captured natively","Learned automatically via trees"],
           ["Interpretability","High (explicit equations)","Medium (SHAP values)"],
           ["Data requirements","Low (30+ obs)","Medium (200+ obs per SKU)"],
         ]}/>
     )},
    {label:"XGBoost Mechanics",
     text:"XGBoost builds trees sequentially — each tree learns to predict the residuals of the current ensemble. The key idea: each tree is a small step toward correcting whatever the current ensemble gets wrong. Stack enough of these corrections and you get a surprisingly powerful model.",
     viz:({accent})=>(<XGBoostTutorial accent={accent}/>)},
    // In Ch4's steps array, replace or add after the "Hybrid" step:
    {label:"Inside XGBoost",
    text:"XGBoost builds hundreds of shallow decision trees in sequence. Each tree corrects the mistakes of all the previous trees — a technique called gradient boosting. The key insight: you never train on demand directly. You train each tree on the residuals.",
    viz:({accent})=>(<XGBoostExplainer accent={accent}/>)},
    {label:"Hybrid ETS + XGB",
     text:"The hybrid model chains ETS and XGBoost: ETS captures structural seasonal baseline, then XGBoost learns the residuals (the part ETS cannot explain). This preserves statistical interpretability while adding ML flexibility where the statistical model falls short.",
     viz:()=>(
       <div>
         <MathBlock>{`Step 1:  ŷ_ETS = ETS(train)          # seasonal baseline
Step 2:  r_t   = y_t - ŷ_ETS_t       # compute residuals
Step 3:  ŷ_XGB = XGB(features, r_t)  # residual model
Step 4:  ŷ_hybrid = ŷ_ETS + ŷ_XGB   # final forecast`}</MathBlock>
         <div style={{display:"flex",gap:10,marginTop:14}}>
           <RMSEBadge label="ETS alone" value={ETS_RMSE} color={SC.s3}/>
           <RMSEBadge label="Hybrid" value={HYB_RMSE} color={col}/>
           <div style={{flex:1,background:C.bgCard2,border:`1px solid ${col}40`,borderRadius:8,padding:"12px 14px",textAlign:"center"}}>
             <div style={{color:C.textDim,fontSize:10,marginBottom:3}}>Improvement</div>
             <div style={{color:col,fontSize:22,fontWeight:800}}>{Math.round((1-HYB_RMSE/ETS_RMSE)*100)}%</div>
             <div style={{color:C.textMuted,fontSize:10}}>RMSE reduction</div>
           </div>
         </div>
       </div>
     )},
    {label:"Decomposition Lab",
     text:"Toggle ETS and XGB layers to see exactly how the hybrid model builds its forecast. The ETS baseline handles broad seasonal shape; XGBoost's residual correction sharpens peaks and troughs.",
     viz:({accent})=>(<DecompositionLab accent={accent}/>)},
  ],[]);

  return(
    <div>
      <SectionHero num="Chapter 4" title="Advanced ML Models" subtitle="When baselines hit their ceiling, gradient boosting picks up the slack. This chapter covers XGBoost mechanics, the hybrid ETS+XGB architecture, and the Decomposition Lab." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>4.1 XGBoost Objective Function</SubHeader>
      <MathBlock>{`Objective: L(φ) = Σ_i l(ŷ_i, y_i) + Σ_k Ω(f_k)

where: Ω(f) = γT + ½λ||w||²    (complexity penalty)
       T = number of leaves, w = leaf weights
       γ = min gain for split, λ = L2 regularization

At round t, second-order Taylor approximation:
  g_i = ∂l/∂ŷ_i^(t-1)   (gradient)
  h_i = ∂²l/∂(ŷ_i^(t-1))² (Hessian)
  Optimal leaf weight: w_j* = -G_j / (H_j + λ)`}</MathBlock>
      <SubHeader accent={col}>4.2 Key Hyperparameters</SubHeader>
      <TableBlock
        headers={["Parameter","Typical Range","Effect"]}
        rows={[
          ["n_estimators","100–2000","Boosting rounds; more = lower bias, higher overfit risk"],
          ["max_depth","3–8","Tree complexity; lower = more regularized"],
          ["learning_rate","0.01–0.3","Shrinkage; lower = needs more rounds, more stable"],
          ["subsample","0.5–1.0","Fraction of rows per tree; <1.0 = stochastic boosting"],
          ["colsample_bytree","0.5–1.0","Fraction of features per tree; reduces correlation"],
          ["reg_lambda","0.1–10","L2 regularization weight on leaf weights"],
        ]}
        caption="Table 4.1 — XGBoost hyperparameters for demand forecasting"/>
      <SubHeader accent={col}>4.3 Interactive: XGBoost Tutorial</SubHeader>
      <VizCard accent={col}><XGBoostTutorial accent={col}/></VizCard>
      <FigCap num="4.1">Step through 4 boosting rounds to see how residuals shrink with each tree added to the ensemble.</FigCap>
      <SubHeader accent={col}>4.4 Interactive: Decomposition Lab</SubHeader>
      <VizCard accent={col}><DecompositionLab accent={col}/></VizCard>
      <FigCap num="4.2">Toggle ETS, XGB residual, and error layers to see the hybrid model's internal structure.</FigCap>
      <KeyTakeaways accent={col} items={[
        "XGBoost treats demand as supervised regression. The feature matrix — especially lag features — determines the model ceiling.",
        "The hybrid ETS+XGB architecture is theoretically sound: ETS provides unbiased seasonal structure; XGBoost corrects nonlinear residuals.",
        `On this dataset, the hybrid achieves ${Math.round((1-HYB_RMSE/ETS_RMSE)*100)}% lower RMSE than ETS and ${Math.round((1-HYB_RMSE/SN_RMSE)*100)}% lower than seasonal naïve.`,
        "Always tune XGBoost with expanding-window CV, not random K-fold. Use early stopping on a validation set to prevent overfitting.",
      ]}/>
    </div>
  );
}

/* ═════════════════ CHAPTER 5 ═════════════════ */
function Ch5(){
  const col=SC.s5;
  const steps=useMemo(()=>[
    {label:"The Metric Zoo",
     text:"RMSE, MAE, MAPE, Bias: each metric tells you something different about forecast quality. The important question before picking one is: what decision does this forecast feed into, and which kind of error hurts more?",
     viz:()=>(
       <TableBlock headers={["Metric","Formula","Best For","Pitfall"]}
         rows={[
           ["RMSE","√(mean(e²))","Large errors very costly","Unit-dependent, outlier-sensitive"],
           ["MAE","mean(|e|)","Equal error weighting","Unit-dependent, no outlier penalty"],
           ["MAPE","mean(|e/y|)×100%","Interpretable percentage","Undefined at zero demand"],
           ["Bias","mean(ŷ-y)","Systematic over/under-forecast","Hides RMSE/MAE"],
           ["WAPE","Σ|e|/Σy","Low-volume SKUs","Dominated by high-volume items"],
         ]}/>
     )},
    {label:"Data Leakage Demo",
     text:"The most common evaluation mistake in time series: random train/test splits. This lets the model 'see' future patterns during training, making test performance artificially good. Toggle between split types to see how much RMSE changes.",
     viz:({accent})=>(<LeakageDemo accent={accent}/>)},
    {label:"Backtesting Protocol",
     text:"Robust evaluation requires multiple backtesting windows, not a single split. Expanding window backtesting: fix origin, progressively extend training data, evaluate on next h periods. Report mean ± std RMSE — not a single point estimate.",
     viz:()=>(
       <div>
         <MathBlock>{`Expanding Window Cross-Validation:
  Window 1: train[1..52]   → test[53..56]
  Window 2: train[1..56]   → test[57..60]
  Window 3: train[1..60]   → test[61..64]
  ...
  Report: mean(RMSE) ± std(RMSE) across all windows

This is far more reliable than a single train/test split.
Use 5+ windows minimum for stable RMSE estimates.`}</MathBlock>
         <Callout icon="📊" color={col} title="Why Multiple Windows?">
           A single test split might land in an unusually easy or hard period. Multiple windows average out sampling variance and reveal whether your model is consistently good or got lucky.
         </Callout>
       </div>
     )},
    {label:"Evaluation Lab",
     text:"Adjust the train/test split and switch between metrics to see how evaluation choices affect the model ranking. Notice: the best model by RMSE is not always best by MAPE or Bias.",
     viz:({accent})=>(<EvaluationLab accent={accent}/>)},
  ],[]);

  return(
    <div>
      <SectionHero num="Chapter 5" title="Model Evaluation" subtitle="A model is only as good as its evaluation framework. This chapter covers metrics, the data leakage trap, backtesting protocol, and how to build evaluation that matches your business objective." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>5.1 Statistical Significance of RMSE Differences</SubHeader>
      <P>Is a 5% RMSE improvement meaningful? Use the Diebold-Mariano test to assess significance. With only 26 test observations, even a 15% RMSE difference may not be statistically significant at the 95% level.</P>
      <MathBlock>{`Diebold-Mariano Test:
  d_t = L(ê_{1,t}) - L(ê_{2,t})   # loss differential
  DM  = d̄ / sqrt(V̂(d̄) / T)      # t-statistic

  H0: E[d_t] = 0  (equal forecast accuracy)
  Under H0, DM ~ N(0,1) for large T

Bootstrap alternative (small samples):
  Resample test errors B=1000 times
  Compute RMSE_boot distribution → 95% CI`}</MathBlock>
      <SubHeader accent={col}>5.2 Interactive: Evaluation Lab</SubHeader>
      <VizCard accent={col}><EvaluationLab accent={col}/></VizCard>
      <FigCap num="5.1">Adjust split week and metric to explore how evaluation choices affect apparent model rankings.</FigCap>
      <SubHeader accent={col}>5.3 Interactive: Leakage Demo</SubHeader>
      <VizCard accent={col}><LeakageDemo accent={col}/></VizCard>
      <FigCap num="5.2">Toggle temporal vs. random splits to see how data leakage inflates apparent model performance.</FigCap>
      <KeyTakeaways accent={col} items={[
        "Choose metrics that align with business costs. RMSE when large errors are catastrophic; MAE for symmetric cost; profit-weighted metrics for asymmetric cost structures.",
        "Always use temporal splits for time-series evaluation. Random splits cause leakage — the model sees future demand during training.",
        "Report RMSE across 5+ backtesting windows (mean ± std), not a single split. One test period is too noisy for firm conclusions.",
        "The Diebold-Mariano test determines statistical significance of RMSE differences. Small test sets make even 15% improvements statistically uncertain.",
      ]}/>
    </div>
  );
}

/* ═════════════════ CHAPTER 6 ═════════════════ */
function Ch6(){
  const col=SC.s6;
  const [scenario,setScenario]=useState("base");
  const scDefs={base:{label:"Base",mult:1,color:col},up:{label:"Upside +20%",mult:1.2,color:C.green},dn:{label:"Downside -15%",mult:.85,color:C.red}};
  const scData=TEST.slice(0,16).map((d,i)=>{
    const f=HYB_PRED[i]?.forecast||0;
    return{week:d.week,actual:d.sales,base:f,up:Math.round(f*1.2),dn:Math.round(f*.85),forecast:Math.round(f*scDefs[scenario].mult)};
  });
  const steps=useMemo(()=>[
    {label:"Forecast Uncertainty",
     text:"Every point forecast comes with a cone of uncertainty that widens as the horizon extends. Showing that cone is what prevents stakeholders from treating a single number as a guarantee, and then blaming the model when reality lands somewhere else.",
     viz:()=>(
       <ResponsiveContainer width="100%" height={240}>
         <AreaChart data={scData}>
           <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
           <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
           <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
           <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
           <Legend wrapperStyle={{fontSize:10}}/>
           <Area type="monotone" dataKey="up" fill={`${C.green}15`} stroke={C.green} strokeWidth={1} strokeDasharray="4 2" name="Upside +20%"/>
           <Area type="monotone" dataKey="base" fill={`${col}15`} stroke={col} strokeWidth={2} name="Base Forecast"/>
           <Area type="monotone" dataKey="dn" fill={`${C.red}12`} stroke={C.red} strokeWidth={1} strokeDasharray="4 2" name="Downside -15%"/>
           <Line type="monotone" dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} name="Actual"/>
         </AreaChart>
       </ResponsiveContainer>
     )},
  {label:"Scenario Planning",
      text:"Present three scenarios — base, upside, downside — each corresponding to a plausible demand state. Decision-makers plan contingency inventory for each scenario. Toggle scenarios to see the demand range and plan buffer stock accordingly.",
      viz:()=>(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {Object.entries(scDefs).map(([k,v])=>(
              <button key={k} onClick={()=>setScenario(k)}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:`2px solid ${k===scenario?v.color:C.border}`,
                  background:k===scenario?`${v.color}20`:C.bgCard2,color:k===scenario?v.color:C.textDim,
                  cursor:"pointer",fontSize:12,fontWeight:k===scenario?700:400,transition:"all .2s"}}>
                {v.label}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={scData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
              <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
              <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
              <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Line type="monotone" dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} name="Actual"/>
              <Line type="monotone" dataKey="forecast" stroke={scDefs[scenario].color} strokeWidth={2.5} dot={false} name={scDefs[scenario].label}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )},
    {label:"Stakeholder Translation",
     text:"Different audiences need different framings. A CFO wants to know the revenue impact of a 10% demand miss. Operations wants units and lead times. Sales wants to know when to run promotions. The model output is the same; you're just translating it.",
     viz:()=>(
       <TableBlock headers={["Stakeholder","They Ask","You Answer"]}
         rows={[
           ["CFO","Revenue impact if demand drops 10%?","Downside scenario: $X revenue, -$Y margin"],
           ["Supply Chain","How much safety stock?","SS = z × σ × √LT (use Action Lab Ch.7)"],
           ["Sales","When to push promotions?","Weeks where forecast < prior year × 0.95"],
           ["Merchandising","Which SKUs need overrides?","SKUs where model MAPE > 30% over 4 weeks"],
         ]}/>
     )},
    {label:"Communicating Errors",
     text:"When forecasts miss (and they will), the way you talk about it matters. Be clear about the difference between normal statistical noise and systematic bias. Show error distributions, not just point errors.",
     viz:()=>(
       <div>
         <ResponsiveContainer width="100%" height={200}>
           <BarChart data={TEST.map((d,i)=>({week:d.week,error:d.sales-(HYB_PRED[i]?.forecast||0)})).slice(0,20)}>
             <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
             <XAxis dataKey="week" stroke={C.textMuted} tick={{fontSize:9}} label={{value:"Week",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:9}}/>
             <YAxis stroke={C.textMuted} tick={{fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+"k"} label={{value:"Units (k)",angle:-90,position:"insideLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
             <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:6}} formatter={v=>Number(v).toLocaleString()}/>
             <ReferenceLine y={0} stroke={C.textMuted}/>
             <Bar dataKey="error" fill={col} name="Forecast Error"/>
           </BarChart>
         </ResponsiveContainer>
         <P>A symmetric error distribution (mean ≈ 0) indicates no systematic bias. Asymmetric errors suggest bias requiring recalibration.</P>
       </div>
     )},
  ],[scenario]);

  return(
    <div>
      <SectionHero num="Chapter 6" title="Communicating Forecasts" subtitle="The best model is worthless if it's not trusted. Uncertainty communication, scenario planning, and stakeholder translation turn model output into organizational action." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>6.1 Prediction Intervals</SubHeader>
      <MathBlock>{`ETS Analytical Prediction Interval (95%):
  PI = ŷ_{t+h} ± 1.96 × σ_h
  where σ_h² = σ²_ε × h   (variance grows with horizon)

Conformal Prediction (model-agnostic):
  1. Compute residuals r_i on calibration set
  2. q = (1-α) quantile of |r_i|
  3. PI = [ŷ - q, ŷ + q]   (valid under exchangeability)`}</MathBlock>
      <KeyTakeaways accent={col} items={[
        "Always communicate uncertainty alongside point forecasts. A range signals honesty; a single number signals false precision.",
        "Scenario planning (base/upside/downside) is more actionable than statistical intervals for most business audiences.",
        "Translate model output for each stakeholder: RMSE means nothing to a CFO. Revenue impact, units, and service level do.",
        "Distinguish systematic bias (fixable) from statistical noise (expected). Transparent error communication builds long-term forecasting credibility.",
      ]}/>
    </div>
  );
}

/* ═════════════════ CHAPTER 7 ═════════════════ */

/* ── EOQ Explorer: interactive cost-curve chart ── */
function EOQExplorer({accent}){
  const col=accent||SC.s7;
  const [K,setK]=useState(200);
  const [h,setH]=useState(5);
  const D=50000;
  const eoq=useMemo(()=>Math.round(Math.sqrt(2*D*K/h)),[K,h]);
  const chartData=useMemo(()=>{
    const lo=Math.round(eoq*0.25);
    const hi=Math.round(eoq*2.6);
    return Array.from({length:36},(_,i)=>{
      const Q=Math.round(lo+i*(hi-lo)/35);
      return{Q,ordering:Math.round(D*K/Q),holding:Math.round(h*Q/2),total:Math.round(D*K/Q+h*Q/2)};
    });
  },[K,h,eoq]);
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={eoq.toLocaleString()+" u"} label="EOQ" sub={`K=$${K}, h=$${h}/u/yr`} color={col}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Slider label={`Order cost K = $${K}`} min={50} max={500} step={25} value={K} onChange={setK} accent={col}/>
        <Slider label={`Holding cost h = $${h}/u/yr`} min={1} max={20} step={1} value={h} onChange={setH} accent={col}/>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={chartData} margin={{top:8,right:8,bottom:20,left:0}}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.borderLight}/>
          <XAxis dataKey="Q" tickFormatter={v=>`${Math.round(v/1000)}k`} tick={{fill:C.textMuted,fontSize:9}} label={{value:"Order Quantity (Q, units)",position:"bottom",offset:-6,fill:C.textMuted,fontSize:9}}/>
          <YAxis tickFormatter={v=>`$${Math.round(v/1000)}k`} tick={{fill:C.textMuted,fontSize:9}} label={{value:"Annual Cost ($)",angle:-90,position:"insideBottomLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip formatter={(v,n)=>[`$${v.toLocaleString()}`,n]} contentStyle={{background:C.bgCard,border:`1px solid ${col}40`,borderRadius:8,fontSize:11}}/>
          <Legend wrapperStyle={{fontSize:10}}/>
          <ReferenceLine x={eoq} stroke={col} strokeWidth={2} strokeDasharray="4 3" label={{value:"EOQ",position:"insideTopRight",fill:col,fontSize:9}}/>
          <Line type="monotone" dataKey="ordering" stroke={C.orange} strokeWidth={1.5} dot={false} name="Ordering Cost (↓ with Q)"/>
          <Line type="monotone" dataKey="holding" stroke={C.purple} strokeWidth={1.5} dot={false} name="Holding Cost (↑ with Q)"/>
          <Line type="monotone" dataKey="total" stroke={col} strokeWidth={2.5} dot={false} name="Total Cost ★"/>
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{color:C.textMuted,fontSize:10,marginTop:4,textAlign:"center"}}>EOQ minimizes total cost where the two curves cross. Drag sliders to see how cost structure shifts the optimal order quantity.</div>
    </div>
  );
}

/* ── Safety Stock Sensitivity: how SS scales with lead time & service level ── */
function SafetyStockExplorer({accent}){
  const col=accent||SC.s7;
  const [lt,setLt]=useState(4);
  const sigma=useMemo(()=>Math.round(Math.sqrt(_.mean(TEST.map((d,i)=>Math.pow(d.sales-(HYB_PRED[i]?.forecast||0),2))))),[]);
  const SL_LEVELS=[
    {sl:"90%",z:1.28,color:C.textDim},
    {sl:"95%",z:1.65,color:col},
    {sl:"98%",z:2.05,color:C.orange},
    {sl:"99%",z:2.33,color:C.red},
  ];
  const chartData=useMemo(()=>Array.from({length:8},(_,i)=>{
    const l=i+1;
    const row={lt:l};
    SL_LEVELS.forEach(({sl,z})=>{row[sl]=Math.round(z*sigma*Math.sqrt(l));});
    return row;
  }),[sigma]);
  const activeSS=Math.round(1.65*sigma*Math.sqrt(lt));
  return(
    <div style={{position:"relative"}}>
      <ResultPop show={true} value={activeSS.toLocaleString()+" u"} label="Safety Stock" sub={`95% SL, LT=${lt}wk`} color={col}/>
      <Slider label={`Lead time = ${lt} weeks`} min={1} max={8} step={1} value={lt} onChange={setLt} accent={col}/>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{top:8,right:8,bottom:20,left:0}}>
          <CartesianGrid strokeDasharray="2 4" stroke={C.borderLight}/>
          <XAxis dataKey="lt" tickFormatter={v=>`${v}wk`} tick={{fill:C.textMuted,fontSize:9}} label={{value:"Lead Time (weeks)",position:"bottom",offset:-6,fill:C.textMuted,fontSize:9}}/>
          <YAxis tick={{fill:C.textMuted,fontSize:9}} label={{value:"Safety Stock (units)",angle:-90,position:"insideBottomLeft",offset:10,fill:C.textMuted,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${col}40`,borderRadius:8,fontSize:11}}/>
          <Legend wrapperStyle={{fontSize:10}}/>
          <ReferenceLine x={lt} stroke={col} strokeWidth={1.5} strokeDasharray="3 2"/>
          {SL_LEVELS.map(({sl,color,z})=>(
            <Line key={sl} type="monotone" dataKey={sl} stroke={color} strokeWidth={sl==="95%"?2.5:1.5} dot={false} name={sl} strokeDasharray={sl==="95%"?"none":"5 2"}/>
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{color:C.textMuted,fontSize:10,marginTop:4,textAlign:"center"}}>Safety stock grows as √(LT), not linearly. Doubling lead time from 4 to 8 weeks increases safety stock by only ~41%, not 100%.</div>
    </div>
  );
}

function Ch7(){
  const col=SC.s7;
  const steps=useMemo(()=>[
    {label:"The EOQ Problem",
     text:"Inventory management balances two opposing costs: ordering costs (fixed per order, so high when you order frequently) and holding costs (per unit per period, so high when you order a lot at once). The EOQ is the order quantity that minimises their sum. Drag the sliders to see how order cost and holding cost shape the optimal Q.",
     viz:({accent})=>(<EOQExplorer accent={accent}/>)},
    {label:"Safety Stock & Lead Time",
     text:"Safety stock protects against demand uncertainty during lead time. The formula is z × σ_demand × √(lead time). The √LT relationship matters: doubling lead time increases required safety stock by only 41%, not 100%. Use the chart to see how each service level responds to lead time changes.",
     viz:({accent})=>(<SafetyStockExplorer accent={accent}/>)},
    {label:"Profit-Driven Forecasting",
     text:"The Newsvendor problem shows that the optimal order quantity depends on the ratio of underage cost (stockout) to overage cost (overstock) — not just expected demand. A model minimising RMSE is not guaranteed to maximise profit.",
     viz:({accent})=>(<ProfitCalculator accent={accent}/>)},
    {label:"Man vs. Machine",
     text:"Analyst overrides are sometimes valuable — when promotions or regional events are known to the analyst but not in the data. But overrides often introduce bias (optimism, anchoring). Measure override accuracy systematically to decide when to trust human judgment.",
     viz:({accent})=>(<ActionLab accent={accent}/>)},
  ],[]);

  return(
    <div>
      <SectionHero num="Chapter 7" title="Inventory Decisions" subtitle="Forecasts only matter when they drive decisions. This chapter connects demand forecasting to inventory management — safety stock, the Newsvendor problem, and profit-optimal model selection." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>7.1 The Newsvendor Problem</SubHeader>
      <MathBlock>{`Newsvendor Optimal Quantity:
  Q* = F⁻¹(Cu / (Cu + Co))

  Cu = per-unit stockout (underage) cost
  Co = per-unit overstock (overage) cost
  F⁻¹ = inverse demand CDF

Example: Cu = $80, Co = $20
  Critical ratio = 80 / (80+20) = 0.80
  Q* = 80th percentile of demand distribution
  → Order above mean when stockout >> overstock`}</MathBlock>
      <SubHeader accent={col}>7.2 Service Level Reference</SubHeader>
      <TableBlock
        headers={["Service Level","z","Safety Stock","Interpretation"]}
        rows={[
          ["90%","1.28","1.28 × σ × √LT","9 in 10 cycles with no stockout"],
          ["95%","1.65","1.65 × σ × √LT","19 in 20 cycles — retail standard"],
          ["98%","2.05","2.05 × σ × √LT","49 in 50 cycles"],
          ["99%","2.33","2.33 × σ × √LT","99 in 100 cycles — high-cost items"],
        ]}
        caption="Table 7.1 — Service level z-scores and safety stock formulas (LT = lead time in periods)"/>
      <SubHeader accent={col}>7.3 Interactive: Profit Calculator</SubHeader>
      <VizCard accent={col}><ProfitCalculator accent={col}/></VizCard>
      <FigCap num="7.1">Set asymmetric stockout/overstock costs to discover which model maximises profit (not just RMSE).</FigCap>
      <SubHeader accent={col}>7.4 Interactive: Action Lab</SubHeader>
      <VizCard accent={col}><ActionLab accent={col}/></VizCard>
      <FigCap num="7.2">Calculate safety stock at different service levels and test analyst overrides against model baseline.</FigCap>
      <KeyTakeaways accent={col} items={[
        "Safety stock = z × σ_demand × √LT. The z value is determined by your target service level.",
        "The Newsvendor critical ratio Cu/(Cu+Co) determines the optimal stocking quantile. Stock above mean when stockout >> overstock.",
        "RMSE-optimal ≠ profit-optimal. Use the Profit Calculator to find the right model for your cost structure.",
        "Measure analyst override accuracy systematically. Unsystematic overrides usually hurt forecast accuracy despite feeling intuitively right.",
      ]}/>
    </div>
  );
}
/* ── n5.jsx — Ch8, ChRef, ChAppA, ChAppB, ChAI, CHAPTERS, App ── */

function Ch8(){
  const col=SC.s8;
  const steps=useMemo(()=>[
    {label:"The Forecasting Stack",
     text:"A production forecasting system has five layers: data ingestion and cleaning, feature engineering, model training, evaluation and monitoring, and decision integration. Most analysts spend most of their time on layer 3. The real leverage is usually in layers 1 and 5.",
     viz:()=>(
       <div>
         {[
           {n:"5. Decision Integration",d:"Safety stock → replenishment → purchase orders",c:SC.s8},
           {n:"4. Evaluation & Monitoring",d:"RMSE tracking, drift detection, champion-challenger",c:SC.s7},
           {n:"3. Model Training & Selection",d:"ETS, XGBoost, Hybrid — backtesting, tuning",c:SC.s5},
           {n:"2. Feature Engineering",d:"Lags, rolling stats, calendar, promotions",c:SC.s3},
           {n:"1. Data Ingestion & Cleaning",d:"ERP, POS — outlier detection, imputation",c:SC.s1},
         ].map((l,i)=>(
           <div key={i} style={{background:`${l.c}12`,border:`1px solid ${l.c}35`,borderRadius:6,padding:"11px 16px",marginBottom:5,borderLeft:`3px solid ${l.c}`}}>
             <div style={{color:l.c,fontSize:12,fontWeight:700}}>{l.n}</div>
             <div style={{color:C.textDim,fontSize:12,marginTop:2}}>{l.d}</div>
           </div>
         ))}
       </div>
     )},
    {label:"Model Governance",
     text:"Forecasting models degrade over time as demand patterns shift (concept drift). Monitor RMSE weekly, alert on >20% degradation, retrain quarterly or when drift is detected. Champion-challenger testing ensures the production model is always the best available.",
     viz:()=>(
       <Callout icon="📊" color={col} title="Model Monitoring Checklist">
         <div style={{lineHeight:2.1}}>
           <div>☐ Weekly RMSE vs. rolling 13-week baseline — alert if +20%</div>
           <div>☐ Bias check: mean error stable near zero?</div>
           <div>☐ PI coverage: are 95% intervals covering 95% of actuals?</div>
           <div>☐ Feature drift: have lag/calendar distributions shifted?</div>
           <div>☐ Challenger model: is a fresh retrain performing better?</div>
           <div>☐ Quarterly full retrain with updated hyperparameter search</div>
         </div>
       </Callout>
     )},
    {label:"Forecast Cadence",
     text:"Match forecast frequency to decision frequency — not to data availability. Replenishment orders: weekly. Capacity planning: monthly. Financial budgets: quarterly. Building a weekly model when the key decisions are monthly wastes compute and creates false precision.",
     viz:()=>(
       <TableBlock headers={["Cadence","Horizon","Decision","Owner"]}
         rows={[
           ["Weekly","4–8 weeks","Replenishment & safety stock","Supply chain planner"],
           ["Monthly","3–6 months","Capacity & workforce planning","Operations manager"],
           ["Quarterly","12–18 months","Supplier contracts","Procurement lead"],
           ["Annual","2–3 years","Capital & DC network","VP Supply Chain"],
         ]}/>
     )},
    {label:"Building Credibility",
     text:"Forecast credibility builds slowly and erodes quickly. Three practices that build it: (1) always present confidence intervals, not just point forecasts; (2) document assumptions explicitly; (3) conduct blame-free forecast reviews where actual vs. forecast is examined to learn, not to attribute fault.",
     viz:()=>(
       <div>
         <Quote source="Tetlock & Gardner, Superforecasting (2015)">The value of keeping score is not to embarrass forecasters but to identify those whose methods are worth emulating.</Quote>
         <DR>Post-mortems on large forecast errors are the highest-ROI investment in forecast quality improvement. Was the gap caused by a model failure, data failure, or a genuinely unforecastable external shock?</DR>
       </div>
     )},
  ],[]);

  return(
    <div>
      <SectionHero num="Chapter 8" title="Forecast Process Design" subtitle="Winning organizations don't just have good models — they have good forecasting processes. This chapter covers the production stack, governance, cadence design, and building analyst credibility." accent={col}/>
      <ScrollySection steps={steps} accent={col}/>
      <SubHeader accent={col}>8.1 Minimal Production Pipeline</SubHeader>
      <MathBlock>{`# Python pseudocode — minimal production pipeline

def weekly_forecast_pipeline():
  # Layer 1: Extract + clean
  data = extract_sales(start_date, end_date, sku_list)
  data = clean_outliers(data, threshold=3)
  data = impute_stockouts(data, method='seasonal_mean')

  # Layer 2: Feature engineering
  data = engineer_features(data,
    lags=[1, 4, 52], rolling=[4, 8, 13], calendar=True)

  # Layer 3: Train hybrid model
  ets_model  = fit_ets(data.train, seasonal='mul')
  residuals  = data.train.sales - ets_model.fittedvalues
  xgb_model  = fit_xgb(features, residuals,
    n_estimators=500, max_depth=5, learning_rate=0.05)

  # Layer 4: Evaluate
  metrics = evaluate(forecast, actuals,
    metrics=['RMSE', 'MAE', 'Bias'], windows=5)

  # Layer 5: Integrate into decisions
  safety_stock = compute_ss(forecast, z=1.65, lead_time=4)
  replenishment_orders = generate_orders(forecast, safety_stock)
  return replenishment_orders, metrics`}</MathBlock>
      <SubHeader accent={col}>8.2 Common Pitfalls Reference</SubHeader>
      <TableBlock
        headers={["Pitfall","Symptom","Fix"]}
        rows={[
          ["Data leakage","Test RMSE << production RMSE","Temporal splits, expanding-window CV"],
          ["Overfit XGBoost","Low train, high test RMSE","Reduce depth, increase regularization, early stopping"],
          ["Missing seasonality","Large systematic seasonal errors","Add lag-52, is_holiday, week_of_year features"],
          ["Single split evaluation","High variance RMSE","5+ backtesting windows, report CI"],
          ["No bias monitoring","Model over-forecasts all year","Monitor mean error weekly"],
          ["Stale model","RMSE drifts upward over months","Monthly retrain trigger or drift alert"],
        ]}
        caption="Table 8.1 — Common forecasting pitfalls and fixes"/>
      <KeyTakeaways accent={col} items={[
        "Over-invest in data quality (layer 1) and decision integration (layer 5). Under-investment there makes excellent modelling (layer 3) irrelevant.",
        "Model governance — weekly RMSE monitoring, drift detection, quarterly retraining — keeps production models healthy. Without it, even great models degrade silently.",
        "Match forecast cadence to decision cadence. A weekly model for monthly decisions creates false precision and wasted compute.",
        "Analyst credibility comes from honest uncertainty communication, documented assumptions, and blame-free forecast reviews. It is the bridge between model output and business action.",
      ]}/>
    </div>
  );
}

function ChRef(){
  const col=SC.ref;
  return(
    <div>
      <SectionHero num="References" title="Bibliography" subtitle="Key academic and practitioner sources underpinning this guide." accent={col}/>
      <SubHeader accent={col}>Academic References</SubHeader>
      <P>Box, G. E. P., & Jenkins, G. M. (1970). <em>Time Series Analysis: Forecasting and Control</em>. Holden-Day.</P>
      <P>Hyndman, R. J., & Athanasopoulos, G. (2021). <em>Forecasting: Principles and Practice</em> (3rd ed.). OTexts. https://otexts.com/fpp3/</P>
      <P>Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). M5 accuracy competition. <em>International Journal of Forecasting</em>, 38(4), 1346–1364.</P>
      <P>Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. <em>KDD 2016</em>, 785–794.</P>
      <P>Petropoulos, F., et al. (2022). Forecasting: theory and practice. <em>International Journal of Forecasting</em>, 38(3), 705–871.</P>
      <P>Diebold, F. X., & Mariano, R. S. (1995). Comparing predictive accuracy. <em>Journal of Business & Economic Statistics</em>, 13(3), 253–263.</P>
      <P>Tetlock, P. E., & Gardner, D. (2015). <em>Superforecasting</em>. Crown Publishers.</P>
      <SubHeader accent={col}>Streamlit Applications</SubHeader>
      <AppLink url="https://cp194-forecast-demo.streamlit.app" label="App A: Model Comparison Dashboard" desc="Live RMSE metrics comparing ETS, XGBoost, and Hybrid on retail data."/>
      <AppLink url="https://cp194-inventory-optimizer.streamlit.app" label="App B: Inventory Optimization" desc="Safety stock, reorder point, and service-level trade-off simulator."/>
      <AppLink url="https://cp194-forecast-explainer.streamlit.app" label="App C: Forecast Explainer (SHAP)" desc="Feature importance visualizations for individual forecasts."/>
    </div>
  );
}

function ChAppA(){
  const col=SC.appA;
  return(
    <div>
      <SectionHero num="Appendix A" title="Python Code Reference" subtitle="Production-ready snippets for all models and workflows in this guide." accent={col}/>
      <SubHeader accent={col}>A.1 Feature Engineering</SubHeader>
      <MathBlock>{`def prepare_features(df, lags=[1,4,13,26,52]):
    df = df.copy().sort_values('date')
    for lag in lags:
        df[f'sales_lag_{lag}'] = df['sales'].shift(lag)
    df['rolling_mean_4']  = df['sales'].shift(1).rolling(4).mean()
    df['rolling_std_8']   = df['sales'].shift(1).rolling(8).std()
    df['week_of_year']    = df['date'].dt.isocalendar().week
    df['month']           = df['date'].dt.month
    df['is_holiday']      = df['date'].isin(holidays).astype(int)
    return df.dropna()`}</MathBlock>
      <SubHeader accent={col}>A.2 ETS (statsmodels)</SubHeader>
      <MathBlock>{`from statsmodels.tsa.holtwinters import ExponentialSmoothing

model = ExponentialSmoothing(
    train['sales'],
    trend='add',
    seasonal='mul',
    seasonal_periods=52,
    initialization_method='estimated'
).fit(optimized=True)
forecast = model.forecast(26)   # 26-week horizon`}</MathBlock>
      <SubHeader accent={col}>A.3 Hybrid ETS + XGBoost</SubHeader>
      <MathBlock>{`import xgboost as xgb

def fit_hybrid(train_df, horizon=26, feature_cols):
    # Step 1: ETS baseline
    ets = fit_ets(train_df['sales'])
    train_df['residual'] = train_df['sales'] - ets.fittedvalues

    # Step 2: XGBoost on residuals
    xgb_model = xgb.XGBRegressor(
        n_estimators=500, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.7,
        reg_lambda=1.0, early_stopping_rounds=50
    ).fit(
        train_df[feature_cols], train_df['residual'],
        eval_set=[(val[feature_cols], val['residual'])],
        verbose=False
    )
    return ets, xgb_model`}</MathBlock>
      <SubHeader accent={col}>A.4 Expanding Window Backtesting</SubHeader>
      <MathBlock>{`def expanding_window_cv(df, initial=78, step=4, horizon=4):
    rmse_list = []
    for start in range(initial, len(df)-horizon, step):
        train = df.iloc[:start]
        test  = df.iloc[start:start+horizon]
        ets, xgb, feats = fit_hybrid(train)
        ets_fc  = ets.forecast(horizon)
        xgb_fc  = xgb.predict(make_future_features(train, horizon))
        forecast = ets_fc.values + xgb_fc
        rmse = np.sqrt(((test['sales'].values - forecast)**2).mean())
        rmse_list.append(rmse)
    return {
        'mean_rmse': np.mean(rmse_list),
        'std_rmse':  np.std(rmse_list),
        'n_windows': len(rmse_list)
    }`}</MathBlock>
    </div>
  );
}

function ChAppB(){
  const col=SC.appB;
  return(
    <div>
      <SectionHero num="Appendix B" title="Mathematical Appendix" subtitle="Formal derivations and statistical foundations for the models and metrics in this guide." accent={col}/>
      <SubHeader accent={col}>B.1 ETS State-Space (M,A,M)</SubHeader>
      <MathBlock>{`Measurement:  y_t = (l_{t-1} + b_{t-1}) × s_{t-m} × (1 + ε_t)
Level:        l_t = α·(y_t/s_{t-m}) + (1-α)·(l_{t-1}+b_{t-1})
Trend:        b_t = β*(l_t-l_{t-1}) + (1-β*)·b_{t-1}
Seasonal:     s_t = γ·(y_t/l_t) + (1-γ)·s_{t-m}

  ε_t ~ NID(0,σ²)
  α∈(0,1), β*∈(0,1), γ∈(0,1-α), m=52`}</MathBlock>
      <SubHeader accent={col}>B.2 XGBoost: Gradient and Hessian</SubHeader>
      <MathBlock>{`Taylor approximation of objective at round t:
  L^(t) ≈ Σ_i [g_i·f_t(x_i) + ½h_i·f_t²(x_i)] + Ω(f_t)

  g_i = ∂L/∂ŷ_i^(t-1)    (first derivative — gradient)
  h_i = ∂²L/∂ŷ_i^(t-1)²  (second derivative — Hessian)

For squared loss L = (y-ŷ)²/2:
  g_i = ŷ_i - y_i    (residual)
  h_i = 1             (constant Hessian)

Optimal leaf weight:
  w_j* = -G_j / (H_j + λ)   where G_j = Σg, H_j = Σh over leaf j`}</MathBlock>
      <SubHeader accent={col}>B.3 Newsvendor Derivation</SubHeader>
      <MathBlock>{`Expected profit:
  E[Π(Q)] = Cu·E[max(D-Q,0)] - Co·E[max(Q-D,0)]

FOC: dE[Π]/dQ = 0
  Cu·(1-F(Q)) - Co·F(Q) = 0
  F(Q*) = Cu / (Cu + Co)     ← critical ratio

Q* = F⁻¹(Cu/(Cu+Co)) = demand quantile at critical ratio

Example: Cu=$80, Co=$20
  critical ratio = 0.80
  Q* = 80th percentile of demand`}</MathBlock>
      <SubHeader accent={col}>B.4 Winkler Score (Interval Calibration)</SubHeader>
      <MathBlock>{`Winkler Score for (1-α)×100% prediction interval:
  WS_t = (u_t - l_t)
       + (2/α)·(l_t - y_t)·𝟙[y_t < l_t]
       + (2/α)·(y_t - u_t)·𝟙[y_t > u_t]

Lower average WS = better calibrated interval.
Penalises both over-width (imprecise) and under-coverage (wrong).`}</MathBlock>
    </div>
  );
}

function ChAI(){
  const col=SC.ai;
  return(
    <div>
      <SectionHero num="AI Tutor" title="Demand Forecasting Tutor" subtitle="Ask anything about this guide — ETS, XGBoost, evaluation metrics, safety stock, data leakage. Challenge questions below test each chapter's key concept." accent={col}/>
      <P>The tutor uses keyword matching across a curated knowledge base covering all chapters. For best results, ask specific questions rather than broad topics (e.g. "What is α in ETS?" not "tell me about forecasting").</P>
      <VizCard accent={col} minH={420}><ChatBot accent={col}/></VizCard>
      <SubHeader accent={col}>Chapter Challenge Questions</SubHeader>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
        {[
          {ch:"Ch 1",q:"If stockout costs are 4× overstock costs, which model should you choose — the one with lowest RMSE or highest profit?"},
          {ch:"Ch 2",q:"Your lag-52 feature has very high importance in XGBoost. What does this tell you about the demand series?"},
          {ch:"Ch 3",q:"Why does high α in ETS cause more volatile forecasts? What trade-off does this introduce?"},
          {ch:"Ch 4",q:"Explain why the hybrid ETS+XGB model chains the two models rather than averaging them."},
          {ch:"Ch 5",q:"Your model achieves RMSE of 5,200 on temporal split but 2,100 on random split. What happened?"},
          {ch:"Ch 6",q:"A CFO asks: 'How confident are you in next quarter's forecast?' How do you answer?"},
          {ch:"Ch 7",q:"Lead time doubles from 4 to 8 weeks. By how much does safety stock change, assuming σ stays constant?"},
          {ch:"Ch 8",q:"Your model's RMSE increased 30% this month vs. last month's average. What do you check first?"},
        ].map((item,i)=>(
          <div key={i} style={{background:C.bgCard2,border:`1px solid ${col}28`,borderRadius:8,padding:"14px 16px"}}>
            <div style={{color:col,fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:5}}>{item.ch}</div>
            <div style={{color:C.text,fontSize:12.5,lineHeight:1.65}}>{item.q}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   CHAPTERS REGISTRY
══════════════════════════════════════ */
const CHAPTERS=[
  {id:"home",  label:"Home",    short:"Home",  color:SC.home,  component:ChHome},
  {id:"ch1",   label:"Ch 1 — Why Forecasting", short:"Ch 1",  color:SC.s1,  component:Ch1},
  {id:"ch2",   label:"Ch 2 — Data Literacy",   short:"Ch 2",  color:SC.s2,  component:Ch2},
  {id:"ch3",   label:"Ch 3 — Baselines",        short:"Ch 3",  color:SC.s3,  component:Ch3},
  {id:"ch4",   label:"Ch 4 — Advanced ML",      short:"Ch 4",  color:SC.s4,  component:Ch4},
  {id:"ch5",   label:"Ch 5 — Evaluation",       short:"Ch 5",  color:SC.s5,  component:Ch5},
  {id:"ch6",   label:"Ch 6 — Communication",    short:"Ch 6",  color:SC.s6,  component:Ch6},
  {id:"ch7",   label:"Ch 7 — Inventory",        short:"Ch 7",  color:SC.s7,  component:Ch7},
  {id:"ch8",   label:"Ch 8 — Process",          short:"Ch 8",  color:SC.s8,  component:Ch8},
  {id:"ref",   label:"References",              short:"Refs",  color:SC.ref, component:ChRef},
  {id:"appa",  label:"Appendix A — Code",       short:"App A", color:SC.appA,component:ChAppA},
  {id:"appb",  label:"Appendix B — Math",       short:"App B", color:SC.appB,component:ChAppB},
  {id:"ai",    label:"AI Tutor",                short:"Tutor", color:SC.ai,  component:ChAI},
];

/* ══════════════════════════════════════
   APP — top nav + progress bar + bottom prev/next
══════════════════════════════════════ */
export default function App(){
  const [chIdx,setChIdx]=useState(0);
  const ch=CHAPTERS[chIdx];
  const ChComp=ch.component;
  const prev=()=>setChIdx(i=>Math.max(0,i-1));
  const next=()=>setChIdx(i=>Math.min(CHAPTERS.length-1,i+1));

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif",color:C.text}}>
      {/* Inject global CSS animations */}
      <style>{GLOBAL_CSS}</style>

      {/* ── TOP NAV ── */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:`${C.bg}F2`,backdropFilter:"blur(14px)",borderBottom:`1px solid ${C.border}`}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",alignItems:"center",gap:0,height:50,padding:"0 16px"}}>
          {/* Logo / title */}
          <div style={{flexShrink:0,marginRight:16}}>
            <span style={{color:SC.home,fontWeight:900,fontSize:13,letterSpacing:.3}}>F→D</span>
          </div>
          {/* Scrollable chapter pills */}
          <div style={{flex:1,overflowX:"auto",display:"flex",gap:4,scrollbarWidth:"none",msOverflowStyle:"none",alignItems:"center"}}>
            {CHAPTERS.map((c,i)=>(
              <button key={c.id} onClick={()=>setChIdx(i)}
                style={{flexShrink:0,padding:"5px 11px",borderRadius:20,
                  border:`1.5px solid ${i===chIdx?c.color:C.borderLight}`,
                  background:i===chIdx?`${c.color}22`:C.bgCard,
                  color:i===chIdx?c.color:C.textDim,cursor:"pointer",
                  fontSize:11,fontWeight:i===chIdx?700:400,whiteSpace:"nowrap",transition:"all .2s"}}>
                {c.short}
              </button>
            ))}
          </div>
          {/* Prev/Next */}
          <div style={{display:"flex",gap:5,marginLeft:14,flexShrink:0}}>
            <button onClick={prev} disabled={chIdx===0}
              style={{padding:"5px 11px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bgCard,color:chIdx===0?C.textMuted:C.text,cursor:chIdx===0?"not-allowed":"pointer",fontSize:11}}>
              ←
            </button>
            <button onClick={next} disabled={chIdx===CHAPTERS.length-1}
              style={{padding:"5px 14px",borderRadius:8,border:`1.5px solid ${chIdx===CHAPTERS.length-1?C.border:ch.color}`,background:chIdx===CHAPTERS.length-1?C.bgCard:`${ch.color}22`,color:chIdx===CHAPTERS.length-1?C.textMuted:ch.color,cursor:chIdx===CHAPTERS.length-1?"not-allowed":"pointer",fontSize:11,fontWeight:600}}>
              →
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{height:2,background:C.borderLight}}>
          <div style={{height:2,background:ch.color,width:`${((chIdx+1)/CHAPTERS.length)*100}%`,transition:"width .5s ease"}}/>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main key={chIdx} style={{maxWidth:1360,margin:"0 auto",padding:"30px 36px 100px",animation:"fadeUp .35s ease"}}>
        <ChComp/>
      </main>

      {/* ── BOTTOM BAR ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:`${C.bg}F5`,backdropFilter:"blur(10px)",borderTop:`1px solid ${C.border}`,padding:"11px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",zIndex:90}}>
        <button onClick={prev} disabled={chIdx===0}
          style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bgCard,color:chIdx===0?C.textMuted:C.text,cursor:chIdx===0?"not-allowed":"pointer",fontSize:12}}>
          {chIdx>0?`← ${CHAPTERS[chIdx-1].short}`:"Start"}
        </button>
        <div style={{textAlign:"center"}}>
          <div style={{color:ch.color,fontSize:12,fontWeight:700}}>{ch.short}</div>
          <div style={{color:C.textMuted,fontSize:10}}>{chIdx+1} / {CHAPTERS.length}</div>
        </div>
        <button onClick={next} disabled={chIdx===CHAPTERS.length-1}
          style={{padding:"8px 18px",borderRadius:8,border:`1.5px solid ${chIdx===CHAPTERS.length-1?C.border:ch.color}`,background:chIdx===CHAPTERS.length-1?C.bgCard:`${ch.color}22`,color:chIdx===CHAPTERS.length-1?C.textMuted:ch.color,cursor:chIdx===CHAPTERS.length-1?"not-allowed":"pointer",fontSize:12,fontWeight:600}}>
          {chIdx<CHAPTERS.length-1?`${CHAPTERS[chIdx+1].short} →`:"End"}
        </button>
      </div>
    </div>
  );
}
