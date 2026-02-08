# Campus Connect

AI-powered college & school assistant that works for **any** institution worldwide. Enter the official website URL, choose a language, and get answers based only on that site's scraped content.

## Features

- **Generic**: Works with any college or school website
- **🧠 Advanced AI Intelligence**: Thinks deeply like ChatGPT and Perplexity
  - **Contextual understanding** with conversation memory (remembers last 8 messages)
  - **Intelligent keyword extraction** and synonym matching
  - **Smart inference** when exact information isn't available
  - **Progressive disclosure** - builds upon previous answers
  - **Deep analysis** - understands implicit needs in questions
  - **Smart fallback** - provides related info when specific details missing
- **🎯 Accurate Institution Detection**: Enhanced name extraction algorithm
  - Searches meta tags, headers, and page content
  - Correctly identifies college/university names
  - Handles various website structures
- **Domain locking**: Answers only academic/institutional questions; redirects off-topic queries
- **Anti-deflection**: No "check the website" — always provides helpful answers from scraped data
- **Language**: UI language selector (29+ languages); AI understands and responds in selected language
- **Structured answers**: Bullet points, HTML tables, official links when relevant
- **Follow-up suggestions**: Every response ends with contextual suggestions
- **PDF export**: Download full conversation via Print → Save as PDF

## How to run locally

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd campus-connect
   ```

2. **Set up your API key**:
   - Copy `config.example.js` to `config.js`:
     ```bash
     cp config.example.js config.js
     ```
   - Open `config.js` and replace `YOUR_GROQ_API_KEY_HERE` with your actual Groq API key
   - Get a free key at [console.groq.com](https://console.groq.com)
   - **Important**: `config.js` is in `.gitignore` and won't be committed to GitHub

3. **No build step** — plain HTML, CSS, and JavaScript.

4. **Open with a local server** (recommended, to avoid CORS issues):
   - **Node**: `npx serve .` or `npx http-server -p 8080`
   - **Python 3**: `python -m http.server 8080`
   - Then open `http://localhost:8080`

5. **Or open the file**: Double-click `index.html`. Some features may be limited by browser security.

6. **Usage**:
   - Enter the institution's official website URL (e.g. `https://www.example.edu`)
   - Select the response language
   - Click **Connect & load institution**
   - Ask questions about admissions, courses, faculty, exams, placements, etc.
   - Get intelligent, contextual answers!

## Files

- `index.html` — Structure, sidebar (URL, language), chat area, form
- `styles.css` — Layout (Grid/Flexbox), chat bubbles, typing indicator, responsive design
- `app.js` — Enhanced AI logic with advanced reasoning, web scraping, Groq API integration
- `config.js` — Your API key (git-ignored, created from `config.example.js`)
- `config.example.js` — Template for API configuration

## AI Intelligence Enhancements

The assistant now thinks like ChatGPT and Perplexity:

1. **Deep Analysis**: Understands what users are really asking
2. **Contextual Memory**: Remembers and builds upon conversation history
3. **Keyword Intelligence**: Extracts key terms and searches comprehensively
4. **Smart Inference**: Combines multiple pieces of information
5. **Helpful Fallbacks**: Provides related info when exact details unavailable

## CORS and Production

The app uses a public CORS proxy (`api.allorigins.win`) to fetch institution websites from the browser. For production, run your own proxy or backend.

## Security Note

Never commit your `config.js` file with your actual API key to GitHub. The `.gitignore` file prevents this.

## License

Use and modify as needed for your project.
