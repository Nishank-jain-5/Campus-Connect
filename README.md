# 🎓 Campus Connect — AI College Research Agent

> An AI-powered college research agent that deep crawls
> official college websites and answers your questions
> in real-time — in your own language, in your own tone.

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![HTML](https://img.shields.io/badge/HTML-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?style=flat&logo=css3&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat&logo=google&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat&logo=chartdotjs&logoColor=white)
![Netlify](https://img.shields.io/badge/Deployed_on-Netlify-00C7B7?style=flat&logo=netlify&logoColor=white)

---

## 💡 Why I Built This

As a student from a tier-2 city, finding accurate college info was always painful. Official websites are scattered, outdated, and confusing. I had to open 10+ tabs just to compare 2 colleges.

I thought — why can't there be one place where you just ask and get everything instantly?

So I built Campus Connect. 🛠️

---

## ⚙️ How It Works

```
You type a college name
        ↓
AI searches and identifies the college
        ↓
3-layer engine deep crawls official website
        ↓
Gemini 2.5 Flash synthesizes the data
        ↓
You get accurate, real answers — instantly
```

---

## 🧠 The 3-Layer Data Engine

This is the core of Campus Connect — a fallback system that ensures you always get real data:

| Layer | Tool | Role |
|---|---|---|
| **Layer 1** | Jina AI | Primary deep web crawler — reads official college pages |
| **Layer 2** | Browse AI | Fallback scraper — kicks in when Jina returns sparse data |
| **Layer 3** | Gemini + Google Search Grounding | AI synthesis — always ON for verified answers |

> If Layer 1 fails → Layer 2 picks up automatically.
> No dead ends. No "data not found." Always an answer.

---

## 🛠️ Features

### 🔍 College Mode — Deep Research
- Search any college worldwide — IITs, NITs, private
  colleges, international universities
- AI crawls these pages from official website:
  - Homepage · Admissions · Courses · Placements
  - Fees · Facilities · Research · About
- 4-step guided flow: Search → Select → Analyze → Chat
- Quick search sidebar with popular colleges
- Auto-detects new college search mid-conversation

### 📊 Auto-Generated Fee Charts
- Bar chart auto-renders for UG / PG / PhD / Hostel fees
- Built with Chart.js — no manual input needed
- Only renders when actual fee data is found

### 🎙️ Voice Mode
- Full voice interface — speak your query, hear AI reply
- Speech-to-Text (STT) input in your chosen language
- Text-to-Speech (TTS) output — AI speaks answers back

**Supported voice languages:**
```
🇮🇳 Hindi · Tamil · Telugu · Bengali · Malayalam
   Marathi · Kannada · Gujarati
🌍 English · Spanish · French · German · Chinese
   Japanese · Arabic · Portuguese · Korean · Russian · Italian
```

### 🌐 Auto Language & Tone Detection
- Detects your language from script (Hindi, Tamil, Bengali etc.)
- Detects Hinglish automatically from keywords
- Adapts tone based on how you type:
  - Casual (bhai, yaar, dude) → friendly conversational reply
  - Technical (NAAC, NIRF, accreditation) → detailed formal reply
  - Confused (help me, suggest, which one) → guidance mode

### 📎 File Upload & AI Analysis
- Upload any file — AI reads and answers from it instantly
- Supported formats: JPG · PNG · GIF · WEBP · PDF · TXT · DOCX
- Max file size: 20 MB
- Uses Gemini Vision API for images
- Works in College Mode, Global Mode, and all phases

### 💾 PDF Export
- Export your full chat as a formatted PDF
- Includes cover page with college name and session details
- Full conversation log with timestamps
- Clean A4 layout — ready to save or share

### 🌍 Global AI Mode
- Switch from college research to general AI assistant
- Ask anything — science, coding, math, history, general knowledge
- Upload files for analysis in Global Mode too
- Clean session switch — no context mixing

### ⚡ Smart Request System
- Request queue — prevents API rate limit errors
- Auto retry with exponential backoff
- Off-topic question filtering via LLM intent classifier
- Zero-neglect policy — never redirects you to "visit the website"

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| HTML · CSS · JavaScript | Core frontend — no frameworks |
| Gemini 2.5 Flash | AI reasoning, answer synthesis, intent classification |
| Gemini 2.5 Flash Lite | Lightweight tasks and quick queries |
| Google Search Grounding | Always-fresh verified answers |
| Jina AI | Primary deep web crawler |
| Browse AI | Fallback scraper for hard-to-reach pages |
| Chart.js | Fee breakdown bar charts |
| Web Speech API | Voice input (STT) + voice output (TTS) |
| jsPDF | Client-side PDF generation and export |
| Canvas API | Animated particle background |

---

## 📁 Project Structure

```
campus-connect/
│
├── index.html                      # Main entry point
├── config.js                       # API key configuration
├── netlify.toml                    # Netlify deployment config
│
└── src/
    ├── components/
    │   ├── agent.js                # Core AI agent — 3-layer engine
    │   ├── charts.js               # Chart.js fee visualizations
    │   ├── main.js                 # Phase orchestration & UI logic
    │   ├── ui.js                   # UI rendering & components
    │   └── canvas-bg.js            # Animated particle background
    │
    ├── styles/
    │   └── main.css                # Complete styling
    │
    └── utils/
        ├── speech.js               # STT + TTS voice system
        ├── image-upload.js         # File upload & Gemini Vision
        ├── pdf-export.js           # PDF generation & export
        └── helpers.js              # Shared utility functions
```

---

## ⚙️ Setup & Installation

### Step 1 — Clone the repo
```bash
git clone https://github.com/yourusername/campus-connect.git
cd campus-connect
```

### Step 2 — Add your API Keys
Edit `config.js`:
```javascript
window.CC_CONFIG = {
    GEMINI_KEY: "YOUR_GEMINI_API_KEY_HERE",
    BROWSE_AI_KEY: "YOUR_BROWSE_AI_KEY_HERE"  // optional
};
```

> 🔑 Get free Gemini API key:
> https://aistudio.google.com/app/apikey
>
> 🔑 Get Browse AI key (optional — for enhanced scraping):
> https://www.browse.ai

### Step 3 — Run locally
No build tools needed — just open `index.html` in browser!

```bash
# Or use VS Code Live Server extension for best experience
```

### Step 4 — Deploy on Netlify (Free)
```bash
# Just drag and drop your project folder on
# https://netlify.com — done in 2 minutes!
```

---

## 🔐 API Key Security

- Keys stored in `config.js` — listed in `.gitignore`
- Keys also storable in `localStorage` — never hardcoded
- Never push your actual keys to GitHub
- Restrict your Gemini key to your Netlify domain
  in Google Cloud Console → Credentials
---

## 🤝 Contributing

This is my personal minor project but contributions are always welcome!

1. Fork the repo
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'Add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 👤 Author

**Nishank Jain**
- 🔗 LinkedIn: https://linkedin.com/in/nishankjain594
- 💻 GitHub: https://github.com/Nishank-jain-5
- 📧 Email: nishankjain594@gmail.com

---

## ⭐ Support

If this project helped you or you found it interesting — drop a ⭐ on the repo. It genuinely means a lot to a student builder! 🙏

---

*Built with curiosity, a lot of API debugging, and the belief that every student deserves easy access to the right college information 😄*
