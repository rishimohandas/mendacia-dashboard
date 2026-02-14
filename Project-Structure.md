# Project Structure

## Root Directory
backend/ → API server and AI processing pipeline
frontend/ → React dashboard UI
.env → Environment variables (API keys, config)
README.md → Project documentation

---

## 🔧 Backend (`/backend`)

The backend handles video processing, AI analysis, and report generation.
backend/
│
├── main.py → FastAPI entry point
├── requirements.txt → Python dependencies
│
├── app/
│ ├── engine/
│ │ └── consistency.py → Cross-modal consistency rules
│ │
│ ├── models/
│ │ └── schemas.py → Structured JSON schema definitions
│ │
│ └── services/
│ └── twelvelabs_client.py → TwelveLabs API integration

### Backend Responsibilities

- Accept video uploads  
- Call TwelveLabs for scene and transcript extraction  
- Run LLM-based narrative analysis  
- Perform cross-modal consistency checks  
- Generate structured forensic report JSON  

---

## 🎨 Frontend (`/frontend`)

The frontend is a React-based dashboard for displaying forensic analysis results.
frontend/
│
├── src/ → React components and UI logic
└── package.json → Frontend dependencies

### Frontend Responsibilities

- Handle file uploads  
- Call backend `/analyze` endpoint  
- Render:
  - Manipulation breakdown  
  - Cross-modal inconsistencies  
  - Confidence score  
  - Classification explanation  

---

## 🔐 Environment Variables

The `.env` file should include:
TWELVELABS_API_KEY=
LLM_API_KEY=

⚠ Never commit real API keys.