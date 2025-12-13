import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from sklearn.tree import DecisionTreeRegressor
from sklearn.linear_model import LinearRegression
import xgboost as xgb
import time

# --- 1. Page Configuration ---
st.set_page_config(
    page_title="XGBoost Interactive Guide",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- 2. Custom CSS ---
st.markdown(
    """
<style>
    .main-header {font-size: 2.5rem; color: #FF4B4B; font-weight: 700;}
    .sub-text {font-size: 1.2rem; color: #555;}
    .stTabs [data-baseweb="tab-list"] {gap: 10px;}
    .stTabs [data-baseweb="tab"] {height: 50px; white-space: pre-wrap; background-color: #f0f2f6; border-radius: 4px 4px 0px 0px;}
    .stTabs [aria-selected="true"] {background-color: #FF4B4B; color: white;}
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
    '<div class="sub-text">Understanding the mechanics, the hyperparameters, and the risks.</div>',
    unsafe_allow_html=True,
)
st.markdown("---")

# --- 4. Navigation ---
tab1, tab2, tab3, tab4 = st.tabs(
    [
        "🌱 1. The Tree (Logic)",
        "⛳ 2. The Concept (Golf Animation)",
        "⚙️ 3. The Engine (Math)",
        "📉 4. The Limitation (Hyperparameters)",
    ]
)

# ==========================================
# TAB 1: THE MANUAL TREE
# ==========================================
with tab1:
    st.header("1. The Base Unit: A Single Decision Tree")
    st.markdown(
        "A tree minimizes error by splitting data into averages. Find the split that minimizes MSE."
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
        split_val = st.slider("Split Threshold", 0.5, 9.5, 2.0, 0.1)

        left_mask = X_m1 < split_val
        right_mask = X_m1 >= split_val
        left_mean = y_m1[left_mask].mean() if np.any(left_mask) else 0
        right_mean = y_m1[right_mask].mean() if np.any(right_mask) else 0

        y_pred_m1 = np.zeros_like(y_m1)
        y_pred_m1[left_mask] = left_mean
        y_pred_m1[right_mask] = right_mean

        mse_m1 = np.mean((y_m1 - y_pred_m1) ** 2)
        st.metric("MSE (Error)", f"{mse_m1:.2f}")

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
        fig_m1.add_vline(
            x=split_val, line_dash="dash", line_color="black", annotation_text="Split"
        )
        fig_m1.add_trace(
            go.Scatter(
                x=[0, split_val],
                y=[left_mean, left_mean],
                mode="lines",
                name="Left Pred",
                line=dict(color="#FF4B4B", width=4),
            )
        )
        fig_m1.add_trace(
            go.Scatter(
                x=[split_val, 10],
                y=[right_mean, right_mean],
                mode="lines",
                name="Right Pred",
                line=dict(color="#FF4B4B", width=4),
            )
        )
        fig_m1.update_layout(
            title="Manual Tree Splitter",
            xaxis_title="Price ($)",
            yaxis_title="Demand",
            template="plotly_white",
            height=450,
        )
        st.plotly_chart(fig_m1, use_container_width=True)


# ==========================================
# TAB 2: THE GOLFER ANALOGY (ANIMATED)
# ==========================================
with tab2:
    st.header("2. Why Learning Rate Matters (The Ghost Shot)")

    # Session State
    if "golf_ball_x" not in st.session_state:
        st.session_state.golf_ball_x = 0.0
    if "golf_ball_y" not in st.session_state:
        st.session_state.golf_ball_y = 0.0
    if "golf_history" not in st.session_state:
        st.session_state.golf_history = []
    if "golf_playing" not in st.session_state:
        st.session_state.golf_playing = False

    TARGET_X, TARGET_Y = 85, 65
    TEE_X, TEE_Y = 0, 0

    def reset_golf():
        st.session_state.golf_ball_x = TEE_X
        st.session_state.golf_ball_y = TEE_Y
        st.session_state.golf_history = [(TEE_X, TEE_Y)]
        st.session_state.golf_playing = False

    if not st.session_state.golf_history:
        reset_golf()

    col_ctrl, col_viz = st.columns([1, 3])

    with col_ctrl:
        st.markdown(
            """
        **Learning Rate = Shrinkage.**
        The Tree (Golfer) calculates a full shot to the hole. 
        The **Learning Rate** decides what % of that shot we actually take.
        """
        )

        st.info(
            "💡 **Look for the Ghost Arrow:** That is the full tree prediction. The Red Arrow is the actual step."
        )

        lr_golf = st.slider("Learning Rate", 0.05, 1.0, 0.2, step=0.05)
        golfer_skill = st.slider("Tree Quality (Variance)", 1, 10, 7)
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
            # Background
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
                    mode="markers",
                    marker=dict(
                        size=25, color="black", symbol="circle-open", line=dict(width=3)
                    ),
                    name="Hole",
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

            # History
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

            # The Ghost Shot (What the tree WANTED to do)
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
                    arrowhead=0,
                    arrowwidth=2,
                    arrowcolor="gray",
                    opacity=0.5,
                )
                fig.add_trace(
                    go.Scatter(
                        x=[gx],
                        y=[gy],
                        mode="markers",
                        marker=dict(size=8, color="gray", opacity=0.5),
                        showlegend=False,
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
                    name="Ball",
                )
            )

            fig.update_layout(
                xaxis=dict(range=[-20, 120], visible=False),
                yaxis=dict(range=[-20, 120], visible=False),
                height=500,
                margin=dict(l=0, r=0, t=30, b=0),
            )
            return fig

        # Initial Draw
        if not st.session_state.golf_playing:
            golf_plot_spot.plotly_chart(
                draw_golf_course(
                    st.session_state.golf_ball_x,
                    st.session_state.golf_ball_y,
                    st.session_state.golf_history,
                ),
                use_container_width=True,
            )

        # Animation Loop
        if start_btn:
            reset_golf()
            st.session_state.golf_playing = True

            for i in range(1, 11):
                # 1. Calc Residual
                res_x = TARGET_X - st.session_state.golf_ball_x
                res_y = TARGET_Y - st.session_state.golf_ball_y

                # 2. Tree Prediction (With Noise)
                np.random.seed(i * 42)
                tree_pred_x = res_x * np.random.uniform(
                    1.0 - noise_factor, 1.0 + noise_factor
                )
                tree_pred_y = res_y * np.random.uniform(
                    1.0 - noise_factor, 1.0 + noise_factor
                )

                # 3. Ghost Coordinate (Where the tree aims)
                ghost_x = st.session_state.golf_ball_x + tree_pred_x
                ghost_y = st.session_state.golf_ball_y + tree_pred_y

                # 4. Actual Move (Shrinkage)
                move_x = tree_pred_x * lr_golf
                move_y = tree_pred_y * lr_golf

                # 5. Draw Frame (Show Ghost Arrow)
                fig_anim = draw_golf_course(
                    st.session_state.golf_ball_x,
                    st.session_state.golf_ball_y,
                    st.session_state.golf_history,
                    ghost_shot=(ghost_x, ghost_y),
                )
                golf_plot_spot.plotly_chart(fig_anim, use_container_width=True)

                math_box.markdown(
                    f"""
                **Shot {i}**:
                * ⛳ Distance to Hole: **{np.sqrt(res_x**2 + res_y**2):.1f}y**
                * 👻 Ghost Shot (Tree): **{np.sqrt(tree_pred_x**2 + tree_pred_y**2):.1f}y**
                * 🔴 Actual Shot (Tree × LR): **{np.sqrt(move_x**2 + move_y**2):.1f}y**
                """
                )

                time.sleep(0.8)  # Pause to see the ghost arrow

                # 6. Update State
                st.session_state.golf_ball_x += move_x
                st.session_state.golf_ball_y += move_y
                st.session_state.golf_history.append(
                    (st.session_state.golf_ball_x, st.session_state.golf_ball_y)
                )

            # Final Frame
            golf_plot_spot.plotly_chart(
                draw_golf_course(
                    st.session_state.golf_ball_x,
                    st.session_state.golf_ball_y,
                    st.session_state.golf_history,
                ),
                use_container_width=True,
            )
            st.session_state.golf_playing = False


from sklearn.model_selection import train_test_split

# ==========================================
# TAB 3: THE ENGINE (Tuning & Overfitting)
# ==========================================
with tab3:
    st.header("3. The Engine: Tuning & Overfitting")
    st.markdown(
        """
    This is where the magic happens. We split the data into **Training** (Blue) and **Testing** (Red).
    * **Goal:** Lower the error on the **Red (Test)** data.
    * **Trap:** If you make the model too complex (High Depth), it memorizes the Blue dots but fails on the Red ones (Overfitting).
    """
    )

    # --- INPUTS ---
    col_input, col_viz = st.columns([1, 3])

    # 1. Generate Data (Sine Wave + Trend + Noise)
    np.random.seed(42)
    X_m3 = np.linspace(0, 10, 120).reshape(-1, 1)
    y_m3 = (
        np.sin(X_m3.ravel()) * 10 + (X_m3.ravel() * 0.5) + np.random.normal(0, 2.0, 120)
    )

    # 2. Split Data (Train vs Test)
    # We scramble them so the test points are "holes" in the curve we need to interpolate
    X_train, X_test, y_train, y_test = train_test_split(
        X_m3, y_m3, test_size=0.2, random_state=42
    )

    with col_input:
        st.subheader("Hyperparameters")
        n_trees = st.slider(
            "n_estimators (Trees)",
            1,
            200,
            50,
            step=10,
            help="More trees = More refinement steps.",
        )
        depth = st.slider(
            "max_depth (Complexity)",
            1,
            10,
            3,
            help="Controls how specific each tree can be.",
        )
        lr = st.slider(
            "learning_rate (Step Size)",
            0.01,
            1.0,
            0.1,
            step=0.05,
            help="Lower = Slower, safer learning.",
        )

        st.markdown("---")
        st.markdown("### 📊 Live Metrics")

        # We will fill these after training
        metric_col1, metric_col2 = st.columns(2)
        train_metric = metric_col1.empty()
        test_metric = metric_col2.empty()

        st.info(
            """
        **Try this:**
        1. Set **Depth = 10**.
        2. Watch **Train Error** go near 0.
        3. Watch **Test Error** stay high (Overfitting!).
        """
        )

    # --- CALCULATIONS ---

    # 1. Train the Full Ensemble
    # We pass BOTH sets to eval_set to track both learning curves
    model_full = xgb.XGBRegressor(
        n_estimators=n_trees,
        max_depth=depth,
        learning_rate=lr,
        random_state=42,
        objective="reg:squarederror",
    )

    model_full.fit(
        X_train, y_train, eval_set=[(X_train, y_train), (X_test, y_test)], verbose=False
    )

    # Generate predictions for the visualization line (sorted for smooth plotting)
    X_sorted = np.sort(X_m3, axis=0)
    y_pred_sorted = model_full.predict(X_sorted)

    # 2. Single Tree Demo (Complexity Visualizer)
    # We fit a single decision tree to raw data just to show the "Shape" of that depth
    model_single = DecisionTreeRegressor(max_depth=depth)
    model_single.fit(X_m3, y_m3)
    y_pred_single = model_single.predict(X_sorted)

    # 3. Retrieve Learning Curves
    results = model_full.evals_result()
    train_history = [
        x**2 for x in results["validation_0"]["rmse"]
    ]  # Square RMSE to get MSE
    test_history = [x**2 for x in results["validation_1"]["rmse"]]

    # Update Metrics
    train_metric.metric("Train MSE", f"{train_history[-1]:.1f}")
    test_metric.metric("Test MSE", f"{test_history[-1]:.1f}", delta_color="inverse")

    # --- VISUALIZATION ---
    with col_viz:
        fig = make_subplots(
            rows=2,
            cols=2,
            specs=[[{"colspan": 2}, None], [{}, {}]],
            subplot_titles=(
                "1. Model Fit (Blue=Train, Red=Test)",
                "2. Structural Complexity (What 1 Tree looks like)",
                "3. Learning Curve (The Overfitting Detector)",
            ),
            vertical_spacing=0.15,
        )

        # PLOT 1: The Final Fit
        # Train Dots
        fig.add_trace(
            go.Scatter(
                x=X_train.ravel(),
                y=y_train,
                mode="markers",
                name="Train Data",
                marker=dict(color="#3b82f6", size=6, opacity=0.6),
            ),
            row=1,
            col=1,
        )
        # Test Dots
        fig.add_trace(
            go.Scatter(
                x=X_test.ravel(),
                y=y_test,
                mode="markers",
                name="Test Data",
                marker=dict(color="#ef4444", size=8, symbol="x"),
            ),
            row=1,
            col=1,
        )
        # The Line
        fig.add_trace(
            go.Scatter(
                x=X_sorted.ravel(),
                y=y_pred_sorted,
                mode="lines",
                name="XGBoost Model",
                line=dict(color="#10b981", width=3),
            ),
            row=1,
            col=1,
        )

        # PLOT 2: Single Tree Complexity
        fig.add_trace(
            go.Scatter(
                x=X_sorted.ravel(),
                y=y_pred_single,
                mode="lines",
                name="Single Tree Structure",
                line=dict(color="purple", width=2),
            ),
            row=2,
            col=1,
        )
        fig.add_annotation(
            text=f"Depth {depth} = {2**depth} Leaves",
            xref="x2",
            yref="y2",
            x=5,
            y=min(y_m3),
            showarrow=False,
            font=dict(size=12, color="purple"),
            row=2,
            col=1,
        )

        # PLOT 3: Learning Curve (Train vs Test)
        iterations = list(range(1, len(train_history) + 1))
        fig.add_trace(
            go.Scatter(
                x=iterations,
                y=train_history,
                mode="lines",
                name="Train Error",
                line=dict(color="#3b82f6"),
            ),
            row=2,
            col=2,
        )
        fig.add_trace(
            go.Scatter(
                x=iterations,
                y=test_history,
                mode="lines",
                name="Test Error",
                line=dict(color="#ef4444", width=3),
            ),
            row=2,
            col=2,
        )

        fig.update_xaxes(title_text="Trees", row=2, col=2)
        fig.update_yaxes(title_text="MSE (Error)", row=2, col=2)

        fig.update_layout(height=650, template="plotly_white", margin=dict(t=30))
        st.plotly_chart(fig, use_container_width=True)

# ==========================================
# TAB 4: THE CLIFF (VISUALIZING PARAMETERS)
# ==========================================
with tab4:
    st.header("4. Visualizing Model Complexity & Extrapolation")
    st.markdown(
        """
    Here you can see the impact of **Number of Trees** and **Tree Depth**.
    * **Max Depth:** Controls how "wiggly" the line is (Complexity).
    * **N Estimators:** Controls how refined the fit is.
    * **The Cliff:** Notice that no matter what you do, the Red Zone remains flat.
    """
    )

    col_ctrl, col_viz = st.columns([1, 4])

    # Time Series Data
    days = np.arange(100)
    demand = (
        200 + 3 * days + np.random.normal(0, 15, 100)
    )  # Noisier data to show overfitting

    train_size = 70
    X_train = days[:train_size].reshape(-1, 1)
    y_train = demand[:train_size]
    X_test = days[train_size:].reshape(-1, 1)  # Future
    y_test = demand[train_size:]
    X_full = np.concatenate([X_train, X_test])

    with col_ctrl:
        st.subheader("Hyperparameters")

        model_type = st.radio("Model Choice", ["Linear Regression", "XGBoost"])

        # DYNAMIC SLIDERS for XGBoost
        if model_type == "XGBoost":
            n_est = st.slider("Number of Trees (n_estimators)", 1, 300, 100)
            max_d = st.slider("Tree Depth (max_depth)", 1, 10, 3)
            lr_real = st.slider("Learning Rate", 0.01, 0.5, 0.1)

            st.markdown("---")
            if max_d < 2:
                st.warning("Depth 1: 'Stumps'. Too simple (Underfitting).")
            elif max_d > 6:
                st.error("Depth > 6: High variance. Likely overfitting noise.")
            else:
                st.success("Depth 3-6: Usually the sweet spot.")

    # Model Fitting
    if model_type == "Linear Regression":
        model = LinearRegression()
        model.fit(X_train, y_train)
        y_pred_full = model.predict(X_full)
        line_color = "blue"
        model_name = "Linear Regression"
    else:
        # Train interactive XGBoost
        model = xgb.XGBRegressor(
            n_estimators=n_est, max_depth=max_d, learning_rate=lr_real, random_state=42
        )
        model.fit(X_train, y_train)
        y_pred_full = model.predict(X_full)
        line_color = "#FF4B4B"
        model_name = f"XGBoost (n={n_est}, d={max_d})"

    with col_viz:
        fig_m3 = go.Figure()
        # History
        fig_m3.add_trace(
            go.Scatter(
                x=X_train.ravel(),
                y=y_train,
                mode="markers",
                name="Training Data",
                marker=dict(color="green", opacity=0.6),
            )
        )
        # Future Truth
        fig_m3.add_trace(
            go.Scatter(
                x=X_test.ravel(),
                y=y_test,
                mode="markers",
                name="Future Reality",
                marker=dict(color="gray", opacity=0.4),
            )
        )
        # Prediction
        fig_m3.add_trace(
            go.Scatter(
                x=X_full.ravel(),
                y=y_pred_full,
                mode="lines",
                name=f"{model_name}",
                line=dict(color=line_color, width=4),
            )
        )

        # Zones
        fig_m3.add_vrect(
            x0=0,
            x1=train_size,
            fillcolor="green",
            opacity=0.1,
            annotation_text="Training Zone",
        )
        fig_m3.add_vrect(
            x0=train_size,
            x1=100,
            fillcolor="red",
            opacity=0.1,
            annotation_text="Extrapolation Zone",
        )

        fig_m3.update_layout(
            title="Forecasting: Training vs. Extrapolation",
            xaxis_title="Time (Days)",
            yaxis_title="Demand",
            template="plotly_white",
            height=500,
        )
        st.plotly_chart(fig_m3, use_container_width=True)
