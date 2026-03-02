# From Forecasts to Decisions
### A Practical Guide to Demand Forecasting for Early-Career Analysts

[![Live Guide](https://img.shields.io/badge/Live%20Guide-Visit%20Site-2563EB?style=flat-square)]([https://subtaka0613.github.io/Capstone](https://capstone-silk-sigma.vercel.app/)
[![Built with React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Built with Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)

---

Most resources on demand forecasting teach analysts to minimize error metrics. This guide takes a different starting point: **a forecast only has value if it changes a decision for the better.**

Built as a Minerva University senior capstone project, this interactive web textbook bridges the gap between fitting a forecasting model and actually using one — examining three approaches (statistical baseline, machine learning, and a hybrid of the two), when each works, when each fails, and how to translate model output into concrete decisions.

---

## Table of Contents

- [Live Demo](#live-demo)
- [What's Inside](#whats-inside)
- [Interactive Features](#interactive-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [AI Chatbot Setup](#ai-chatbot-setup)
- [Deployment](#deployment)
- [Background](#background)
- [License](#license)

---

## Live Demo

**[subtaka0613.github.io/Capstone](https://subtaka0613.github.io/Capstone)**

No installation required — runs entirely in the browser. The embedded AI assistant requires an internet connection; all interactive simulations work offline once the page has loaded.

---

## What's Inside

The guide is organized as eight chapters that build on each other, from framing the problem correctly through to communicating results and supporting decisions.

| Chapter | Title | Core Question |
|---------|-------|---------------|
| 1 | Why Forecast Accuracy Is Not the Goal | What should I actually be optimizing for, and why does RMSE alone mislead? |
| 2 | The Hidden Question Behind Every Forecast | What organizational context shapes which forecasting questions get asked — and ignored? |
| 3 | Reading the Data | What patterns are present in the demand signal before fitting any model? |
| 4 | Baseline Models | When does a naïve seasonal model outperform something more sophisticated? |
| 5 | Machine Learning for Demand Forecasting | How does gradient boosting actually work, and when does it help? |
| 6 | Evaluating Forecasts Like a Practitioner | Beyond RMSE: what does a well-calibrated, decision-relevant evaluation look like? |
| 7 | The Hybrid Framework | How can ETS and XGBoost be combined so each does what it does best? |
| 8 | Communicating Forecasts and Supporting Decisions | How do I present a forecast to a non-technical stakeholder in a way that leads to better decisions? |

In addition to the main chapters, the guide includes:
- A **Glossary** of key forecasting terms
- **Practice Problems** with worked solutions
- **Appendices** on data preprocessing and evaluation methodology
- An embedded **AI Assistant** (see below)

---

## Interactive Features

The guide is built as a web application rather than a PDF because the core subject matter — how model outputs change as parameters, data, or context change — cannot be adequately conveyed by description alone.

### 1. Residual Evidence Board *(Chapter 3)*
An interactive heatmap that displays forecast residuals across weeks and years using a diverging color scale. Blue cells = model over-predicted; red cells = under-predicted. Click any cell to see the actual value, the forecast, and the residual for that specific week. Makes temporal patterns in forecast error immediately visible.

### 2. ETS Parameter Explorer *(Chapter 4)*
Three sliders control the smoothing parameters of the Exponential Smoothing model: α (level), β (trend), and γ (seasonality). As each slider moves, the forecast line and RMSE score update in real time — letting readers directly observe how each parameter shapes model behavior on real data.

### 3. XGBoost Tree Split Explorer *(Chapter 5)*
A scatter plot of demand data with a **draggable vertical threshold line**. Moving the threshold dynamically recalculates leaf means on each side of the split and updates the RMSE display. Makes the mechanics of gradient boosting concrete: readers see what a single tree is actually doing to the data rather than treating the algorithm as a black box.

### 4. Hybrid Framework Walkthrough *(Chapter 7)*
A step-by-step animated walkthrough of how the ETS + XGBoost hybrid model is constructed. Users advance through four stages: ETS captures trend/seasonality → residuals are computed → XGBoost is fitted to residuals → components combine into the final forecast. Each stage updates the chart to show exactly what has been added.

### 5. Embedded AI Assistant *(throughout)*
A retrieval-augmented AI assistant powered by the Anthropic API. When a user asks a question, the system searches the guide's own content (chapter summaries, glossary definitions, and practice problems) for relevant passages and grounds the response in them — so answers are specific to the guide's approach and terminology. Also supports meta-questions like "which chapter covers prediction intervals?" with direct navigation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [React 18](https://react.dev) + [Vite](https://vitejs.dev) |
| Charts | [Recharts](https://recharts.org) |
| Custom visualizations | [D3.js](https://d3js.org) (residual heatmap, SVG interactions) |
| Utilities | [Lodash](https://lodash.com) |
| AI assistant | [Anthropic Claude API](https://docs.anthropic.com) via Vercel serverless function |
| Deployment | [Vercel](https://vercel.com) (automatic deploys from `main`) |
| Styling | Inline styles + CSS-in-JS (no external CSS framework) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Install and run locally

```bash
# Clone the repo
git clone https://github.com/SubTaka0613/Capstone.git
cd Capstone

# Install dependencies
npm install

# Start development server
npm run dev
```

The guide will be available at `http://localhost:5173`.

> **Note:** The AI assistant makes calls to `/api/chat`, which is a Vercel serverless function. This route does not work in local Vite dev mode. See [AI Chatbot Setup](#ai-chatbot-setup) below for options.

### Build for production

```bash
npm run build
npm run preview   # preview the production build locally
```

---

## Project Structure

```
Capstone/
├── src/
│   └── capstone_textbook_v8.jsx   # Main application (single-file React app)
├── api/
│   └── chat.js                    # Vercel serverless function — Anthropic API proxy
├── public/
├── index.html
├── vite.config.js
├── vercel.json                    # Vercel routing config
└── package.json
```

The guide is intentionally structured as a **single-file React application** (`capstone_textbook_v8.jsx`). This makes it straightforward to read, fork, and adapt without navigating a complex component hierarchy.

---

## AI Chatbot Setup

The embedded AI assistant proxies requests to Anthropic's API through a Vercel serverless function at `/api/chat`. To enable it:

### On Vercel (recommended)
1. Go to your project settings → **Environment Variables**
2. Add `ANTHROPIC_API_KEY` with your key from [console.anthropic.com](https://console.anthropic.com)
3. Redeploy — the chatbot will be live automatically

### Local development
The `/api/chat` route is not served by Vite's dev server. Two options:

**Option A — Use the Vercel CLI:**
```bash
npm install -g vercel
vercel dev   # serves both Vite and the API routes
```

**Option B — Direct browser call (dev only):**
In `src/capstone_textbook_v8.jsx`, locate the `askAI` function and switch the fetch target to call the Anthropic API directly with the `anthropic-dangerous-direct-browser-access: true` header. Do **not** ship this to production (it exposes your API key).

---

## Deployment

The project is configured for zero-config deployment to Vercel:

1. Fork or clone this repo
2. Connect the repo to a new Vercel project
3. Add the `ANTHROPIC_API_KEY` environment variable (see above)
4. Push to `main` — Vercel builds and deploys automatically

The `vercel.json` file handles routing so that `/api/*` requests are served by the serverless function and everything else is handled by the Vite build.

---

## Background

This guide grew out of a demand forecasting internship at a consumer goods startup in Japan, where I found that the gap between producing an accurate forecast and actually improving decisions was larger than any textbook had prepared me for. Stakeholders rarely asked about RMSE. They asked: *How uncertain is this? When should we trust it? What should we order?*

The guide is an attempt to answer those questions in a form that a junior analyst — the version of me that existed at the start of that internship — can actually use.

It was developed as a senior capstone project at Minerva University (2025–2026) and went through three major versions driven by user testing and advisor feedback before reaching this form.

---

## License

This project is open source. You are welcome to fork the repository, adapt the content, or use the interactive simulation components in your own work. If you build on this, a link back to this repo is appreciated but not required.

---

*Built by [Takaya Maekawa](https://github.com/SubTaka0613) · Minerva University · Class of 2026*
