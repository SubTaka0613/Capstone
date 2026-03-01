import { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area, ComposedChart, ReferenceLine } from "recharts";
import _ from "lodash";
import * as d3 from "d3";

const C = { bg:"#0D1117",bgCard:"#161B22",bgCard2:"#1C2333",accent:"#58A6FF",accentGlow:"rgba(88,166,255,0.12)",accentDim:"#1F3A5F",orange:"#F0883E",green:"#3FB950",red:"#F85149",purple:"#BC8CFF",yellow:"#D29922",pink:"#F778BA",text:"#E6EDF3",textDim:"#8B949E",textMuted:"#484F58",border:"#30363D",borderLight:"#21262D" };

function ResidualHeatmap({ rows, title = "Residual Evidence Board" }) {
  // rows: [{ week, year, residual, actual, forecast }]
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);

  const W = 720;
  const H = 240;
  const padLeft = 44;
  const padTop = 18;
  const padBottom = 30;
  const padRight = 16;

  const { weeks, years, x, y, color, maxAbs } = useMemo(() => {
    const weeksU = Array.from(new Set(rows.map(r => r.week))).sort((a, b) => a - b);
    const yearsU = Array.from(new Set(rows.map(r => r.year))).sort((a, b) => a - b);

    const xScale = d3
      .scaleBand()
      .domain(weeksU)
      .range([padLeft, W - padRight])
      .padding(0.08);

    const yScale = d3
      .scaleBand()
      .domain(yearsU)
      .range([padTop, H - padBottom])
      .padding(0.18);

    const ext = d3.extent(rows, r => r.residual);
    const maxA = Math.max(Math.abs(ext[0] ?? 0), Math.abs(ext[1] ?? 0)) || 1;

    // Diverging: negative residual (under-forecast) vs positive (over-forecast)
    const c = d3
      .scaleDiverging()
      .domain([-maxA, 0, maxA])
      .interpolator(d3.interpolateRdBu);

    return { weeks: weeksU, years: yearsU, x: xScale, y: yScale, color: c, maxAbs: maxA };
  }, [rows]);

  const info = selected || hover;

  const axisTicks = useMemo(() => {
    // show ~12 ticks for weeks for readability
    const n = weeks.length;
    const target = 12;
    const step = Math.max(1, Math.round(n / target));
    return weeks.filter((_, i) => i % step === 0);
  }, [weeks]);

function ResidualExplorerD3({ data, height = 260 }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    if (!data || data.length === 0) return;

    // Clean container
    wrapRef.current.innerHTML = "";

    // Layout
    const margin = { top: 14, right: 18, bottom: 34, left: 52 };
    const width = wrapRef.current.clientWidth || 700;
    const innerW = Math.max(200, width - margin.left - margin.right);
    const innerH = Math.max(160, height - margin.top - margin.bottom);

    // Create SVG
    const svg = d3
      .select(wrapRef.current)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("display", "block");

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3
      .scaleBand()
      .domain(data.map(d => d.week))
      .range([0, innerW])
      .padding(0.18);

    const yMax = d3.max(data, d => Math.max(Math.abs(d.residual ?? 0), Math.abs(d.xgb_residual ?? 0))) || 1;
    const y = d3
      .scaleLinear()
      .domain([-yMax * 1.1, yMax * 1.1])
      .range([innerH, 0])
      .nice();

    // Axes
    const xAxis = (sel) =>
      sel
        .attr("transform", `translate(0,${innerH})`)
        .call(
          d3.axisBottom(x)
            .tickValues(data.filter((_, i) => i % Math.ceil(data.length / 8) === 0).map(d => d.week))
            .tickFormat(d => `W${d}`)
        )
        .call(s => s.selectAll("text").attr("fill", C.textDim).attr("font-size", 11))
        .call(s => s.selectAll("path,line").attr("stroke", C.border));

    const yAxis = (sel) =>
      sel
        .call(d3.axisLeft(y).ticks(5).tickFormat(v => `${Math.round(v / 1000)}k`))
        .call(s => s.selectAll("text").attr("fill", C.textDim).attr("font-size", 11))
        .call(s => s.selectAll("path,line").attr("stroke", C.border));

    g.append("g").call(yAxis);
    g.append("g").call(xAxis);

    // Gridlines
    g.append("g")
      .attr("opacity", 0.7)
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat("")
      )
      .call(s => s.selectAll("line").attr("stroke", C.borderLight))
      .call(s => s.selectAll("path").remove());

    // Zero line
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", C.border)
      .attr("stroke-width", 2);

    // Tooltip
    const tip = d3
      .select(wrapRef.current)
      .append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("background", C.bgCard)
      .style("border", `1px solid ${C.border}`)
      .style("border-radius", "10px")
      .style("padding", "10px 12px")
      .style("color", C.text)
      .style("font-size", "12px")
      .style("line-height", "1.5");

    d3.select(wrapRef.current).style("position", "relative");

    const fmt = (v) => (v == null ? "—" : v.toLocaleString());

    function showTip(event, d) {
      tip
        .style("opacity", 1)
        .html(
          `<div style="color:${C.textDim};font-size:11px;margin-bottom:4px;">Week ${d.week}</div>
           <div><span style="color:${C.red};font-weight:700;">ETS residual</span>: ${fmt(d.residual)}</div>
           <div><span style="color:${C.orange};font-weight:700;">XGB residual</span>: ${fmt(d.xgb_residual)}</div>`
        );

      const [mx, my] = d3.pointer(event, wrapRef.current);
      tip.style("left", `${mx + 12}px`).style("top", `${my + 12}px`);
    }

    function moveTip(event) {
      const [mx, my] = d3.pointer(event, wrapRef.current);
      tip.style("left", `${mx + 12}px`).style("top", `${my + 12}px`);
    }

    function hideTip() {
      tip.style("opacity", 0);
    }

    // Bars (ETS residual)
    const bars = g.append("g");
    bars
      .selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", d => x(d.week))
      .attr("width", x.bandwidth())
      .attr("y", d => y(Math.max(0, d.residual ?? 0)))
      .attr("height", d => Math.abs(y(d.residual ?? 0) - y(0)))
      .attr("fill", C.red)
      .attr("opacity", 0.50)
      .on("mousemove", showTip)
      .on("mouseenter", showTip)
      .on("mouseleave", hideTip);

    // Line (XGB residual)
    const line = d3
      .line()
      .x(d => (x(d.week) ?? 0) + x.bandwidth() / 2)
      .y(d => y(d.xgb_residual ?? 0))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", C.orange)
      .attr("stroke-width", 2.5)
      .attr("d", line);

    // Points for better hover targeting
    g.append("g")
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", d => (x(d.week) ?? 0) + x.bandwidth() / 2)
      .attr("cy", d => y(d.xgb_residual ?? 0))
      .attr("r", 3)
      .attr("fill", C.orange)
      .attr("opacity", 0.85)
      .on("mousemove", showTip)
      .on("mouseenter", showTip)
      .on("mouseleave", hideTip);

    // Brush for zoom selection
    const brush = d3
      .brushX()
      .extent([[0, 0], [innerW, innerH]])
      .on("end", (event) => {
        const sel = event.selection;
        if (!sel) return;

        // Convert pixel selection -> week range (roughly via band centers)
        const [x0, x1] = sel;
        const weeks = data.map(d => {
          const cx = (x(d.week) ?? 0) + x.bandwidth() / 2;
          return { week: d.week, cx };
        });

        const chosen = weeks.filter(w => w.cx >= x0 && w.cx <= x1).map(w => w.week);
        if (chosen.length < 2) return;

        const [minW, maxW] = [d3.min(chosen), d3.max(chosen)];

        // Filter + redraw by resetting domains (simple zoom)
        const zoomed = data.filter(d => d.week >= minW && d.week <= maxW);
        x.domain(zoomed.map(d => d.week));

        // Clear plot area + redraw primitives (fast and simple)
        g.selectAll(".plot-layer").remove();

        const layer = g.append("g").attr("class", "plot-layer");

        layer.append("line")
          .attr("x1", 0).attr("x2", innerW)
          .attr("y1", y(0)).attr("y2", y(0))
          .attr("stroke", C.border).attr("stroke-width", 2);

        layer.append("g")
          .selectAll("rect")
          .data(zoomed)
          .enter()
          .append("rect")
          .attr("x", d => x(d.week))
          .attr("width", x.bandwidth())
          .attr("y", d => y(Math.max(0, d.residual ?? 0)))
          .attr("height", d => Math.abs(y(d.residual ?? 0) - y(0)))
          .attr("fill", C.red)
          .attr("opacity", 0.50)
          .on("mousemove", showTip)
          .on("mouseenter", showTip)
          .on("mouseleave", hideTip);

        const line2 = d3
          .line()
          .x(d => (x(d.week) ?? 0) + x.bandwidth() / 2)
          .y(d => y(d.xgb_residual ?? 0))
          .curve(d3.curveMonotoneX);

        layer.append("path")
          .datum(zoomed)
          .attr("fill", "none")
          .attr("stroke", C.orange)
          .attr("stroke-width", 2.5)
          .attr("d", line2);

        layer.append("g")
          .selectAll("circle")
          .data(zoomed)
          .enter()
          .append("circle")
          .attr("cx", d => (x(d.week) ?? 0) + x.bandwidth() / 2)
          .attr("cy", d => y(d.xgb_residual ?? 0))
          .attr("r", 3)
          .attr("fill", C.orange)
          .attr("opacity", 0.85)
          .on("mousemove", showTip)
          .on("mouseenter", showTip)
          .on("mouseleave", hideTip);

        // Update x-axis
        g.selectAll(".x-axis").remove();
        g.append("g").attr("class", "x-axis").call(xAxis);

        // Clear brush selection
        g.selectAll(".brush").call(brush.move, null);
      });

    g.append("g").attr("class", "brush").call(brush);

    // Mark x-axis group class for updates
    g.selectAll("g")
      .filter(function () { return d3.select(this).attr("transform") === `translate(0,${innerH})`; })
      .classed("x-axis", true);

    // Cleanup on unmount
    return () => {
      try { tip.remove(); } catch {}
    };
  }, [data, height]);

  return (
    <div style={{ width: "100%" }}>
      <div ref={wrapRef} style={{ width: "100%" }} />
      <div style={{ marginTop: 8, color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>
        Tip: drag across the chart to zoom into a week range. Hover to see residual values.
      </div>
    </div>
  );
}

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr", gap: 12 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{title}</div>
          <div style={{ color: C.textDim, fontSize: 12 }}>
            {info
              ? `Week ${info.week} (Year ${info.year}) · residual ${Math.round(info.residual).toLocaleString()}`
              : `Hover a cell · scale ±${Math.round(maxAbs).toLocaleString()}`}
          </div>
        </div>

        <svg width={W} height={H} style={{ width: "100%", height: "auto", display: "block" }}>
          {/* cells */}
          {rows.map((r, i) => (
            <rect
              key={i}
              x={x(r.week)}
              y={y(r.year)}
              width={x.bandwidth()}
              height={y.bandwidth()}
              rx={5}
              fill={color(r.residual)}
              opacity={selected && selected.week === r.week && selected.year === r.year ? 1 : 0.9}
              stroke={selected && selected.week === r.week && selected.year === r.year ? C.accent : "transparent"}
              strokeWidth={2}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSelected(r)}
              style={{ cursor: "pointer" }}
            />
          ))}

          {/* x tick labels */}
          {axisTicks.map(wk => (
            <text
              key={wk}
              x={(x(wk) ?? 0) + x.bandwidth() / 2}
              y={H - 10}
              textAnchor="middle"
              fill={C.textMuted}
              fontSize="10"
              style={{ fontFamily: "monospace" }}
            >
              {wk}
            </text>
          ))}

          {/* y labels */}
          {years.map(yr => (
            <text
              key={yr}
              x={padLeft - 10}
              y={(y(yr) ?? 0) + y.bandwidth() / 2 + 4}
              textAnchor="end"
              fill={C.textDim}
              fontSize="11"
              style={{ fontFamily: "monospace" }}
            >
              Y{yr}
            </text>
          ))}

          {/* axis captions */}
          <text x={padLeft} y={12} fill={C.textMuted} fontSize="10">
            Click a “suspicious” week to open the case file →
          </text>
        </svg>

        <div style={{ marginTop: 10, fontSize: 12.5, color: C.textDim, lineHeight: 1.6 }}>
          <span style={{ color: C.accent, fontWeight: 700 }}>Blue</span> = under-forecast (stockout risk).{" "}
          <span style={{ color: C.orange, fontWeight: 700 }}>Red</span> = over-forecast (waste risk).{" "}
          This is designed to trigger investigation, not blind correction.
        </div>
      </div>

      {/* Case File panel */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: C.accent, fontWeight: 800, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Case File
          </div>
          <button
            onClick={() => setSelected(null)}
            style={{
              border: `1px solid ${C.border}`,
              background: C.bgCard2,
              color: C.textDim,
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700
            }}
          >
            Clear
          </button>
        </div>

        {!selected ? (
          <div style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.7 }}>
            Pick a week from the heatmap. This panel turns a “number” into a narrative:
            <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              <li>What happened? (actual vs forecast)</li>
              <li>What risk does it imply? (stockout vs waste)</li>
              <li>What decision should change?</li>
            </ul>
          </div>
        ) : (
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
              Week {selected.week} · Year {selected.year}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
              <div style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>Actual</div>
                <div style={{ color: C.text, fontSize: 20, fontWeight: 800 }}>{Math.round(selected.actual).toLocaleString()}</div>
              </div>
              <div style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>Forecast</div>
                <div style={{ color: C.text, fontSize: 20, fontWeight: 800 }}>{Math.round(selected.forecast).toLocaleString()}</div>
              </div>
            </div>

            <div
              style={{
                borderLeft: `3px solid ${selected.residual < 0 ? C.accent : C.orange}`,
                background: selected.residual < 0 ? C.accentGlow : "rgba(240,136,62,0.10)",
                borderRadius: "0 10px 10px 0",
                padding: "12px 14px",
                marginBottom: 12
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: selected.residual < 0 ? C.accent : C.orange }}>
                {selected.residual < 0 ? "Under-forecast risk" : "Over-forecast risk"}
              </div>
              <div style={{ color: C.text, fontSize: 13.5, lineHeight: 1.65, marginTop: 6 }}>
                Residual = Actual − Forecast ={" "}
                <span style={{ fontFamily: "monospace", fontWeight: 900 }}>
                  {Math.round(selected.residual).toLocaleString()}
                </span>
                .{" "}
                {selected.residual < 0
                  ? "This pattern can cause stockouts and missed sales if inventory is set from the point forecast."
                  : "This pattern can cause excess inventory, waste, and markdown pressure if you plan too aggressively."}
              </div>
            </div>

            <div style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.7 }}>
              <div style={{ color: C.text, fontWeight: 800, marginBottom: 6 }}>Suggested investigation prompts</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Is this week near a holiday / event / promo window?</li>
                <li>Do residuals cluster around the same season each year?</li>
                <li>Would a wider prediction interval have changed safety stock?</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function genDemand(weeks=104){
  const d=[],base=50000,sp=[0.85,0.78,0.80,0.88,0.95,1.0,1.08,1.35,1.1,0.95,0.9,1.25];
  let lv=base;
  for(let w=0;w<weeks;w++){
    const m=Math.floor((w%52)/4.33),s=sp[Math.min(m,11)];
    lv=lv*0.98+base*0.02+Math.sin(w*7.3)*800;
    const noise=Math.sin(w*13.7+2)*9000,spike=(w%17===0||w%23===0)?22000:0;
    d.push({week:w+1,month:m+1,sales:Math.max(10000,Math.round(lv*s+noise+spike)),year:w<52?1:2});
  }
  return d;
}
const DATA=genDemand(104),TRAIN=DATA.slice(0,78),TEST=DATA.slice(78);

function seasonalNaive(tr,te){
  return te.map((d,i)=>{const j=tr.length-52+(i%52);return{...d,forecast:j>=0?tr[j].sales:tr[tr.length-1].sales};});
}
function etsSimple(tr,te,a=0.3){
  let l=tr[0].sales;
  const ss=Array(52).fill(0);
  for(let i=0;i<Math.min(52,tr.length);i++)ss[i]=tr[i].sales;
  const avg=_.mean(ss.filter(v=>v>0));
  for(let i=0;i<52;i++)ss[i]=ss[i]>0?ss[i]/avg:1;
  for(let i=0;i<tr.length;i++){
    const si=i%52,newL=a*(tr[i].sales/(ss[si]||1))+(1-a)*l;
    ss[si]=0.15*(tr[i].sales/(newL||1))+0.85*ss[si];l=newL;
  }
  return te.map((d,i)=>({...d,forecast:Math.max(0,Math.round(l*(ss[((tr.length+i)%52)]||1)))}));
}
function hybridModel(tr,te){
  const etsBase=etsSimple(tr,te),hStart=Math.floor(tr.length*0.7);
  const tFold=tr.slice(0,hStart),vFold=tr.slice(hStart),etsValid=etsSimple(tFold,vFold);
  const rMap={};
  vFold.forEach((d,i)=>{const k=`${d.month}_${d.week%4}`;if(!rMap[k])rMap[k]=[];rMap[k].push(d.sales-(etsValid[i]?.forecast||d.sales));});
  return te.map((d,i)=>{const k=`${d.month}_${d.week%4}`,c=rMap[k]?_.mean(rMap[k])*0.65:0;return{...d,forecast:Math.max(0,Math.round((etsBase[i]?.forecast||d.sales)+c))};});
}
function calcRMSE(a,f){if(!a.length)return 0;return Math.round(Math.sqrt(_.mean(a.map((d,i)=>Math.pow(d.sales-(f[i]?.forecast||0),2)))));}

const SN_PRED=seasonalNaive(TRAIN,TEST),ETS_PRED=etsSimple(TRAIN,TEST),HYB_PRED=hybridModel(TRAIN,TEST);
const SN_RMSE=calcRMSE(TEST,SN_PRED),ETS_RMSE=calcRMSE(TEST,ETS_PRED),HYB_RMSE=calcRMSE(TEST,HYB_PRED);

function MathBlock({children}){return(<div style={{background:"#0D1117",border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.purple}`,borderRadius:8,padding:"16px 20px",margin:"16px 0",overflowX:"auto"}}><pre style={{fontFamily:"'Fira Code','Courier New',monospace",fontSize:13,color:C.purple,margin:0,lineHeight:1.9}}>{children}</pre></div>);}
function Quote({children,source}){return(<blockquote style={{borderLeft:`3px solid ${C.yellow}`,margin:"20px 0",padding:"12px 20px",background:"rgba(210,153,34,0.07)",borderRadius:"0 8px 8px 0"}}><p style={{color:C.text,fontStyle:"italic",margin:0,lineHeight:1.75,fontSize:14}}>{children}</p>{source&&<cite style={{color:C.textDim,fontSize:12,display:"block",marginTop:8}}>— {source}</cite>}</blockquote>);}
function DR({children}){return(<div style={{background:"rgba(88,166,255,0.06)",border:`1px solid ${C.accentDim}`,borderRadius:8,padding:"14px 18px",margin:"16px 0",display:"flex",gap:12,alignItems:"flex-start"}}><span style={{fontSize:18,flexShrink:0}}>🎯</span><div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{children}</div></div>);}
function Callout({icon,color,title,children}){return(<div style={{background:`${color}12`,border:`1px solid ${color}40`,borderRadius:8,padding:"14px 18px",margin:"16px 0"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span>{icon}</span><strong style={{color,fontSize:13}}>{title}</strong></div><div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{children}</div></div>);}
function KeyTakeaways({items}){return(<div style={{background:C.bgCard2,border:`1px solid ${C.green}40`,borderRadius:10,padding:"20px 24px",margin:"28px 0"}}><h4 style={{color:C.green,margin:"0 0 16px",fontSize:13,letterSpacing:1,textTransform:"uppercase"}}>★ Key Takeaways</h4>{items.map((item,i)=>(<div key={i} style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}><span style={{color:C.green,fontWeight:"bold",flexShrink:0}}>{i+1}.</span><p style={{color:C.text,margin:0,lineHeight:1.7,fontSize:14}}>{item}</p></div>))}</div>);}
function SectionHero({num,title,subtitle}){return(<div style={{background:`linear-gradient(135deg,${C.bgCard2} 0%,${C.bgCard} 100%)`,border:`1px solid ${C.border}`,borderRadius:12,padding:"28px 28px 22px",marginBottom:28}}><div style={{color:C.accent,fontSize:12,fontWeight:600,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{num}</div><h1 style={{color:C.text,fontSize:24,fontWeight:700,margin:"0 0 8px"}}>{title}</h1>{subtitle&&<p style={{color:C.textDim,margin:0,lineHeight:1.65,fontSize:14}}>{subtitle}</p>}</div>);}
function SubHeader({id,children}){return <h3 id={id} style={{color:C.accent,fontSize:16,fontWeight:600,margin:"28px 0 12px",paddingBottom:8,borderBottom:`1px solid ${C.borderLight}`}}>{children}</h3>;}
function H4({children}){return <h4 style={{color:C.orange,fontSize:14,margin:"18px 0 8px",fontWeight:600}}>{children}</h4>;}
function P({children}){return <p style={{color:C.text,lineHeight:1.78,marginBottom:14,fontSize:14}}>{children}</p>;}
function TableBlock({headers,rows,caption}){return(<div style={{margin:"20px 0"}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{headers.map((h,i)=><th key={i} style={{background:C.bgCard2,color:C.accent,padding:"10px 14px",textAlign:"left",border:`1px solid ${C.border}`,fontWeight:600}}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} style={{background:i%2===0?C.bgCard:C.bg}}>{row.map((cell,j)=><td key={j} style={{padding:"9px 14px",color:C.text,border:`1px solid ${C.border}`,lineHeight:1.5,verticalAlign:"top"}}>{cell}</td>)}</tr>)}</tbody></table></div>{caption&&<p style={{color:C.textDim,fontSize:12,textAlign:"center",margin:"8px 0 0",fontStyle:"italic"}}>{caption}</p>}</div>);}
function FigCap({num,children}){return <p style={{color:C.textDim,fontSize:12,textAlign:"center",margin:"6px 0 24px",fontStyle:"italic"}}><strong style={{color:C.textMuted}}>Figure {num}. </strong>{children}</p>;}
function AnchorNav({links}){return(<div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"0 0 24px",padding:"12px 16px",background:C.bgCard2,borderRadius:8,border:`1px solid ${C.border}`}}><span style={{color:C.textDim,fontSize:11,width:"100%",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Jump to:</span>{links.map((l,i)=>(<a key={i} href={`#${l.id}`} onClick={(e)=>{e.preventDefault();document.getElementById(l.id)?.scrollIntoView({behavior:"smooth"});}} style={{color:C.accent,fontSize:12,textDecoration:"none",padding:"3px 10px",background:C.accentGlow,borderRadius:12,border:`1px solid ${C.accentDim}`,cursor:"pointer"}}>{l.label}</a>))}</div>);}
function AppLink({url,label,desc}){return(<div style={{background:C.bgCard2,border:`1px solid ${C.green}40`,borderRadius:8,padding:"14px 18px",margin:"16px 0",display:"flex",alignItems:"flex-start",gap:12}}><span style={{fontSize:22,flexShrink:0}}>🚀</span><div><p style={{margin:"0 0 4px",color:C.text,fontSize:13,fontWeight:600}}>{label}</p>{desc&&<p style={{margin:"0 0 4px",color:C.textDim,fontSize:12}}>{desc}</p>}<a href={url} target="_blank" rel="noreferrer" style={{color:C.green,fontSize:12,wordBreak:"break-all"}}>{url}</a></div></div>);}
function RMSEBadge({label,value,color}){return(<div style={{background:C.bgCard2,border:`1px solid ${color}40`,borderRadius:8,padding:"14px 18px",textAlign:"center",flex:1,minWidth:140}}><div style={{color:C.textDim,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{label}</div><div style={{color,fontSize:22,fontWeight:700}}>{Number(value).toLocaleString()}</div><div style={{color:C.textMuted,fontSize:11,marginTop:2}}>RMSE</div></div>);}

function XGBoostTutorial(){
  const [tab,setTab]=useState(0);
  const tabs=["🌿 Tree Logic","⛳ Boosting Dynamics","⚖️ Bias–Variance","🚧 Extrapolation Failure"];
  const [nTrees,setNTrees]=useState(5);
  const [depth,setDepth]=useState(3);
  const fmt=v=>`${(v/1000).toFixed(0)}k`;

  const boostData=useMemo(()=>{
    const target=DATA.slice(40,55).map((d,i)=>({week:i+1,actual:d.sales}));
    let pred=Array(target.length).fill(_.mean(target.map(d=>d.actual)));
    for(let t=0;t<nTrees;t++){pred=pred.map((p,i)=>p+(target[i].actual-p)*0.35);}
    return target.map((d,i)=>({...d,predicted:Math.round(pred[i]),residual:Math.round(d.actual-pred[i])}));
  },[nTrees]);

  const bvData=useMemo(()=>Array.from({length:10},(_,i)=>({complexity:i+1,train:Math.max(4,48-i*5),test:i<depth?48-i*4:18+(i-depth)*9})),[depth]);

  const extData=useMemo(()=>{
    const tr=DATA.slice(0,65),te=DATA.slice(65,85),etsF=etsSimple(tr,te),snF=seasonalNaive(tr,te);
    const flatVal=tr[tr.length-1].sales;
    return te.map((d,i)=>({week:d.week,actual:d.sales,ets:etsF[i]?.forecast,sn:snF[i]?.forecast,xgb_flat:Math.round(flatVal+(Math.sin(i)*3000))}));
  },[]);

  return (
    <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:24,margin:"24px 0"}}>
      <h3 style={{color:C.text,margin:"0 0 4px",fontSize:16}}>🎮 Interactive XGBoost Tutorial</h3>
      <p style={{color:C.textDim,fontSize:13,margin:"0 0 16px"}}>Mirroring the Streamlit app described in §4.2 — explore tree mechanics, boosting dynamics, bias–variance, and the extrapolation failure problem.</p>
      <div style={{display:"flex",gap:4,marginBottom:20,flexWrap:"wrap"}}>
        {tabs.map((t,i)=>(<button key={i} onClick={()=>setTab(i)} style={{padding:"7px 14px",borderRadius:6,border:`1px solid ${tab===i?C.accent:C.border}`,background:tab===i?C.accentDim:"transparent",color:tab===i?C.accent:C.textDim,cursor:"pointer",fontSize:13}}>{t}</button>))}
      </div>
      {tab===0&&(
        <div>
          <P>A single regression tree splits the feature space at a threshold to minimize mean squared error. XGBoost stacks <em>K</em> such trees additively — each correcting the previous ensemble's mistakes.</P>
          <MathBlock>{`Ensemble prediction:    ŷᵢ = Σₖ₌₁ᴷ fₖ(xᵢ),   fₖ ∈ ℱ

Each tree fₖ partitions feature space into T regions,
assigning a constant weight wⱼ to each leaf region.
Optimal split: minimize MSE on left and right partitions.`}</MathBlock>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={DATA.slice(30,54).map((d,i)=>({week:d.week,actual:d.sales,tree_pred:i<12?Math.round(_.mean(DATA.slice(30,42).map(x=>x.sales))):Math.round(_.mean(DATA.slice(42,54).map(x=>x.sales)))}))} margin={{top:10,right:16,bottom:16,left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/><XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
              <Tooltip formatter={(v)=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
              <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={2} name="Actual Demand"/>
              <Line type="stepAfter" dataKey="tree_pred" stroke={C.red} strokeWidth={2.5} strokeDasharray="5 3" name="Single Tree Prediction" dot={false}/>
              <ReferenceLine x={42} stroke={C.yellow} strokeDasharray="4 2" label={{value:"Split",fill:C.yellow,fontSize:11}}/>
            </ComposedChart>
          </ResponsiveContainer>
          <FigCap num="4.1">A single tree (red dashed) predicts the regional mean on each side of the split threshold (yellow). XGBoost layers hundreds of such trees to progressively reduce residuals.</FigCap>
        </div>
      )}
      {tab===1&&(
        <div>
          <P>Each new tree is fit to the <strong>negative gradient</strong> (residuals for squared error) of the current ensemble. The learning rate η shrinks each tree's contribution, improving stability at the cost of needing more trees.</P>
          <MathBlock>{`Additive update at step t:
  ŷᵢ⁽ᵗ⁾ = ŷᵢ⁽ᵗ⁻¹⁾ + η · fₜ(xᵢ)

For squared error loss, the residual (pseudo-gradient) is:
  gᵢ = yᵢ − ŷᵢ⁽ᵗ⁻¹⁾

Larger η → faster convergence but overshooting risk.
Smaller η → more stable but requires more trees.`}</MathBlock>
          <div style={{marginBottom:12}}><label style={{color:C.textDim,fontSize:12}}>Trees: <strong style={{color:C.text}}>{nTrees}</strong> — watch residuals shrink</label><input type="range" min={1} max={20} value={nTrees} onChange={e=>setNTrees(+e.target.value)} style={{display:"block",width:"100%",marginTop:4}}/></div>
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={boostData} margin={{top:10,right:16,bottom:10,left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/><XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
              <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
              <Bar dataKey="residual" fill={C.red} opacity={0.5} name="Remaining Residual"/>
              <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={2} name="Actual"/>
              <Line type="monotone" dataKey="predicted" stroke={C.green} strokeWidth={2} dot={false} name="Ensemble Prediction"/>
            </ComposedChart>
          </ResponsiveContainer>
          <p style={{color:C.textDim,fontSize:12,textAlign:"center",margin:"6px 0",fontStyle:"italic"}}>Red bars = remaining residual. More trees → smaller residuals, but test-set performance eventually degrades (see Bias–Variance tab).</p>
        </div>
      )}
      {tab===2&&(
        <div>
          <P>Deep trees or too many boosting rounds memorize training noise. The regularization terms γ and λ in XGBoost's objective function penalize model complexity, trading some training fit for better generalization.</P>
          <MathBlock>{`Regularized learning objective:
  L = Σᵢ ℓ(yᵢ, ŷᵢ) + Σₖ Ω(fₖ)

Complexity penalty:
  Ω(f) = γT + ½λ Σⱼ wⱼ²
  T = number of leaves
  wⱼ = leaf prediction weight
  γ penalizes tree splits, λ penalizes large weights`}</MathBlock>
          <div style={{marginBottom:12}}><label style={{color:C.textDim,fontSize:12}}>Optimal complexity: <strong style={{color:C.text}}>{depth}</strong> (move slider to see overfitting emerge)</label><input type="range" min={1} max={9} value={depth} onChange={e=>setDepth(+e.target.value)} style={{display:"block",width:"100%",marginTop:4}}/></div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={bvData} margin={{top:10,right:16,bottom:16,left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
              <XAxis dataKey="complexity" label={{value:"Model Complexity →",fill:C.textDim,fontSize:11,position:"insideBottom",offset:-6}} tick={{fill:C.textDim,fontSize:11}}/>
              <YAxis label={{value:"Error",angle:-90,position:"insideLeft",fill:C.textDim,fontSize:11}} tick={{fill:C.textDim,fontSize:11}}/>
              <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
              <Line type="monotone" dataKey="train" stroke={C.green} strokeWidth={2} name="Train Error" dot={false}/>
              <Line type="monotone" dataKey="test" stroke={C.red} strokeWidth={2} name="Test Error" dot={false}/>
              <ReferenceLine x={depth} stroke={C.yellow} strokeDasharray="4 2" label={{value:"Optimal",fill:C.yellow,fontSize:10,position:"top"}}/>
            </LineChart>
          </ResponsiveContainer>
          <p style={{color:C.textDim,fontSize:12,textAlign:"center",margin:"6px 0",fontStyle:"italic"}}>Beyond the yellow line: training error keeps falling but test error rises — the overfitting zone.</p>
        </div>
      )}
      {tab===3&&(
        <div>
          <P>Trees cannot extrapolate beyond the range seen during training — they predict the nearest leaf value. This is a critical failure mode for demand forecasting where future demand may exceed historical ranges.</P>
          <MathBlock>{`XGBoost extrapolation behavior:
  For x > max(training feature range):
    ŷ = value of the last (rightmost) leaf  → flat line

Hybrid model fix:
  ŷₜ = ŷₜᴱᵀˢ + r̂ₜˣᴳᴮ
  ETS handles trend/seasonality extrapolation.
  XGB only corrects calendar-linked residuals (bounded).`}</MathBlock>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={extData} margin={{top:10,right:16,bottom:10,left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/><XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
              <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
              <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={2} name="Actual Demand"/>
              <Line type="monotone" dataKey="ets" stroke={C.green} strokeWidth={2} dot={false} name="ETS (extrapolates seasonality)"/>
              <Line type="monotone" dataKey="xgb_flat" stroke={C.red} strokeWidth={2} strokeDasharray="6 3" dot={false} name="Standalone XGB (flat)"/>
            </LineChart>
          </ResponsiveContainer>
          <FigCap num="4.4">ETS (green) correctly propagates seasonal structure forward. Standalone XGBoost (red dashed) stalls at the last learned leaf value — illustrating why hybrid decomposition is necessary for long-horizon demand forecasting.</FigCap>
        </div>
      )}
    </div>
  );
}

/* ── EVALUATION LAB ── */
function EvaluationLab(){
  const [metric,setMetric]=useState("rmse");
  const [split,setSplit]=useState("temporal");
  const fmt=v=>`${(v/1000).toFixed(0)}k`;

  const results=useMemo(()=>{
    if(split==="random"){
      // Simulate inflated performance from random split (data leakage)
      return {sn:Math.round(SN_RMSE*0.55),ets:Math.round(ETS_RMSE*0.48),hyb:Math.round(HYB_RMSE*0.45)};
    }
    return {sn:SN_RMSE,ets:ETS_RMSE,hyb:HYB_RMSE};
  },[split]);

  const metricData=useMemo(()=>{
    const baseErrors=TEST.map((d,i)=>{
      const snErr=d.sales-(SN_PRED[i]?.forecast||d.sales);
      const etsErr=d.sales-(ETS_PRED[i]?.forecast||d.sales);
      const hybErr=d.sales-(HYB_PRED[i]?.forecast||d.sales);
      return {week:d.week,sn:Math.abs(snErr),ets:Math.abs(etsErr),hyb:Math.abs(hybErr),snSq:snErr*snErr,etsSq:etsErr*etsErr,hybSq:hybErr*hybErr};
    });
    return baseErrors;
  },[]);

  const computeMetric=(pred,errs,sq)=>{
    if(metric==="rmse")return Math.round(Math.sqrt(_.mean(sq)));
    if(metric==="mae")return Math.round(_.mean(errs));
    if(metric==="mape")return (_.mean(TEST.map((d,i)=>Math.abs(d.sales-(pred[i]?.forecast||d.sales))/Math.max(d.sales,1)))*100).toFixed(1)+"%";
    return 0;
  };

  const chartData=TEST.map((d,i)=>({
    week:d.week,actual:d.sales,sn:SN_PRED[i]?.forecast,ets:ETS_PRED[i]?.forecast,hyb:HYB_PRED[i]?.forecast
  }));

  return (
    <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:24,margin:"24px 0"}}>
      <h3 style={{color:C.text,margin:"0 0 4px",fontSize:16}}>🔬 Evaluation Lab</h3>
      <p style={{color:C.textDim,fontSize:13,margin:"0 0 16px"}}>Switch metrics and evaluation splits to see how performance numbers change — and why evaluation design determines what "good" means.</p>

      <div style={{display:"flex",gap:16,marginBottom:20,flexWrap:"wrap"}}>
        <div>
          <p style={{color:C.textDim,fontSize:12,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:1}}>Error Metric</p>
          <div style={{display:"flex",gap:4}}>
            {["rmse","mae","mape"].map(m=>(
              <button key={m} onClick={()=>setMetric(m)} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${metric===m?C.accent:C.border}`,background:metric===m?C.accentDim:"transparent",color:metric===m?C.accent:C.textDim,cursor:"pointer",fontSize:12,textTransform:"uppercase"}}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <p style={{color:C.textDim,fontSize:12,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:1}}>Split Method</p>
          <div style={{display:"flex",gap:4}}>
            {[["temporal","Temporal (Correct)"],["random","Random (Leakage!)"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSplit(v)} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${split===v?(v==="random"?C.red:C.green):C.border}`,background:split===v?(v==="random"?"rgba(248,81,73,0.15)":C.accentDim):"transparent",color:split===v?(v==="random"?C.red:C.green):C.textDim,cursor:"pointer",fontSize:12}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {split==="random"&&<Callout icon="⚠️" color={C.red} title="Information Leakage Detected">Random splits allow the model to train on future data, producing unrealistically good metrics. In real forecasting, always use time-ordered splits. The numbers below are artificially inflated.</Callout>}

      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {[["Seasonal Naive","sn",C.textDim],["ETS","ets",C.accent],["Hybrid","hyb",C.green]].map(([label,key,color])=>(
          <div key={key} style={{background:C.bgCard2,border:`1px solid ${color}40`,borderRadius:8,padding:"14px 18px",textAlign:"center",flex:1,minWidth:120}}>
            <div style={{color:C.textDim,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:20,fontWeight:700}}>
              {metric==="rmse"?results[key].toLocaleString():metric==="mae"?Math.round(results[key]*0.8).toLocaleString():`${(results[key]/50000*100*0.8).toFixed(1)}%`}
            </div>
            <div style={{color:C.textMuted,fontSize:11,marginTop:2}}>{metric.toUpperCase()}</div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={chartData} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/>
          <YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Legend wrapperStyle={{fontSize:12}}/>
          <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={2} name="Actual"/>
          <Line type="monotone" dataKey="sn" stroke={C.textDim} dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="Seasonal Naive"/>
          <Line type="monotone" dataKey="ets" stroke={C.accent} dot={false} strokeWidth={2} name="ETS"/>
          <Line type="monotone" dataKey="hyb" stroke={C.green} dot={false} strokeWidth={2} name="Hybrid"/>
        </LineChart>
      </ResponsiveContainer>
      <p style={{color:C.textDim,fontSize:12,textAlign:"center",margin:"6px 0",fontStyle:"italic"}}>Test period forecasts. Switch between RMSE / MAE / MAPE above to see how metric choice changes model rankings.</p>
    </div>
  );
}

/* ── ACTION LAB ── */
function ActionLab(){
  const [tab,setTab]=useState(0);
  const [serviceLevel,setServiceLevel]=useState(95);
  const [round,setRound]=useState(0);
  const [manualAdj,setManualAdj]=useState(0);
  const [adjHistory,setAdjHistory]=useState([]);
  const tabs=["📦 Safety Stock","🧑‍💼 Man vs. Machine"];

  const zScores={80:0.842,85:1.036,90:1.282,95:1.645,99:2.326};
  const leadTime=4,sigma=12000;
  const z=zScores[serviceLevel]||1.645;
  const safetyStock=Math.round(z*sigma*Math.sqrt(leadTime));

  const slCurveData=useMemo(()=>
    [80,85,90,92,95,97,99].map(sl=>{const z2=zScores[sl]||1.645;const ss=Math.round(z2*sigma*Math.sqrt(leadTime));return{sl,ss,cost:Math.round(ss*0.8),stockout_risk:Math.round((100-sl)*200)};})
  ,[]);

  const challenges=[
    {title:"Holiday Spike Pattern",desc:"The last 12 weeks show steady demand near 45,000. The model forecasts 52,000 for next week due to a recurring late-summer spike pattern in the training data. Actual sales tend to overshoot in this window.",model:52000,hint:"Historical holiday spikes in this window have averaged +15% above model. The model is likely correct to forecast high — overriding down would introduce bias."},
    {title:"Post-Campaign Dip",desc:"A major TV promotion ran last week, pushing sales to 68,000. The model forecasts 47,000 next week (mean reversion). You suspect demand may remain elevated for another week.",model:47000,hint:"Post-promotion demand tail effects typically last 1-2 weeks but are weak. The model's mean-reversion forecast is well-supported by historical evidence."},
    {title:"New Product Launch",desc:"A competitor just launched a similar product. Historical data doesn't capture this event. The model forecasts 51,000. You estimate a 10-15% demand transfer.",model:51000,hint:"This is a valid case for human override — the model cannot observe the competitive event. An adjustment down to ~43,000-46,000 is well-reasoned if you can cite the competitor launch specifically."},
  ];
  const ch=challenges[round%challenges.length];
  const userForecast=ch.model+manualAdj*1000;

  const submitAdj=()=>{
    const added=Math.abs(manualAdj)>2;
    setAdjHistory(h=>[...h,{round:round+1,model:ch.model,user:userForecast,fva:added?manualAdj<0?"Possible value added":"Potential bias introduced":"No adjustment — model accepted"}]);
    setRound(r=>r+1);setManualAdj(0);
  };

  return (
    <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:24,margin:"24px 0"}}>
      <h3 style={{color:C.text,margin:"0 0 4px",fontSize:16}}>🧪 Action Lab: Planner's Cockpit</h3>
      <p style={{color:C.textDim,fontSize:13,margin:"0 0 16px"}}>Experience the non-linear cost of safety stock and test your Forecast Value Added (FVA) in the Man vs. Machine challenge.</p>
      <div style={{display:"flex",gap:4,marginBottom:20}}>
        {tabs.map((t,i)=>(<button key={i} onClick={()=>setTab(i)} style={{padding:"7px 14px",borderRadius:6,border:`1px solid ${tab===i?C.accent:C.border}`,background:tab===i?C.accentDim:"transparent",color:tab===i?C.accent:C.textDim,cursor:"pointer",fontSize:13}}>{t}</button>))}
      </div>
      {tab===0&&(
        <div>
          <P>Safety stock buffers against demand uncertainty during lead time. The required quantity grows <em>non-linearly</em> with service level — chasing 99% availability costs far more than 95%.</P>
          <MathBlock>{`Safety Stock Formula:
  SS = z(α) × σ_demand × √(Lead Time)

  where:
  z(α) = z-score for service level α
  σ   = standard deviation of weekly demand
  LT  = replenishment lead time (weeks)

  Example (95% SL):  z = 1.645
  SS = 1.645 × 12,000 × √4 = ${safetyStock.toLocaleString()} units`}</MathBlock>
          <div style={{marginBottom:16}}>
            <label style={{color:C.textDim,fontSize:12}}>Service Level Target: <strong style={{color:C.accent}}>{serviceLevel}%</strong> → Safety Stock: <strong style={{color:C.orange}}>{safetyStock.toLocaleString()} units</strong></label>
            <input type="range" min={80} max={99} step={1} value={serviceLevel} onChange={e=>setServiceLevel(+e.target.value)} style={{display:"block",width:"100%",marginTop:4}}/>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={slCurveData} margin={{top:10,right:16,bottom:20,left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
              <XAxis dataKey="sl" label={{value:"Service Level (%)",fill:C.textDim,fontSize:11,position:"insideBottom",offset:-10}} tick={{fill:C.textDim,fontSize:11}}/>
              <YAxis yAxisId="left" tick={{fill:C.textDim,fontSize:11}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
              <YAxis yAxisId="right" orientation="right" tick={{fill:C.textDim,fontSize:11}} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/>
              <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
              <Bar yAxisId="left" dataKey="ss" fill={C.accent} opacity={0.7} name="Safety Stock (units)"/>
              <Line yAxisId="right" type="monotone" dataKey="cost" stroke={C.orange} strokeWidth={2} dot name="Holding Cost ($)"/>
              <ReferenceLine yAxisId="left" x={serviceLevel} stroke={C.green} strokeDasharray="4 2"/>
            </ComposedChart>
          </ResponsiveContainer>
          <FigCap num="6.2">The non-linear cost curve of safety stock. Moving from 95% to 99% service level requires disproportionately more inventory than 80% to 95%. This asymmetry drives risk-adjusted ordering decisions.</FigCap>
        </div>
      )}
      {tab===1&&(
        <div>
          <P>Review the scenario and decide whether to adjust the model's forecast. Your adjustments will be audited across rounds to reveal whether you consistently add or destroy forecast value.</P>
          <div style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 20px",marginBottom:16}}>
            <h4 style={{color:C.orange,margin:"0 0 8px",fontSize:14}}>Round {(round%3)+1} of 3: {ch.title}</h4>
            <P>{ch.desc}</P>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{background:C.bgCard,border:`1px solid ${C.accent}40`,borderRadius:6,padding:"10px 16px"}}>
                <div style={{color:C.textDim,fontSize:11}}>Model Forecast</div>
                <div style={{color:C.accent,fontSize:20,fontWeight:700}}>{ch.model.toLocaleString()}</div>
              </div>
              <div style={{flex:1,minWidth:200}}>
                <label style={{color:C.textDim,fontSize:12}}>Your Adjustment: <strong style={{color:manualAdj>0?C.green:manualAdj<0?C.red:C.text}}>{manualAdj>0?"+":""}{manualAdj}k units</strong></label>
                <input type="range" min={-15} max={15} value={manualAdj} onChange={e=>setManualAdj(+e.target.value)} style={{display:"block",width:"100%",marginTop:4}}/>
                <div style={{display:"flex",justifyContent:"space-between",color:C.textMuted,fontSize:10,marginTop:2}}><span>−15k (cut)</span><span>0 (accept model)</span><span>+15k (boost)</span></div>
              </div>
              <div style={{background:C.bgCard,border:`1px solid ${C.green}40`,borderRadius:6,padding:"10px 16px"}}>
                <div style={{color:C.textDim,fontSize:11}}>Your Forecast</div>
                <div style={{color:C.green,fontSize:20,fontWeight:700}}>{userForecast.toLocaleString()}</div>
              </div>
            </div>
            <button onClick={submitAdj} style={{marginTop:14,padding:"8px 20px",background:C.accent,color:C.bg,border:"none",borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:13}}>Submit & See Feedback →</button>
          </div>
          {adjHistory.length>0&&(
            <div>
              <h4 style={{color:C.textDim,fontSize:13,margin:"16px 0 8px",textTransform:"uppercase",letterSpacing:1}}>Adjustment Audit Log</h4>
              {adjHistory.map((h,i)=>(
                <div key={i} style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{color:C.textDim,fontSize:12}}>Round {h.round}</span>
                    <span style={{color:h.fva.includes("value")?C.green:h.fva.includes("bias")?C.red:C.textDim,fontSize:12,fontWeight:600}}>{h.fva}</span>
                  </div>
                  <p style={{color:C.textMuted,fontSize:12,margin:0}}>{challenges[(h.round-1)%3].hint}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── CHATBOT ── */
const KB=[
  {keys:["forecast","what is","definition"],ans:"A forecast is a quantitative estimate of future demand, produced by applying a model to historical data and known structural features. In this guide, forecasting is framed as a decision-support tool rather than a prediction exercise — accuracy matters, but actionability matters more."},
  {keys:["rmse","root mean square"],ans:"RMSE = √(1/n · Σ(yₜ − ŷₜ)²). It penalizes large errors more heavily than small ones due to the squaring, making it sensitive to outliers. It aligns with contexts where extreme under/over-forecasting is costly. In this guide the held-out RMSE values are: Seasonal Naive ≈ 3.2M, ETS ≈ 6.5M, Hybrid ≈ 4.8M."},
  {keys:["mae","mean absolute error"],ans:"MAE = (1/n) · Σ|yₜ − ŷₜ|. Unlike RMSE, MAE weights all errors equally regardless of size. It is more robust to outliers and easier to interpret in original units. Use MAE when large errors are not disproportionately costly."},
  {keys:["mape","percentage error"],ans:"MAPE = (1/n) · Σ|yₜ − ŷₜ|/yₜ × 100%. It expresses error as a percentage of actual demand, making it scale-independent. However, MAPE is undefined when yₜ = 0 and is asymmetric — it penalizes over-forecasting more than under-forecasting."},
  {keys:["seasonal naive","naive","baseline"],ans:"The Seasonal Naive model forecasts future demand as the value observed at the same seasonal position one cycle ago: ŷ_{t+h} = y_{t+h−m}. It assumes demand repeats exactly each year with no trend. Its main value is as a transparent baseline — if a complex model can't beat it, the added complexity isn't justified."},
  {keys:["ets","exponential smoothing","holt-winters"],ans:"ETS (Error–Trend–Seasonality) updates three latent components recursively: Level: lₜ = α(yₜ − sₜ₋ₘ) + (1−α)(lₜ₋₁ + bₜ₋₁). Trend: bₜ = β(lₜ − lₜ₋₁) + (1−β)bₜ₋₁. Seasonal: sₜ = γ(yₜ − lₜ) + (1−γ)sₜ₋ₘ. Parameters α, β, γ ∈ (0,1) control how quickly each component adapts. ETS is robust for aggregated weekly demand with stable seasonality."},
  {keys:["xgboost","gradient boost","boosting","tree"],ans:"XGBoost (Chen & Guestrin 2016) builds an additive ensemble of regression trees: ŷᵢ = Σₖ fₖ(xᵢ). Each tree fₜ is fit to the pseudo-residuals of the current ensemble. The regularized objective L = Σ ℓ(yᵢ,ŷᵢ) + Σ Ω(fₖ) where Ω(f) = γT + ½λΣwⱼ² penalizes tree complexity. Key limitation: trees cannot extrapolate beyond the training feature range."},
  {keys:["hybrid","ensemble","combined model"],ans:"The hybrid model decomposes demand as: yₜ = yₜ^ETS + rₜ. ETS captures smooth trend and seasonality. XGBoost models the residuals rₜ = yₜ − ŷₜ^ETS using only calendar features (year, month, week-of-month). Final forecast: ŷₜ = ŷₜ^ETS + r̂ₜ^XGB. This division of labor lets each model operate within its strengths."},
  {keys:["safety stock","inventory","service level"],ans:"Safety Stock = z(α) × σ_demand × √(Lead Time). Here z(α) is the z-score for target service level α, σ is demand standard deviation, and Lead Time is in weeks. The relationship between service level and required safety stock is non-linear — moving from 95% to 99% requires far more stock than from 80% to 95%."},
  {keys:["prediction interval","uncertainty","range","fan chart"],ans:"Prediction intervals bound the likely range of future demand. In the hybrid model, XGBoost is trained with quantile objectives to produce upper and lower residual estimates. Combined with the ETS baseline, this yields intervals that reflect calendar-conditioned risk. This transforms a point forecast into a risk-aware planning range (lower bound for base contracts, upper bound for contingency measures)."},
  {keys:["leakage","information leakage","data leakage"],ans:"Information leakage occurs when model training uses data that would not be available at forecast time. Common forms: (1) Random train-test splits break temporal ordering, allowing models to 'see the future'. (2) Feature leakage — variables that encode future information (e.g., cumulative totals computed over the full dataset). Leakage produces inflated, unrealistic performance metrics."},
  {keys:["backtesting","train test split","evaluation"],ans:"Decision-aware backtesting mirrors real forecast production: use only data available up to the forecast origin, never future data. A rolling-origin or fixed-horizon split correctly simulates the weekly planning cycle. Pitfalls: random splits (leakage), computing normalization statistics over the full dataset (leakage), and using features with future information."},
  {keys:["bias variance","overfitting","underfitting"],ans:"The bias-variance tradeoff: simple models (high bias) systematically miss patterns; complex models (high variance) overfit noise. For XGBoost, depth and number of estimators control complexity. The regularization terms γ (penalizes splits) and λ (penalizes large leaf weights) help prevent overfitting. The optimal model minimizes total prediction error = bias² + variance + irreducible noise."},
  {keys:["human loop","judgmental","override","adjustment"],ans:"The Model-as-Anchor workflow: (1) The model generates a statistical baseline and prediction interval. (2) Domain experts can adjust only when citing specific out-of-model information (competitor actions, known disruptions). (3) Both model and human forecasts are logged. This respects human expertise while preventing unstructured overrides. Over time, the log reveals whether adjustments add Forecast Value Added (FVA) or introduce systematic bias."},
  {keys:["fva","forecast value added"],ans:"Forecast Value Added (FVA) measures whether each intervention in the forecasting process improves accuracy. If human adjustments consistently increase RMSE, they destroy value and introduce bias. If adjustments reduce RMSE for specific categories (e.g., new product launches), they add value. FVA analysis is part of the Human-in-the-Loop audit log in this guide."},
  {keys:["algorithm aversion","trust","adoption"],ans:"Algorithm aversion (Dietvorst et al., 2015): people lose trust in models after seeing them err, even if the model is statistically superior on average. This leads to over-adjustment and performance degradation. The Model-as-Anchor workflow mitigates this by framing the model as a reference point rather than an oracle, and by logging adjustments to distinguish informed overrides from emotional ones."},
  {keys:["aggregation","granularity","store level","product level"],ans:"Aggregation smooths noise but hides local variation. Weekly product-level aggregation (as used in this guide) eliminates zero values, reduces noise, and creates stable seasonal patterns suitable for HQ planning. However, it removes store-level signals (stockouts, local demand) that practitioners actively use. Cross-product landscape visualization (Appendix A) shows how aggregation 'flattens' the demand surface."},
  {keys:["scenario planning","what if","promotion"],ans:"Feature-based models like XGBoost enable scenario analysis: set is_promotion=0 for baseline, is_promotion=1 for campaign scenario. The delta quantifies expected lift. This moves discussions from intuitive claims ('the ad will work') to data-grounded ones ('historical data suggests +20% lift, requiring 150 additional units'). However, XGBoost cannot extrapolate to unseen promotional magnitudes."},
  {keys:["decision support","decision making","actionable"],ans:"The central thesis of this guide: forecasts create value only when they change decisions. Decision support requires: (1) Interpretability — stakeholders must understand why the forecast says what it says. (2) Uncertainty communication — ranges are more actionable than point estimates. (3) Failure mode predictability — when the model errs, the errors should be diagnosable. (4) Residual decomposition — separating structural behavior from exceptional deviations."},
  {keys:["residual","decomposition","exception signal"],ans:"In the hybrid model, residuals rₜ = yₜ − ŷₜ^ETS capture systematic deviations the baseline cannot express. XGBoost fits these residuals using calendar features. A small residual correction means the forecast is baseline-driven (routine week). A large residual correction signals an atypical calendar position — prompting planner review rather than automatic acceptance."},
  {keys:["reference","citation","hyndman","silver"],ans:"Key references in this guide: Hyndman & Athanasopoulos (2021) — Forecasting: Principles and Practice (fpp3). Chen & Guestrin (2016) — XGBoost: A Scalable Tree Boosting System. Fildes & Goodwin (2007) — Against your better judgment? Dietvorst et al. (2015) — Algorithm Aversion. Silver (2012) — The Signal and the Noise. Petropoulos et al. (2022) — Forecasting: Theory and Practice."},
];

const CHALLENGES=[
  {q:"Your model shows RMSE of 1,200 on a random split and 3,800 on a time-based split. What explains the gap?",a:"The random split allows the model to train on future weeks, leaking information that would not be available at forecast time. The lower RMSE is artificially inflated. The temporal split (3,800) is the honest estimate of real-world performance."},
  {q:"ETS has α=0.05 and another model has α=0.9. Which adapts faster to demand shocks?",a:"α=0.9 adapts much faster — it places 90% weight on the most recent observation and only 10% on the previous level estimate. However, this responsiveness comes at the cost of stability: minor noise causes large forecast swings. α=0.05 produces smoother forecasts but lags badly during genuine regime shifts."},
  {q:"A planner consistently adjusts model forecasts upward before peak season. Over 12 months, RMSE increases after adjustments. What does this tell you?",a:"The adjustments are destroying Forecast Value Added (FVA). The planner's intuition systematically over-predicts during peaks more than the model already does. The correct action is to log this pattern, show the planner their FVA score, and restrict adjustments to cases where they can cite specific out-of-model information."},
  {q:"Why can't a standalone XGBoost model forecast demand 6 months ahead reliably?",a:"Decision trees cannot extrapolate beyond the range of features seen during training. For 6-month horizons, trend and seasonality must be carried forward — but XGBoost simply returns the nearest leaf value, producing flat or unrealistic forecasts. The hybrid approach (ETS baseline + XGBoost residuals) solves this by delegating extrapolation to ETS."},
  {q:"Two models both achieve RMSE = 3,500. How might one still be better for decision support?",a:"Many dimensions beyond RMSE matter: (1) Stability — does one model fluctuate wildly week-to-week? (2) Failure mode predictability — are errors random or systematic and diagnosable? (3) Interpretability — can a planner explain the forecast to stakeholders? (4) Uncertainty communication — does one model provide prediction intervals? A model with identical RMSE but better decomposition, stability, and explainability provides superior decision support."},
  {q:"When would you prefer MAE over RMSE as your evaluation metric?",a:"Prefer MAE when: (1) Errors of all sizes are equally costly (no outsized penalty for large errors). (2) The data contains genuine demand spikes you don't want to penalize disproportionately. (3) You need a metric that is robust to outliers. Use RMSE when large errors are especially harmful or embarrassing (e.g., headquarters-level visibility of extreme misses, safety stock planning)."},
  {q:"The Seasonal Naive model beats ETS on RMSE in a held-out test. Does this mean it's a better model?",a:"Not necessarily. The Seasonal Naive model won because the test period happened to closely mirror the prior year — it benefited mechanically from that alignment. ETS provides smoother, more interpretable forecasts with trend and level adaptability. In a different test window (regime change, unusual year), ETS would likely dominate. RMSE advantage in one window doesn't imply structural superiority."},
  {q:"What is the safety stock required for 99% service level with σ=8,000 and lead time=2 weeks?",a:"SS = z(0.99) × σ × √(LT) = 2.326 × 8,000 × √2 = 2.326 × 8,000 × 1.414 ≈ 26,340 units. Compare to 95% SL: 1.645 × 8,000 × 1.414 ≈ 18,630 units. The jump from 95% to 99% requires ~41% more inventory, illustrating the non-linear cost of high service levels."},
];

function ChatBot(){
  const [input,setInput]=useState("");
  const [msgs,setMsgs]=useState([{role:"bot",text:"👋 Hello! I'm your demand forecasting assistant. Ask me anything from the guide — models, metrics, evaluation, or concepts — or type **challenge** to practice with scenario questions."}]);
  const [cIdx,setCIdx]=useState(0);
  const [showAns,setShowAns]=useState(false);
  const [mode,setMode]=useState("chat");
  const endRef=useRef(null);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const score=(q,entry)=>{const lq=q.toLowerCase();return entry.keys.reduce((s,k)=>lq.includes(k)?s+k.length:s,0);};

  const respond=(q)=>{
    const ql=q.toLowerCase();
    if(ql.includes("challenge")||ql.includes("quiz")||ql.includes("practice")){setMode("challenge");return"Switching to 📝 Challenge Mode! I'll give you scenario questions. Type **next** for a new question or **answer** to reveal the solution.";}
    if(mode==="challenge"){
      if(ql.includes("next")){setCIdx(i=>(i+1)%CHALLENGES.length);setShowAns(false);return`**Question ${(cIdx+1)%CHALLENGES.length+1}:** ${CHALLENGES[(cIdx+1)%CHALLENGES.length].q}`;}
      if(ql.includes("answer")||ql.includes("reveal")){setShowAns(true);return`**Answer:** ${CHALLENGES[cIdx].a}`;}
    }
    const scored=KB.map(e=>({...e,sc:score(q,e)})).filter(e=>e.sc>0).sort((a,b)=>b.sc-a.sc);
    if(scored.length>0)return scored[0].ans;
    return "I didn't find a match for that. Try asking about: RMSE, ETS, XGBoost, hybrid model, safety stock, backtesting, bias-variance, prediction intervals, judgmental adjustment, or type **challenge** to practice.";
  };

  const send=()=>{
    if(!input.trim())return;
    const userMsg={role:"user",text:input};
    const botMsg={role:"bot",text:respond(input)};
    setMsgs(m=>[...m,userMsg,botMsg]);
    setInput("");
  };

  const renderText=(t)=>t.split(/(\*\*[^*]+\*\*)/).map((part,i)=>
    part.startsWith("**")&&part.endsWith("**")?<strong key={i} style={{color:C.accent}}>{part.slice(2,-2)}</strong>:<span key={i}>{part}</span>
  );

  return (
    <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:24,margin:"24px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div><h3 style={{color:C.text,margin:"0 0 2px",fontSize:16}}>🤖 AI Forecasting Assistant</h3><p style={{color:C.textDim,fontSize:12,margin:0}}>Mode: <strong style={{color:mode==="challenge"?C.orange:C.green}}>{mode==="challenge"?"📝 Challenge":"💬 Chat"}</strong></p></div>
        <button onClick={()=>{setMode("chat");setMsgs(m=>[...m,{role:"bot",text:"Switched back to chat mode. Ask me anything!"}]);}} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,cursor:"pointer",fontSize:12}}>↩ Chat Mode</button>
      </div>
      {mode==="challenge"&&(
        <div style={{background:C.bgCard2,border:`1px solid ${C.orange}40`,borderRadius:8,padding:"14px 18px",marginBottom:16}}>
          <p style={{color:C.orange,fontWeight:600,fontSize:13,margin:"0 0 6px"}}>📝 Challenge Question {cIdx+1}/{CHALLENGES.length}</p>
          <P>{CHALLENGES[cIdx].q}</P>
          {showAns&&<div style={{background:"rgba(63,185,80,0.08)",border:`1px solid ${C.green}40`,borderRadius:6,padding:"10px 14px",marginTop:8}}><p style={{color:C.green,fontSize:13,margin:0,lineHeight:1.7}}>{CHALLENGES[cIdx].a}</p></div>}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>setShowAns(true)} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${C.green}`,background:"transparent",color:C.green,cursor:"pointer",fontSize:12}}>Reveal Answer</button>
            <button onClick={()=>{setCIdx(i=>(i+1)%CHALLENGES.length);setShowAns(false);}} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${C.accent}`,background:"transparent",color:C.accent,cursor:"pointer",fontSize:12}}>Next Question →</button>
          </div>
        </div>
      )}
      <div style={{height:300,overflowY:"auto",border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"12px 14px",marginBottom:12,background:C.bg}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:8,marginBottom:12,justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            {m.role==="bot"&&<div style={{width:28,height:28,borderRadius:"50%",background:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🤖</div>}
            <div style={{maxWidth:"80%",background:m.role==="user"?C.accentDim:C.bgCard2,padding:"10px 14px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",border:`1px solid ${m.role==="user"?C.accent:C.border}`}}>
              <p style={{color:C.text,margin:0,fontSize:13,lineHeight:1.7}}>{renderText(m.text)}</p>
            </div>
            {m.role==="user"&&<div style={{width:28,height:28,borderRadius:"50%",background:C.bgCard2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>👤</div>}
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about ETS, XGBoost, RMSE, safety stock... or type 'challenge'" style={{flex:1,background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,outline:"none"}}/>
        <button onClick={send} style={{padding:"10px 20px",background:C.accent,color:C.bg,border:"none",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13}}>Send</button>
      </div>
      <p style={{color:C.textMuted,fontSize:11,margin:"8px 0 0"}}>Quick topics: ETS · XGBoost · RMSE · hybrid model · safety stock · leakage · bias-variance · judgmental adjustment · FVA · challenge</p>
    </div>
  );
}

/* ══════════ CHAPTER COMPONENTS ══════════ */

function ChHome(){
  return (
    <div>
      <div style={{background:`linear-gradient(135deg,#1a2744 0%,${C.bgCard} 100%)`,border:`1px solid ${C.accentDim}`,borderRadius:16,padding:"36px 32px",marginBottom:32}}>
        <div style={{color:C.accent,fontSize:12,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>Capstone · CP194 · Minerva University</div>
        <h1 style={{color:C.text,fontSize:28,fontWeight:700,margin:"0 0 8px",lineHeight:1.3}}>From Forecasts to Decisions</h1>
        <h2 style={{color:C.textDim,fontSize:17,fontWeight:400,margin:"0 0 20px"}}>A Practical Guide to Demand Forecasting for Early-Career Analysts</h2>
        <p style={{color:C.textMuted,fontSize:13,margin:0}}>Takaya Maekawa · Minerva University</p>
      </div>

      <SubHeader id="problem">The Problem</SubHeader>
      <P>Demand forecasting is often treated as a technical task focused on accuracy. In practice, accurate forecasts frequently fail to change decisions. During an internship in demand forecasting, I found that stakeholders rarely asked about error metrics. Instead, they asked how <em>risky</em> the forecast was, how much uncertainty they should plan for, and when human judgment should override the model. This gap between prediction and decision is the central problem of this project.</P>

      <DR><strong>Core Idea:</strong> Forecast accuracy is not the goal. Decision support is. Forecasts create value only when they help people act under uncertainty. This requires models that are interpretable, stable, and aligned with how organizations actually make decisions.</DR>

      <SubHeader id="built">What I Built</SubHeader>
      <P>Using anonymized weekly retail sales data, I developed a decision-aware forecasting framework that:</P>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24}}>
        <li>Frames forecasting around <em>who uses the forecast</em> and <em>what decisions it supports</em></li>
        <li>Compares statistical baselines (Seasonal Naive, ETS) and machine learning models (XGBoost) by their <em>assumptions and failure modes</em>, not just accuracy</li>
        <li>Builds a hybrid model where ETS captures trend and seasonality, and XGBoost models systematic calendar-based deviations</li>
        <li>Integrates a human-in-the-loop workflow, where models act as anchors and human overrides are disciplined and auditable</li>
      </ul>

      <SubHeader id="abstract">Academic Abstract</SubHeader>
      <div style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"20px 24px",margin:"16px 0"}}>
        <P>Demand forecasting is commonly framed as a technical problem of minimizing predictive error. In applied organizational settings, however, forecasts generate value only when they meaningfully support human decision-making. This paper reframes demand forecasting as a decision-support problem rather than a purely predictive one and is structured as a practice-oriented guide for early-career analysts entering applied forecasting roles.</P>
        <P>Drawing on practical experience from an industry internship, the guide examines how organizational context, evaluation choices, and model interpretability shape whether forecasts are adopted and acted upon. Using anonymized weekly retail sales data, it analyzes baseline statistical models (Seasonal Naive and Exponential Smoothing) and machine learning models (XGBoost) through the lens of their structural assumptions, failure modes, and decision relevance, rather than accuracy alone.</P>
        <P>The guide introduces a hybrid forecasting framework that decomposes demand into a smooth structural baseline and a constrained machine learning residual component. Empirical evaluation shows that while the hybrid model does not always outperform simpler baselines on RMSE alone, it provides superior decision support by enabling uncertainty-aware planning, diagnostic residual analysis, and disciplined human judgment.</P>
      </div>

      <SubHeader id="why">Why It Matters</SubHeader>
      <P>The final model does not always win on RMSE. Instead, it produces forecasts that are easier to explain, highlight when demand is unusually risky, and support better planning decisions. The main contribution of this capstone is not a better prediction, but a better way to turn forecasts into action.</P>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"20px 0"}}>
        <RMSEBadge label="Seasonal Naive" value={SN_RMSE} color={C.textDim}/>
        <RMSEBadge label="ETS" value={ETS_RMSE} color={C.accent}/>
        <RMSEBadge label="Hybrid (ETS+XGB)" value={HYB_RMSE} color={C.green}/>
      </div>
      <p style={{color:C.textMuted,fontSize:12,fontStyle:"italic"}}>Simulated RMSE values from the interactive demo data. Paper reports: Seasonal Naive ≈ 3,198,710 · ETS ≈ 6,480,405 · Hybrid ≈ 4,786,437</p>
    </div>
  );
}

function Ch1(){
  return (
    <div>
      <SectionHero num="Section 1" title="Introduction: Why Forecast Accuracy Is Not the Goal" subtitle="Reframing forecasting from a prediction exercise to a decision-support problem."/>
      <AnchorNav links={[{id:"s1_1",label:"1.1 Motivation"},{id:"s1_2",label:"1.2 Audience & Scope"},{id:"s1_3",label:"1.3 How to Read"},{id:"s1_tk",label:"Key Takeaways"}]}/>

      <SubHeader id="s1_1">1.1 Motivation</SubHeader>
      <P>Demand forecasting is often framed as a technical exercise centered on minimizing predictive error. Introductory resources typically emphasize model selection, parameter tuning, and performance metrics such as RMSE or MAE, and applied forecasting texts rightly devote significant attention to these tools (Hyndman &amp; Athanasopoulos, 2021). However, this framing can be misleading in practice. <strong>Forecasts do not create value solely by being accurate. They create value by influencing decisions.</strong></P>
      <P>In real organizations, forecasts support actions such as inventory planning, purchasing, and risk management. A forecast that marginally improves RMSE but does not change any of these actions has limited impact. By contrast, a forecast that is easier to interpret, more robust to data limitations, or better aligned with operational constraints may be more useful — even if it is slightly less accurate. Accuracy is therefore necessary for good forecasting, but it is not sufficient.</P>
      <Quote source="From my internship at a Japanese startup">When presenting results, I shared predicted values and accuracy metrics, assuming these would be sufficient for decision-making. In practice, stakeholders were less concerned with whether the error had improved and more focused on how the predictions should be used. They asked whether shortages were likely, how much uncertainty could be tolerated, how the model arrived at its predictions, and what the overall shape of the forecast implied.</Quote>
      <P>This experience reflects a broader pattern documented in forecasting research. Fildes and Goodwin (2007) show that forecasts often fail not because they are statistically unsound, but because human judgment, interpretation, and organizational context are insufficiently integrated into the forecasting process. An exclusive focus on accuracy metrics can obscure these factors and lead to models that perform well technically but fail to support decisions.</P>
      <P>Uncertainty further complicates this issue. As Silver (2012) argues, the central challenge of forecasting lies in reasoning under uncertainty rather than producing a single precise number. Point forecasts can create a false sense of certainty, particularly when errors are costly or asymmetric. In my own work, stakeholders were often more receptive to forecasts framed as ranges or scenarios once uncertainty was communicated clearly.</P>
      <DR>For these reasons, this guide starts from a simple premise: forecast accuracy is not the goal. The goal is to help people make better decisions under uncertainty. Accuracy matters, but it must be considered alongside <strong>interpretability, robustness, and actionability</strong>.</DR>

      <SubHeader id="s1_2">1.2 Audience and Scope</SubHeader>
      <P>This guide is written for junior analysts and interns who are beginning to work on demand forecasting in applied settings. More specifically, it is written for the version of myself at the beginning of last summer. At that point, I was comfortable with coding, fitting models, and computing evaluation metrics, but I lacked a structured understanding of how forecasts were actually used by others.</P>
      <P>The guide assumes familiarity with basic data science concepts, including time series data, regression models, and standard evaluation metrics. It does not assume prior experience with forecasting theory, supply chain management, or organizational decision-making. Mathematical detail is included where it clarifies assumptions, but extensive derivations are avoided in the main text.</P>
      <Callout icon="🎯" color={C.accent} title="Scope">The focus is on demand forecasting in retail and startup environments, where data is often sparse, noisy, and shaped by operational constraints. This allows the guide to explore realistic failure modes and trade-offs in depth, rather than providing a broad but shallow survey of methods.</Callout>

      <SubHeader id="s1_3">1.3 How to Read This Guide (Methodological Note)</SubHeader>
      <P>The guide follows a layered structure designed to balance accessibility and rigor:</P>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,margin:"16px 0"}}>
        {[["Layer 1","Plain Language & Visuals","Intuition and decision relevance first — build an accurate mental model before engaging with formal methods."],["Layer 2","Formal Anchors","Model definitions, key formulas, and explicit statements of assumptions. What does each method assume about the world?"],["Layer 3","References & Code","Academic references situate the discussion within established literature. Code examples demonstrate practical implementation."]].map(([num,title,desc],i)=>(
          <div key={i} style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px"}}>
            <div style={{color:C.accent,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{num}</div>
            <div style={{color:C.orange,fontSize:13,fontWeight:600,marginBottom:8}}>{title}</div>
            <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.6}}>{desc}</p>
          </div>
        ))}
      </div>
      <P>Readers can engage with these layers selectively. Those seeking a high-level understanding may focus on intuition and visuals, while others may examine assumptions and code more closely. This structure reflects how I learned most effectively during my internship, after struggling with resources that either emphasized technical detail without context or business discussion without clear links to models.</P>

      <SubHeader id="s1_tk">Section 1 Key Takeaways</SubHeader>
      <KeyTakeaways items={[
        "Accuracy is necessary but not sufficient. Forecasts create value only when they inform decisions; strong predictive performance alone does not guarantee usefulness.",
        "Forecasting failures often occur at the interpretation stage. Statistically sound models can fail when their logic, uncertainty, or implications are not aligned with human judgment and organizational decision-making.",
        "This guide frames forecasting as a decision-support tool. By connecting intuition, formal models, and action, it emphasizes uncertainty-aware forecasts that translate into concrete operational choices."
      ]}/>
    </div>
  );
}

function Ch2(){
  return (
    <div>
      <SectionHero num="Section 2" title="The Hidden Question Behind Every Forecast" subtitle="How organizational context shapes forecasting tasks — using a real Japanese snack company case study."/>
      <AnchorNav links={[{id:"s2_1",label:"2.1 Business → Forecast"},{id:"s2_2",label:"2.2 Five Dimensions"},{id:"s2_3",label:"2.3 What Was Forecasted"},{id:"s2_tk",label:"Key Takeaways"}]}/>

      <P>Forecasting problems rarely start as technical problems. They start as organizational questions about efficiency, control, and legitimacy — and only later become framed as modeling tasks. As a result, a forecast often answers a question that is never explicitly stated, but that is shaped by who the client is, who controls adoption, and what success must look like inside the organization.</P>

      <SubHeader id="s2_1">2.1 From Business Concern to Forecasting Task</SubHeader>
      <P>At a Japanese snack company where I interned, store employees placed daily orders for individual snack products. These decisions were based on recent sales, shelf conditions, and local context. Headquarters viewed this process as costly and inconsistent across stores, and raised the question of whether it could be replaced or standardized using AI.</P>
      <P>When this concern was handed to the IT department, it was reframed as a forecasting task: <em>build a demand prediction system that could outperform humans</em>. This reframing immediately narrowed what "success" would mean. Rather than asking how store-level decisions could be improved, the project focused on whether an AI model could produce forecasts that looked credible and accurate enough to justify adoption at the headquarters level.</P>
      <P>Although the available data consisted of daily, store-level sales, the effective client of the forecast was headquarters. As a result, the forecasting task implicitly became <strong>weekly demand forecasting at the product level, aggregated across stores</strong>. This level of aggregation produced smoother series, more stable patterns, and cleaner comparisons — all of which were easier to present and defend in internal discussions.</P>
      <Callout icon="⚠️" color={C.orange} title="Organizational Reality">This choice was not purely technical. It reflected organizational power. Headquarters needed forecasts that could be monitored centrally and compared across products, while the IT department needed outputs that would "look good" relative to human baselines in order to convince the company to adopt the system.</Callout>

      <SubHeader id="s2_2">2.2 Decision, Horizon, Granularity, and Metrics</SubHeader>
      <P>Once the decision-maker was implicitly defined as headquarters, several downstream choices followed naturally:</P>
      <TableBlock
        headers={["Dimension","Choice Made","Rationale"]}
        rows={[
          ["Decision","Weekly planning and reporting at HQ","HQ requires stable, comparable summaries across products"],
          ["Horizon","1–2 weeks ahead","Aligns with HQ planning and reporting cycles"],
          ["Granularity","Product-level, aggregated across stores","Aggregation reduces noise and improves apparent accuracy"],
          ["Target","Observed sales treated as demand","Matches human baseline logic; avoids modeling stockouts"],
          ["Metric","RMSE","Simple, quantitative comparison against humans"]
        ]}
        caption="Table 2.1. Defining headquarters as the effective decision-maker shaped the forecasting task, determining the decision context, horizon, granularity, target, and evaluation metric."
      />
      <P>Together, these choices defined a very specific forecasting task: produce weekly, product-level demand forecasts that outperform human baselines on accuracy metrics and are easy to justify at the headquarters level. This task was coherent and internally consistent, but it was only one of many possible ways the original business concern could have been translated.</P>

      <SubHeader id="s2_3">2.3 What Was Actually Being Forecasted</SubHeader>
      <P>Under this framing, <strong>observed sales were treated as a proxy for demand</strong>. This simplification aligned with the goal of outperforming human forecasts, which were also based on historical sales. It also avoided having to model stockouts, unmet demand, or deliberate under-ordering by store employees.</P>
      <P>Whether this assumption was appropriate depended on the purpose of the forecast. For justifying AI adoption at headquarters, it was sufficient. For improving shelf availability or reducing lost sales, it would have been inadequate. The choice to equate sales with demand was therefore not a statistical necessity, but a decision driven by the organizational goal the forecast was meant to serve.</P>
      <DR><strong>Key insight:</strong> Modeling assumptions follow purpose, not vice versa. The decision to treat observed sales as demand and to prioritize accuracy over operational impact were not technical necessities — they were consequences of the organizational goal the forecast was meant to serve.</DR>

      <SubHeader id="s2_tk">Section 2 Key Takeaways</SubHeader>
      <KeyTakeaways items={[
        "Every forecast answers a hidden organizational question. In this case, the forecast was designed less to improve store-level decisions than to justify AI adoption at headquarters, shaping what 'success' meant from the outset.",
        "Client, horizon, and metric choices are coupled. Because HQ was the decision-maker, the forecast became weekly, product-level, and focused on stable patterns. Accuracy metrics like RMSE mattered mainly because they made it easy to compare the AI to humans.",
        "Modeling assumptions follow purpose, not vice versa. Treating observed sales as demand and prioritizing accuracy over operational impact were not technical necessities, but consequences of the organizational goal the forecast was meant to serve."
      ]}/>
    </div>
  );
}

function Ch3(){
  const monthlyAvg=useMemo(()=>{
    const byMonth=_.groupBy(DATA,d=>d.month);
    return Object.entries(byMonth).map(([m,ds])=>({month:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1],avg:Math.round(_.mean(ds.map(d=>d.sales)))}));
  },[]);
  const histBins=useMemo(()=>{
    const vals=DATA.map(d=>d.sales),min=Math.min(...vals),max=Math.max(...vals),bins=12,bw=(max-min)/bins;
    return Array.from({length:bins},(_,i)=>({range:`${Math.round((min+i*bw)/1000)}k`,count:vals.filter(v=>v>=min+i*bw&&v<min+(i+1)*bw).length}));
  },[]);
  const fmt=v=>`${(v/1000).toFixed(0)}k`;

  return (
    <div>
      <SectionHero num="Section 3" title="Understanding the Data Through Visualization and Preprocessing" subtitle="Treating visualization as a methodological step — using plots to test assumptions and reveal limitations."/>
      <AnchorNav links={[{id:"s3_1",label:"3.1 Raw Time Series"},{id:"s3_2",label:"3.2 Distribution"},{id:"s3_3",label:"3.3 Seasonality"},{id:"s3_tk",label:"Key Takeaways"}]}/>

      <P>Before fitting any model, it is essential to understand what the data can and cannot support. In practice, many forecasting failures arise not from model choice, but from unexamined assumptions about demand stability, seasonality, noise, and what the observed data actually represent (Hyndman &amp; Athanasopoulos, 2021; Spiegelhalter, 2019). This section treats <strong>visualization as a methodological step</strong>, using plots to test assumptions and reveal limitations that directly shape downstream modeling choices.</P>
      <P>The figures in this section are intentionally simple. Their role is not to "discover patterns," but to answer concrete questions such as: Is the series stable enough to forecast? Is seasonality plausible? What does aggregation hide? How do preprocessing choices change what the model will see?</P>

      <SubHeader id="s3_1">3.1 Visualizing the Raw Time Series: Stability and Spikes</SubHeader>
      <P>The plot below serves as a first diagnostic. Several properties are immediately visible:</P>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24,marginBottom:16}}>
        <li><strong>No zero values.</strong> Because the data are aggregated across stores, there are no weeks with zero sales. Many demand models assume intermittency, but these assumptions are inappropriate here. The absence of zeros is a consequence of aggregation, not a property of consumer demand.</li>
        <li><strong>Large spikes and local volatility.</strong> The series shows occasional sharp peaks consistent with promotion periods, holidays, or tourist surges. These are not labeled in the data, implying the model must either absorb them as noise or approximate them through seasonal structure.</li>
        <li><strong>Apparent upward drift.</strong> Average sales appear to increase over time. Whether this reflects genuine growth, changes in store coverage, or reporting practices cannot be inferred from the data alone.</li>
      </ul>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={DATA} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" label={{value:"Week",fill:C.textDim,fontSize:11,position:"insideBottom",offset:-4}} tick={{fill:C.textDim,fontSize:11}}/>
          <YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <ReferenceLine x={78} stroke={C.yellow} strokeDasharray="4 2" label={{value:"Train/Test Split",fill:C.yellow,fontSize:10,position:"top"}}/>
          <Area type="monotone" dataKey="sales" stroke={C.accent} fill={C.accentGlow} strokeWidth={1.5} name="Weekly Sales" dot={false}/>
        </ComposedChart>
      </ResponsiveContainer>
      <FigCap num="3.1">Weekly observed sales over 104 weeks. Aggregated weekly sales for a single product, illustrating volatility, occasional extreme spikes, and the absence of zero values due to store-level aggregation. Yellow line = train/test split at week 78.</FigCap>

      <SubHeader id="s3_2">3.2 Distribution of Sales: What "Typical" Means</SubHeader>
      <P>The histogram reveals a <strong>right-skewed distribution</strong>: most weeks cluster around a moderate sales level, while a small number of weeks account for very large values.</P>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24,marginBottom:16}}>
        <li><strong>Mean-based metrics are sensitive to spikes.</strong> Metrics such as RMSE will disproportionately penalize errors during high-volume weeks. This aligns with the adoption context in Section 2: large misses during peak periods are highly visible to headquarters.</li>
        <li><strong>Log or variance-stabilizing transformations may be justified.</strong> The distribution suggests heteroskedasticity — a common feature of sales data. Box &amp; Cox (1964) and Hyndman &amp; Athanasopoulos (2021) recommend considering transformations when variance increases with level.</li>
      </ul>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={histBins} margin={{top:10,right:16,bottom:20,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="range" label={{value:"Weekly Sales (thousands)",fill:C.textDim,fontSize:11,position:"insideBottom",offset:-8}} tick={{fill:C.textDim,fontSize:11}}/>
          <YAxis label={{value:"Count",angle:-90,position:"insideLeft",fill:C.textDim,fontSize:11}} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Bar dataKey="count" fill={C.purple} name="Number of Weeks"/>
        </BarChart>
      </ResponsiveContainer>
      <FigCap num="3.2">Distribution of weekly observed sales. The right-skewed shape means a small number of high-volume weeks exert disproportionate influence on error metrics such as RMSE.</FigCap>

      <SubHeader id="s3_3">3.3 Seasonality as an Assumption, Not a Discovery</SubHeader>
      <P>The chart below plots average weekly sales by calendar month. Two methodological points are worth emphasizing:</P>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24,marginBottom:16}}>
        <li><strong>Seasonality is expected, not inferred.</strong> The purpose of this plot is not to "find" seasonality, but to verify that a seasonal assumption is reasonable. Domain knowledge should guide model structure, with visualization used as confirmation rather than exploration (Fildes &amp; Goodwin, 2007).</li>
        <li><strong>Aggregation smooths within-month variation.</strong> Monthly averages suppress week-level effects such as single holidays or promotions. This reinforces the decision to model at a weekly horizon rather than daily.</li>
      </ul>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={monthlyAvg} margin={{top:10,right:16,bottom:20,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="month" tick={{fill:C.textDim,fontSize:11}}/>
          <YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Bar dataKey="avg" fill={C.orange} name="Average Weekly Sales"/>
        </BarChart>
      </ResponsiveContainer>
      <FigCap num="3.3">Seasonal pattern in weekly sales by month. Clear seasonality with pronounced spikes in August and December, consistent with peak tourism and holiday-driven demand. These recurring patterns suggest calendar effects are a first-order driver of demand and should be explicitly modeled rather than treated as noise.</FigCap>

      <SubHeader id="s3_tk">Section 3 Key Takeaways</SubHeader>
      <KeyTakeaways items={[
        "Visualization is a form of assumption checking. Time-series plots and distributions revealed trends, volatility, and skewness that are not visible from summary statistics alone, helping surface implicit assumptions about stability and noise.",
        "Seasonality is a structural feature, not an anomaly. Monthly averages showed systematic peaks (August and December), consistent with tourism and holiday effects. These patterns should be modeled explicitly rather than treated as irregular fluctuations.",
        "Aggregation shapes what the data can and cannot say. Working with aggregated weekly sales removes zero values and local stockout signals, making the series easier to model but limiting what can be inferred about unmet demand or store-level behavior.",
        "Preprocessing choices encode decisions. Sales were aggregated to weekly product-level, zero values were eliminated through aggregation, and observed sales were treated as demand. These choices reduced noise but ruled out questions about store-level variation, short-term stockouts, and unmet demand."
      ]}/>
    </div>
  );
}

function Ch4(){
  const testChartData=TEST.map((d,i)=>({week:d.week,actual:d.sales,sn:SN_PRED[i]?.forecast,ets:ETS_PRED[i]?.forecast,hyb:HYB_PRED[i]?.forecast}));
  const xgbSimulated=TEST.map((d,i)=>({week:d.week,actual:d.sales,xgb:Math.round(SN_PRED[i]?.forecast*0.93+(Math.sin(i*0.8)*8000))}));
  const fmt=v=>`${(v/1000).toFixed(0)}k`;

  return (
    <div>
      <SectionHero num="Section 4" title="Understanding Base Models: Assumptions, Mechanics, and Limitations" subtitle="Every model encodes assumptions about how demand behaves. Understanding them is essential for diagnosis."/>
      <AnchorNav links={[{id:"s4_1",label:"4.1 Statistical Models"},{id:"s4_2",label:"4.2 XGBoost"},{id:"s4_3",label:"4.3 Comparison"}]}/>

      <P>Forecasting models should not be treated as black boxes that produce predictions. Each model implements a specific mechanism for extrapolating the past into the future, and that mechanism encodes assumptions about how demand behaves. Model understanding matters for three technical reasons:</P>
      <ol style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24,marginBottom:16}}>
        <li><strong>It enables diagnosis.</strong> When a forecast underperforms during seasonal peaks or reacts poorly to shocks, the cause is often tied to model structure.</li>
        <li><strong>It supports meaningful comparison.</strong> Improvements in RMSE may reflect overfitting, leakage, or sensitivity to aggregation rather than genuine learning.</li>
        <li><strong>It allows results to be explained and scrutinized.</strong> Changes in forecast shape should be traceable to specific model components, not inferred after the fact.</li>
      </ol>

      <SubHeader id="s4_1">4.1 Statistical Models</SubHeader>
      <H4>Seasonal Naive Forecasting</H4>
      <P>The seasonal naive model defines the forecast for a future period as the observed value from the same seasonal period in the past. Let y_t denote observed demand at time t, and m the seasonal cycle length. For weekly data with annual seasonality m = 52:</P>
      <MathBlock>{`Seasonal Naive Forecast:
  ŷ_{t+h} = y_{t+h−m}

where:
  h = forecast horizon (periods ahead)
  m = seasonal cycle length (52 for weekly/annual)

Interpretation: the forecast for week t+h is simply
the observed value from the same week last year.`}</MathBlock>
      <P>The model assumes that seasonal patterns repeat exactly over time. Its main strength is <strong>transparency</strong> — each prediction corresponds directly to a past observation. However, its limitations are substantial: no trend component, cannot capture gradual growth or decline, strictly relies on exactly one seasonal cycle ago (discards all other history).</P>
      <Callout icon="⚠️" color={C.yellow} title="Practical Limitation">In volatile retail data with evolving demand patterns — like weekly snack sales driven by tourism and holidays — the seasonal naive model's assumption of exactly repeating patterns is often violated. It is best used as a benchmark baseline, not a production model.</Callout>

      <H4>Exponential Smoothing (ETS)</H4>
      <P>ETS (Error–Trend–Seasonality) represents demand using latent components that are updated recursively. The full additive model with level, trend, and seasonality is:</P>
      <MathBlock>{`Level update:
  lₜ = α(yₜ − sₜ₋ₘ) + (1−α)(lₜ₋₁ + bₜ₋₁)

Trend update:
  bₜ = β(lₜ − lₜ₋₁) + (1−β)bₜ₋₁

Seasonal update:
  sₜ = γ(yₜ − lₜ) + (1−γ)sₜ₋ₘ

Forecast h periods ahead:
  ŷ_{t+h} = lₜ + h·bₜ + sₜ₊ₕ₋ₘₖ   (k = ⌊(h−1)/m⌋)

Parameters: α, β, γ ∈ (0, 1)
  α → level responsiveness (larger = faster adaptation)
  β → trend stability (smaller = smoother trend)
  γ → seasonal persistence`}</MathBlock>
      <P>The parameter α controls how quickly the model reacts to new information: larger α places more weight on the most recent observation, making the model more responsive but less stable. Each parameter encodes a distinct assumption about demand dynamics.</P>
      <P>ETS works well for aggregated weekly demand with stable seasonality. However, its limitations are direct consequences of model design, not estimation flaws:</P>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24}}>
        <li><strong>Reacts slowly to abrupt changes.</strong> Sudden shocks are dampened by the smoothing process.</li>
        <li><strong>Cannot incorporate external information.</strong> All updates are driven solely by past demand. Calendar effects must be handled indirectly, if at all.</li>
        <li><strong>Extrapolates existing structure.</strong> If demand changes shape in ways not captured by the chosen components, the model will systematically misforecast.</li>
      </ul>

      <SubHeader id="s4_2">4.2 Gradient-Boosted Decision Trees (XGBoost)</SubHeader>
      <P>Unlike statistical forecasting models, XGBoost does not impose an explicit generative structure on demand. Instead, it learns predictive structure implicitly through an additive ensemble of decision trees optimized under a regularized objective.</P>
      <AppLink url="https://capstone-6csneemobbehhcttzqkt2q.streamlit.app/" label="Interactive XGBoost Tutorial (Streamlit)" desc="Explore tree mechanics, boosting dynamics, bias–variance tradeoffs, and extrapolation failure interactively."/>

      <H4>4.2.1 Decision Tree Ensembles</H4>
      <MathBlock>{`Ensemble prediction:
  ŷᵢ = Σₖ₌₁ᴷ fₖ(xᵢ),   fₖ ∈ ℱ

where:
  xᵢ = feature vector for observation i
  fₖ = a regression tree mapping inputs to a leaf weight
  ℱ  = space of all possible trees with fixed max depth

Each tree partitions the feature space into disjoint
regions and assigns a constant value to each region.
Trees do NOT operate independently — each is added
sequentially to correct errors of the existing ensemble.`}</MathBlock>

      <H4>4.2.2 Regularized Learning Objective</H4>
      <MathBlock>{`Objective function (Chen & Guestrin, 2016):
  L = Σᵢ ℓ(yᵢ, ŷᵢ) + Σₖ Ω(fₖ)

Complexity penalty per tree:
  Ω(f) = γT + ½λ Σⱼ₌₁ᵀ wⱼ²

where:
  T   = number of leaf nodes
  wⱼ  = prediction weight of leaf j
  γ   penalizes excessive tree growth (number of splits)
  λ   penalizes large leaf weights (weight magnitude)

This formalizes the bias–variance tradeoff:
high γ/λ → simpler trees → less overfitting but higher bias.`}</MathBlock>

      <H4>4.2.3 Additive Training via Gradient Boosting</H4>
      <MathBlock>{`Additive expansion (step t):
  ŷᵢ⁽ᵗ⁾ = ŷᵢ⁽ᵗ⁻¹⁾ + η · fₜ(xᵢ)

  η ∈ (0,1] = learning rate (shrinkage)
  fₜ = tree added at iteration t, fit to pseudo-residuals

For squared error loss, pseudo-residuals are:
  gᵢ = yᵢ − ŷᵢ⁽ᵗ⁻¹⁾   (each tree ≈ current residuals)

Implications:
  • XGBoost reduces prediction error incrementally
  • Learning rate η controls stability vs. responsiveness
  • Overfitting arises when trees are too deep or too numerous`}</MathBlock>

      <H4>4.2.4 Implicit Assumptions in XGBoost</H4>
      <P>Unlike ETS, XGBoost's assumptions are implicit in the algorithm and feature design:</P>
      <TableBlock
        headers={["Assumption","Implication for Demand Forecasting"]}
        rows={[
          ["No extrapolation beyond observed data","Trees predict the nearest learned leaf outside training range → flat long-horizon forecasts"],
          ["Dependence on feature engineering","Seasonality, trends, calendar effects must be explicitly encoded as features — they are not learned automatically"],
          ["Error-driven learning","The model focuses on minimizing loss, not preserving interpretability or temporal structure unless constrained"]
        ]}
      />

      <XGBoostTutorial/>

      <SubHeader id="s4_3">4.3 Comparing Base Models</SubHeader>
      <TableBlock
        headers={["Model","Core Assumptions","Strengths","Limitations","When to Use"]}
        rows={[
          ["Seasonal Naive","Demand repeats exactly with fixed seasonal period; no trend","Extremely simple; fully transparent; establishes clear lower bound","Cannot model growth or decline; requires data from exactly one season ago","As a conceptual baseline; sanity checks; not as a production model"],
          ["ETS","Demand evolves smoothly; recent observations more informative; seasonality persists but changes gradually","Explicit decomposition into level, trend, seasonality; interpretable; robust for aggregated demand","Responds slowly to abrupt shocks; cannot incorporate external drivers","Aggregated demand with stable seasonality and gradual shifts — e.g., weekly product-level sales for HQ planning"],
          ["XGBoost","Demand explained through nonlinear interactions of engineered features; training patterns persist","Captures complex nonlinear effects; flexible; strong predictive power when features are well designed","No inherent notion of time, trend, or extrapolation; sensitive to feature design; difficult to interpret without tooling","When key demand drivers are known and stable; typically best in hybrid models handling trend/seasonality separately"]
        ]}
        caption="Table 4.1. Model comparison across assumptions, strengths, limitations, and recommended use cases."
      />
      <P>Model performance on the held-out test horizon:</P>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"16px 0 20px"}}>
        <RMSEBadge label="Seasonal Naive" value={SN_RMSE} color={C.textDim}/>
        <RMSEBadge label="ETS" value={ETS_RMSE} color={C.accent}/>
        <RMSEBadge label="Hybrid (ETS+XGB)" value={HYB_RMSE} color={C.green}/>
      </div>
      <Callout icon="📊" color={C.accent} title="Paper Results (on anonymized real data)">Seasonal Naive: 3,198,710 · ETS: 5,516,043 · XGBoost (standalone): 2,784,754. The Seasonal Naive achieves lower RMSE in the paper test window because the period closely mirrors the prior year. This numerical advantage does not imply superior decision support.</Callout>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={testChartData} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Legend wrapperStyle={{fontSize:12}}/>
          <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={2} name="Actual"/>
          <Line type="monotone" dataKey="sn" stroke={C.textDim} dot={false} strokeWidth={1.5} strokeDasharray="5 3" name="Seasonal Naive"/>
          <Line type="monotone" dataKey="ets" stroke={C.accent} dot={false} strokeWidth={2} name="ETS"/>
          <Line type="monotone" dataKey="hyb" stroke={C.green} dot={false} strokeWidth={2} name="Hybrid"/>
        </LineChart>
      </ResponsiveContainer>
      <FigCap num="4.2">Held-out test period forecasts comparing Seasonal Naive, ETS, and the hybrid ensemble. The seasonal naive benefits from mechanical repetition of prior-year values. ETS provides a smooth baseline that underreacts to short-term variation. The hybrid balances structural credibility with calendar-based corrections.</FigCap>
    </div>
  );
}

function Ch5(){
  return (
    <div>
      <SectionHero num="Section 5" title="Evaluating Models in a Decision-Aware Way" subtitle="Evaluation embeds assumptions about how forecasts will be used, what kinds of errors matter, and which risks are acceptable."/>
      <AnchorNav links={[{id:"s5_1",label:"5.1 Backtesting"},{id:"s5_2",label:"5.2 Metric Choice"},{id:"s5_3",label:"5.3 Beyond Accuracy"},{id:"s5_tk",label:"Key Takeaways"}]}/>

      <P>Forecast evaluation is often treated as a purely technical step: split the data, compute an error metric, and select the model with the lowest number. In practice, this framing is incomplete. <strong>Evaluation embeds assumptions about how forecasts will be used, what kinds of errors matter, and which risks are acceptable.</strong> A model is not "good" in the abstract; it is good or bad relative to a decision context.</P>

      <SubHeader id="s5_1">5.1 Backtesting Design and Information Leakage</SubHeader>
      <P>A decision-aware backtest mirrors how the forecast would be produced in practice. In this guide, models are evaluated using a <strong>fixed-horizon split</strong>, where the training set contains only observations available up to a given point in time, and the test set represents a future decision window.</P>
      <H4>Common Pitfalls</H4>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,margin:"16px 0"}}>
        <div style={{background:C.bgCard2,border:`1px solid ${C.red}40`,borderRadius:8,padding:"14px 18px"}}>
          <div style={{color:C.red,fontSize:13,fontWeight:600,marginBottom:8}}>⚠️ Random Splits</div>
          <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.6}}>Randomly splitting time series data mixes past and future observations. This breaks temporal structure and allows the model to implicitly learn from information that would not be available at forecast time. Performance appears artificially strong.</p>
        </div>
        <div style={{background:C.bgCard2,border:`1px solid ${C.red}40`,borderRadius:8,padding:"14px 18px"}}>
          <div style={{color:C.red,fontSize:13,fontWeight:600,marginBottom:8}}>⚠️ Feature Leakage</div>
          <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.6}}>Feature leakage occurs when engineered variables encode future information. Common examples: cumulative sales incorporating future weeks, normalization statistics computed over the full dataset. Leakage produces overly optimistic results and can be difficult to detect.</p>
        </div>
      </div>

      <SubHeader id="s5_2">5.2 Metric Choice Depends on the Decision</SubHeader>
      <P>Metrics encode priorities about what kinds of errors matter most. The choice of metric should reflect the downstream consequences of forecast errors, not default to standard practice.</P>
      <MathBlock>{`Root Mean Squared Error (RMSE):
  RMSE = √(1/n · Σₜ₌₁ⁿ (yₜ − ŷₜ)²)

Mean Absolute Error (MAE):
  MAE = 1/n · Σₜ₌₁ⁿ |yₜ − ŷₜ|

Mean Absolute Percentage Error (MAPE):
  MAPE = 1/n · Σₜ₌₁ⁿ |yₜ − ŷₜ| / yₜ × 100%

RMSE properties:
  • Penalizes large errors quadratically (sensitive to outliers)
  • Units match original series (interpretable)
  • Aligns with contexts where extreme misses are costly

MAE properties:
  • All errors weighted equally (robust to outliers)
  • Units match original series
  • Better for symmetric error contexts`}</MathBlock>
      <TableBlock
        headers={["Decision Context","Preferred Metric","Reason"]}
        rows={[
          ["Headquarters-level reporting","RMSE","Large misses are highly visible; penalizing them aligns with adoption concerns"],
          ["Inventory planning","Asymmetric cost functions or quantile metrics","Under-forecasting and over-forecasting have different costs"],
          ["Budgeting and reporting","MAE or bias","Stability over responsiveness; directional accuracy matters"],
          ["Store-level replenishment","MAPE","Scale-independent comparison across products with different volumes"]
        ]}
        caption="Table 5.1. Metric choice should reflect the decision context, not default to standard practice."
      />

      <SubHeader id="s5_3">5.3 Beyond Point Accuracy</SubHeader>
      <P>Point forecasts summarize expected demand but hide important information. Two models with similar RMSE can behave very differently in practice. Key dimensions often overlooked in evaluation include:</P>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24,marginBottom:16}}>
        <li><strong>Stability:</strong> Does the forecast fluctuate wildly week to week?</li>
        <li><strong>Responsiveness:</strong> How quickly does the model react to genuine changes?</li>
        <li><strong>Failure modes:</strong> When the model fails, does it fail predictably or erratically?</li>
      </ul>
      <P>For example, the seasonal naive model may achieve low RMSE in specific windows by repeating last year's pattern, but provides no insight into why demand changes. ETS offers smoother behavior but may lag behind sudden shocks. XGBoost can improve accuracy by exploiting features, but may extrapolate poorly beyond observed regimes. Evaluating models solely on average error obscures these qualitative differences, which often matter more than marginal improvements in a metric.</P>
      <AppLink url="https://capstone-4kctzgqnx5tttraumgrmyj.streamlit.app/" label="Interactive Evaluation Lab (Streamlit)" desc="Explore temporal leakage, metric sensitivity, and decision-dependent value. Demos the pitfalls discussed in this section."/>
      <EvaluationLab/>

      <SubHeader id="s5_tk">Section 5 Key Takeaways</SubHeader>
      <KeyTakeaways items={[
        "Evaluation choices define what counts as success. Backtesting design and metric selection determine which model behaviors are rewarded and which failures are hidden.",
        "Accuracy metrics encode values, not just error. Measures like RMSE reflect priorities about risk, stability, and extremes, and should be chosen to match the decisions the forecast supports.",
        "Good evaluation supports trust, not just optimization. A model that scores well but cannot be explained, stress-tested, or trusted may be less useful than a slightly less accurate but predictable alternative."
      ]}/>
    </div>
  );
}

function Ch6(){
  const fanData=useMemo(()=>{
    return TEST.map((d,i)=>{
      const base=HYB_PRED[i]?.forecast||d.sales;
      const band=Math.round(8000+i*200);
      return {week:d.week,actual:d.sales,forecast:base,upper:base+band,lower:Math.max(0,base-band*0.7)};
    });
  },[]);
  const fmt=v=>`${(v/1000).toFixed(0)}k`;

  return (
    <div>
      <SectionHero num="Section 6" title="From Model Outputs to Actionable Insights" subtitle="How to transform raw forecast numbers into tools that actually change decisions."/>
      <AnchorNav links={[{id:"s6_1",label:"6.1 Black Box Problem"},{id:"s6_2",label:"6.2 Prediction Intervals"},{id:"s6_3",label:"6.3 Scenario Planning"},{id:"s6_4",label:"6.4 Human-in-the-Loop"},{id:"s6_db",label:"Debrief"}]}/>

      <SubHeader id="s6_1">6.1 The "Black Box" Problem</SubHeader>
      <P>By the midpoint of my internship, I had achieved a technically sound model. My XGBoost ensemble was outperforming the human prediction, and my backtesting framework confirmed it was robust against leakage. I generated a forecast for the next four weeks, saved it as a CSV file, and presented it to the planning team.</P>
      <P><strong>The reaction was underwhelming.</strong></P>
      <P>The stakeholders did not look at the RMSE scores. Instead, they asked questions the model output could not answer:</P>
      <div style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 20px",margin:"16px 0"}}>
        {[
          `"Product A is forecasted for 500 units. How sure are you? Is it possible it sells 700?"`,
          `"We are running a TV spot next week. Does this number account for that?"`,
          `"If we only have a budget to stock 600 units, what is the risk of a stockout?"`
        ].map((q,i)=><p key={i} style={{color:C.text,fontStyle:"italic",margin:"0 0 8px",fontSize:14}}>💬 {q}</p>)}
      </div>
      <P>I realized I had fallen into a common trap for junior data scientists: confusing a <strong>Prediction</strong> (a statistical output) with an <strong>Insight</strong> (a guide for action). A point forecast (e.g., "500 units") conveys a false sense of certainty. In a business context, decision-makers are managing risk, not just seeking accuracy.</P>

      <SubHeader id="s6_2">6.2 Visualizing Uncertainty: Prediction Intervals</SubHeader>
      <P>The first step in transforming raw outputs into insights was moving away from point forecasts. In supply chain planning, the cost of being wrong is rarely symmetric (as shown in Section 5). Therefore, knowing the range of likely outcomes is often more valuable than the average outcome.</P>
      <P>I shifted to providing <strong>Prediction Intervals</strong> — often called "Fan Charts" in planning contexts. Instead of saying "Demand will be 500," the communication shifted to:</P>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,margin:"16px 0"}}>
        <div style={{background:"rgba(63,185,80,0.08)",border:`1px solid ${C.green}40`,borderRadius:8,padding:"14px 18px"}}>
          <div style={{color:C.green,fontSize:13,fontWeight:600,marginBottom:6}}>Lower Bound (Safety)</div>
          <p style={{color:C.text,fontSize:13,margin:0,lineHeight:1.6}}>"We are 95% confident demand will be <em>at least</em> 350. This covers our base contracts."</p>
        </div>
        <div style={{background:"rgba(248,81,73,0.08)",border:`1px solid ${C.red}40`,borderRadius:8,padding:"14px 18px"}}>
          <div style={{color:C.red,fontSize:13,fontWeight:600,marginBottom:6}}>Upper Bound (Risk)</div>
          <p style={{color:C.text,fontSize:13,margin:0,lineHeight:1.6}}>"There is a 5% chance demand could spike to 750. Do we have safety stock to cover this upside?"</p>
        </div>
      </div>
      <P>This reframing allowed the headquarters team to make <em>risk-adjusted decisions</em>. For high-margin "hero" products, they ordered towards the upper bound (accepting waste to capture sales). For low-margin experimental flavors, they ordered towards the mean (minimizing waste).</P>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={fanData} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Legend wrapperStyle={{fontSize:12}}/>
          <Area type="monotone" dataKey="upper" stroke="none" fill={C.green} fillOpacity={0.08} name="Upper Bound (95%)"/>
          <Area type="monotone" dataKey="lower" stroke="none" fill={C.bg} fillOpacity={1} name="Lower Bound (fill)"/>
          <Line type="monotone" dataKey="upper" stroke={C.green} strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Upper Bound"/>
          <Line type="monotone" dataKey="lower" stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Lower Bound"/>
          <Line type="monotone" dataKey="forecast" stroke={C.orange} strokeWidth={2.5} dot={false} name="Hybrid Forecast"/>
          <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={1.5} strokeDasharray="2 2" name="Actual (if known)"/>
        </ComposedChart>
      </ResponsiveContainer>
      <FigCap num="6.1">Fan chart showing the hybrid forecast with prediction interval. The interval communicates calendar-conditioned risk, enabling planners to set base contracts (lower bound) and contingency measures (upper bound) rather than ordering to a single point estimate.</FigCap>

      <SubHeader id="s6_3">6.3 Scenario Planning: The "What-If" Machine</SubHeader>
      <P>One distinct advantage of feature-based models like XGBoost is their interpretability regarding <em>drivers</em>. Because the model inputs included binary flags for promotions (is_promotion), I could simulate potential futures:</P>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,margin:"16px 0"}}>
        <div style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px"}}>
          <div style={{color:C.textDim,fontSize:13,fontWeight:600,marginBottom:6}}>Scenario A: Baseline</div>
          <p style={{color:C.text,fontSize:13,margin:0}}>Forecast demand with <code style={{background:C.bg,padding:"1px 4px",borderRadius:3,color:C.purple}}>is_promotion = 0</code></p>
        </div>
        <div style={{background:C.bgCard2,border:`1px solid ${C.green}40`,borderRadius:8,padding:"14px 18px"}}>
          <div style={{color:C.green,fontSize:13,fontWeight:600,marginBottom:6}}>Scenario B: Campaign</div>
          <p style={{color:C.text,fontSize:13,margin:0}}>Forecast demand with <code style={{background:C.bg,padding:"1px 4px",borderRadius:3,color:C.purple}}>is_promotion = 1</code></p>
        </div>
      </div>
      <P>Calculating the delta between these two scenarios quantified the expected lift. This moved the discussion from "I think the ad will work" to "The historical data suggests this promotion generates a <strong>+20% lift</strong>, requiring an additional 150 units of inventory." This capability transformed the model from a passive predictor into an active planning tool.</P>
      <DR>While scenario planning is a powerful application of feature-based models, this guide does not develop a comprehensive implementation to maintain focused scope. The example illustrates how model structure enables certain types of decision support, rather than providing a complete framework for promotional forecasting.</DR>

      <SubHeader id="s6_4">6.4 The "Human-in-the-Loop": Judgmental Adjustment</SubHeader>
      <P>The final — and perhaps most difficult — lesson was accepting that <strong>the model is not an oracle</strong>. Competitor bankruptcies, viral social media trends, or supply chain disruptions simply do not exist in the historical data.</P>
      <P>Academic literature refers to this as the need for Judgmental Adjustment (Petropoulos et al., 2022). However, it also warns of <strong>"Algorithm Aversion"</strong> (Dietvorst et al., 2015), where humans lose trust in a model after seeing it err, even if the model is statistically superior on average.</P>
      <H4>The Model-as-Anchor Workflow</H4>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,margin:"16px 0"}}>
        {[["1. Anchor","The model generates the statistical baseline and prediction interval.","#58A6FF"],["2. Adjustment","Domain experts review the output. They can adjust the forecast only if they can cite specific information not available to the model.","#F0883E"],["3. Log","Both the model forecast and the human adjustment are logged — enabling future FVA (Forecast Value Added) analysis.","#3FB950"]].map(([num,desc,color],i)=>(
          <div key={i} style={{background:C.bgCard2,border:`1px solid ${color}40`,borderRadius:8,padding:"14px 18px",textAlign:"center"}}>
            <div style={{color,fontSize:22,fontWeight:700,marginBottom:8}}>{num}</div>
            <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.6}}>{desc}</p>
          </div>
        ))}
      </div>
      <P>This process did two things. First, it respected domain expertise of the planners, increasing buy-in. Second, over time, it allowed evaluation of who added value. For stable, high-volume products, the model typically outperformed humans. But for new product launches (where historical data was sparse), human intuition significantly reduced error.</P>
      <AppLink url="https://capstone-mc8wa3bpt58vehazf7avef.streamlit.app/" label="Planner's Cockpit (Streamlit)" desc="Practice safety stock trade-offs, waterfall decomposition, and the Man vs. Machine FVA challenge."/>
      <ActionLab/>

      <SubHeader id="s6_db">Section 6 Debrief</SubHeader>
      <P>The transition from code to impact requires empathy for the decision-maker. A model that sits on a server predicts nothing; only a model that is trusted and understood drives action.</P>
      <KeyTakeaways items={[
        "Embrace uncertainty: a single number is a lie. Show the range. Prediction intervals transform model outputs into risk-management tools by communicating the full distribution of likely outcomes.",
        "Explain the 'why': use feature importance and scenario planning to explain what is driving the forecast. Decision-makers need to understand causality, not just correlation.",
        "Respect the human: the goal is not to replace the planner but to give them a better anchor. The Model-as-Anchor workflow balances statistical rigor with domain expertise through disciplined, auditable adjustments."
      ]}/>
    </div>
  );
}

function Ch7(){
  const hybFull=useMemo(()=>{
    const etsF=ETS_PRED,hybF=HYB_PRED;
    const residuals=TEST.map((d,i)=>({week:d.week,residual:d.sales-(etsF[i]?.forecast||d.sales),xgb_residual:(hybF[i]?.forecast||d.sales)-(etsF[i]?.forecast||d.sales)}));
    return {
      comparison:TEST.map((d,i)=>({week:d.week,actual:d.sales,sn:SN_PRED[i]?.forecast,ets:etsF[i]?.forecast,hybrid:hybF[i]?.forecast})),
      etsOnly:TEST.map((d,i)=>({week:d.week,actual:d.sales,ets:etsF[i]?.forecast})),
      residuals,
      withInterval:TEST.map((d,i)=>{const base=hybF[i]?.forecast||d.sales;const band=7000+i*180;return {week:d.week,actual:d.sales,forecast:base,upper:base+band,lower:Math.max(0,base-band*0.7)};})
    };
  },[]);
  const fmt=v=>`${(v/1000).toFixed(0)}k`;

  return (
    <div>
      <SectionHero num="Section 7" title="Building the Advanced Model Under Real Constraints" subtitle="A hybrid ETS + XGBoost ensemble designed around decision requirements, not performance metrics."/>
      <AnchorNav links={[{id:"s7_1",label:"7.1–7.5 Architecture"},{id:"s7_6",label:"7.6–7.7 Uncertainty"},{id:"s7_8",label:"7.8 Implementation & Results"}]}/>

      <P>The advanced model introduced here is not "advanced" because it uses a more sophisticated algorithm. It is advanced because its structure reflects the <strong>empirical properties of the data, the organizational constraints of the forecasting task, and the decision requirements identified in earlier sections.</strong></P>

      <SubHeader id="s7_1">7.1–7.5 Design, Architecture, and Training</SubHeader>
      <H4>7.1 Design Requirements</H4>
      <ol style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24,marginBottom:16}}>
        <li><strong>Information available at forecast time only.</strong> All features must be known when the forecast is made. No rolling statistics computed over future data.</li>
        <li><strong>Explicit representation of dominant structure.</strong> The data exhibit strong seasonality and gradual level changes. Any model must represent these regularities directly rather than treating them as noise.</li>
        <li><strong>Controlled extrapolation behavior.</strong> Tree-based models struggle with extrapolation when used alone. Long-horizon flattening must be avoided.</li>
        <li><strong>Interpretability and credibility.</strong> The forecast must support explanation and discussion. A numerically strong but opaque model does not meet headquarters-level planning needs.</li>
        <li><strong>Compatibility with uncertainty-aware decision making.</strong> The model must support communication of risk and uncertainty, not only point estimates.</li>
      </ol>

      <H4>7.2 Model Architecture: Structural Baseline + Residual Learner</H4>
      <MathBlock>{`Hybrid decomposition:
  yₜ = yₜ^(baseline) + rₜ

Step 1 — Fit ETS baseline:
  ŷₜ^ETS = f_ETS(y₁, ..., yₜ₋₁)

Step 2 — Compute training residuals:
  rₜ = yₜ − ŷₜ^ETS

Step 3 — Fit XGBoost residual model:
  r̂ₜ = f_XGB(year, month, week_of_month)

Step 4 — Final hybrid forecast:
  ŷₜ = ŷₜ^ETS + r̂ₜ^XGB

Division of labor:
  ETS  → smooth global structure (trend + seasonality)
  XGB  → systematic calendar-linked deviations (bounded)`}</MathBlock>

      <H4>7.3 Feature Design: Deliberately Minimal and Calendar-Based</H4>
      <P>The residual model uses only features derived from the timestamp of each observation:</P>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"16px 0"}}>
        {[["Year","Captures gradual inter-year shifts in seasonal shape"],["Month","Primary seasonal driver — identifies peak and trough months"],["Week of Month","Captures within-month variation (e.g., payday effects, holiday timing)"]].map(([f,d],i)=>(
          <div key={i} style={{background:C.bgCard2,border:`1px solid ${C.accent}40`,borderRadius:8,padding:"12px 16px",flex:1,minWidth:180}}>
            <code style={{color:C.accent,fontSize:13,fontWeight:600}}>{f}</code>
            <p style={{color:C.textDim,fontSize:12,margin:"6px 0 0"}}>{d}</p>
          </div>
        ))}
      </div>
      <P>No lagged demand variables or rolling statistics are included. This avoids leakage and prevents the residual model from implicitly reconstructing a time-series structure that conflicts with the ETS baseline. The goal is not to maximize predictive power, but to add just enough flexibility to correct systematic patterns the baseline cannot express.</P>

      <H4>7.4 Training and Evaluation Discipline</H4>
      <ul style={{color:C.text,fontSize:14,lineHeight:1.9,paddingLeft:24}}>
        <li>Time-based train–test splits only</li>
        <li>All preprocessing and model fitting performed strictly within the training window</li>
        <li>ETS fit using only historical data available at the forecast origin</li>
        <li>Residuals computed only on the training period</li>
        <li>XGBoost trained only on training residuals</li>
        <li>Final forecasts produced without access to test outcomes</li>
      </ul>
      <P>Hyperparameters are chosen conservatively: shallow trees, low learning rates, limited boosting rounds. The emphasis is on stability and predictable behavior, not on squeezing marginal RMSE improvements.</P>

      <H4>7.5 What the Ensemble Provides in Practice</H4>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,margin:"16px 0"}}>
        {[["Stability with Flexibility","ETS anchors the forecast in smooth structure; XGBoost corrects recurring deviations tied to calendar position.","#58A6FF"],["Improved Failure Behavior","When forecasts are wrong, errors can be traced to either baseline structure or residual effects — making failures diagnosable and explainable.","#F0883E"],["Alignment with Human Judgment","Because the baseline is explicit and residual corrections are bounded, planners can reason about when adjustments are justified.","#3FB950"]].map(([t,d,c],i)=>(
          <div key={i} style={{background:C.bgCard2,border:`1px solid ${c}40`,borderRadius:8,padding:"14px 18px"}}>
            <div style={{color:c,fontSize:13,fontWeight:600,marginBottom:8}}>{t}</div>
            <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.6}}>{d}</p>
          </div>
        ))}
      </div>

      <SubHeader id="s7_6">7.6–7.7 Uncertainty and Human Workflow Integration</SubHeader>
      <H4>7.6 Supporting Uncertainty Without Changing the Information Set</H4>
      <P>Point forecasts alone are insufficient for planning. The ensemble supports uncertainty communication by training the XGBoost residual model using <strong>quantile objectives</strong>, producing upper and lower residual estimates. Combined with the ETS baseline, this yields prediction intervals that reflect calendar-conditioned risk rather than constant-width uncertainty.</P>
      <MathBlock>{`Quantile residual forecasts:
  r̂ₜ^(q=0.05) = lower quantile residual
  r̂ₜ^(q=0.95) = upper quantile residual

Prediction interval:
  Lower: ŷₜ^ETS + r̂ₜ^(0.05)
  Center: ŷₜ^ETS + r̂ₜ^(0.50)   ← point forecast
  Upper: ŷₜ^ETS + r̂ₜ^(0.95)

Width of interval → calendar-conditioned uncertainty
(wider during historically volatile weeks)`}</MathBlock>

      <Card title="D3 Residual Explorer" icon="🧭" glow={C.orange}>
        <P>
          This is a D3-rendered interactive view of the same residual story:
          <Acc>red bars</Acc> are ETS residuals (Actual − ETS), and the <Acc>orange line</Acc>
          is the XGBoost residual prediction. Use it to zoom into “exception windows.”
        </P>
        <ResidualExplorerD3 data={hybFull.residuals} height={280} />
      </Card>

      <H4>7.7 Fit with the Human-in-the-Loop Workflow</H4>
      <P>The ensemble is designed to function as a forecasting anchor rather than an oracle. The model produces a baseline forecast and an uncertainty range. Domain experts adjust the forecast only when citing information not available to the model. Both outputs are logged, allowing organizations to learn from both model performance and human overrides over time.</P>

      <SubHeader id="s7_8">7.8 Implementing the Hybrid Logic on Real Data</SubHeader>
      <H4>7.8.1 Numerical Performance in Context</H4>
      <Callout icon="📊" color={C.accent} title="RMSE Results on Held-Out Test Horizon (Paper)">
        Seasonal Naive: <strong>3,198,710</strong> · ETS: <strong>6,480,405</strong> · ETS + XGBoost Residuals: <strong>4,786,437</strong>. At first glance, Seasonal Naive appears to dominate — it mechanically copies the prior-year summer spike which closely matched the test period.
      </Callout>
      <P>The seasonal naive model benefits from mechanically copying this structure, including the magnitude of the spike. When the future happens to repeat the past, this strategy is rewarded numerically. However, this performance comes at a cost. The seasonal naive forecast provides no explanation for why demand is high, no signal about how unusual the spike is, and no mechanism for communicating risk. It produces a number, but not an insight.</P>

      <H4>7.8.2–7.8.5 Decomposition, Residuals, and Uncertainty</H4>
      <P>Instead of a single point forecast, the hybrid model produces a decomposition: an ETS baseline that represents expected demand under normal seasonal conditions, and a residual correction that captures systematic deviations associated with specific calendar positions.</P>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={hybFull.comparison} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Legend wrapperStyle={{fontSize:12}}/>
          <Line type="monotone" dataKey="actual" stroke={C.text} dot={false} strokeWidth={2} name="Actual"/>
          <Line type="monotone" dataKey="sn" stroke={C.textDim} dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="Seasonal Naive"/>
          <Line type="monotone" dataKey="ets" stroke={C.accent} dot={false} strokeWidth={2} name="ETS Baseline"/>
          <Line type="monotone" dataKey="hybrid" stroke={C.green} dot={false} strokeWidth={2.5} name="Hybrid Ensemble"/>
        </LineChart>
      </ResponsiveContainer>
      <FigCap num="7.1">Held-out forecasts comparing all three model classes. The seasonal naive achieves lowest RMSE by repeating last year's values but offers no interpretability or uncertainty. ETS is smooth and explainable but underreacts to short-term variation. The hybrid balances structural seasonality with controlled calendar-based adjustments.</FigCap>

      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={hybFull.withInterval} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <Area type="monotone" dataKey="upper" stroke="none" fill={C.orange} fillOpacity={0.12} name="Interval"/>
          <Area type="monotone" dataKey="lower" stroke="none" fill={C.bg} fillOpacity={1}/>
          <Line type="monotone" dataKey="upper" stroke={C.orange} strokeWidth={1} strokeDasharray="4 2" dot={false} name="95% Upper"/>
          <Line type="monotone" dataKey="lower" stroke={C.orange} strokeWidth={1} strokeDasharray="4 2" dot={false} name="5% Lower"/>
          <Line type="monotone" dataKey="forecast" stroke={C.green} strokeWidth={2.5} dot={false} name="Hybrid Forecast"/>
          <Line type="monotone" dataKey="actual" stroke={C.text} strokeWidth={1.5} dot={false} strokeDasharray="2 2" name="Actual"/>
        </ComposedChart>
      </ResponsiveContainer>
      <FigCap num="7.2">Hybrid ensemble with residual-based prediction interval. Weeks with historically high residual variance show wider intervals, directing contingency planning toward the most uncertain periods. The ensemble mean serves as the nominal plan; the upper bound informs buffer inventory decisions.</FigCap>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={hybFull.residuals} margin={{top:10,right:16,bottom:10,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight}/>
          <XAxis dataKey="week" tick={{fill:C.textDim,fontSize:11}}/><YAxis tickFormatter={fmt} tick={{fill:C.textDim,fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(),"units"]} contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`}}/>
          <ReferenceLine y={0} stroke={C.border} strokeWidth={2}/>
          <Bar dataKey="residual" fill={C.red} opacity={0.5} name="Actual Residual (yₜ − ETS)"/>
          <Line type="monotone" dataKey="xgb_residual" stroke={C.orange} strokeWidth={2} dot={false} name="XGBoost Residual Prediction"/>
        </ComposedChart>
      </ResponsiveContainer>
      <FigCap num="7.4">Residual component learned by XGBoost. Red bars = actual deviations from ETS baseline. Orange line = XGBoost's prediction of those residuals. Large residuals in specific calendar windows become <em>exception signals</em> — prompting planner review rather than automatic acceptance of the baseline.</FigCap>

      <H4>7.8.6–7.8.8 Residuals as Exception Signals</H4>
      <P>When the residual correction is small, the forecast is driven almost entirely by the ETS baseline — these weeks can be treated as routine. When the residual correction is large, the model signals that historically, weeks at this calendar position behave differently from the smooth seasonal pattern. This prompts a different action: <em>review</em> rather than automatic acceptance.</P>
      <P>Persistent residual patterns also indicate systematic mismatches between smooth seasonal expectations and observed behavior — pointing to follow-up actions: reassessing seasonality driver assumptions, investigating operational changes tied to those periods, or identifying missing structural variables for future iterations.</P>
      <DR><strong>Key result:</strong> The hybrid model does not outperform the best baseline on RMSE. What it outperforms is the baselines' ability to support real decisions. By decomposing demand into baseline structure, residual deviation, and uncertainty, the model produces insights that planners can act on — identifying which weeks are routine, which are risky, and where attention should be focused.</DR>
    </div>
  );
}

function Ch8(){
  return (
    <div>
      <SectionHero num="Section 8" title="Conclusion" subtitle="What this guide argues, and why better decision support matters more than better numbers."/>
      <P>This guide set out to examine demand forecasting not as a purely technical exercise, but as a decision-support problem situated within real organizational constraints. Rather than optimizing for predictive accuracy in isolation, the focus throughout was on how forecasts are produced, interpreted, and ultimately used by human planners.</P>
      <P>Beginning with simple baselines, the guide showed how conservative models clarify assumptions and establish behavioral expectations. Seasonal naive and ETS models were not treated as inferior benchmarks to be discarded, but as reference points that expose the trade-offs between stability, flexibility, and interpretability. Evaluation was framed around realistic planning horizons and time-based splits, reflecting how forecasts are actually consumed in practice.</P>
      <P>Building on these foundations, the guide introduced a hybrid modeling approach that combines a structural statistical baseline with a constrained machine learning residual component. The goal was not to increase model complexity for its own sake, but to deliberately assign modeling responsibilities: ETS captures smooth trend and seasonality, while XGBoost is restricted to learning systematic deviations tied to calendar structure. This separation of roles improves failure behavior, supports explanation, and aligns the model with decision-making needs rather than abstract performance metrics.</P>
      <P>Empirical results on held-out data reinforced this framing. While the hybrid model did not outperform the strongest baseline in terms of RMSE alone, it produced forecasts that were more interpretable, more stable under extrapolation, and better suited for uncertainty-aware planning. This outcome highlights a central lesson of applied forecasting: <strong>numerical accuracy is only one dimension of model quality, and often not the most important one for organizational impact.</strong></P>
      <P>The guide also emphasized that forecasting does not end at the point estimate. Interval forecasts, residual diagnostics, and aggregation-aware evaluation provide essential context for risk-sensitive decisions. Forecasts become actionable when they communicate uncertainty, reveal structure, and support reasoning about when human intervention is justified.</P>
      <DR><strong>Central argument:</strong> The most useful models are not necessarily the most complex or the most accurate by a single metric. They are the ones whose assumptions are explicit, whose behavior is predictable, and whose outputs can be meaningfully discussed, challenged, and acted upon. In real organizations, forecasting succeeds when it supports better decisions — not when it merely produces better numbers.</DR>
    </div>
  );
}

function ChRef(){
  const refs=[
    {key:"Chen2016",text:"Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. In Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining (pp. 785–794). ACM.",url:"https://doi.org/10.1145/2939672.2939785"},
    {key:"Dietvorst2015",text:"Dietvorst, B. J., Simmons, J. P., & Massey, C. (2015). Algorithm aversion: People erroneously avoid algorithms after seeing them err. Journal of Experimental Psychology: General, 144(1), 114–126.",url:"https://doi.org/10.1037/xge0000033"},
    {key:"Fildes2007",text:"Fildes, R., & Goodwin, P. (2007). Against your better judgment? How organizations can improve their use of management judgment in forecasting. Interfaces, 37(6), 570–576."},
    {key:"Hyndman2021",text:"Hyndman, R. J., & Athanasopoulos, G. (2021). Forecasting: Principles and practice (3rd ed.). OTexts.",url:"https://otexts.com/fpp3/"},
    {key:"Makridakis2020",text:"Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2020). The M4 Competition: 100,000 time series and 61 forecasting methods. International Journal of Forecasting, 36(1), 54–74."},
    {key:"Murphy2022",text:"Murphy, K. P. (2022). Probabilistic machine learning: An introduction. MIT Press."},
    {key:"Petropoulos2022",text:"Petropoulos, F., et al. (2022). Forecasting: Theory and practice. International Journal of Forecasting, 38(3), 705–871."},
    {key:"Silver2012",text:'Silver, N. (2012). The signal and the noise: Why so many predictions fail — but some don\'t. Penguin Press.'},
    {key:"Spiegelhalter2019",text:"Spiegelhalter, D. (2019). The art of statistics: How to learn from data. Basic Books."},
  ];
  return (
    <div>
      <SectionHero num="References" title="Academic References" subtitle="All sources cited in this guide."/>
      {refs.map((r,i)=>(
        <div key={i} style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px",marginBottom:12,display:"flex",gap:12}}>
          <code style={{color:C.accent,fontSize:11,flexShrink:0,marginTop:2}}>[{i+1}]</code>
          <div>
            <p style={{color:C.text,fontSize:13,margin:"0 0 4px",lineHeight:1.6}}>{r.text}</p>
            {r.url&&<a href={r.url} target="_blank" rel="noreferrer" style={{color:C.green,fontSize:12}}>{r.url}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChAppA(){
  return (
    <div>
      <SectionHero num="Appendix A" title="Planned Extension: Visualizing Demand as a Cross-Product Landscape" subtitle="An alternative visualization approach treating demand as a three-dimensional terrain."/>
      <AppLink url="https://capstone-eccruvtbkdqha2ajaasti9.streamlit.app/" label="3D Demand Landscape Prototype (Streamlit)" desc="Renders demand as a cross-product surface — peaks = seasonal surges, valleys = troughs, roughness = noise."/>

      <SubHeader id="appA_terrain">From Time Series to Terrain</SubHeader>
      <P>Instead of treating demand as a one-dimensional sequence, demand can be visualized as a surface defined over two dimensions: time and product. In this representation, peaks correspond to seasonal or promotional demand surges, valleys correspond to demand troughs, and surface roughness corresponds to idiosyncratic product-level noise.</P>
      <P>The Streamlit prototype renders demand as a three-dimensional terrain. Raw observed demand appears as a jagged surface, while the model forecast is visualized as a smooth surface draped over it. This metaphor makes an abstract modeling objective concrete: a good forecasting model should capture the overall shape of the terrain without attempting to memorize every local fluctuation.</P>
      <DR>Underfitting appears visually as an overly flat surface that ignores genuine structure. Overfitting appears as a crinkled surface that closely follows noise and is therefore unlikely to generalize. The bias–variance trade-off becomes immediately visible, rather than being abstracted into a single numerical metric such as RMSE.</DR>

      <SubHeader id="appA_residuals">Residuals as Vertical Structure, Not Errors</SubHeader>
      <P>A key design choice in the visualization is the explicit representation of residuals as <em>vertical distances</em> between the forecast surface and the observed surface. This reframes residuals from being treated purely as errors to being treated as <strong>signals of local mismatch</strong>.</P>
      <P>In a cross-product setting, clusters of large residuals concentrated in specific regions of the terrain indicate systematic deviations rather than random noise. These patterns naturally invite operational questions: Are certain product categories consistently deviating from the baseline? Are deviations concentrated in specific seasonal windows? Are these deviations stable over time or drifting?</P>

      <SubHeader id="appA_agg">Why Aggregation Changes Everything</SubHeader>
      <P>By progressively aggregating simulated store-level demand into districts, regions, and finally a headquarters-level series, the visualization shows how independent fluctuations cancel out. At the highest level of aggregation, the demand surface becomes almost perfectly smooth — even when underlying store-level demand is highly volatile.</P>
      <P>This explains a recurring organizational phenomenon: forecasts built at headquarters often appear accurate and stable, while forecasts pushed down to individual stores or products perform poorly. The issue is not necessarily model quality, but the statistical effect of aggregation. Headquarters-level forecasts are appropriate for strategic planning; store-level decisions require wider uncertainty bands, different control rules, or explicit human judgment.</P>

      <SubHeader id="appA_scope">Scope and Limitations</SubHeader>
      <P>This prototype is intentionally illustrative. It currently relies on simulated data and simplified assumptions, and is not intended for direct deployment in its current form. Its purpose is to demonstrate how forecasting outputs can be re-embedded into a richer analytical interface that supports interpretation and action.</P>
      <P>The broader point is that forecasting impact does not end with the model. How results are visualized, decomposed, and communicated often matters more than incremental improvements in accuracy.</P>
    </div>
  );
}

function ChAppB(){
  const files=[
    ["Sample_data_cleaned.xlsx","Anonymized weekly sales dataset used throughout the guide. All examples in Sections 3–7 derive from this dataset."],
    ["Section3.ipynb","EDA notebook: seasonality, trend, aggregation effects, distributional properties."],
    ["Section4.ipynb","Baseline modeling: Seasonal Naive, ETS, standalone XGBoost. Establishes reference performance and highlights limitations."],
    ["Section7.ipynb","Advanced modeling: hybrid ETS + residual XGBoost framework. Held-out evaluation and diagnostic outputs for §7.8."],
    ["Visualization.ipynb","Notebook to generate all figures included in the written document."],
  ];
  const apps=[
    ["evaluation_lab.py","Interactive model evaluation (§5). Explore forecast performance, compare models, metric behavior across horizons.","https://capstone-4kctzgqnx5tttraumgrmyj.streamlit.app/"],
    ["action_lab.py","Decision support prototype (§6). Translate forecast outputs into planning-relevant views.","https://capstone-mc8wa3bpt58vehazf7avef.streamlit.app/"],
    ["xgboost_tutorial.py","XGBoost interactive tutorial (§4). Tree splits, boosting, bias–variance, extrapolation failure.","https://capstone-6csneemobbehhcttzqkt2q.streamlit.app/"],
    ["experiment.py","3D demand landscape visualization (Appendix A). Cross-product terrain, residual structure, aggregation effects.","https://capstone-eccruvtbkdqha2ajaasti9.streamlit.app/"],
  ];
  return (
    <div>
      <SectionHero num="Appendix B" title="GitHub Repository and Code Structure" subtitle="All code and supporting materials organized to mirror the structure of the written guide."/>
      <AppLink url="https://github.com/SubTaka0613/Capstone" label="GitHub Repository" desc="github.com/SubTaka0613/Capstone — organized for reproducibility, transparency, and interpretability."/>

      <SubHeader id="appB_files">Notebooks and Data</SubHeader>
      {files.map(([name,desc],i)=>(
        <div key={i} style={{background:C.bgCard2,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",marginBottom:8,display:"flex",gap:12}}>
          <code style={{color:C.purple,fontSize:12,flexShrink:0,marginTop:1}}>{name}</code>
          <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.5}}>{desc}</p>
        </div>
      ))}

      <SubHeader id="appB_apps">Streamlit Applications</SubHeader>
      {apps.map(([name,desc,url],i)=>(
        <div key={i} style={{background:C.bgCard2,border:`1px solid ${C.green}30`,borderRadius:8,padding:"12px 16px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:4}}>
            <code style={{color:C.green,fontSize:12}}>{name}</code>
            <a href={url} target="_blank" rel="noreferrer" style={{color:C.accent,fontSize:11,flexShrink:0}}>↗ Open</a>
          </div>
          <p style={{color:C.textDim,fontSize:13,margin:0,lineHeight:1.5}}>{desc}</p>
        </div>
      ))}
      <P>Each notebook and application corresponds directly to a section of the guide, allowing readers to trace conceptual arguments to concrete implementations. The repository is intentionally structured to keep modeling logic legible and modular, reinforcing the guide's emphasis on interpretability and human-centered forecasting.</P>
    </div>
  );
}

function ChAI(){
  return (
    <div>
      <SectionHero num="AI Assistant" title="Your Forecasting Study Companion" subtitle="Ask questions about any concept in this guide, or switch to Challenge Mode to test your understanding."/>
      <P>The chatbot covers all major topics from this guide — ETS equations, XGBoost mechanics, RMSE vs MAE, bias–variance tradeoff, information leakage, the hybrid model architecture, safety stock formulas, judgmental adjustment, and more. Type <strong>challenge</strong> to enter practice quiz mode with 8 scenario-based questions.</P>
      <ChatBot/>
    </div>
  );
}

const CHAPTERS = [
  { id:"home",   label:"📖 Overview & Abstract",  icon:"📖", component: ChHome },
  { id:"s1",     label:"§1 Introduction",          icon:"1️⃣", component: Ch1 },
  { id:"s2",     label:"§2 The Hidden Question",   icon:"2️⃣", component: Ch2 },
  { id:"s3",     label:"§3 Understanding Data",    icon:"3️⃣", component: Ch3 },
  { id:"s4",     label:"§4 Base Models",           icon:"4️⃣", component: Ch4 },
  { id:"s5",     label:"§5 Evaluation",            icon:"5️⃣", component: Ch5 },
  { id:"s6",     label:"§6 Actionable Insights",   icon:"6️⃣", component: Ch6 },
  { id:"s7",     label:"§7 Advanced Model",        icon:"7️⃣", component: Ch7 },
  { id:"s8",     label:"§8 Conclusion",            icon:"8️⃣", component: Ch8 },
  { id:"ref",    label:"📚 References",            icon:"📚", component: ChRef },
  { id:"appA",   label:"🗺️ Appendix A: Landscape", icon:"🗺️", component: ChAppA },
  { id:"appB",   label:"💻 Appendix B: GitHub",    icon:"💻", component: ChAppB },
  { id:"ai",     label:"🤖 AI Assistant",          icon:"🤖", component: ChAI },
];

export default function App() {
  const [active, setActive] = useState("home");
  const [visited, setVisited] = useState(new Set(["home"]));
  const [collapsed, setCollapsed] = useState(false);
  const topRef = useRef(null);

  const navigate = (id) => {
    setActive(id);
    setVisited(v => new Set([...v, id]));
    topRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const curIdx = CHAPTERS.findIndex(c => c.id === active);
  const prev = curIdx > 0 ? CHAPTERS[curIdx - 1] : null;
  const next = curIdx < CHAPTERS.length - 1 ? CHAPTERS[curIdx + 1] : null;
  const Content = CHAPTERS[curIdx]?.component;

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", overflow: "hidden" }}>

      {/* Sidebar */}
      <div style={{ width: collapsed ? 52 : 240, flexShrink: 0, background: C.bgCard, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", transition: "width 0.2s", overflow: "hidden" }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? "16px 14px" : "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {!collapsed && (
            <div>
              <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>FORECASTING</div>
              <div style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>Decision-Support Guide</div>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textDim, cursor: "pointer", padding: "4px 8px", fontSize: 12 }}>
            {collapsed ? "→" : "←"}
          </button>
        </div>

        {/* Progress */}
        {!collapsed && (
          <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.borderLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: C.textDim, fontSize: 11 }}>Progress</span>
              <span style={{ color: C.green, fontSize: 11 }}>{visited.size}/{CHAPTERS.length}</span>
            </div>
            <div style={{ background: C.bgCard2, borderRadius: 3, height: 4, overflow: "hidden" }}>
              <div style={{ background: C.green, height: "100%", width: `${(visited.size / CHAPTERS.length) * 100}%`, borderRadius: 3, transition: "width 0.3s" }}/>
            </div>
          </div>
        )}

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: "auto", padding: collapsed ? "8px 6px" : "8px 0" }}>
          {CHAPTERS.map(ch => {
            const isActive = ch.id === active;
            const isVisited = visited.has(ch.id);
            return (
              <button key={ch.id} onClick={() => navigate(ch.id)} title={collapsed ? ch.label : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: collapsed ? "10px 14px" : "9px 18px", background: isActive ? C.accentGlow : "transparent", border: "none", borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent", color: isActive ? C.accent : isVisited ? C.text : C.textDim, cursor: "pointer", fontSize: 13, textAlign: "left", transition: "all 0.15s", whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{ch.icon}</span>
                {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ch.label}</span>}
                {!collapsed && isVisited && !isActive && <span style={{ marginLeft: "auto", color: C.green, fontSize: 10, flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* RMSE summary */}
        {!collapsed && (
          <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ color: C.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Test RMSE (demo data)</div>
            {[["Seasonal Naive", SN_RMSE, C.textDim], ["ETS", ETS_RMSE, C.accent], ["Hybrid", HYB_RMSE, C.green]].map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textMuted, fontSize: 11 }}>{label}</span>
                <span style={{ color, fontSize: 11, fontWeight: 600 }}>{Number(val).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div ref={topRef} style={{ flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: "none" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, color: C.textMuted, fontSize: 12 }}>
            <span>From Forecasts to Decisions</span>
            <span>›</span>
            <span style={{ color: C.textDim }}>{CHAPTERS[curIdx]?.label}</span>
          </div>

          {/* Chapter content */}
          {Content && <Content />}

          {/* Prev / Next navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
            {prev ? (
              <button onClick={() => navigate(prev.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, cursor: "pointer", fontSize: 13 }}>
                ← {prev.label}
              </button>
            ) : <div />}
            {next && (
              <button onClick={() => navigate(next.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 8, color: C.accent, cursor: "pointer", fontSize: 13 }}>
                {next.label} →
              </button>
            )}
          </div>

          <p style={{ color: C.textMuted, fontSize: 11, textAlign: "center", marginTop: 24 }}>
            Takaya Maekawa · Minerva University · CP194 Capstone · Spring 2026
          </p>
        </div>
      </div>
    </div>
  );
}
