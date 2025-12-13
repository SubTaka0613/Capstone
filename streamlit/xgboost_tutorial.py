import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from sklearn.tree import DecisionTreeRegressor
from sklearn.linear_model import LinearRegression
import xgboost as xgb
import time
from sklearn.model_selection import train_test_split

# --- 1. Page Configuration ---
st.set_page_config(
    page_title="XGBoost Master Class",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- 2. Custom CSS ---
st.markdown(
    """
<style>
    .main-header {font-size: 2.5rem; color: #FF4B4B; font-weight: 800;}
    .sub-text {font-size: 1.2rem; color: #555;}
    .stTabs [data-baseweb="tab-list"] {gap: 8px;}
    .stTabs [data-baseweb="tab"] {height: 50px; white-space: pre-wrap; background-color: #f0f2f6; border-radius: 4px 4px 0px 0px; font-weight: 600;}
    .stTabs [aria-selected="true"] {background-color: #FF4B4B; color: white;}
    div[data-testid="stMetricValue"] {font-size: 1.8rem;}
</style>
""",
    unsafe_allow_html=True,
)

# --- 3. Header ---
st.markdown(
    '<div class="main-header">🚀 XGBoost: The Interactive Master Class</div>',
    unsafe_allow_html=True,
)
st.markdown(
    '<div class="sub-text">From the basic logic of a single tree to advanced industry techniques for time-series.</div>',
    unsafe_allow_html=True,
)
st.markdown("---")

# --- 4. Navigation ---
tab1, tab2, tab3, tab4 = st.tabs(
    [
        "🌱 1. The Tree (Logic)",
        "⛳ 2. The Concept (Golf Animation)",
        "⚙️ 3. The Engine (Bias vs Variance)",
        "📉 4. The Limitation (Extrapolation)",
    ]
)

# ==========================================
# TAB 1: THE MANUAL TREE
# ==========================================
with tab1:
    st.header("1. The Base Unit: A Single Decision Tree")
    st.markdown(
        """
        Gradient Boosting is just an ensemble of many simple Regression Trees. 
        A single tree makes predictions by splitting data into "leaves" and taking the average.
        
        **Your Mission:** minimizing the **Mean Squared Error (MSE)** by finding the perfect split.
        """
    )

    col1, col2 = st.columns([1, 3])

    # Generate Data
    np.random.seed(42)
    n_samples = 50
    X_m1 = np.sort(np.random.uniform(0, 10, n_samples))
    y_m1 = np.where(
        X_m1 < 5,
        100 + np.random.normal(0, 5, n_samples),
        60 + np.random.normal(0, 5, n_samples),
    )

    with col1:
        st.subheader("Controls")

        # User Control
        split_val = st.slider("✂️ Split Threshold", 0.5, 9.5, 2.0, 0.1)

        # Optimization Logic
        best_split_idx = 0
        min_mse = float("inf")

        # Brute force search for the best split for display purposes
        search_space = np.linspace(0.5, 9.5, 100)
        for s in search_space:
            l_mask = X_m1 < s
            r_mask = X_m1 >= s
            if np.any(l_mask) and np.any(r_mask):
                pred = np.zeros_like(y_m1)
                pred[l_mask] = y_m1[l_mask].mean()
                pred[r_mask] = y_m1[r_mask].mean()
                mse = np.mean((y_m1 - pred) ** 2)
                if mse < min_mse:
                    min_mse = mse
                    best_split = s

        show_optimum = st.checkbox("🤖 Show Optimal Split")

        # Current Calculation
        left_mask = X_m1 < split_val
        right_mask = X_m1 >= split_val
        left_mean = y_m1[left_mask].mean() if np.any(left_mask) else 0
        right_mean = y_m1[right_mask].mean() if np.any(right_mask) else 0

        y_pred_m1 = np.zeros_like(y_m1)
        y_pred_m1[left_mask] = left_mean
        y_pred_m1[right_mask] = right_mean

        current_mse = np.mean((y_m1 - y_pred_m1) ** 2)

        st.divider()
        st.metric("Your MSE", f"{current_mse:.2f}")
        if show_optimum:
            st.metric(
                "Optimal MSE",
                f"{min_mse:.2f}",
                delta=f"{current_mse - min_mse:.2f}",
                delta_color="inverse",
            )
            st.caption(f"Best Split was at: **{best_split:.2f}**")

    with col2:
        fig_m1 = go.Figure()
        fig_m1.add_trace(
            go.Scatter(
                x=X_m1,
                y=y_m1,
                mode="markers",
                name="Data",
                marker=dict(color="gray", size=8),
            )
        )

        # User Split
        fig_m1.add_vline(
            x=split_val,
            line_dash="dash",
            line_color="#FF4B4B",
            annotation_text="Your Split",
        )
        fig_m1.add_trace(
            go.Scatter(
                x=[0, split_val],
                y=[left_mean, left_mean],
                mode="lines",
                name="Your Prediction",
                line=dict(color="#FF4B4B", width=4),
            )
        )
        fig_m1.add_trace(
            go.Scatter(
                x=[split_val, 10],
                y=[right_mean, right_mean],
                mode="lines",
                showlegend=False,
                line=dict(color="#FF4B4B", width=4),
            )
        )

        # Optimal Split (Ghost)
        if show_optimum:
            fig_m1.add_vline(
                x=best_split,
                line_dash="dot",
                line_color="green",
                opacity=0.5,
                annotation_text="Optimum",
            )

        fig_m1.update_layout(
            title="Manual Tree Splitter",
            xaxis_title="Price ($)",
            yaxis_title="Demand",
            template="plotly_white",
            height=450,
            margin=dict(t=30),
        )
        st.plotly_chart(fig_m1, use_container_width=True)


# ==========================================
# TAB 2: THE GOLFER ANALOGY (ANIMATED)
# ==========================================
with tab2:
    st.header("2. Why Learning Rate Matters (The Ghost Shot)")

    # Session State management
    if "golf_state" not in st.session_state:
        st.session_state.golf_state = {
            "ball_x": 0.0,
            "ball_y": 0.0,
            "history": [(0.0, 0.0)],
            "playing": False,
        }

    TARGET_X, TARGET_Y = 85, 65
    TEE_X, TEE_Y = 0, 0

    def reset_golf():
        st.session_state.golf_state = {
            "ball_x": TEE_X,
            "ball_y": TEE_Y,
            "history": [(TEE_X, TEE_Y)],
            "playing": False,
        }

    col_ctrl, col_viz = st.columns([1, 3])

    with col_ctrl:
        st.markdown(
            """
        **Learning Rate = Shrinkage.**
        
        1. **The Tree (Golfer):** Calculates a shot to the hole (Residual).
        2. **The Learning Rate:** Decides what % of that shot we actually take.
        
        *Low Learning Rate = More precise, but needs more trees.*
        """
        )

        lr_golf = st.slider("Learning Rate", 0.05, 1.0, 0.2, step=0.05)
        golfer_skill = st.slider(
            "Tree Quality (Variance)",
            1,
            10,
            7,
            help="Lower quality = The tree aims poorly (high variance).",
        )
        noise_factor = (11 - golfer_skill) / 20.0

        col_start, col_reset = st.columns(2)
        start_btn = col_start.button("▶️ Start Round")
        if col_reset.button("🔄 Reset"):
            reset_golf()

        math_box = st.empty()

    with col_viz:
        golf_plot_spot = st.empty()

        def draw_golf_course(curr_x, curr_y, history, ghost_shot=None):
            fig = go.Figure()
            # Background Green
            fig.add_shape(
                type="rect",
                x0=-20,
                y0=-20,
                x1=120,
                y1=120,
                fillcolor="#f0fdf4",
                layer="below",
                line_width=0,
            )

            # Hole & Tee
            fig.add_trace(
                go.Scatter(
                    x=[TARGET_X],
                    y=[TARGET_Y],
                    mode="markers+text",
                    text=["Hole"],
                    textposition="top center",
                    marker=dict(
                        size=25, color="black", symbol="circle-open", line=dict(width=3)
                    ),
                    name="Target",
                )
            )
            fig.add_trace(
                go.Scatter(
                    x=[TEE_X],
                    y=[TEE_Y],
                    mode="markers",
                    marker=dict(size=12, color="green", symbol="square"),
                    name="Start",
                )
            )

            # History Path
            if len(history) > 1:
                hist_x, hist_y = zip(*history)
                fig.add_trace(
                    go.Scatter(
                        x=hist_x,
                        y=hist_y,
                        mode="lines+markers",
                        marker=dict(size=5, color="#FF4B4B"),
                        line=dict(color="#FF4B4B", dash="dot"),
                        name="Path",
                    )
                )

            # The Ghost Shot (Prediction)
            if ghost_shot:
                gx, gy = ghost_shot
                fig.add_annotation(
                    x=gx,
                    y=gy,
                    ax=curr_x,
                    ay=curr_y,
                    xref="x",
                    yref="y",
                    axref="x",
                    ayref="y",
                    showarrow=True,
                    arrowhead=2,
                    arrowwidth=2,
                    arrowcolor="gray",
                    opacity=0.5,
                    arrowsize=1,
                )
                fig.add_trace(
                    go.Scatter(
                        x=[gx],
                        y=[gy],
                        mode="markers",
                        marker=dict(size=8, color="gray", opacity=0.5),
                        showlegend=False,
                        name="Full Tree Pred",
                    )
                )

            # Current Ball
            fig.add_trace(
                go.Scatter(
                    x=[curr_x],
                    y=[curr_y],
                    mode="markers",
                    marker=dict(
                        size=15, color="white", line=dict(width=2, color="red")
                    ),
                    name="Current Pos",
                )
            )

            fig.update_layout(
                xaxis=dict(range=[-20, 120], visible=False),
                yaxis=dict(range=[-20, 120], visible=False),
                height=500,
                margin=dict(l=0, r=0, t=10, b=0),
                showlegend=True,
            )
            return fig

        # Initial Draw
        if not st.session_state.golf_state["playing"]:
            golf_plot_spot.plotly_chart(
                draw_golf_course(
                    st.session_state.golf_state["ball_x"],
                    st.session_state.golf_state["ball_y"],
                    st.session_state.golf_state["history"],
                ),
                use_container_width=True,
            )

        # Animation Loop
        if start_btn:
            reset_golf()
            st.session_state.golf_state["playing"] = True

            for i in range(1, 11):
                # Physics
                res_x = TARGET_X - st.session_state.golf_state["ball_x"]
                res_y = TARGET_Y - st.session_state.golf_state["ball_y"]

                # Tree Prediction (Signal + Noise)
                np.random.seed(i * 42)
                tree_pred_x = res_x * np.random.uniform(
                    1.0 - noise_factor, 1.0 + noise_factor
                )
                tree_pred_y = res_y * np.random.uniform(
                    1.0 - noise_factor, 1.0 + noise_factor
                )

                ghost_x = st.session_state.golf_state["ball_x"] + tree_pred_x
                ghost_y = st.session_state.golf_state["ball_y"] + tree_pred_y

                # Shrinkage
                move_x = tree_pred_x * lr_golf
                move_y = tree_pred_y * lr_golf

                # Render Frame
                fig_anim = draw_golf_course(
                    st.session_state.golf_state["ball_x"],
                    st.session_state.golf_state["ball_y"],
                    st.session_state.golf_state["history"],
                    ghost_shot=(ghost_x, ghost_y),
                )
                golf_plot_spot.plotly_chart(fig_anim, use_container_width=True)

                dist_remaining = np.sqrt(
                    (TARGET_X - (st.session_state.golf_state["ball_x"] + move_x)) ** 2
                    + (TARGET_Y - (st.session_state.golf_state["ball_y"] + move_y)) ** 2
                )

                math_box.info(
                    f"""
                **Shot {i} / 10**
                * 🎯 Residual (Distance): **{np.sqrt(res_x**2 + res_y**2):.1f}y**
                * 👻 Tree Prediction: **{np.sqrt(tree_pred_x**2 + tree_pred_y**2):.1f}y**
                * 🔴 Actual Step (x LR): **{np.sqrt(move_x**2 + move_y**2):.1f}y**
                * 📏 Remaining: **{dist_remaining:.1f}y**
                """
                )

                time.sleep(0.6)

                # Update State
                st.session_state.golf_state["ball_x"] += move_x
                st.session_state.golf_state["ball_y"] += move_y
                st.session_state.golf_state["history"].append(
                    (
                        st.session_state.golf_state["ball_x"],
                        st.session_state.golf_state["ball_y"],
                    )
                )

            st.session_state.golf_state["playing"] = False


# ==========================================
# TAB 3: THE ENGINE (Fixed for XGBoost 2.0+)
# ==========================================


@st.cache_data(show_spinner="Training Ensemble...")
def train_xgboost_ensemble(n_trees, depth, lr, X_train, y_train, X_test, y_test):
    # FIX: Pass eval_metric here instead of in .fit()
    model_full = xgb.XGBRegressor(
        n_estimators=n_trees,
        max_depth=depth,
        learning_rate=lr,
        random_state=42,
        objective="reg:squarederror",
        n_jobs=4,
        eval_metric="rmse",  # <--- MOVED HERE
    )

    evals_result = {}

    # FIX: Removed eval_metric argument from .fit()
    model_full.fit(
        X_train, y_train, eval_set=[(X_train, y_train), (X_test, y_test)], verbose=False
    )

    # Access history manually since we didn't pass a dictionary to fit() in the new API
    # XGBoost 2.0+ stores results in model_full.evals_result() after training
    evals_result = model_full.evals_result()

    # Smooth plotting range
    X_sorted = np.sort(np.concatenate([X_train, X_test]), axis=0)
    y_pred_sorted = model_full.predict(X_sorted)

    return model_full, y_pred_sorted, evals_result


@st.cache_data(show_spinner=False)
def train_single_tree(depth, X, y):
    model_single = DecisionTreeRegressor(max_depth=depth)
    model_single.fit(X, y)
    X_full = np.linspace(0, 10, 120).reshape(-1, 1)
    X_sorted = np.sort(X_full, axis=0)
    y_pred_single = model_single.predict(X_sorted)
    return y_pred_single


with tab3:
    st.header("3. The Engine: Bias vs. Variance")
    st.markdown(
        """
    We split data into **Train (Blue)** and **Test (Red)**. 
    The goal is to minimize Test Error. Watch what happens when Depth gets too high!
    """
    )

    col_input, col_viz = st.columns([1, 3])

    # Data Gen
    np.random.seed(42)
    X_m3 = np.linspace(0, 10, 120).reshape(-1, 1)
    y_m3 = (
        np.sin(X_m3.ravel()) * 10 + (X_m3.ravel() * 0.5) + np.random.normal(0, 2.5, 120)
    )
    X_train, X_test, y_train, y_test = train_test_split(
        X_m3, y_m3, test_size=0.2, random_state=42
    )

    with col_input:
        st.subheader("Hyperparameters")
        n_trees = st.slider("n_estimators", 1, 300, 50, step=10)
        depth = st.slider("max_depth", 1, 15, 3)
        lr = st.slider("learning_rate", 0.01, 1.0, 0.1, step=0.05, key="lr_t3")

        st.divider()
        st.markdown("### 📊 Metrics")
        col_m1, col_m2 = st.columns(2)
        metric_train = col_m1.empty()
        metric_test = col_m2.empty()

        if depth > 7:
            st.warning(
                "⚠️ High Depth detected. Look for the gap between Train and Test lines!"
            )

    # Training
    model_full, y_pred_sorted, results = train_xgboost_ensemble(
        n_trees, depth, lr, X_train, y_train, X_test, y_test
    )
    y_pred_single = train_single_tree(depth, X_m3, y_m3)

    # Metrics - XGBoost returns RMSE, we square it for MSE
    train_hist = [x**2 for x in results["validation_0"]["rmse"]]
    test_hist = [x**2 for x in results["validation_1"]["rmse"]]

    metric_train.metric("Train MSE", f"{train_hist[-1]:.1f}")
    metric_test.metric(
        "Test MSE",
        f"{test_hist[-1]:.1f}",
        delta=f"{test_hist[-1]-train_hist[-1]:.1f} Gap",
        delta_color="inverse",
    )

    with col_viz:
        fig = make_subplots(
            rows=2,
            cols=2,
            specs=[[{"colspan": 2}, None], [{}, {}]],
            subplot_titles=(
                "1. Model Fit",
                "2. Complexity (Single Tree)",
                "3. Learning Curve (Overfitting)",
            ),
            vertical_spacing=0.15,
        )

        # 1. Fit
        fig.add_trace(
            go.Scatter(
                x=X_train.ravel(),
                y=y_train,
                mode="markers",
                name="Train",
                marker=dict(color="#3b82f6", size=6, opacity=0.5),
            ),
            row=1,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=X_test.ravel(),
                y=y_test,
                mode="markers",
                name="Test",
                marker=dict(color="#ef4444", size=8, symbol="x"),
            ),
            row=1,
            col=1,
        )
        X_full_sorted = np.sort(np.concatenate([X_train, X_test]), axis=0)
        fig.add_trace(
            go.Scatter(
                x=X_full_sorted.ravel(),
                y=y_pred_sorted,
                mode="lines",
                name="XGBoost",
                line=dict(color="#10b981", width=3),
            ),
            row=1,
            col=1,
        )

        # 2. Complexity
        fig.add_trace(
            go.Scatter(
                x=X_full_sorted.ravel(),
                y=y_pred_single,
                mode="lines",
                name="Single Tree",
                line=dict(color="purple", width=2),
            ),
            row=2,
            col=1,
        )
        fig.add_annotation(
            text=f"Depth {depth}<br>{2**depth} Leaves",
            xref="x2",
            yref="y2",
            x=5,
            y=np.min(y_m3),
            showarrow=False,
            font=dict(size=12, color="purple"),
            row=2,
            col=1,
        )

        # 3. Learning Curve
        iters = list(range(1, len(train_hist) + 1))
        fig.add_trace(
            go.Scatter(
                x=iters,
                y=train_hist,
                mode="lines",
                name="Train Error",
                line=dict(color="#3b82f6"),
            ),
            row=2,
            col=2,
        )
        fig.add_trace(
            go.Scatter(
                x=iters,
                y=test_hist,
                mode="lines",
                name="Test Error",
                line=dict(color="#ef4444", width=3),
            ),
            row=2,
            col=2,
        )

        # Shade the overfitting gap
        fig.add_trace(
            go.Scatter(
                x=iters + iters[::-1],
                y=train_hist + test_hist[::-1],
                fill="toself",
                fillcolor="rgba(239, 68, 68, 0.2)",
                line=dict(color="rgba(255,255,255,0)"),
                showlegend=False,
                name="Variance Gap",
            ),
            row=2,
            col=2,
        )

        fig.update_layout(height=600, template="plotly_white", margin=dict(t=30))
        st.plotly_chart(fig, use_container_width=True)


# ==========================================
# TAB 4: THE CLIFF (WITH SOLUTION)
# ==========================================


@st.cache_data(show_spinner="Forecasting...")
def train_forecasting_model(
    model_choice, n_est, max_d, lr, use_hybrid, X_train, y_train, X_full
):
    # Setup data
    model_name = "Model"
    line_color = "gray"

    if model_choice == "Linear Regression":
        model = LinearRegression()
        model.fit(X_train, y_train)
        y_pred = model.predict(X_full)
        line_color = "blue"
        model_name = "Linear Regression"

    elif model_choice == "XGBoost":
        if use_hybrid:
            # 1. Fit Linear Trend
            lin = LinearRegression()
            lin.fit(X_train, y_train)
            trend_train = lin.predict(X_train)
            trend_full = lin.predict(X_full)

            # 2. Fit XGB on Residuals
            resid_train = y_train - trend_train
            xgb_model = xgb.XGBRegressor(
                n_estimators=n_est,
                max_depth=max_d,
                learning_rate=lr,
                n_jobs=4,
                random_state=42,
            )
            xgb_model.fit(X_train, resid_train)
            resid_pred_full = xgb_model.predict(X_full)

            # 3. Combine
            y_pred = trend_full + resid_pred_full
            line_color = "#8b5cf6"  # Purple
            model_name = "Hybrid (Linear + XGB)"
        else:
            # Standard XGB
            model = xgb.XGBRegressor(
                n_estimators=n_est,
                max_depth=max_d,
                learning_rate=lr,
                n_jobs=4,
                random_state=42,
            )
            model.fit(X_train, y_train)
            y_pred = model.predict(X_full)
            line_color = "#FF4B4B"
            model_name = "Standard XGBoost"

    return y_pred, line_color, model_name


with tab4:
    st.header("4. The Cliff & The Solution")
    st.markdown(
        """
    **The Problem:** XGBoost cannot predict values outside the range it saw during training. It flatlines.
    **The Solution:** Use a "Hybrid" approach. Fit the trend with Linear Regression, and boost the residuals.
    """
    )

    col_ctrl, col_viz = st.columns([1, 4])

    days = np.arange(120)
    demand = 200 + 4 * days + np.sin(days / 5) * 20 + np.random.normal(0, 15, 120)

    train_size = 80
    X_train = days[:train_size].reshape(-1, 1)
    y_train = demand[:train_size]
    X_test = days[train_size:].reshape(-1, 1)
    y_test = demand[train_size:]
    X_full = np.concatenate([X_train, X_test])

    with col_ctrl:
        st.subheader("Model Configuration")
        model_choice = st.radio("Base Model", ["Linear Regression", "XGBoost"])

        use_hybrid = False
        n_est, max_d, lr_real = 100, 3, 0.1

        if model_choice == "XGBoost":
            st.markdown("### 🛠️ The Fix")
            use_hybrid = st.checkbox(
                "✅ Apply 'Detrending' (Hybrid)",
                help="Fits a Linear Regression first, then boosts the errors.",
            )

            st.markdown("### Hyperparameters")
            n_est = st.slider("Trees", 1, 300, 100)
            max_d = st.slider("Depth", 1, 10, 3)
            lr_real = st.slider("Learning Rate", 0.01, 0.5, 0.1)

            if not use_hybrid:
                st.error("Observe the flatline in the Extrapolation Zone.")
            else:
                st.success("The model now captures Trend AND Seasonality!")

    y_pred, line_color, model_name = train_forecasting_model(
        model_choice, n_est, max_d, lr_real, use_hybrid, X_train, y_train, X_full
    )

    with col_viz:
        fig_m3 = go.Figure()
        fig_m3.add_trace(
            go.Scatter(
                x=X_train.ravel(),
                y=y_train,
                mode="markers",
                name="History (Train)",
                marker=dict(color="green", opacity=0.5),
            )
        )
        fig_m3.add_trace(
            go.Scatter(
                x=X_test.ravel(),
                y=y_test,
                mode="markers",
                name="Future (Reality)",
                marker=dict(color="gray", opacity=0.4),
            )
        )

        fig_m3.add_trace(
            go.Scatter(
                x=X_full.ravel(),
                y=y_pred,
                mode="lines",
                name=model_name,
                line=dict(color=line_color, width=4),
            )
        )

        fig_m3.add_vrect(
            x0=0,
            x1=train_size,
            fillcolor="green",
            opacity=0.05,
            annotation_text="Training Zone",
        )
        fig_m3.add_vrect(
            x0=train_size,
            x1=120,
            fillcolor="red",
            opacity=0.05,
            annotation_text="Extrapolation Zone",
        )

        fig_m3.update_layout(
            title="Forecasting: Trend vs Flatline",
            xaxis_title="Time (Days)",
            yaxis_title="Demand",
            template="plotly_white",
            height=500,
        )
        st.plotly_chart(fig_m3, use_container_width=True)
