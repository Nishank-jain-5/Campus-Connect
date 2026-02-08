/**
 * Campus Connect – Production application logic
 * Handles: URL submission, scraping, session KB, LLM calls, domain lock, PDF export
 */

(function () {
  'use strict';

  // ----- Groq API key (embedded): replace with your key from https://console.groq.com
  const GROQ_API_KEY = CONFIG.GROQ_API_KEY;

  // ----- Token budget: Groq free tier limits request size (~6000 TPM). We cap context to stay under.
  const MAX_KB_CHARS_FOR_API = 7500;   // ~1900 tokens for context
  const MAX_CONVERSATION_TURNS = 8;    // last 8 messages (4 user + 4 assistant) for better memory

  // ----- CORS proxy (fetch arbitrary URLs from browser)
  const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

  // ----- DOM refs
  const institutionUrlInput = document.getElementById('institutionUrl');
  const languageSelect = document.getElementById('languageSelect');
  const connectBtn = document.getElementById('connectBtn');
  const agentIdentity = document.getElementById('agentIdentity');
  const institutionNameEl = document.getElementById('institutionName');
  const headerStatus = document.getElementById('headerStatus');
  const chatMessages = document.getElementById('chatMessages');
  const typingIndicator = document.getElementById('typingIndicator');
  const chatForm = document.getElementById('chatForm');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const voiceInputBtn = document.getElementById('voiceInputBtn');
  const speakResponsesCheckbox = document.getElementById('speakResponses');
  const languageDropdown = document.getElementById('languageDropdown');
  const languageTrigger = document.getElementById('languageTrigger');
  const languagePanel = document.getElementById('languagePanel');
  const languageTriggerText = document.getElementById('languageTriggerText');
  const newChatBtn = document.getElementById('newChatBtn');
  const refreshKbBtn = document.getElementById('refreshKbBtn');
  const sessionFooter = document.getElementById('sessionFooter');
  const suggestedQuestionsEl = document.getElementById('suggestedQuestions');

  // ----- App state
  const state = {
    institutionUrl: null,
    institutionName: null,
    baseHost: null,
    language: 'en',
    knowledgeBase: '',
    conversation: [],
    locked: false,
    loading: false,
    kbLoadedAt: null,
    scrapedUrls: [],
    feedback: {}
  };

  const STORAGE_KEY = 'campus_connect_session';
  const MAX_PERSISTED_MESSAGES = 50;
  const SUGGESTED_QUESTIONS = [
    'What are the admission eligibility criteria?',
    'What is the fee structure and payment process?',
    'List the departments and programs offered.',
    'How can I contact the institution?',
    'What are the placement and internship opportunities?',
    'When are the exams and what is the syllabus?'
  ];

  // ----- Language display names for PDF (Global + Indian)
  const languageNames = {
    en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', zh: '中文 (Chinese)',
    ar: 'العربية (Arabic)', pt: 'Português', ru: 'Русский', ja: '日本語', ko: '한국어',
    it: 'Italiano', nl: 'Nederlands', tr: 'Türkçe', vi: 'Tiếng Việt', th: 'ไทย',
    id: 'Bahasa Indonesia', ms: 'Bahasa Melayu',
    hi: 'हिंदी (Hindi)', bn: 'বাংলা (Bengali)', ta: 'தமிழ் (Tamil)', te: 'తెలుగు (Telugu)',
    mr: 'मराठी (Marathi)', gu: 'ગુજરાતી (Gujarati)', kn: 'ಕನ್ನಡ (Kannada)',
    ml: 'മലയാളം (Malayalam)', pa: 'ਪੰਜਾਬੀ (Punjabi)', ur: 'اردو (Urdu)',
    or: 'ଓଡ଼ିଆ (Odia)', as: 'অসমীয়া (Assamese)'
  };

  const OFF_TOPIC_REPLY = "🙂 I appreciate your question, but I'm specifically designed to help with academic and institutional information about **{INSTITUTION_NAME}**.\n\n**I can help you with:**\n• 🎓 Admissions & eligibility criteria\n• 📚 Courses, programs & curriculum\n• 👨‍🏫 Faculty & departments\n• 📝 Exams, results & timetables\n• 💼 Placements & career opportunities\n• 🏛️ Campus facilities & infrastructure\n• 📞 Contact information\n• 📅 Important dates & events\n\n**Please ask me something about {INSTITUTION_NAME}**, and I'll be happy to help! 😊";
  const NOT_FOUND_REPLY = "This specific information is not available on the official website sections that were analyzed.";
  const BEST_FIT_INSTRUCTION = `Analyze the user's question and keywords. Search the context for the BEST MATCHING, related, or partial information. Give a helpful, direct answer from the context (related sections, same topic, general policy, contact info, or similar). Only if there is truly ZERO relevant content in the context, respond with exactly: "${NOT_FOUND_REPLY}". Never make excuses; never say "this section is not present" or "not found" unless you have genuinely no related information.`;

  /**
   * Fetch HTML from URL via CORS proxy and return as string
   */
  async function fetchPageHtml(url) {
    const encoded = encodeURIComponent(url);
    const res = await fetch(CORS_PROXY + encoded, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch page');
    return res.text();
  }

  /**
   * Parse HTML string and extract main content, title, meta, tables, links
   * Enhanced to extract more metadata for better institution identification
   */
  function parseHtml(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = new URL(baseUrl);
    const out = { title: '', siteName: '', description: '', text: '', tables: [], links: [] };

    // Extract title
    out.title = (doc.querySelector('title') && doc.querySelector('title').textContent.trim()) || '';
    
    // Extract Open Graph site name
    const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
    if (ogSiteName && ogSiteName.getAttribute('content')) out.siteName = ogSiteName.getAttribute('content').trim();
    
    // Extract meta description for additional context
    const metaDesc = doc.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.getAttribute('content')) out.description = metaDesc.getAttribute('content').trim();
    
    // Look for institution name in common header locations
    if (!out.siteName) {
      const headerSelectors = [
        'header h1', 'header .site-title', 'header .logo', 
        '.header h1', '.site-name', '.institution-name',
        'h1.title', '.page-title h1'
      ];
      for (const selector of headerSelectors) {
        const el = doc.querySelector(selector);
        if (el && el.textContent.trim().length > 3 && el.textContent.trim().length < 100) {
          out.siteName = el.textContent.trim();
          break;
        }
      }
    }

    // Remove script, style, nav (optional: keep nav for menu links)
    const clone = doc.body ? doc.body.cloneNode(true) : doc.documentElement.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
    const main = clone.querySelector('main, [role="main"], #content, .content, .main') || clone;
    out.text = main.textContent.replace(/\s+/g, ' ').trim().slice(0, 120000);

    doc.querySelectorAll('table').forEach((table, i) => {
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(cell => cells.push(cell.textContent.replace(/\s+/g, ' ').trim()));
        if (cells.length) rows.push(cells);
      });
      if (rows.length) out.tables.push({ page: baseUrl, rows });
    });

    doc.querySelectorAll('a[href]').forEach(a => {
      try {
        const href = a.getAttribute('href');
        const absolute = new URL(href, baseUrl).href;
        if (absolute.startsWith(base.origin) && absolute !== baseUrl) {
          const text = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          if (text && !out.links.some(l => l.url === absolute)) out.links.push({ url: absolute, text });
        }
      } catch (_) {}
    });

    return out;
  }

  /**
   * Derive institution name from parsed data and URL - Enhanced Algorithm
   */
  function deriveInstitutionName(parsed, url) {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    
    // Priority 1: Look for institution name in meta tags
    if (parsed.siteName && parsed.siteName.length > 3) return parsed.siteName;
    
    // Priority 2: Extract from title - look for common patterns
    if (parsed.title) {
      const title = parsed.title;
      // Remove common suffixes like "Home", "Official Website", etc.
      const cleaned = title
        .replace(/\s*[-|–]\s*(Home|Official|Website|Portal|Welcome).*$/i, '')
        .replace(/^\s*(Home|Welcome)\s*[-|–]\s*/i, '')
        .trim();
      
      // Look for college/university/institute patterns
      const institutionMatch = cleaned.match(/(.*?(?:College|University|Institute|School|Academy|Polytechnic|Campus))/i);
      if (institutionMatch) return institutionMatch[0].trim();
      
      if (cleaned.length > 3 && cleaned.length < 100) return cleaned;
    }
    
    // Priority 3: Look in the page text for institution name patterns
    if (parsed.text) {
      const textSnippet = parsed.text.slice(0, 1000);
      const nameMatch = textSnippet.match(/(?:Welcome to|About)\s+([A-Z][^.,]{10,80}(?:College|University|Institute|School|Academy))/);
      if (nameMatch) return nameMatch[1].trim();
    }
    
    // Priority 4: Smart hostname parsing
    const hostParts = host.split('.');
    const mainDomain = hostParts[0];
    const formatted = mainDomain
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+(College|University|Institute|School)$/i, ' $1');
    
    return formatted;
  }

  /**
   * Build knowledge base from homepage and optionally a few key paths
   */
  async function buildKnowledgeBase(url) {
    const base = new URL(url);
    const pagesToTry = [
      url,
      base.origin + '/about',
      base.origin + '/admissions',
      base.origin + '/courses',
      base.origin + '/academics',
      base.origin + '/department',
      base.origin + '/faculty',
      base.origin + '/notice',
      base.origin + '/notices',
      base.origin + '/'
    ];
    const seen = new Set();
    const scrapedUrls = [];
    let fullText = '';
    let institutionName = '';

    for (const pageUrl of pagesToTry) {
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);
      try {
        const html = await fetchPageHtml(pageUrl);
        const parsed = parseHtml(html, pageUrl);
        if (!institutionName) institutionName = deriveInstitutionName(parsed, pageUrl);
        scrapedUrls.push(pageUrl);
        fullText += `\n\n--- PAGE: ${pageUrl} ---\n`;
        fullText += parsed.text;
        parsed.tables.forEach(t => {
          fullText += '\n[TABLE]\n';
          t.rows.forEach(r => fullText += r.join(' | ') + '\n');
        });
      } catch (_) {
        // skip failed pages
      }
    }

    return {
      knowledgeBase: fullText.trim().slice(0, 150000),
      institutionName: institutionName || base.hostname,
      scrapedUrls
    };
  }

  /**
   * Connect: validate URL, build KB, set identity, enable chat
   * Enhanced with estimate timer
   */
  async function onConnect() {
    const url = (institutionUrlInput.value || '').trim();
    if (!url) {
      headerStatus.textContent = 'Please enter a valid institution website URL.';
      return;
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (_) {
      headerStatus.textContent = 'Invalid URL. Please enter a full URL (e.g. https://example.edu).';
      return;
    }

    connectBtn.disabled = true;
    agentIdentity.classList.add('hidden');
    
    // Start estimate timer
    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      const mins = Math.floor(elapsedSeconds / 60);
      const secs = elapsedSeconds % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      headerStatus.textContent = `⏱️ Analyzing website... ${timeStr} elapsed`;
    }, 1000);

    try {
      const { knowledgeBase, institutionName, scrapedUrls } = await buildKnowledgeBase(url);
      
      // Stop timer
      clearInterval(timerInterval);
      
      state.institutionUrl = url;
      state.baseHost = parsedUrl.origin;
      state.institutionName = institutionName;
      state.knowledgeBase = knowledgeBase;
      state.kbLoadedAt = Date.now();
      state.scrapedUrls = scrapedUrls || [];
      state.language = languageSelect.value;
      state.locked = true;
      state.conversation = [];
      state.feedback = {};

      institutionNameEl.textContent = institutionName;
      agentIdentity.classList.remove('hidden');
      headerStatus.textContent = `✅ Analysis complete! Loaded in ${elapsedSeconds}s. You can ask questions now.`;
      
      // Reset to normal message after 3 seconds
      setTimeout(() => {
        headerStatus.textContent = 'You can ask academic and institutional questions.';
      }, 3000);
      
      userInput.disabled = false;
      sendBtn.disabled = false;
      exportPdfBtn.disabled = false;
      if (voiceInputBtn) voiceInputBtn.disabled = false;
      if (refreshKbBtn) refreshKbBtn.disabled = false;
      if (newChatBtn) newChatBtn.disabled = false;
      chatMessages.innerHTML = '';

      appendMessage('ai', `I am the **OFFICIAL AI ASSISTANT** of **${institutionName}**. I answer only from this institution's official website. Ask me about admissions, courses, faculty, exams, placements, or campus facilities.`, []);
      renderSuggestedQuestions();
      updateSessionFooter();
      persistSession();
    } catch (e) {
      clearInterval(timerInterval); // Stop timer on error
      headerStatus.textContent = 'Could not load the website. Check the URL or try again later.';
      console.error(e);
    } finally {
      connectBtn.disabled = false;
    }
  }

  /**
   * Check if the user question is academic/institutional (simple heuristic; LLM does final check)
   * Enhanced with more off-topic patterns
   */
  function seemsOffTopic(text) {
    const t = text.toLowerCase();
    
    // Academic/institutional keywords - ON TOPIC
    const academic = /admission|course|syllabus|curriculum|department|faculty|fee|scholarship|exam|result|timetable|placement|internship|research|lab|campus|notice|event|academic|program|degree|college|school|university|institute|eligibility|semester|hostel|library|infrastructure|facilities|contact|phone|email|address|location|timing|holiday|vacation|cut(\s)?off|rank|seat|application|enroll|register|registration/i;
    
    // Common off-topic patterns - OFF TOPIC
    const offTopicPatterns = [
      /what is (photosynthesis|gravity|democracy|capitalism)/i,
      /how to (cook|bake|make|prepare) (food|recipe|dish)/i,
      /who (is|was) (the )?(president|prime minister|ceo)/i,
      /(tell me|what|explain) (about|regarding) (harvard|mit|stanford|oxford|cambridge)/i, // Other universities
      /write (a|me) (code|script|program|function)/i,
      /solve (this )?(math|equation|problem)/i,
      /(what|how|tell).{0,20}(weather|temperature|climate)/i,
      /(recipe|ingredient|cooking|food) (for|of)/i,
      /current (news|event|affair)/i,
      /sport(s)? (news|score|match|game)/i,
      /movie|film|song|music|entertainment/i,
      /health (advice|tip|problem)/i,
      /personal (advice|problem|issue)/i,
    ];
    
    // If it contains academic keywords, it's ON topic
    if (academic.test(t)) return false;
    
    // If it matches off-topic patterns, it's OFF topic
    if (offTopicPatterns.some(pattern => pattern.test(t))) return true;
    
    // If it's short and has no academic keywords, might be off-topic
    return t.length > 20 && !academic.test(t);
  }

  /**
   * Build system prompt for the LLM: domain lock, language, anti-deflection, format
   * Enhanced with advanced reasoning like ChatGPT and Perplexity
   */
  function buildSystemPrompt() {
    const lang = state.language;
    const langName = languageNames[lang] || 'English';
    return `You are an ADVANCED AI ASSISTANT representing "${state.institutionName}". You think deeply, reason intelligently, and provide comprehensive answers like ChatGPT and Perplexity.

INTELLIGENCE & REASONING (Core Capabilities):
1. DEEP ANALYSIS: Read the user's question carefully. Identify what they're really asking for, including implicit needs.
2. CONTEXTUAL THINKING: Consider the conversation history. Build upon previous answers. If the current question relates to earlier topics, acknowledge and connect them.
3. KEYWORD EXTRACTION: Extract key terms from the user's question (e.g., "admission", "B.Tech", "fees", "placement"). Search the context for ALL related information using these keywords and their synonyms.
4. INFERENCE & SYNTHESIS: If exact information isn't available, infer from related content. Combine multiple pieces of information to form a complete answer.
5. SMART FALLBACK: If you truly don't have specific information, provide:
   - Related information from the same category
   - General policies or procedures that might apply
   - Contact information for getting the exact answer
   - Similar examples or cases from the context

CRITICAL - INTELLIGENT ANSWER GENERATION:
${BEST_FIT_INSTRUCTION}

When answering:
- Think step-by-step about what information the user needs
- Search the context for primary information + backup related information
- Connect dots between different pieces of context
- Consider what would be most helpful to the user beyond their literal question
- Never say "I don't have this information" without first:
  * Checking related sections
  * Looking for similar topics
  * Finding general policies that might apply
  * Suggesting related information

CONVERSATION MEMORY & CONTINUITY:
- Remember what you discussed earlier in this conversation
- Build upon previous answers when relevant
- If user asks follow-up questions, understand they relate to the previous context
- Provide progressive disclosure: Start with key info, then details

CORE RULES (non-negotiable):
1. USE ONLY THE PROVIDED CONTEXT. Search thoroughly for related information before concluding it's not available.
2. NEVER deflect with: "please check the website", "refer to the handbook", "visit the office", "I am analyzing", "information may vary"
3. **OFF-TOPIC DETECTION** - STRICTLY enforce this:
   - You ONLY answer questions about ${state.institutionName} and its academic/institutional matters
   - OFF-TOPIC includes: other colleges/universities, general knowledge, recipes, politics, entertainment, sports (unless about ${state.institutionName}'s teams), current events (unless about ${state.institutionName}), technology tips, health advice, personal advice, coding help, math problems (unless from ${state.institutionName}'s curriculum)
   - Examples of OFF-TOPIC: "What is photosynthesis?", "How to cook pasta?", "Who is the president?", "Tell me about Harvard", "Write me a Python script", "What's the weather?"
   - Examples of ON-TOPIC: "What courses does ${state.institutionName} offer?", "How to apply to ${state.institutionName}?", "What is ${state.institutionName}'s fee structure?"
   - If OFF-TOPIC, respond with EXACTLY: "${OFF_TOPIC_REPLY}" (replace {INSTITUTION_NAME} with ${state.institutionName})
   - Then end with helpful suggestions about ${state.institutionName}
4. Respond entirely in: ${langName}. Understand and answer in that language.
5. Format for readability:
   - Markdown: **bold**, *italic*, __underline__, ## headings, lists, > blockquote, \`code\`, ==highlight==
   - HTML tables for structured data: <table><tr><th>Item</th><th>Details</th></tr><tr><td>...</td><td>...</td></tr></table>
   - Organize complex answers with clear sections
6. Emojis (sparingly): 🎓 📘 📊 🔗 📈 🙂 ✅ ⚠️ 💡
7. ALWAYS end with: |SUGGEST: Question one?; Question two?; Question three?|
   - Make suggestions intelligent and contextual
   - Based on what the user might want to know next
   - Progressive: Guide them deeper into the topic
   - For OFF-TOPIC responses, suggest relevant questions about ${state.institutionName}
8. When citing information, you may add before SUGGEST: "📍 Based on: [relevant section/page]"

THINKING PROCESS (Internal - Not shown to user):
1. What is the user really asking?
2. What keywords should I search for?
3. What's the best match in the context?
4. What related info should I include?
5. How can I make this answer complete and helpful?

CONTEXT FROM OFFICIAL WEBSITE:
---
${state.knowledgeBase.slice(0, MAX_KB_CHARS_FOR_API)}
---`;
  }

  /**
   * Call Groq API with streaming for faster perceived response. Returns full text when done.
   * Enhanced with better parameters for intelligent responses
   */
  async function callGroqStream(userMessage, onChunk) {
    if (!GROQ_API_KEY || GROQ_API_KEY === 'gsk_your_groq_api_key_here') {
      throw new Error('Please set your Groq API key in app.js (GROQ_API_KEY). Get one at console.groq.com');
    }
    const systemPrompt = buildSystemPrompt();
    
    // Enhanced conversation context with fuller content for better understanding
    const recentConv = state.conversation.slice(-MAX_CONVERSATION_TURNS).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, 800) // Increased from 600 for better context
    }));
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentConv,
      { role: 'user', content: userMessage }
    ];

    let res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        temperature: 0.4, // Slightly higher for more natural, thoughtful responses
        max_tokens: 1500, // Increased for more comprehensive answers
        top_p: 0.9, // Added for better response quality
        stream: true
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429 || (errText && errText.includes('rate_limit'))) {
        throw new Error('Rate limit reached. Please wait a moment and try again.');
      }
      throw new Error(errText || 'API request failed');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              if (onChunk) onChunk(delta, full);
            }
          } catch (_) {}
        }
      }
    }
    return full;
  }

  /**
   * Parse SUGGEST line from model response and return { body, suggestions }
   * Also replaces {INSTITUTION_NAME} placeholder in off-topic messages
   */
  function parseSuggest(response) {
    const suggestMatch = response.match(/\|SUGGEST:\s*([^|]+)\|/);
    let body = response;
    let suggestions = [];
    if (suggestMatch) {
      body = response.replace(/\|SUGGEST:[^|]*\|/g, '').trim();
      const part = suggestMatch[1].trim();
      suggestions = part.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean).slice(0, 3);
    }
    
    // Replace institution name placeholder in off-topic responses
    if (body.includes('{INSTITUTION_NAME}')) {
      body = body.replace(/\{INSTITUTION_NAME\}/g, state.institutionName || 'this institution');
    }
    
    return { body, suggestions };
  }

  /**
   * Simple markdown-like to HTML for user messages
   */
  function simpleMarkdownToHtml(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /**
   * Extract HTML tables to placeholders so they are not escaped
   */
  function extractTables(raw) {
    const tables = [];
    const out = raw.replace(/<table[\s\S]*?<\/table>/gi, (m) => {
      tables.push(m);
      return '___TABLE_PLACEHOLDER_' + (tables.length - 1) + '___';
    });
    return { text: out, tables };
  }

  /**
   * Rich Markdown to HTML for AI messages: ** * __ ## ### -, lists, `code`, >, ==, links, tables
   */
  function markdownToHtml(raw) {
    const { text: noTables, tables } = extractTables(raw);
    let s = noTables
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/__([^_]+)__/g, '<u>$1</u>');
    s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    s = s.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^-\s+/gm, '• ');
    s = s.replace(/^\d+\.\s+/gm, (m) => m);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/^&gt;\s*(.+)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\n/g, '<br>');
    tables.forEach((tbl, i) => {
      s = s.replace('___TABLE_PLACEHOLDER_' + i + '___', tbl);
    });
    return s;
  }

  function renderContent(raw) {
    return markdownToHtml(raw);
  }

  /**
   * Speak text using Web Speech API (text-to-speech)
   */
  function speakText(text, btnEl) {
    if (!window.speechSynthesis) return;
    const plain = (typeof text === 'string') ? text : (text.textContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!plain) return;
    if (btnEl) {
      btnEl.classList.add('speaking');
      btnEl.disabled = true;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 0.95;
    u.onend = u.onerror = () => {
      if (btnEl) { btnEl.classList.remove('speaking'); btnEl.disabled = false; }
    };
    window.speechSynthesis.speak(u);
  }

  /**
   * Append one message to the chat UI; optional suggestion chips and speak button for AI.
   * If options.placeholder is true (for streaming), only div and contentDiv are created and returned.
   */
  function appendMessage(role, content, suggestions = [], options = {}) {
    const div = document.createElement('div');
    div.className = 'msg msg-' + role;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.innerHTML = role === 'ai' ? renderContent(content) : simpleMarkdownToHtml(content);
    div.appendChild(contentDiv);
    if (options.placeholder) {
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return { div, contentDiv };
    }
    if (role === 'ai' && content) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'msg-action-btn';
      copyBtn.title = 'Copy response';
      copyBtn.innerHTML = '📋 Copy';
      copyBtn.addEventListener('click', () => {
        const plain = (content || '').replace(/<[^>]+>/g, '').trim();
        navigator.clipboard.writeText(plain).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 1500); });
      });
      const speakBtn = document.createElement('button');
      speakBtn.type = 'button';
      speakBtn.className = 'speak-btn msg-action-btn';
      speakBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> Speak';
      speakBtn.addEventListener('click', () => speakText(content, speakBtn));
      const feedbackIdx = state.conversation.length;
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'msg-action-btn feedback-btn';
      upBtn.title = 'Helpful';
      upBtn.textContent = '👍';
      upBtn.addEventListener('click', () => { state.feedback[feedbackIdx] = 'up'; upBtn.classList.add('active'); downBtn.classList.remove('active'); });
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'msg-action-btn feedback-btn';
      downBtn.title = 'Not helpful';
      downBtn.textContent = '👎';
      downBtn.addEventListener('click', () => { state.feedback[feedbackIdx] = 'down'; downBtn.classList.add('active'); upBtn.classList.remove('active'); });
      actions.appendChild(copyBtn);
      actions.appendChild(speakBtn);
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      div.appendChild(actions);
    }
    if (suggestions.length) {
      const wrap = document.createElement('div');
      wrap.className = 'suggestions';
      suggestions.forEach(q => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'suggestion-chip';
        btn.textContent = q;
        btn.addEventListener('click', () => {
          userInput.value = q;
          userInput.focus();
        });
        wrap.appendChild(btn);
      });
      div.appendChild(wrap);
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (role === 'ai' && !options.skipSpeak && speakResponsesCheckbox && speakResponsesCheckbox.checked && content) {
      speakText(content);
    }
    return div;
  }

  /**
   * Add speak button and suggestion chips to an existing AI message div (after streaming)
   */
  function finalizeStreamedMessage(msgDiv, contentDiv, body, suggestions) {
    contentDiv.innerHTML = renderContent(body);
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = 'Copy response';
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.addEventListener('click', () => {
      const plain = (body || '').replace(/<[^>]+>/g, '').trim();
      navigator.clipboard.writeText(plain).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 1500); });
    });
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'speak-btn msg-action-btn';
    speakBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> Speak';
    speakBtn.addEventListener('click', () => speakText(body, speakBtn));
    const feedbackIdx = state.conversation.length;
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'msg-action-btn feedback-btn';
    upBtn.title = 'Helpful';
    upBtn.textContent = '👍';
    upBtn.addEventListener('click', () => { state.feedback[feedbackIdx] = 'up'; upBtn.classList.add('active'); downBtn.classList.remove('active'); });
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'msg-action-btn feedback-btn';
    downBtn.title = 'Not helpful';
    downBtn.textContent = '👎';
    downBtn.addEventListener('click', () => { state.feedback[feedbackIdx] = 'down'; downBtn.classList.add('active'); upBtn.classList.remove('active'); });
    actions.appendChild(copyBtn);
    actions.appendChild(speakBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    msgDiv.appendChild(actions);
    if (suggestions.length) {
      const wrap = document.createElement('div');
      wrap.className = 'suggestions';
      suggestions.forEach(q => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'suggestion-chip';
        btn.textContent = q;
        btn.addEventListener('click', () => { userInput.value = q; userInput.focus(); });
        wrap.appendChild(btn);
      });
      msgDiv.appendChild(wrap);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (speakResponsesCheckbox && speakResponsesCheckbox.checked && body) speakText(body);
  }

  /**
   * Handle user submit: add user msg, stream AI response for speed, then finalize
   */
  async function onSubmit(e) {
    e.preventDefault();
    const text = (userInput.value || '').trim();
    if (!text || state.loading || !state.locked) return;

    userInput.value = '';
    state.conversation.push({ role: 'user', content: text });
    appendMessage('user', text);

    state.loading = true;
    typingIndicator.classList.remove('hidden');
    userInput.disabled = true;
    sendBtn.disabled = true;
    if (voiceInputBtn) voiceInputBtn.disabled = true;

    let aiReply = '';
    let suggestions = [];
    let msgDiv; let contentDiv;

    try {
      const { div, contentDiv: cd } = appendMessage('ai', '', [], { placeholder: true });
      msgDiv = div; contentDiv = cd;
      aiReply = await callGroqStream(text, (chunk, full) => {
        contentDiv.innerHTML = renderContent(full);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      });
      const parsed = parseSuggest(aiReply);
      finalizeStreamedMessage(msgDiv, contentDiv, parsed.body, parsed.suggestions);
      suggestions = parsed.suggestions;
      state.conversation.push({ role: 'assistant', content: parsed.body });
      persistSession();
    } catch (err) {
      const errMsg = 'Sorry, I could not process your question. ' + (err.message || 'Please try again.');
      state.conversation.push({ role: 'assistant', content: errMsg });
      appendMessage('ai', errMsg, []);
      persistSession();
    }

    state.loading = false;
    typingIndicator.classList.add('hidden');
    sendBtn.disabled = false;
    userInput.disabled = false;
    if (voiceInputBtn) voiceInputBtn.disabled = false;
  }

  /**
   * Persist session to localStorage (conversation, institution, language; not full KB)
   */
  function persistSession() {
    if (!state.institutionUrl || !state.locked) return;
    try {
      const payload = {
        institutionUrl: state.institutionUrl,
        institutionName: state.institutionName,
        language: state.language,
        kbLoadedAt: state.kbLoadedAt,
        scrapedUrls: state.scrapedUrls,
        conversation: state.conversation.slice(-MAX_PERSISTED_MESSAGES)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  /**
   * Restore session from localStorage and optionally re-scrape to refill KB
   */
  function restoreSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.institutionUrl || !data.conversation || !Array.isArray(data.conversation)) return false;
      state.institutionUrl = data.institutionUrl;
      state.institutionName = data.institutionName || new URL(data.institutionUrl).hostname;
      state.language = data.language || 'en';
      state.kbLoadedAt = data.kbLoadedAt || null;
      state.scrapedUrls = data.scrapedUrls || [];
      state.conversation = data.conversation;
      state.knowledgeBase = ''; // KB not persisted; user must refresh to get answers again
      state.locked = true;
      institutionUrlInput.value = state.institutionUrl;
      languageSelect.value = state.language;
      if (languageTriggerText) languageTriggerText.textContent = languageNames[state.language] || 'English';
      institutionNameEl.textContent = state.institutionName;
      agentIdentity.classList.remove('hidden');
      headerStatus.textContent = 'Session restored. Click "Refresh data" to reload website and continue, or ask a question (requires refreshed data).';
      userInput.disabled = false;
      sendBtn.disabled = false;
      exportPdfBtn.disabled = false;
      if (voiceInputBtn) voiceInputBtn.disabled = false;
      if (refreshKbBtn) refreshKbBtn.disabled = false;
      if (newChatBtn) newChatBtn.disabled = false;
      chatMessages.innerHTML = '';
      state.conversation.forEach(m => {
        appendMessage(m.role === 'assistant' ? 'ai' : 'user', m.content, [], { skipSpeak: true });
      });
      updateSessionFooter();
      if (suggestedQuestionsEl) { suggestedQuestionsEl.classList.remove('hidden'); renderSuggestedQuestions(); }
      return true;
    } catch (_) { return false; }
  }

  /**
   * Update session footer and "Data loaded at" in main footer
   */
  function updateSessionFooter() {
    const dataLoadedEl = document.getElementById('dataLoadedAt');
    if (dataLoadedEl) {
      if (state.kbLoadedAt) {
        const d = new Date(state.kbLoadedAt);
        dataLoadedEl.textContent = 'Data loaded ' + d.toLocaleString();
        dataLoadedEl.classList.remove('hidden');
      } else {
        dataLoadedEl.textContent = '';
        dataLoadedEl.classList.add('hidden');
      }
    }
    if (sessionFooter && state.scrapedUrls && state.scrapedUrls.length) {
      sessionFooter.classList.remove('hidden');
      sessionFooter.innerHTML = 'Based on ' + state.scrapedUrls.length + ' page(s) • <a href="' + state.institutionUrl + '" target="_blank" rel="noopener">Open website</a>';
    }
  }

  /**
   * Render suggested starter questions as chips
   */
  function renderSuggestedQuestions() {
    if (!suggestedQuestionsEl || !state.locked) return;
    suggestedQuestionsEl.classList.remove('hidden');
    suggestedQuestionsEl.innerHTML = '<span class="suggested-label">Suggested:</span>';
    SUGGESTED_QUESTIONS.forEach(q => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggested-chip';
      btn.textContent = q;
      btn.addEventListener('click', () => {
        userInput.value = q;
        userInput.focus();
        if (chatForm.requestSubmit) chatForm.requestSubmit(); else chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });
      suggestedQuestionsEl.appendChild(btn);
    });
  }

  /**
   * New conversation: clear messages and conversation; keep institution and KB
   */
  function onNewChat() {
    if (!state.locked) return;
    state.conversation = [];
    state.feedback = {};
    chatMessages.innerHTML = '';
    if (suggestedQuestionsEl) { suggestedQuestionsEl.classList.remove('hidden'); renderSuggestedQuestions(); }
    appendMessage('ai', `New conversation started. I am the **OFFICIAL AI ASSISTANT** of **${state.institutionName}**. Ask me anything about this institution.`, []);
    persistSession();
  }

  /**
   * Refresh knowledge base (re-scrape) for current institution
   * Enhanced with estimate timer
   */
  async function onRefreshKb() {
    if (!state.institutionUrl || state.loading) return;
    if (refreshKbBtn) refreshKbBtn.disabled = true;
    
    // Start estimate timer
    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      const mins = Math.floor(elapsedSeconds / 60);
      const secs = elapsedSeconds % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      headerStatus.textContent = `⏱️ Refreshing website data... ${timeStr} elapsed`;
    }, 1000);
    
    try {
      const { knowledgeBase, institutionName, scrapedUrls } = await buildKnowledgeBase(state.institutionUrl);
      
      // Stop timer
      clearInterval(timerInterval);
      
      state.knowledgeBase = knowledgeBase;
      state.kbLoadedAt = Date.now();
      state.scrapedUrls = scrapedUrls || [];
      state.institutionName = institutionName;
      institutionNameEl.textContent = institutionName;
      headerStatus.textContent = `✅ Refresh complete! Updated in ${elapsedSeconds}s.`;
      
      // Reset to normal message after 3 seconds
      setTimeout(() => {
        headerStatus.textContent = 'You can ask academic and institutional questions.';
      }, 3000);
      
      updateSessionFooter();
      persistSession();
    } catch (e) {
      clearInterval(timerInterval); // Stop timer on error
      headerStatus.textContent = 'Refresh failed. Try again.';
    } finally {
      if (refreshKbBtn) refreshKbBtn.disabled = false;
    }
  }

  /**
   * Export conversation as PDF: open print window with formatted content
   */
  function exportPdf() {
    if (!state.institutionName || !state.conversation.length) return;

    const langLabel = languageNames[state.language] || 'English';
    const dateStr = new Date().toLocaleString();

    let html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Campus Connect – Chat Export</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #1a2332; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  .msg { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
  .msg-user { background: #eff6ff; margin-left: 24px; }
  .msg-ai { background: #f3f4f6; margin-right: 24px; }
  .role { font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; }
</style></head><body>
  <h1>Campus Connect – Chat Export</h1>
  <div class="meta">Institution: ${state.institutionName} | Language: ${langLabel} | Date: ${dateStr}</div>
`;
    state.conversation.forEach(m => {
      const role = m.role === 'user' ? 'User' : 'AI Assistant';
      const cls = m.role === 'user' ? 'msg-user' : 'msg-ai';
      const content = m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      html += `<div class="msg ${cls}"><div class="role">${role}</div><div>${content}</div></div>`;
    });
    html += '</body></html>';

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.onafterprint = () => w.close();
    }, 250);
  }

  // ----- Voice input (Web Speech API)
  let recognition = null;
  if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      const t = e.results[e.results.length - 1][0].transcript;
      if (userInput) userInput.value = (userInput.value ? userInput.value + ' ' : '') + t;
    };
    recognition.onerror = () => { if (voiceInputBtn) voiceInputBtn.classList.remove('recording'); };
    recognition.onend = () => { if (voiceInputBtn) voiceInputBtn.classList.remove('recording'); };
  }
  const speechRecognitionLangs = { en: 'en-US', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', zh: 'zh-CN', ar: 'ar-SA', pt: 'pt-BR', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', it: 'it-IT' };
  if (voiceInputBtn && recognition) {
    voiceInputBtn.addEventListener('click', () => {
      if (!recognition || state.loading) return;
      if (voiceInputBtn.classList.contains('recording')) {
        recognition.stop();
        return;
      }
      recognition.lang = speechRecognitionLangs[state.language] || 'en-US';
      voiceInputBtn.classList.add('recording');
      recognition.start();
    });
  }

  // ----- Custom language dropdown: full list visible when open
  function updateLanguageTriggerText() {
    const opt = languageSelect.querySelector('option[value="' + state.language + '"]');
    if (languageTriggerText) languageTriggerText.textContent = opt ? opt.textContent : 'English';
    document.querySelectorAll('.language-option').forEach(el => {
      el.classList.toggle('selected', el.getAttribute('data-value') === state.language);
    });
  }
  if (languageTrigger && languagePanel && languageSelect) {
    updateLanguageTriggerText();
    languageTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      languageDropdown.classList.toggle('open');
      languagePanel.setAttribute('aria-hidden', languageDropdown.classList.contains('open') ? 'false' : 'true');
      languageTrigger.setAttribute('aria-expanded', languageDropdown.classList.contains('open'));
    });
    document.querySelectorAll('.language-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const val = opt.getAttribute('data-value');
        if (val) {
          state.language = val;
          languageSelect.value = val;
          updateLanguageTriggerText();
          languageDropdown.classList.remove('open');
          languagePanel.setAttribute('aria-hidden', 'true');
          languageTrigger.setAttribute('aria-expanded', 'false');
        }
      });
    });
    document.addEventListener('click', () => {
      if (languageDropdown.classList.contains('open')) {
        languageDropdown.classList.remove('open');
        languagePanel.setAttribute('aria-hidden', 'true');
        languageTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }
  languageSelect.addEventListener('change', () => { state.language = languageSelect.value; if (languageTriggerText) updateLanguageTriggerText(); });

  // ----- Event bindings
  connectBtn.addEventListener('click', onConnect);
  chatForm.addEventListener('submit', onSubmit);
  exportPdfBtn.addEventListener('click', exportPdf);
  if (newChatBtn) newChatBtn.addEventListener('click', onNewChat);
  if (refreshKbBtn) refreshKbBtn.addEventListener('click', onRefreshKb);

  // ----- Keyboard: Enter to send, Shift+Enter for new line (if textarea in future)
  if (userInput) {
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (state.locked && !state.loading && userInput.value.trim()) chatForm.requestSubmit ? chatForm.requestSubmit() : chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
  }

  // ----- Restore session on load (if previous session exists)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { restoreSession(); });
  } else {
    restoreSession();
  }
})();
