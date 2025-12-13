import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# --- Page Config ---
st.set_page_config(page_title="Evaluation Lab", layout="wide")

st.markdown("# 🎯 Evaluating Models: The Decision-Aware Way")
st.markdown(
    """
This lab demonstrates why "Error Metrics" aren't enough. 
We explore how cheating happens (Leakage), why outliers matter (RMSE vs MAE), 
and how a "worse" model can actually make more money (Business Logic).
"""
)

# --- NAVIGATION ---
tab1, tab2, tab3 = st.tabs(
    [
        "🕵️ 1. The Time Machine (Leakage)",
        "📏 2. The Metric Sandbox",
        "💰 3. The Business Simulator",
    ]
)

# ==========================================
# TAB 1: BACKTESTING & LEAKAGE
# ==========================================
with tab1:
    st.header("1. Backtesting: Don't Cheat Time")
    st.markdown(
        """
    **The Concept:** In forecasting, you cannot look at the future. 
    Standard "Random Splitting" (used in computer vision or NLP) destroys time series data because it lets the model peek at next week's sales to predict this week's.
    """
    )

    col_ctrl, col_viz = st.columns([1, 3])

    # Generate Time Series Data
    np.random.seed(42)
    days = np.arange(100)
    # Trend + Seasonality + Noise
    demand = 50 + (0.5 * days) + (np.sin(days / 5) * 20) + np.random.normal(0, 5, 100)
    df = pd.DataFrame({"Day": days, "Demand": demand})

    with col_ctrl:
        split_type = st.radio(
            "Split Method:",
            ["Random Split (The Trap)", "Time Series Split (The Correct Way)"],
        )

        st.info(
            """
        **Look at the gaps.**
        
        * **Random:** The model can "connect the dots" because it has data points *between* the test points.
        * **Time Series:** The model faces a solid wall of the unknown (The Future).
        """
        )

    with col_viz:
        fig = go.Figure()

        if split_type == "Random Split (The Trap)":
            # Randomly assign 20% to test
            mask = np.random.rand(len(df)) < 0.8
            train = df[mask]
            test = df[~mask]

            fig.add_trace(
                go.Scatter(
                    x=train["Day"],
                    y=train["Demand"],
                    mode="markers",
                    name="Training Data (Known)",
                    marker=dict(color="blue", opacity=0.5),
                )
            )
            fig.add_trace(
                go.Scatter(
                    x=test["Day"],
                    y=test["Demand"],
                    mode="markers",
                    name="Test Data (Hidden)",
                    marker=dict(color="red", symbol="x", size=8),
                )
            )
            fig.add_annotation(
                text="Cheating! The model can interpolate.",
                x=50,
                y=100,
                showarrow=False,
                font=dict(color="red", size=14),
            )

        else:
            # Chronological Split
            split_point = 80
            train = df.iloc[:split_point]
            test = df.iloc[split_point:]

            fig.add_trace(
                go.Scatter(
                    x=train["Day"],
                    y=train["Demand"],
                    mode="lines+markers",
                    name="Training Data (Past)",
                    line=dict(color="blue"),
                )
            )
            fig.add_trace(
                go.Scatter(
                    x=test["Day"],
                    y=test["Demand"],
                    mode="lines+markers",
                    name="Test Data (Future)",
                    line=dict(color="red"),
                )
            )
            fig.add_vline(
                x=split_point,
                line_dash="dash",
                line_color="black",
                annotation_text="The 'Now' Line",
            )

        fig.update_layout(
            title="Visualizing the Split",
            xaxis_title="Time (Days)",
            yaxis_title="Demand",
            height=400,
            template="plotly_white",
        )
        st.plotly_chart(fig, use_container_width=True)

# ==========================================
# TAB 2: METRIC SANDBOX
# ==========================================
with tab2:
    st.header("2. Metrics: What do we penalize?")
    st.markdown(
        """
    **The Concept:** Different metrics penalize errors differently.
    * **MAE (Mean Absolute Error):** "I care about the average mistake."
    * **RMSE (Root Mean Squared Error):** "I hate BIG mistakes." (Squaring makes big numbers huge).
    
    **Try this:** Drag the slider to create a single **huge** outlier error. Watch RMSE explode while MAE barely moves.
    """
    )

    col_input, col_plot = st.columns([1, 3])

    with col_input:
        error_type = st.radio(
            "Scenario:", ["Consistent Small Errors", "One Huge Failure"]
        )

        if error_type == "Consistent Small Errors":
            actual = np.array([100, 100, 100, 100, 100])
            forecast = np.array([105, 95, 105, 95, 105])  # +/- 5 errors
        else:
            outlier_size = st.slider("Size of the Outlier", 10, 200, 100)
            actual = np.array([100, 100, 100, 100, 100])
            forecast = np.array(
                [100, 100, 100, 100, 100 + outlier_size]
            )  # One massive error

    # Calculate Metrics
    errors = actual - forecast
    mae = np.mean(np.abs(errors))
    rmse = np.sqrt(np.mean(errors**2))

    with col_plot:
        # Visualizing the Error
        fig_m = go.Figure()
        fig_m.add_trace(
            go.Bar(
                x=["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"],
                y=errors,
                marker_color="orange",
                name="Error (Actual - Forecast)",
            )
        )
        fig_m.add_hline(y=0, line_color="black")

        fig_m.update_layout(
            title="Visualizing the Residuals (The Mistakes)",
            height=300,
            template="plotly_white",
        )
        st.plotly_chart(fig_m, use_container_width=True)

        # The Scoreboard
        c1, c2 = st.columns(2)
        c1.metric(
            "MAE (Linear Penalty)", f"{mae:.1f}", help="Treats all errors equally."
        )
        c2.metric(
            "RMSE (Squared Penalty)",
            f"{rmse:.1f}",
            help="Hates outliers. If you have one big error, this skyrockets.",
        )

        if error_type == "One Huge Failure" and rmse > mae * 2:
            st.warning(
                "⚠️ Notice how RMSE is much higher than MAE? This metric 'panics' when it sees a large outlier."
            )

# ==========================================
# TAB 3: BUSINESS SIMULATOR (Improved)
# ==========================================
with tab3:
    st.header("3. The 'Profit Paradox'")
    st.markdown(
        """
    **The Scenario:** You run a bakery.
    * If you bake **too little**, you lose a customer (Missed Opportunity).
    * If you bake **too much**, you throw away bread (Waste).
    
    **The Lesson:** "Accuracy" (RMSE) treats these errors the same. **Your Bank Account** does not.
    """
    )

    # --- 1. The Setup (Inputs) ---
    col_inputs, col_sim = st.columns([1, 3])

    with col_inputs:
        st.subheader("🍞 Bakery Economics")
        price = st.number_input("Selling Price ($)", value=12.0, step=0.5)
        cost = st.number_input("Cost to Bake ($)", value=2.0, step=0.5)
        disposal = st.number_input(
            "Disposal Fee ($)", value=0.5, step=0.1, help="Cost to trash unsold bread"
        )

        # Calculate margins
        profit_per_sale = price - cost
        loss_per_waste = cost + disposal

        st.divider()
        st.markdown(
            f"""
        **The Stakes:**
        * **Gain:** +${profit_per_sale:.2f} per sale.
        * **Loss:** -${loss_per_waste:.2f} per waste.
        
        *It is {profit_per_sale / loss_per_waste:.1f}x worse to miss a sale than to waste a loaf.*
        """
        )

    # --- 2. The Simulation ---
    with col_sim:
        st.subheader("The Simulation: 30 Days of Sales")

        # Generate Data
        np.random.seed(42)
        days = np.arange(1, 31)
        # True demand fluctuates between 100 and 150
        true_demand = np.random.randint(100, 150, size=30)

        # Define Two Models with SIMILAR Accuracy but DIFFERENT Logic
        # Model A: Conservative (The "Safe" Planner) - Misses sales but zero waste
        pred_conservative = true_demand - 10

        # Model B: Aggressive (The "Greedy" Planner) - Captures sales but high waste
        pred_aggressive = true_demand + 10

        # --- Helper Function for Math ---
        def calculate_economics(demand, forecast):
            # You can only sell what you have (forecast) or what they want (demand), whichever is lower
            sold_units = np.minimum(demand, forecast)

            # Waste is anything you baked (forecast) that wasn't bought (demand)
            waste_units = np.maximum(0, forecast - demand)

            # Missed sales is demand you couldn't meet
            missed_units = np.maximum(0, demand - forecast)

            # Financials
            revenue = sold_units * price
            expenses = (forecast * cost) + (waste_units * disposal)
            net_profit = revenue - expenses

            return net_profit, np.sum(waste_units), np.sum(missed_units)

        # Run Calculations
        profit_A_daily, waste_A, missed_A = calculate_economics(
            true_demand, pred_conservative
        )
        profit_B_daily, waste_B, missed_B = calculate_economics(
            true_demand, pred_aggressive
        )

        # Calculate Metrics
        rmse_A = np.sqrt(np.mean((true_demand - pred_conservative) ** 2))
        rmse_B = np.sqrt(np.mean((true_demand - pred_aggressive) ** 2))

        total_profit_A = np.sum(profit_A_daily)
        total_profit_B = np.sum(profit_B_daily)

        # --- 3. The Visualization (The "Profit Race") ---
        fig = go.Figure()

        # Cumulative Profit Line for A
        fig.add_trace(
            go.Scatter(
                x=days,
                y=np.cumsum(profit_A_daily),
                mode="lines",
                name="Model A (Conservative)",
                line=dict(color="#ef4444", width=3, dash="dot"),
            )
        )

        # Cumulative Profit Line for B
        fig.add_trace(
            go.Scatter(
                x=days,
                y=np.cumsum(profit_B_daily),
                mode="lines",
                name="Model B (Aggressive)",
                line=dict(color="#10b981", width=3),
            )
        )

        # Fill the gap to show the extra money
        fig.add_trace(
            go.Scatter(
                x=np.concatenate([days, days[::-1]]),
                y=np.concatenate(
                    [np.cumsum(profit_B_daily), np.cumsum(profit_A_daily)[::-1]]
                ),
                fill="toself",
                fillcolor="rgba(16, 185, 129, 0.2)",
                line=dict(color="rgba(255,255,255,0)"),
                name="Profit Gap",
            )
        )

        fig.update_layout(
            title="💰 Cumulative Profit Over 30 Days (The Profit Race)",
            xaxis_title="Day",
            yaxis_title="Total Profit ($)",
            template="plotly_white",
            height=400,
            hovermode="x unified",
        )
        st.plotly_chart(fig, use_container_width=True)

    # --- 4. The "Scoreboard" ---
    st.divider()
    c1, c2, c3 = st.columns(3)

    with c1:
        st.info("### 📊 Accuracy (RMSE)")
        st.metric("Model A Error", f"{rmse_A:.1f}")
        st.metric("Model B Error", f"{rmse_B:.1f}")
        st.caption("Both models are equally 'wrong' mathematically.")

    with c2:
        st.error(f"### 🛡️ Model A (Conservative)")
        st.metric("Total Profit", f"${total_profit_A:,.0f}")
        st.write(f"📉 Missed Sales: **{missed_A}** loaves")
        st.write(f"🗑️ Waste: **{waste_A}** loaves")

    with c3:
        st.success(f"### 🚀 Model B (Aggressive)")
        st.metric(
            "Total Profit",
            f"${total_profit_B:,.0f}",
            delta=f"+${total_profit_B - total_profit_A:,.0f}",
        )
        st.write(f"📉 Missed Sales: **{missed_B}** loaves")
        st.write(f"🗑️ Waste: **{waste_B}** loaves")

    st.markdown(
        """
    ### 💡 The Insight
    Model B made **thousands of dollars more** simply because it understood the business rule: 
    *"It is cheaper to waste bread than to turn away a paying customer."*
    
    **Evaluation Lesson:** Don't just pick the model with the lowest Error. Pick the model that aligns with your cost structure.
    """
    )
