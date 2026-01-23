# Tides 🌊
> Design as if your users were beside you.

<img width="7684" height="4322" alt="localhost_5173_(High Res)" src="https://github.com/user-attachments/assets/0fb13898-5a3b-4951-84b6-35c56531a58d" />
<img width="7684" height="4322" alt="localhost_5173_(High Res) (1)" src="https://github.com/user-attachments/assets/25bdf4b0-dbab-4037-a6e0-6cdd91187855" />


## The Problem

Non-technical business owners struggle to improve their digital platforms when metrics decline. Small UX issues can have outsized impact, but they're difficult to spot and costly to test. Traditional solutions force businesses to either live with declining metrics or invest in expensive full redesigns.

**Example:** A small clothing brand owner noticed high traffic but low purchase completions after an influencer campaign. Unable to identify specific issues or test small changes cost-effectively, she was forced to rebuild her entire website—when the real problem might have been a few fixable micro-interactions.

## What Tides Does

Tides combines **behavioral analytics + context-aware AI** to make product design feel as if your users are beside you, telling you exactly what to change.

- **Issue Detection**: Automatically identifies UX issues and opportunities from your Amplitude event data using AI agents and deterministic statistics
- **Evidence-Based Design**: Visualize and build solutions without losing analytics context while switching between dashboards
- **Iterative Experimentation**: Generate and test targeted UI micro-changes validated against real user behavior
- **Persona Simulation**: Test changes with synthetic personas (e.g., "Explorers," "Low Activity Engagers") before deploying to real users

Upload your website, connect to Amplitude, and start building a self-improving digital platform.

## How It Works

### 1. Behavioral Data Processing
- Ingests raw events from Amplitude's Export API (every event, property, and user path)
- Models data as **Sequential Behavioral**: analyzes event sequences, user paths, and the "Happy Path" leading to success events
- Uses rolling time windows and weighted sequences to detect when user behavior is mathematically diverging from optimal patterns

### 2. AI-Powered Issue Detection
Unlike basic rules engines that wait for 20% drops, Tides detects:
- Behavioral divergence from the "Happy Path"
- Funnel friction points across user segments
- Micro-interaction patterns that correlate with purchase behavior

The multi-step processing pipeline combines AI agents with deterministic statistics to transform unstructured data into actionable issues that traditional analytics miss.

### 3. Design Agent Execution
When an issue is detected, our **Design Agent** (powered by Gemini 3.0 Flash):
- Analyzes the issue with behavioral evidence from Amplitude
- Reviews relevant code and screenshots
- Generates non-aggressive UI changes that small businesses can actually implement
- Provides reasoning backed by event data

### 4. Synthetic Persona Simulation
Before deploying to real users, changes are tested in a sandbox:
- Personas generated from Amplitude's behavioral data (e.g., "Explorers," "Low Activity Engagers")
- AI simulates persona reactions to new UI
- Flags if changes are too aggressive or successfully meet segment needs

## Tech Stack

**Frontend:** React, TailwindCSS, tldraw  
**Backend:** ExpressJS, Bun, PostgreSQL  
**AI/Analytics:** Amplitude API, Gemini 3.0 Flash

## Setup & Installation

### Prerequisites
- Node.js 18+
- Bun 1.3.6+
- PostgreSQL database
- Amplitude project with Export API access
- Gemini API key

### Environment Variables

Create a `.env` file in the project root:

```bash
AMPLITUDE_API_KEY=your_amplitude_api_key
AMPLITUDE_SECRET_KEY=your_amplitude_secret_key
AMPLITUDE_PROJECT_ID=your_project_id

GEMINI_API_KEY=your_gemini_api_key

DATABASE_URL=postgresql://user:password@localhost:5432/tides

PORT=3000
NODE_ENV=development
```

### Installation

1. **Install dependencies:**
```bash
bun install
cd client && npm install
```

2. **Set up the database:**
```bash
# Initialize PostgreSQL database
# Run migrations
```

3. **Start the backend server:**
```bash
bun run server.ts
```

4. **Start the frontend development server:**
```bash
cd client
npm run dev
```

5. **Access the application:**
```
Frontend: http://localhost:5173
Backend API: http://localhost:3000
```

## Usage

### 1. Connect Your Amplitude Project
- Navigate to settings and enter your Amplitude project credentials
- Tides will begin ingesting event data

### 2. Fetch Event Data
```bash
./scripts/fetch_events.sh
```

### 3. Review Detected Issues
- Issues appear automatically as the processing pipeline analyzes your event data
- Each issue includes behavioral evidence and affected user segments

### 4. Design Solutions
- Click on an issue to open the design platform
- Use the AI copilot to generate UI changes
- Iterate on designs with context from Amplitude data

### 5. Test with Personas
```bash
# Run persona synthesis
./scripts/persona_test.sh

# Run synthetic persona impact tests
./scripts/synthetic_test.sh
```

### 6. Deploy Changes
- Export code from the design platform
- Integrate changes into your production site
- Monitor impact through Amplitude

## Scripts

- `fetch_events.sh` - Fetch latest Amplitude events
- `persona_test.sh` - Test persona generation
- `synthetic_test.sh` - Run synthetic persona simulations
- `suggest_ui_test.sh` - Test UI suggestion generation
- `real_test.sh` - End-to-end testing with real data

## Key Features

### Sequential Behavioral Modeling
Unlike traditional analytics that only track page views, Tides models user journeys as conversational funnels, capturing:
- Discovery → Intent → Commitment sequences
- Micro-interactions that predict conversion
- Behavioral divergence from "Happy Paths"

### Context-Aware Design Platform
- Built around solving specific issues, not generic design
- Automatically surfaces relevant pages and funnels for each issue
- Maintains analytics context while designing solutions

### Evidence-Based AI
- Every suggestion is grounded in Amplitude data
- AI explains its reasoning with behavioral evidence
- No speculative changes—only insights backed by user behavior
