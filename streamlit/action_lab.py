import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from scipy.stats import norm

# --- Page Config ---
st.set_page_config(
    page_title="Actionable Insights Lab",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- Custom CSS for Professional UI ---
st.markdown(
    """
<style>
    .metric-card {
        background-color: #f9f9f9;
        border: 1px solid #e0e0e0;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 2px 2px 5px rgba(0,0,0,0.05);
    }
    .stTabs [data-baseweb="tab-list"] {gap: 8px;}
    .stTabs [data-baseweb="tab"] {height: 50px; font-weight: 600; font-size: 16px;}
    .stTabs [aria-selected="true"] {background-color: #FF4B4B; color: white;}
    h3 {color: #333;}
</style>
""",
    unsafe_allow_html=True,
)

st.title("🧠 The Planner's Cockpit")
st.markdown(
    """
**From Output to Action:** This tool simulates the decision-making layer described in Section 6.
It translates statistical outputs into **Financial Risk**, **Strategic Drivers**, and **Performance Audits**.
"""
)

# --- NAVIGATION ---
tab1, tab2, tab3 = st.tabs(
    [
        "🛡️ Risk & Capital Trade-offs",
        "🌊 Driver Decomposition",
        "⚖️ FVA & Bias Detection",
    ]
)

# ==========================================
# TAB 1: RISK & CAPITAL (THE EFFICIENT FRONTIER)
# Matches Section 6.2: "Visualizing Uncertainty: Prediction Intervals"
# ==========================================
with tab1:
    st.header("The Cost of Perfection")
    st.markdown(
        """
    **Context:** As noted in the paper, a point forecast (e.g., "500 units") implies false certainty. 
    Stakeholders manage risk, not accuracy. Use this tool to find the **"Efficient Frontier"**—the balance between availability (Service Level) and cash flow.
    """
    )

    col_ctrl, col_viz = st.columns([1, 2])

    with col_ctrl:
        with st.container():
            st.subheader("⚙️ Policy Settings")
            mean_forecast = 1000

            # Input: Uncertainty (The Fan Chart Width)
            std_dev = st.slider(
                "Forecast Uncertainty (Sigma)",
                50,
                300,
                100,
                help="Derived from the model's Prediction Interval width. Higher = Riskier item.",
            )

            # Input: Strategic Target
            target_sl = st.slider(
                "Target Service Level (%)",
                80.0,
                99.9,
                95.0,
                step=0.1,
                help="The probability of NOT stocking out. 95% is standard; 99% is expensive.",
            )

            # Input: Financials
            unit_cost = st.number_input("Unit Cost ($)", value=10.0, step=1.0)
            holding_rate = 0.20  # 20% cost of capital

            # Calculations for CURRENT state
            z_score = norm.ppf(target_sl / 100)
            safety_stock = z_score * std_dev
            capital = safety_stock * unit_cost

            st.markdown("---")
            st.markdown(
                f"""
            <div class="metric-card">
                <h4>📦 Decision Impact</h4>
                <p>To achieve <strong>{target_sl}%</strong> availability:</p>
                <p><strong>Safety Stock Buffer:</strong> {int(safety_stock):,} units</p>
                <p><strong>Capital Tied Up:</strong> <span style="color:red">${capital:,.0f}</span></p>
            </div>
            """,
                unsafe_allow_html=True,
            )

    with col_viz:
        # Generate the "Hockey Stick" Curve
        sl_range = np.linspace(0.80, 0.999, 100)
        z_scores = norm.ppf(sl_range)
        ss_curve = z_scores * std_dev
        cost_curve = ss_curve * unit_cost

        # Plot
        fig = go.Figure()

        # The Cost Curve
        fig.add_trace(
            go.Scatter(
                x=sl_range * 100,
                y=cost_curve,
                mode="lines",
                name="Cost Curve",
                line=dict(color="#3b82f6", width=3),
            )
        )

        # The Current Selection Point
        fig.add_trace(
            go.Scatter(
                x=[target_sl],
                y=[capital],
                mode="markers",
                name="Current Policy",
                marker=dict(color="#FF4B4B", size=12, symbol="diamond"),
            )
        )

        # Annotations
        fig.add_annotation(
            x=target_sl,
            y=capital,
            text=f"Current: {target_sl}% = ${capital:,.0f}",
            ax=0,
            ay=-40,
            showarrow=True,
        )

        fig.update_layout(
            title="The 'Hockey Stick' Curve: Service Level vs. Inventory Cost",
            xaxis_title="Service Level Target (%)",
            yaxis_title="Capital Investment ($)",
            template="plotly_white",
            height=500,
            hovermode="x unified",
        )
        st.plotly_chart(fig, use_container_width=True)

        # Marginal Cost Insight
        if target_sl > 98:
            st.warning(
                "⚠️ **Diminishing Returns:** You are in the 'Vertical Zone'. Increasing service by 1% requires exponential capital."
            )


# ==========================================
# TAB 2: DRIVER DECOMPOSITION (WATERFALL)
# Matches Section 6.3: "Scenario Planning: The What-If Machine"
# ==========================================
with tab2:
    st.header("Explaining the 'Why'")
    st.markdown(
        """
    **Context:** Stakeholders asked: *"Does this number account for the TV spot?"* The **Waterfall Chart** visually bridges the gap between the Baseline (Statistical) forecast and the Final number, quantifying the "Lift" mentioned in the text.
    """
    )

    col_input, col_chart = st.columns([1, 2])

    with col_input:
        st.subheader("Scenario Inputs")
        base_vol = 5000

        seasonality = st.select_slider(
            "Seasonality Effect",
            options=["Off-Peak", "Neutral", "Peak"],
            value="Neutral",
        )
        season_impact = {"Off-Peak": -800, "Neutral": 0, "Peak": +1500}

        promo = st.checkbox("Active TV Campaign", value=True)
        promo_impact = 1200 if promo else 0

        price_change = st.number_input("Price Adjustment (%)", -20, 20, -10, step=5)
        price_impact = -1 * (price_change * 1.8 / 100) * base_vol  # Elasticity 1.8

        competitor = st.checkbox("Competitor Stockout Event", value=False)
        comp_impact = 600 if competitor else 0

        final_forecast = (
            base_vol
            + season_impact[seasonality]
            + promo_impact
            + price_impact
            + comp_impact
        )

        # Automated Commentary Generation (NLG)
        st.markdown("---")
        st.subheader("📝 Automated Insight")

        reasons = []
        if season_impact[seasonality] != 0:
            reasons.append(
                f"{seasonality} seasonality ({season_impact[seasonality]:+})"
            )
        if promo:
            reasons.append(f"TV Campaign lift (+{promo_impact})")
        if price_impact != 0:
            reasons.append(f"Price Elasticity ({price_impact:+})")
        if competitor:
            reasons.append(f"Competitor issues (+{comp_impact})")

        summary_text = (
            f"Forecast of **{final_forecast:,.0f}** is driven by "
            + ", ".join(reasons)
            + "."
        )
        st.info(summary_text)

    with col_chart:
        fig2 = go.Figure(
            go.Waterfall(
                name="Drivers",
                orientation="v",
                measure=[
                    "relative",
                    "relative",
                    "relative",
                    "relative",
                    "relative",
                    "total",
                ],
                x=[
                    "Baseline",
                    "Seasonality",
                    "Marketing",
                    "Price Effect",
                    "Competitor",
                    "Final",
                ],
                textposition="outside",
                text=[
                    f"{base_vol}",
                    f"{season_impact[seasonality]:+}",
                    f"{promo_impact:+}",
                    f"{price_impact:+}",
                    f"{comp_impact:+}",
                    f"{int(final_forecast)}",
                ],
                y=[
                    base_vol,
                    season_impact[seasonality],
                    promo_impact,
                    price_impact,
                    comp_impact,
                    0,
                ],
                connector={"line": {"color": "rgb(63, 63, 63)"}},
                decreasing={"marker": {"color": "#ef4444"}},
                increasing={"marker": {"color": "#10b981"}},
                totals={"marker": {"color": "#3b82f6"}},
            )
        )

        fig2.update_layout(
            title="Forecast Driver Decomposition", height=500, template="plotly_white"
        )
        st.plotly_chart(fig2, use_container_width=True)


# ==========================================
# TAB 3: THE BIAS AUDIT (COMPLEX PATTERNS)
# ==========================================
with tab3:
    st.header("6.4 Man vs. Machine: The Hidden Pattern")
    st.markdown(
        """
    **The Concept:** Algorithms excel at finding non-linear patterns buried in noise.
    
    **The Challenge:** You will see 12 weeks of sales history.
    The "System" has detected a complex signal (Saturation, Stockpiling, or Regime Change).
    **Can you spot the truth through the noise?**
    """
    )

    # --- Session State ---
    if "game_state" not in st.session_state:
        st.session_state.game_state = {
            "round": 1,
            "history": [],
            "game_over": False,
            # We pre-select a random complex pattern for the user to face
            "pattern_type": np.random.choice(
                ["saturation", "stockpiling", "step_change"]
            ),
        }

    # --- COMPLEX DATA GENERATOR ---
    def generate_complex_context(round_num, pattern):
        # Time horizon: 12 weeks back, 1 week forward
        t = np.arange(1, 15)

        # 1. GENERATE THE HIDDEN SIGNAL (The "Truth" the model sees)
        if pattern == "saturation":
            # Logarithmic growth that flattens out (Humans tend to over-extrapolate linearly)
            signal = 800 + 200 * np.log(t)
            explain_title = "Saturation (Diminishing Returns)"
            explain_text = "The growth was slowing down (Logarithmic). Humans often project linear growth and over-shoot."

        elif pattern == "stockpiling":
            # Mean reversion: High weeks are followed by low weeks
            signal = np.zeros_like(t)
            signal[0] = 1000
            for i in range(1, len(t)):
                # If yesterday was high, today is low (negative auto-correlation)
                deviation = signal[i - 1] - 1000
                signal[i] = 1000 - (0.8 * deviation)

            # Add a trend so it's not too obvious
            signal += t * 10
            explain_title = "Stockpiling Effect (Mean Reversion)"
            explain_text = "High sales led to pantry loading, causing a dip the next week. Humans miss this 'Zig-Zag' pattern."

        elif pattern == "step_change":
            # A structural break happened recently
            signal = np.ones_like(t) * 900
            signal[8:] = 1200  # Sudden jump at week 8
            explain_title = "Structural Break (Regime Change)"
            explain_text = "The baseline shifted permanently at Week 8. Humans often 'anchor' to the old average (900)."

        # 2. ADD NOISE (What the user sees)
        np.random.seed(round_num * 55)  # Deterministic noise per round
        noise = np.random.normal(0, 40, len(t))
        noisy_data = signal + noise

        # 3. PREPARE OUTPUTS
        history_x = list(range(1, 13))
        history_y = noisy_data[:12]  # Past 12 weeks

        # The System Forecast sees the SIGNAL + tiny noise (It ignores the heavy noise)
        future_idx = 12
        system_forecast = signal[future_idx] + np.random.normal(0, 5)

        # The Actual includes the heavy noise
        actual_sales = noisy_data[future_idx]

        # Return the "Clean Signal" for the reveal chart later
        full_signal_x = list(range(1, 14))
        full_signal_y = signal[:13]

        return (
            history_x,
            history_y,
            system_forecast,
            actual_sales,
            explain_title,
            explain_text,
            full_signal_x,
            full_signal_y,
        )

    # --- GAME UI ---
    col_game, col_results = st.columns([2, 1])

    with col_game:
        if not st.session_state.game_state["game_over"]:
            # Generate Data
            if "current_data" not in st.session_state:
                st.session_state.current_data = generate_complex_context(
                    st.session_state.game_state["round"],
                    st.session_state.game_state["pattern_type"],
                )

            hist_x, hist_y, sys_fcst, actual, title, text, sig_x, sig_y = (
                st.session_state.current_data
            )

            # 1. Visualization (Context)
            fig_ctx = go.Figure()
            fig_ctx.add_trace(
                go.Scatter(
                    x=hist_x,
                    y=hist_y,
                    mode="lines+markers",
                    name="Sales History",
                    line=dict(color="black", width=2),
                    marker=dict(size=8),
                )
            )

            # System Forecast Ghost
            fig_ctx.add_trace(
                go.Scatter(
                    x=[13],
                    y=[sys_fcst],
                    mode="markers",
                    name="System Forecast",
                    marker=dict(color="gray", size=14, symbol="star", opacity=0.7),
                )
            )

            fig_ctx.update_layout(
                title=f"Week {st.session_state.game_state['round']} / 5",
                xaxis_title="Weeks Ago",
                yaxis_title="Sales",
                height=400,
                showlegend=True,
                template="plotly_white",
            )
            st.plotly_chart(fig_ctx, use_container_width=True)

            # 2. Inputs
            c1, c2, c3 = st.columns([1, 1, 2])
            c1.metric("🤖 System", f"{sys_fcst:.0f}")

            with c2:
                user_adj = st.number_input("Adjustment", value=0, step=10)

            with c3:
                st.write("")  # Spacer
                st.write("")
                if st.button(
                    "🚀 Lock Prediction", type="primary", use_container_width=True
                ):
                    final_plan = sys_fcst + user_adj

                    # Record Logic
                    bias = final_plan - actual
                    fva = abs(sys_fcst - actual) - abs(final_plan - actual)

                    st.session_state.game_state["history"].append(
                        {
                            "Round": st.session_state.game_state["round"],
                            "System": sys_fcst,
                            "User": final_plan,
                            "Actual": actual,
                            "Error": bias,
                            "Signal_X": sig_x,  # Save for reveal
                            "Signal_Y": sig_y,
                            "Pattern_Title": title,
                            "Pattern_Text": text,
                        }
                    )

                    st.session_state.game_state["round"] += 1
                    del st.session_state.current_data

                    if st.session_state.game_state["round"] > 5:
                        st.session_state.game_state["game_over"] = True

                    st.rerun()

        else:
            # --- GAME OVER / REVEAL SCREEN ---
            st.success("🏁 Audit Complete!")
            if st.button("🔄 Start New Audit"):
                st.session_state.game_state = {
                    "round": 1,
                    "history": [],
                    "game_over": False,
                    "pattern_type": np.random.choice(
                        ["saturation", "stockpiling", "step_change"]
                    ),
                }
                if "current_data" in st.session_state:
                    del st.session_state.current_data
                st.rerun()

    # --- SCOREBOARD & REVEAL ---
    with col_results:
        st.subheader("📋 Audit Report")

        if st.session_state.game_state["history"]:
            df = pd.DataFrame(st.session_state.game_state["history"])

            # KPIs
            user_mae = (df["User"] - df["Actual"]).abs().mean()
            sys_mae = (df["System"] - df["Actual"]).abs().mean()
            bias = df["Error"].mean()

            k1, k2 = st.columns(2)
            k1.metric("System MAE", f"{sys_mae:.0f}")
            k2.metric(
                "Your MAE",
                f"{user_mae:.0f}",
                delta=f"{sys_mae - user_mae:.0f}",
                delta_color="normal",
            )
            st.metric(
                "Your Bias",
                f"{bias:.0f}",
                delta="Over-Forecasting" if bias > 0 else "Under-Forecasting",
                delta_color="inverse",
            )

            # --- THE "DECODER" REVEAL ---
            if st.session_state.game_state["game_over"]:
                st.divider()
                st.markdown("### 🔍 The Decoder Ring")
                st.markdown(f"**Hidden Pattern:** {df['Pattern_Title'].iloc[0]}")
                st.caption(df["Pattern_Text"].iloc[0])

                # Plot the LAST round's reveal to show them what they missed
                last_round = df.iloc[-1]

                fig_reveal = go.Figure()

                # 1. The Noisy Data (What they saw)
                # We reconstruct it roughly from the saved signal + noise implication or just plot the signal vs actual
                # Ideally we plot the clean signal over the noisy actuals

                fig_reveal.add_trace(
                    go.Scatter(
                        x=last_round["Signal_X"],
                        y=last_round["Signal_Y"],
                        mode="lines",
                        name="Hidden Signal",
                        line=dict(color="red", width=3),
                    )
                )

                fig_reveal.add_trace(
                    go.Scatter(
                        x=[13],
                        y=[last_round["System"]],
                        mode="markers",
                        name="System",
                        marker=dict(color="gray", symbol="star", size=12),
                    )
                )

                fig_reveal.add_trace(
                    go.Scatter(
                        x=[13],
                        y=[last_round["Actual"]],
                        mode="markers",
                        name="Actual",
                        marker=dict(color="green", size=12),
                    )
                )

                fig_reveal.add_annotation(
                    x=6,
                    y=min(last_round["Signal_Y"]),
                    text="The algorithm saw the Red Line.<br>You saw the Noise.",
                    showarrow=False,
                    font=dict(color="red"),
                )

                fig_reveal.update_layout(
                    title="Visualizing the Hidden Signal",
                    height=350,
                    template="plotly_white",
                )
                st.plotly_chart(fig_reveal, use_container_width=True)

            else:
                st.dataframe(
                    df[["Round", "System", "User", "Actual"]].style.format("{:.0f}"),
                    use_container_width=True,
                )
