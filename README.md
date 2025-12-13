# Demand Forecasting: A Decision-Support Framework

A comprehensive guide and interactive toolkit for demand forecasting, designed to bridge the gap between statistical modeling and business decision-making.

## Overview

This repository accompanies the Capstone project on demand forecasting. It provides:

- **Theoretical Framework**: A three-layer approach (Intuition → Models → Action)
- **Practical Implementation**: Jupyter notebooks with baseline and advanced models
- **Interactive Learning Tools**: Streamlit applications for hands-on experimentation

## Repository Structure

```
Capstone/
├── README.md                     # This file
├── Sample_data_cleaned.xlsx      # Anonymized weekly sales data
├── Section3.ipynb                # Exploratory Data Analysis
├── Section4.ipynb                # Baseline Models (Seasonal Naive, ETS, XGBoost)
├── Section7.ipynb                # Advanced Modeling Techniques
├── Visualization.ipynb           # Figure generation for documentation
└── streamlit/                    # Interactive Learning Applications
    ├── requirements.txt          # Python dependencies
    ├── evaluation_lab.py         # Model Evaluation Lab
    ├── action_lab.py             # Decision Support Lab
    ├── xgboost_tutorial.py       # XGBoost Interactive Tutorial
    └── experiment.py             # 3D Demand Landscape Visualization
```

## Quick Start

### Prerequisites

- Python 3.8+
- pip package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/SubTaka0613/Capstone.git
cd Capstone

# Install dependencies for interactive apps
cd streamlit
pip install -r requirements.txt
```

### Running the Notebooks

Open any notebook with Jupyter:

```bash
jupyter notebook Section3.ipynb
```

### Running Interactive Applications

```bash
cd streamlit

# Evaluation Lab - Learn about metrics and model evaluation
streamlit run evaluation_lab.py

# Action Lab - Translate forecasts into business decisions
streamlit run action_lab.py

# XGBoost Tutorial - Interactive gradient boosting education
streamlit run xgboost_tutorial.py

# Experiment - 3D demand landscape visualization
streamlit run experiment.py
```

## Notebook Descriptions

| Notebook              | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| `Section3.ipynb`      | Exploratory data analysis: time series plots, distributions, seasonal patterns |
| `Section4.ipynb`      | Baseline models: Seasonal Naive, ETS, XGBoost with time features               |
| `Section7.ipynb`      | Advanced techniques and model evaluation                                       |
| `Visualization.ipynb` | Generates conceptual figures for the documentation                             |

## Interactive Applications

### 1. Evaluation Lab (`evaluation_lab.py`)

**Purpose:** Demonstrates why error metrics alone are insufficient

| Tab                   | Concept                                                |
| --------------------- | ------------------------------------------------------ |
| 🕰️ Time Machine       | Data leakage detection (random vs. time-series splits) |
| 📏 Metric Sandbox     | MAE vs RMSE sensitivity to outliers                    |
| 💰 Business Simulator | The "Profit Paradox" - same RMSE, different profits    |

### 2. Action Lab (`action_lab.py`)

**Purpose:** "The Planner's Cockpit" - translating forecasts into decisions

| Tab                     | Concept                                               |
| ----------------------- | ----------------------------------------------------- |
| ⚖️ Risk & Capital       | Hockey Stick curve (service level vs. inventory cost) |
| 🔍 Driver Decomposition | Waterfall charts with automated NLG summaries         |
| 🎯 FVA Game             | Pattern detection game for forecast bias              |

### 3. XGBoost Tutorial (`xgboost_tutorial.py`)

**Purpose:** Interactive XGBoost education from basics to advanced

| Tab               | Concept                                              |
| ----------------- | ---------------------------------------------------- |
| 🌳 Tree Logic     | Manual split finder (MSE minimization)               |
| ⛳ Golf Animation | Learning rate impact visualization                   |
| 🧠 Engine Room    | Bias-variance trade-off explorer                     |
| ⚠️ Limitation Lab | Extrapolation failure and hybrid detrending solution |

### 4. Experiment (`experiment.py`)

**Purpose:** 3D visualization of forecasting concepts

| Tab                  | Concept                                              |
| -------------------- | ---------------------------------------------------- |
| ⛰️ The Landscape     | Bias/variance as terrain (underfit/good fit/overfit) |
| 🗺️ Aggregation Morph | How aggregation reduces noise (stores → HQ)          |

## Key Concepts Covered

1. **Problem Framing**: Defining what "demand" means and who the forecast serves
2. **Data Understanding**: EDA, seasonality, trend, and noise decomposition
3. **Baseline Models**: Seasonal Naive, Exponential Smoothing, Tree-based methods
4. **Evaluation Beyond Metrics**: Business impact, cost asymmetry, profit optimization
5. **Actionable Insights**: Risk quantification, driver attribution, bias detection
6. **Model Limitations**: Extrapolation issues and hybrid solutions

## Dependencies

```
streamlit
pandas
numpy
plotly
scikit-learn
xgboost
scipy
statsmodels
matplotlib
```

## Documentation

Full documentation is available in `streamlit/documentation/Full Draft.md`, covering:

- Section 1: Introduction and Framework
- Section 2: Problem Framing
- Section 3: Exploratory Data Analysis
- Section 4: Baseline Models
- Section 5: Model Evaluation
- Section 6: From Forecast to Action
- Section 7: Lessons Learned
- Section 8: Interactive Learning Applications

## License

This repository is provided for educational purposes as part of a Capstone project.

## Author

**Takaya Maekawa**
