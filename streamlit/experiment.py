import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go

# --- Page Config ---
st.set_page_config(layout="wide", page_title="The Forecasting Terrain")

st.markdown(
    """
<style>
    .main-header {font-size: 2.5rem; color: #6C63FF; font-weight: 800;}
    .sub-text {font-size: 1.1rem; color: #555;}
    .stApp {background-color: #0E1117; color: white;}
</style>
""",
    unsafe_allow_html=True,
)

st.title("🌍 The Demand Landscape")
st.markdown(
    """
**Concept:** Stop thinking of demand as a line on a chart. Think of it as a **Terrain**.
* **Mountains:** Seasonal peaks.
* **Valleys:** Post-holiday slumps.
* **Roughness:** Noise and volatility.

A good model is a "smooth blanket" draped over this rocky terrain. It should capture the shape, not the rocks.
"""
)

# --- TABS ---
tab_terrain, tab_agg = st.tabs(
    ["⛰️ 1. The Landscape (Bias/Variance)", "🗺️ 2. The Aggregation Morph"]
)

# ==========================================
# MODULE 1: THE DEMAND LANDSCAPE (3D Surface)
# ==========================================
with tab_terrain:
    col_ctrl, col_viz = st.columns([1, 3])

    with col_ctrl:
        st.subheader("Model Settings")

        # 1. Generate The Landscape (Ground Truth)
        # We simulate 52 weeks (X) across 20 products (Y)
        x = np.linspace(0, 52, 52)
        y = np.linspace(0, 20, 20)
        X, Y = np.meshgrid(x, y)

        # The Signal: Seasonality + Trend
        Z_truth = np.sin(X / 5) * 10 + (X / 2) + np.cos(Y / 2) * 5 + 50

        # The Noise: Random jagged rocks
        noise_level = st.slider("Market Noise (Roughness)", 0.0, 10.0, 3.0)
        np.random.seed(42)
        Z_noise = np.random.normal(0, noise_level, Z_truth.shape)
        Z_actual = Z_truth + Z_noise

        st.divider()

        # 2. The Model (The Blanket)
        st.subheader("The Forecasting Blanket")
        model_type = st.select_slider(
            "Model Complexity",
            options=["Underfit (Flat Sheet)", "Good Fit (Smooth)", "Overfit (Tinfoil)"],
            value="Good Fit (Smooth)",
        )

        if model_type == "Underfit (Flat Sheet)":
            # Just the mean plane
            Z_pred = np.full_like(Z_actual, np.mean(Z_actual))
            color_scale = "Greys"
            opacity = 0.5

        elif model_type == "Good Fit (Smooth)":
            # The Truth (Signal) without the Noise
            Z_pred = Z_truth
            color_scale = "Viridis"
            opacity = 0.8

        else:  # Overfit
            # The Truth + Half the noise (It's learning the noise!)
            Z_pred = Z_truth + (Z_noise * 0.9)
            color_scale = "Hot"
            opacity = 0.9

        show_residuals = st.checkbox("Show Residuals (Spikes)", value=False)

    with col_viz:
        fig = go.Figure()

        # Layer 1: The Raw Data (Wireframe / Points) to represent the "Rocky Ground"
        fig.add_trace(
            go.Surface(
                z=Z_actual,
                x=X,
                y=Y,
                colorscale="Ice",
                showscale=False,
                opacity=0.3,
                name="Raw Data",
                hidesurface=False,
                contours_z=dict(
                    show=True,
                    usecolormap=True,
                    highlightcolor="limegreen",
                    project_z=True,
                ),
            )
        )

        # Layer 2: The Model (The Surface)
        fig.add_trace(
            go.Surface(
                z=Z_pred,
                x=X,
                y=Y,
                colorscale=color_scale,
                showscale=True,
                name="Model Prediction",
                opacity=opacity,
                colorbar=dict(title="Demand Lvl", x=0),
            )
        )

        # Layer 3: Residuals (Vertical Lines) - Optional
        if show_residuals:
            # We construct lines by creating pairs of points
            # This is computationally heavy, so we sample
            sample_rate = 2
            for i in range(0, Z_actual.shape[0], sample_rate):
                for j in range(0, Z_actual.shape[1], sample_rate):
                    fig.add_trace(
                        go.Scatter3d(
                            x=[X[i, j], X[i, j]],
                            y=[Y[i, j], Y[i, j]],
                            z=[Z_pred[i, j], Z_actual[i, j]],
                            mode="lines",
                            line=dict(color="red", width=2),
                            showlegend=False,
                        )
                    )

        fig.update_layout(
            title="3D Demand Terrain: Signal vs. Noise",
            scene=dict(
                xaxis_title="Time (Weeks)",
                yaxis_title="Product Category",
                zaxis_title="Sales Volume",
                camera=dict(eye=dict(x=1.5, y=1.5, z=1.2)),
            ),
            height=600,
            margin=dict(l=0, r=0, b=0, t=40),
        )
        st.plotly_chart(fig, use_container_width=True)

        if model_type == "Overfit (Tinfoil)":
            st.error(
                "🚨 **Visualizing Overfitting:** Notice how the 'blanket' is crinkled? It is hugging every random rock (noise). This model will fail next week because the rocks will move."
            )
        elif model_type == "Good Fit (Smooth)":
            st.success(
                "✅ **The Goal:** The blanket captures the shape of the mountain (Seasonality) but ignores the small rocks (Noise)."
            )


# ==========================================
# MODULE 2: THE AGGREGATION DIAL
# ==========================================
with tab_agg:
    col_desc, col_morph = st.columns([1, 3])

    with col_desc:
        st.markdown(
            """
        **The Insight:** Why is forecasting easier at Headquarters?
        
        **Aggregation destroys noise.**
        
        Use the slider to morph **100 Individual Stores** (Chaos) into **1 National Region** (Smoothness).
        """
        )

        agg_level = st.select_slider(
            "Aggregation Level",
            options=["Store Level (100)", "District (20)", "Region (5)", "HQ (1)"],
        )

        # Simulation Logic
        n_stores = 100
        time_steps = 50

        # Base signal is same for everyone
        t = np.linspace(0, 10, time_steps)
        signal = np.sin(t) * 20 + 50

        # Noise is independent per store (This is why aggregation works!)
        np.random.seed(101)
        noise_matrix = np.random.normal(0, 15, (n_stores, time_steps))

        # Construct the dataset
        store_data = np.zeros((n_stores, time_steps))
        for i in range(n_stores):
            store_data[i, :] = signal + noise_matrix[i, :]

    with col_morph:
        # Calculate the morph based on selection
        if agg_level == "Store Level (100)":
            viz_data = store_data
            n_rows = 100
            scale_factor = 1
            title = "100 Stores: Pure Chaos"

        elif agg_level == "District (20)":
            # Group every 5 stores
            viz_data = store_data.reshape(20, 5, time_steps).mean(axis=1)
            n_rows = 20
            scale_factor = (
                1  # Keep Z scale roughly same for comparison (means remain similar)
            )
            title = "20 Districts: Emerging Patterns"

        elif agg_level == "Region (5)":
            # Group every 20 stores
            viz_data = store_data.reshape(5, 20, time_steps).mean(axis=1)
            n_rows = 5
            scale_factor = 1
            title = "5 Regions: Smooth Waves"

        else:  # HQ
            # Average everything
            viz_data = store_data.mean(axis=0).reshape(1, time_steps)
            # Replicate row to make it a visible surface strip
            viz_data = np.tile(viz_data, (10, 1))
            n_rows = 10
            scale_factor = 1
            title = "Headquarters: The Signal Revealed"

        # Create 3D Surface
        # X = Time, Y = Entities, Z = Demand
        x_morph = np.arange(time_steps)
        y_morph = np.arange(n_rows)

        fig_morph = go.Figure(
            data=[
                go.Surface(
                    z=viz_data,
                    x=x_morph,
                    y=y_morph,
                    colorscale="Turbo",
                    cmin=20,
                    cmax=80,
                )
            ]
        )

        fig_morph.update_layout(
            title=title,
            scene=dict(
                xaxis_title="Time",
                yaxis_title="Entity Count",
                zaxis_title="Sales Vol (Mean)",
                zaxis=dict(range=[0, 100]),  # Fixed range to show stability
                camera=dict(eye=dict(x=1.8, y=0.5, z=0.5)),  # Side view is dramatic
            ),
            height=600,
            margin=dict(l=0, r=0, b=0, t=40),
        )
        st.plotly_chart(fig_morph, use_container_width=True)

        if agg_level == "HQ (1)":
            st.info(
                "💡 Notice how the waves are perfect? The random noise from 100 stores canceled each other out. This is why HQ models look great but fail when pushed down to stores."
            )
