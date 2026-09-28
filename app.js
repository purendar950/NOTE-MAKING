// ===== NoteForge — YouTube to Notes =====

// State
let currentVideoId = null;
let currentVideoTitle = '';
let player = null;
let transcriptData = [];
let saveTimeout = null;

// DOM Elements
const youtubeUrlInput = document.getElementById('youtubeUrl');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const fetchTranscriptBtn = document.getElementById('fetchTranscriptBtn');
const generateNotesBtn = document.getElementById('generateNotesBtn');
const clearNotesBtn = document.getElementById('clearNotesBtn');
const exportBtn = document.getElementById('exportBtn');
const themeToggle = document.getElementById('themeToggle');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const playerDiv = document.getElementById('player');
const transcriptPanel = document.getElementById('transcriptPanel');
const transcriptContent = document.getElementById('transcriptContent');
const transcriptStatus = document.getElementById('transcriptStatus');
const noteTitle = document.getElementById('noteTitle');
const editor = document.getElementById('editor');
const wordCount = document.getElementById('wordCount');
const charCount = document.getElementById('charCount');
const saveStatus = document.getElementById('saveStatus');
const toastContainer = document.getElementById('toastContainer');
const divider = document.getElementById('divider');

// ===== YouTube URL Parsing =====
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// ===== YouTube IFrame API =====
function loadYouTubeAPI() {
    return new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve();
            return;
        }
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
    });
}

function initPlayer(videoId) {
    if (player) {
        player.destroy();
    }
    playerDiv.innerHTML = '';
    videoPlaceholder.style.display = 'none';

    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1
        },
        events: {
            onReady: (event) => {
                currentVideoTitle = event.target.getVideoData().title || 'Untitled Video';
                if (!noteTitle.value) {
                    noteTitle.value = currentVideoTitle;
                }
                updateSaveStatus('Video loaded', 'saved');
            },
            onStateChange: () => {}
        }
    });
}

// ===== Load Video =====
async function loadVideo() {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
        showToast('Please enter a YouTube URL', 'error');
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        showToast('Invalid YouTube URL', 'error');
        return;
    }

    currentVideoId = videoId;
    transcriptData = [];
    transcriptContent.innerHTML = '<p class="transcript-empty">Load a video and click "Get Transcript" to extract captions</p>';
    transcriptStatus.textContent = '';

    try {
        await loadYouTubeAPI();
        initPlayer(videoId);
        fetchTranscriptBtn.disabled = false;
        generateNotesBtn.disabled = true;
        showToast('Video loaded successfully!', 'success');
    } catch (err) {
        showToast('Failed to load video player', 'error');
    }
}

// ===== Transcript Extraction =====
async function fetchTranscript() {
    if (!currentVideoId) return;

    transcriptContent.innerHTML = '<div class="transcript-loading"><div class="spinner"></div><span>Extracting transcript...</span></div>';
    transcriptStatus.textContent = 'Fetching...';

    try {
        // Fetch the YouTube watch page to extract caption tracks
        const response = await fetch(`https://www.youtube.com/watch?v=${currentVideoId}`);
        const html = await response.text();

        // Extract caption tracks from ytInitialPlayerResponse
        const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
        if (!captionMatch) {
            throw new Error('No captions found for this video');
        }

        const captionTracks = JSON.parse(captionMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
        if (!captionTracks || captionTracks.length === 0) {
            throw new Error('No caption tracks available');
        }

        // Prefer English captions
        let track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
        const captionUrl = track.baseUrl;

        // Fetch the actual transcript XML
        const transcriptResponse = await fetch(captionUrl);
        const transcriptXml = await transcriptResponse.text();

        // Parse XML transcript
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(transcriptXml, 'text/xml');
        const textElements = xmlDoc.getElementsByTagName('text');

        transcriptData = [];
        for (let i = 0; i < textElements.length; i++) {
            const el = textElements[i];
            const start = parseFloat(el.getAttribute('start') || 0);
            const duration = parseFloat(el.getAttribute('dur') || 0);
            const text = decodeHtmlEntities(el.textContent || '');
            transcriptData.push({ start, duration, text });
        }

        if (transcriptData.length === 0) {
            throw new Error('Transcript is empty');
        }

        renderTranscript();
        generateNotesBtn.disabled = false;
        transcriptStatus.textContent = `${transcriptData.length} segments`;
        showToast('Transcript extracted successfully!', 'success');
    } catch (err) {
        console.error('Transcript error:', err);
        transcriptContent.innerHTML = `<p class="transcript-empty">Could not extract transcript: ${err.message}</p>`;
        transcriptStatus.textContent = 'Error';
        showToast('Failed to extract transcript. The video may not have captions.', 'error');
    }
}

function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function renderTranscript() {
    transcriptContent.innerHTML = transcriptData.map((seg, i) => `
        <div class="transcript-segment" data-index="${i}" data-start="${seg.start}">
            <span class="transcript-time">${formatTime(seg.start)}</span>
            ${seg.text}
        </div>
    `).join('');

    // Click to seek
    transcriptContent.querySelectorAll('.transcript-segment').forEach(el => {
        el.addEventListener('click', () => {
            const start = parseFloat(el.dataset.start);
            if (player && player.seekTo) {
                player.seekTo(start, true);
                player.playVideo();
            }
            // Highlight active segment
            transcriptContent.querySelectorAll('.transcript-segment').forEach(s => s.style.background = '');
            el.style.background = 'var(--accent-subtle)';
        });
    });
}

// ===== Smart Note Generation =====
function generateNotes() {
    if (transcriptData.length === 0) {
        showToast('No transcript data available', 'error');
        return;
    }

    updateSaveStatus('Generating...', 'saving');

    // Build full transcript text
    const fullText = transcriptData.map(s => s.text).join(' ');

    // Extract key sections using simple NLP
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];

    // Score sentences by importance (keyword density, position, length)
    const wordFreq = {};
    const words = fullText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    words.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });

    const scoredSentences = sentences.map((sentence, index) => {
        const sentenceWords = sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const score = sentenceWords.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / Math.max(sentenceWords.length, 1);
        // Boost first few sentences (often intro/summary)
        const positionBoost = index < 3 ? 1.5 : 1;
        // Penalize very short or very long sentences
        const lengthScore = sentenceWords.length > 5 && sentenceWords.length < 30 ? 1.2 : 0.8;
        return { sentence: sentence.trim(), score: score * positionBoost * lengthScore, index };
    });

    // Get top sentences for summary
    const topSentences = scoredSentences
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(8, Math.floor(sentences.length * 0.15)))
        .sort((a, b) => a.index - b.index);

    // Extract key topics (most frequent meaningful words)
    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'said', 'each', 'which', 'their', 'will', 'other', 'about', 'many', 'then', 'them', 'some', 'what', 'would', 'make', 'like', 'just', 'over', 'such', 'take', 'year', 'into', 'could', 'after', 'should', 'also', 'back', 'only', 'know', 'take', 'good', 'much', 'where', 'well', 'very', 'when', 'come', 'here', 'how', 'long', 'make', 'most', 'over', 'such', 'than', 'that', 'this', 'time', 'want', 'way', 'with', 'work', 'your', 'from', 'they', 'been', 'have', 'more', 'will', 'would', 'there', 'think', 'going', 'really', 'because', 'right', 'thing', 'still', 'being', 'actually', 'pretty', 'something', 'everything', 'nothing', 'around', 'through', 'before', 'little', 'people', 'around', 'which', 'these', 'those', 'while', 'since', 'might', 'doesn', 'don't', 'isn't', 'wasn't', 'aren't', 'weren't', 'hasn't', 'haven't', 'hadn't', 'won't', 'wouldn't', 'can't', 'couldn't', 'shouldn't', 'mustn't', 'needn't', 'let's', 'that's', 'who's', 'what's', 'here's', 'there's', 'when's', 'where's', 'why's', 'how's', 'i'm', 'you're', 'he's', 'she's', 'it's', 'we're', 'they're', 'i've', 'you've', 'we've', 'they've', 'i'll', 'you'll', 'he'll', 'she'll', 'we'll', 'they'll', 'i'd', 'you'd', 'he'd', 'she'd', 'we'd', 'they'd', 'isn', 'aren', 'wasn', 'weren', 'hasn', 'haven', 'hadn', 'won', 'wouldn', 'don', 'doesn', 'didn', 'can', 'couldn', 'shouldn', 'mightn', 'mustn', 'needn', 'let', 'that', 'who', 'what', 'here', 'there', 'when', 'where', 'why', 'how', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'need', 'dare', 'ought', 'used', 'get', 'gets', 'got', 'getting', 'go', 'goes', 'went', 'going', 'gone', 'see', 'sees', 'saw', 'seen', 'seeing', 'look', 'looks', 'looked', 'looking', 'seem', 'seems', 'seemed', 'seeming', 'say', 'says', 'said', 'saying', 'tell', 'tells', 'told', 'telling', 'ask', 'asks', 'asked', 'asking', 'try', 'tries', 'tried', 'trying', 'want', 'wants', 'wanted', 'wanting', 'use', 'uses', 'used', 'using', 'find', 'finds', 'found', 'finding', 'give', 'gives', 'gave', 'given', 'giving', 'put', 'puts', 'putting', 'set', 'sets', 'setting', 'keep', 'keeps', 'kept', 'keeping', 'let', 'lets', 'letting', 'begin', 'begins', 'began', 'begun', 'beginning', 'help', 'helps', 'helped', 'helping', 'show', 'shows', 'showed', 'shown', 'showing', 'hear', 'hears', 'heard', 'hearing', 'play', 'plays', 'played', 'playing', 'run', 'runs', 'ran', 'running', 'move', 'moves', 'moved', 'moving', 'live', 'lives', 'lived', 'living', 'believe', 'believes', 'believed', 'believing', 'bring', 'brings', 'brought', 'bringing', 'happen', 'happens', 'happened', 'happening', 'write', 'writes', 'wrote', 'written', 'writing', 'provide', 'provides', 'provided', 'providing', 'sit', 'sits', 'sat', 'sitting', 'stand', 'stands', 'stood', 'standing', 'lose', 'loses', 'lost', 'losing', 'pay', 'pays', 'paid', 'paying', 'meet', 'meets', 'met', 'meeting', 'include', 'includes', 'included', 'including', 'continue', 'continues', 'continued', 'continuing', 'learn', 'learns', 'learned', 'learning', 'change', 'changes', 'changed', 'changing', 'understand', 'understands', 'understood', 'understanding', 'watch', 'watches', 'watched', 'watching', 'follow', 'follows', 'followed', 'following', 'stop', 'stops', 'stopped', 'stopping', 'create', 'creates', 'created', 'creating', 'speak', 'speaks', 'spoke', 'spoken', 'speaking', 'read', 'reads', 'reading', 'allow', 'allows', 'allowed', 'allowing', 'add', 'adds', 'added', 'adding', 'spend', 'spends', 'spent', 'spending', 'grow', 'grows', 'grew', 'grown', 'growing', 'open', 'opens', 'opened', 'opening', 'walk', 'walks', 'walked', 'walking', 'win', 'wins', 'won', 'winning', 'offer', 'offers', 'offered', 'offering', 'remember', 'remembers', 'remembered', 'remembering', 'love', 'loves', 'loved', 'loving', 'consider', 'considers', 'considered', 'considering', 'appear', 'appears', 'appeared', 'appearing', 'buy', 'buys', 'bought', 'buying', 'wait', 'waits', 'waited', 'waiting', 'serve', 'serves', 'served', 'serving', 'die', 'dies', 'died', 'dying', 'send', 'sends', 'sent', 'sending', 'expect', 'expects', 'expected', 'expecting', 'build', 'builds', 'built', 'building', 'stay', 'stays', 'stayed', 'staying', 'fall', 'falls', 'fell', 'fallen', 'falling', 'cut', 'cuts', 'cutting', 'reach', 'reaches', 'reached', 'reaching', 'kill', 'kills', 'killed', 'killing', 'remain', 'remains', 'remained', 'remaining', 'suggest', 'suggests', 'suggested', 'suggesting', 'raise', 'raises', 'raised', 'raising', 'pass', 'passes', 'passed', 'passing', 'sell', 'sells', 'sold', 'selling', 'require', 'requires', 'required', 'requiring', 'report', 'reports', 'reported', 'reporting', 'decide', 'decides', 'decided', 'deciding', 'pull', 'pulls', 'pulled', 'pulling']);

    const keywords = Object.entries(wordFreq)
        .filter(([word, count]) => !stopWords.has(word) && count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);

    // Detect chapters/topics by looking for transition phrases
    const transitionPhrases = ['first', 'second', 'third', 'next', 'now', 'let\'s', 'so', 'another', 'finally', 'lastly', 'moving on', 'let me', 'i want to', 'we\'re going to', 'the first thing', 'the next thing', 'point is', 'remember', 'important', 'key', 'main', 'essential', 'crucial', 'note that', 'keep in mind'];

    const chapters = [];
    let currentChapter = { title: 'Introduction', content: [], timestamps: [] };

    transcriptData.forEach((seg, i) => {
        const lower = seg.text.toLowerCase();
        const isTransition = transitionPhrases.some(p => lower.includes(p));

        if (isTransition && currentChapter.content.length > 0) {
            chapters.push(currentChapter);
            // Try to extract a title from the transition
            const titleMatch = seg.text.match(/(?:first|second|third|next|finally|lastly|another|moving on)[,]?\s*(?:is|we|let's|let me|i want to|about|to|the)?\s*(.{3,60})/i);
            currentChapter = {
                title: titleMatch ? titleMatch[1].trim() : `Section ${chapters.length + 1}`,
                content: [],
                timestamps: []
            };
        }

        currentChapter.content.push(seg.text);
        currentChapter.timestamps.push(seg.start);
    });
    if (currentChapter.content.length > 0) {
        chapters.push(currentChapter);
    }

    // Build the notes HTML
    let notesHTML = '';

    // Title
    if (currentVideoTitle) {
        notesHTML += `<h1>${escapeHtml(currentVideoTitle)}</h1>\n`;
    }

    // Summary section
    notesHTML += `<h2>Summary</h2>\n`;
    notesHTML += `<p>${topSentences.map(s => escapeHtml(s.sentence)).join(' ')}</p>\n`;

    // Key Topics
    if (keywords.length > 0) {
        notesHTML += `<h2>Key Topics</h2>\n`;
        notesHTML += `<ul>\n`;
        keywords.forEach(kw => {
            notesHTML += `  <li><strong>${escapeHtml(kw)}</strong></li>\n`;
        });
        notesHTML += `</ul>\n`;
    }

    // Detailed Notes by Chapter
    if (chapters.length > 1) {
        notesHTML += `<h2>Detailed Notes</h2>\n`;
        chapters.forEach((chapter, ci) => {
            const chapterStart = chapter.timestamps[0] || 0;
            notesHTML += `<h3><span class="timestamp" data-time="${chapterStart}">${formatTime(chapterStart)}</span> ${escapeHtml(chapter.title)}</h3>\n`;

            // Summarize chapter content
            const chapterText = chapter.content.join(' ');
            const chapterSentences = chapterText.match(/[^.!?]+[.!?]+/g) || [chapterText];
            const topChapterSentences = chapterSentences
                .sort((a, b) => b.length - a.length)
                .slice(0, Math.min(3, chapterSentences.length));

            notesHTML += `<ul>\n`;
            topChapterSentences.forEach(s => {
                notesHTML += `  <li>${escapeHtml(s.trim())}</li>\n`;
            });
            notesHTML += `</ul>\n`;
        });
    }

    // Key Takeaways
    notesHTML += `<h2>Key Takeaways</h2>\n`;
    notesHTML += `<ul>\n`;
    const takeaways = scoredSentences.slice(0, 5);
    takeaways.forEach(t => {
        notesHTML += `  <li>${escapeHtml(t.sentence)}</li>\n`;
    });
    notesHTML += `</ul>\n`;

    // Action Items (detect imperative sentences)
    const actionItems = sentences.filter(s => {
        const lower = s.toLowerCase().trim();
        return lower.startsWith('make sure') || lower.startsWith('remember to') ||
               lower.startsWith('don\'t forget') || lower.startsWith('try to') ||
               lower.startsWith('be sure') || lower.startsWith('keep in mind') ||
               lower.startsWith('practice') || lower.startsWith('start by');
    });

    if (actionItems.length > 0) {
        notesHTML += `<h2>Action Items</h2>\n`;
        notesHTML += `<ul>\n`;
        actionItems.slice(0, 5).forEach(item => {
            notesHTML += `  <li>${escapeHtml(item.trim())}</li>\n`;
        });
        notesHTML += `</ul>\n`;
    }

    // Timestamp reference
    notesHTML += `<hr>\n`;
    notesHTML += `<p><em>Generated from video transcript • ${transcriptData.length} segments analyzed</em></p>\n`;

    editor.innerHTML = notesHTML;
    updateCounts();
    updateSaveStatus('Notes generated!', 'saved');
    showToast('Notes generated from transcript!', 'success');

    // Make timestamps clickable
    editor.querySelectorAll('.timestamp').forEach(el => {
        el.addEventListener('click', () => {
            const time = parseFloat(el.dataset.time);
            if (player && player.seekTo) {
                player.seekTo(time, true);
                player.playVideo();
            }
        });
    });
}

// ===== Editor Functions =====
function updateCounts() {
    const text = editor.innerText || '';
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = `${words.length} words`;
    charCount.textContent = `${text.length} chars`;
}

function updateSaveStatus(text, type) {
    saveStatus.textContent = text;
    saveStatus.className = type;
}

function autoSave() {
    updateSaveStatus('Saving...', 'saving');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const data = {
            title: noteTitle.value,
            content: editor.innerHTML,
            videoId: currentVideoId,
            videoTitle: currentVideoTitle,
            timestamp: new Date().toISOString()
        };
        try {
            localStorage.setItem('noteforge_autosave', JSON.stringify(data));
            updateSaveStatus('All changes saved', 'saved');
        } catch (e) {
            updateSaveStatus('Save failed', '');
        }
    }, 1000);
}

function loadAutoSave() {
    try {
        const data = JSON.parse(localStorage.getItem('noteforge_autosave'));
        if (data) {
            noteTitle.value = data.title || '';
            editor.innerHTML = data.content || '';
            updateCounts();
        }
    } catch (e) {}
}

// ===== Toolbar Actions =====
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        editor.focus();

        switch (action) {
            case 'bold': document.execCommand('bold'); break;
            case 'italic': document.execCommand('italic'); break;
            case 'underline': document.execCommand('underline'); break;
            case 'h1': document.execCommand('formatBlock', false, 'h1'); break;
            case 'h2': document.execCommand('formatBlock', false, 'h2'); break;
            case 'h3': document.execCommand('formatBlock', false, 'h3'); break;
            case 'ul': document.execCommand('insertUnorderedList'); break;
            case 'ol': document.execCommand('insertOrderedList'); break;
            case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break;
            case 'code': document.execCommand('formatBlock', false, 'code'); break;
            case 'divider': document.execCommand('insertHorizontalRule'); break;
            case 'checklist':
                document.execCommand('insertHTML', false, '<div class="checklist-item"><input type="checkbox"> <span>Task item</span></div>');
                break;
            case 'timestamp':
                const time = player && player.getCurrentTime ? player.getCurrentTime() : 0;
                const timeStr = formatTime(time);
                document.execCommand('insertHTML', false, ` <span class="timestamp" data-time="${time}">${timeStr}</span> `);
                break;
        }
        updateCounts();
        autoSave();
    });
});

// ===== Export =====
function exportNotes() {
    const title = noteTitle.value || 'Untitled Note';
    const content = editor.innerHTML;

    // Create a clean HTML export
    const exportHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
        body { font-family: 'Inter', -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #1a1a2e; }
        h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        h2 { font-size: 20px; font-weight: 700; margin-top: 28px; border-bottom: 2px solid #6366f1; padding-bottom: 4px; }
        h3 { font-size: 16px; font-weight: 700; margin-top: 20px; }
        ul, ol { margin: 8px 0 8px 24px; }
        li { margin: 4px 0; }
        blockquote { border-left: 3px solid #6366f1; padding: 8px 16px; margin: 12px 0; background: #f0f0ff; border-radius: 0 8px 8px 0; }
        code { font-family: 'JetBrains Mono', monospace; background: #f0f0f6; padding: 2px 6px; border-radius: 4px; }
        pre { background: #f0f0f6; padding: 16px; border-radius: 8px; overflow-x: auto; }
        .timestamp { font-family: monospace; font-size: 12px; color: #6366f1; background: #f0f0ff; padding: 2px 8px; border-radius: 4px; }
        hr { border: none; height: 1px; background: #e0e0ec; margin: 24px 0; }
        em { color: #888; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;

    const blob = new Blob([exportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Notes exported!', 'success');
}

// ===== Theme Toggle =====
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('noteforge_theme', next);
}

function loadTheme() {
    const saved = localStorage.getItem('noteforge_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
}

// ===== Divider Drag =====
let isDragging = false;

divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const splitScreen = document.querySelector('.split-screen');
    const rect = splitScreen.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    document.querySelector('.panel-video').style.flex = `0 0 ${clamped}%`;
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
});

// ===== Toast =====
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== Utilities =====
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Event Listeners =====
loadVideoBtn.addEventListener('click', loadVideo);
youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadVideo();
});
fetchTranscriptBtn.addEventListener('click', fetchTranscript);
generateNotesBtn.addEventListener('click', generateNotes);
clearNotesBtn.addEventListener('click', () => {
    if (confirm('Clear all notes?')) {
        editor.innerHTML = '';
        noteTitle.value = '';
        updateCounts();
        autoSave();
    }
});
exportBtn.addEventListener('click', exportNotes);
themeToggle.addEventListener('click', toggleTheme);

editor.addEventListener('input', () => {
    updateCounts();
    autoSave();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'b': e.preventDefault(); document.execCommand('bold'); break;
            case 'i': e.preventDefault(); document.execCommand('italic'); break;
            case 'u': e.preventDefault(); document.execCommand('underline'); break;
            case 's': e.preventDefault(); autoSave(); showToast('Notes saved!', 'success'); break;
            case 'e': e.preventDefault(); exportNotes(); break;
        }
    }
});

// ===== Init =====
loadTheme();
loadAutoSave();
updateCounts();
