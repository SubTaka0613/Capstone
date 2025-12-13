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
# TAB 3: FVA & BIAS (HISTORY SIMULATION)
# Matches Section 6.4: "The Human-in-the-Loop"
# ==========================================
with tab3:
    st.header("Auditing the Human Planner")
    st.markdown(
        """
    **Context:** We use the "Model as Anchor" workflow. But does the human add value?
    We audit this using **FVA (Forecast Value Added)** and **Bias Tracking**.
    *Positive FVA = Human improved the model. Negative FVA = Algorithm Aversion cost us money.*
    """
    )

    col_sim, col_res = st.columns([1, 2])

    with col_sim:
        st.subheader("Simulation")
        st.markdown("Generate 10 weeks of history to audit performance.")

        if st.button("🎲 Simulate 10 Weeks"):
            np.random.seed(123)  # Consistent demo

            # Generate History Data
            weeks = [f"W{i}" for i in range(1, 11)]
            system_fcsts = np.random.randint(900, 1100, 10)
            actuals = system_fcsts + np.random.normal(
                0, 50, 10
            )  # System has random error

            # Simulate a "Biased Human" (Always adds +50 to +100 units - Optimism Bias)
            human_adjustments = np.random.randint(20, 80, 10)
            final_plans = system_fcsts + human_adjustments

            # Store in Dataframe
            df_hist = pd.DataFrame(
                {
                    "Week": weeks,
                    "System Forecast": system_fcsts,
                    "Human Adj": human_adjustments,
                    "Final Plan": final_plans,
                    "Actual Sales": actuals.astype(int),
                }
            )

            # Calculate Errors
            df_hist["Sys Error"] = np.abs(
                df_hist["System Forecast"] - df_hist["Actual Sales"]
            )
            df_hist["Final Error"] = np.abs(
                df_hist["Final Plan"] - df_hist["Actual Sales"]
            )
            df_hist["FVA"] = (
                df_hist["Sys Error"] - df_hist["Final Error"]
            )  # Positive = Good

            st.session_state["history"] = df_hist

    with col_res:
        if "history" in st.session_state:
            df = st.session_state["history"]

            # 1. KPI Scorecards
            total_fva = df["FVA"].sum()
            avg_bias = (df["Final Plan"] - df["Actual Sales"]).mean()

            kpi1, kpi2, kpi3 = st.columns(3)
            kpi1.metric(
                "Total FVA (Value Add)",
                f"{total_fva:.0f}",
                delta="Human Added Value" if total_fva > 0 else "Human Destroyed Value",
            )
            kpi2.metric("MAE (System)", f"{df['Sys Error'].mean():.0f}")
            kpi3.metric(
                "MAE (Human)",
                f"{df['Final Error'].mean():.0f}",
                delta=f"{(df['Sys Error'].mean() - df['Final Error'].mean()):.0f} Improvement",
            )

            st.divider()

            # 2. Bias Analysis
            st.subheader("Bias Detection Radar")
            if avg_bias > 20:
                st.error(
                    f"⚠️ **Optimism Bias Detected:** The Human planner is over-forecasting by an average of {avg_bias:.0f} units per week."
                )
            elif avg_bias < -20:
                st.warning(
                    f"⚠️ **Pessimism Bias Detected:** The Human planner is consistently under-forecasting."
                )
            else:
                st.success(
                    "✅ **Unbiased:** The planner's adjustments are well-centered."
                )

            # 3. Visualization
            fig3 = go.Figure()
            fig3.add_trace(
                go.Scatter(
                    x=df["Week"],
                    y=df["System Forecast"],
                    name="System (Anchor)",
                    line=dict(color="gray", dash="dot"),
                )
            )
            fig3.add_trace(
                go.Scatter(
                    x=df["Week"],
                    y=df["Final Plan"],
                    name="Final Plan (Adjusted)",
                    line=dict(color="blue"),
                )
            )
            fig3.add_trace(
                go.Scatter(
                    x=df["Week"],
                    y=df["Actual Sales"],
                    name="Actuals",
                    line=dict(color="green", width=3),
                )
            )

            fig3.update_layout(
                title="History: System vs Human vs Reality",
                height=400,
                template="plotly_white",
            )
            st.plotly_chart(fig3, use_container_width=True)

        else:
            st.info("Click 'Simulate 10 Weeks' to generate an audit report.")
