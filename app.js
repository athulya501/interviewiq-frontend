const API_BASE = 'http://localhost:8080/api';

// State
let token = localStorage.getItem('jwt_token') || null;
let currentRole = null;
let questionPool = [];
let questionsAsked = [];
let TOTAL_QUESTIONS_PER_SESSION = 3; // Kept short for demo purposes

// Session Data for Analytics
let sessionData = {
    answers: [],
    currentQuestionStart: 0,
    timer: null,
    timeRemaining: 120,
    longHesitations: 0,
    veryFastAnswers: 0
};

// UI Elements
const views = document.querySelectorAll('.view');
const btnAuth = document.getElementById('btn-auth');
const navLogout = document.getElementById('nav-logout');
const navHome = document.getElementById('nav-home');
const navDashboard = document.getElementById('nav-dashboard');
const navLeaderboard = document.getElementById('nav-leaderboard');

// Initialization
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});

function switchView(viewId) {
    views.forEach(v => {
        v.classList.remove('active-view');
        setTimeout(() => { if(!v.classList.contains('active-view')) v.style.display = 'none'; }, 300);
    });
    const target = document.getElementById(viewId);
    target.style.display = 'block';
    setTimeout(() => target.classList.add('active-view'), 50);
}

if (token) {
    navDashboard.style.display = 'inline';
    navLogout.style.display = 'inline';
    switchView('role-selection');
}

// Authentication
btnAuth.addEventListener('click', async () => {
    const username = document.getElementById('username-input').value;
    const password = document.getElementById('password-input').value;
    
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    if (res.ok) {
        const data = await res.json();
        token = data.token;
        localStorage.setItem('jwt_token', token);
        navDashboard.style.display = 'inline';
        navLogout.style.display = 'inline';
        switchView('role-selection');
    } else {
        alert("Authentication failed.");
    }
});

navLogout.addEventListener('click', () => {
    token = null;
    localStorage.removeItem('jwt_token');
    navDashboard.style.display = 'none';
    navLogout.style.display = 'none';
    switchView('landing-page');
});

// Navigation
navHome.addEventListener('click', () => switchView(token ? 'role-selection' : 'landing-page'));
navLeaderboard.addEventListener('click', fetchLeaderboard);
navDashboard.addEventListener('click', fetchDashboard);

// Role Selection
document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
        currentRole = card.getAttribute('data-role');
        startSimulation();
    });
});

// Full Screen / Anti-Cheat Simulation Mode
function startSimulation() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log("Full screen denied", err);
        });
    }
    
    fetchQuestions();
}

// Anti-cheat Visibility Listener
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && document.getElementById('interview-engine').classList.contains('active-view')) {
        document.getElementById('anti-cheat-overlay').style.display = 'flex';
        // Add a penalty conceptually
    }
});
document.getElementById('btn-resume-interview').addEventListener('click', () => {
    document.getElementById('anti-cheat-overlay').style.display = 'none';
});

async function fetchQuestions() {
    // Only basic auth needed for public questions, but we add token if needed
    const res = await fetch(`${API_BASE}/questions/${encodeURIComponent(currentRole)}/Any`);
    const data = await res.json();
    questionPool = data;
    if(questionPool.length === 0) return alert("No questions found.");
    
    resetSession();
    switchView('interview-engine');
    document.getElementById('interview-role-title').textContent = currentRole;
    loadNextQuestion();
}

function loadNextQuestion() {
    if (questionsAsked.length >= TOTAL_QUESTIONS_PER_SESSION || questionPool.length === 0) {
        finishInterview();
        return;
    }

    const q = questionPool.pop(); // Taking last for simplicity
    questionsAsked.push(q);
    
    document.getElementById('current-question-text').textContent = q.questionText;
    document.getElementById('question-topic-tag').textContent = q.topic;
    document.getElementById('q-curr').textContent = questionsAsked.length;
    document.getElementById('answer-textarea').value = '';
    
    const progressPercent = ((questionsAsked.length - 1) / TOTAL_QUESTIONS_PER_SESSION) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    sessionData.timeRemaining = 120;
    sessionData.currentQuestionStart = Date.now();
    
    clearInterval(sessionData.timer);
    sessionData.timer = setInterval(() => {
        sessionData.timeRemaining--;
        const mins = Math.floor(sessionData.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (sessionData.timeRemaining % 60).toString().padStart(2, '0');
        document.getElementById('countdown-timer').textContent = `${mins}:${secs}`;
        
        if (sessionData.timeRemaining <= 0) {
            handleAnswer(false); // Auto progression in simulation mode
        }
    }, 1000);
}

document.getElementById('btn-skip').addEventListener('click', () => handleAnswer(true));
document.getElementById('btn-next').addEventListener('click', () => handleAnswer(false));

function handleAnswer(skipped) {
    clearInterval(sessionData.timer);
    const text = document.getElementById('answer-textarea').value;
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const timeSpent = 120 - sessionData.timeRemaining;

    if (!skipped && wordCount === 0) skipped = true;

    if (timeSpent < 15 && wordCount < 10) sessionData.veryFastAnswers++;
    if (timeSpent > 100) sessionData.longHesitations++;

    let heuristicScore = skipped ? 0 : Math.min(100, wordCount * 2);

    sessionData.answers.push({
        questionId: questionsAsked[questionsAsked.length - 1].id,
        timeSpent: timeSpent,
        skipped: skipped,
        wordCount: wordCount,
        score: heuristicScore
    });

    loadNextQuestion();
}

function finishInterview() {
    if (document.fullscreenElement) document.exitFullscreen();
    document.getElementById('progress-bar').style.width = `100%`;
    
    let skipped = sessionData.answers.filter(a => a.skipped).length;
    let answered = sessionData.answers.length - skipped;
    let totalTime = sessionData.answers.reduce((acc, val) => acc + val.timeSpent, 0);

    const payload = {
        role: currentRole,
        totalQuestions: questionsAsked.length,
        answeredQuestions: answered,
        skippedQuestions: skipped,
        avgResponseTime: answered > 0 ? totalTime / answered : 0,
        longHesitations: sessionData.longHesitations,
        veryFastAnswers: sessionData.veryFastAnswers,
        answers: sessionData.answers
    };

    fetch(`${API_BASE}/interview/submit`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => renderDashboard(data))
    .catch(console.error);
}

// Analytics Dashboard
let heatmapChartInstance = null;

function renderDashboard(result) {
    switchView('dashboard');
    document.getElementById('kpi-score').textContent = result.score;
    const confBadge = document.getElementById('kpi-confidence');
    confBadge.textContent = result.confidenceLevel;
    confBadge.className = `kpi-value badge ${result.confidenceLevel.split(' ')[0]}`;
    document.getElementById('kpi-confidence-score').textContent = `Heuristic Score: ${Math.round(result.confidenceScore)}/100`;

    const skills = JSON.parse(result.skillBreakdown);
    const labels = Object.keys(skills);
    const data = Object.values(skills);

    const ctx = document.getElementById('heatmapChart').getContext('2d');
    if (heatmapChartInstance) heatmapChartInstance.destroy();

    const isDark = document.body.classList.contains('dark-mode');
    
    heatmapChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels.length ? labels : ['General'],
            datasets: [{
                label: 'Skill Proficiency',
                data: data.length ? data : [result.score],
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: '#4f46e5',
                pointBackgroundColor: '#4f46e5'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: isDark ? '#334155' : '#cbd5e1' },
                    grid: { color: isDark ? '#334155' : '#cbd5e1' },
                    pointLabels: { color: isDark ? '#f8fafc' : '#1e293b' },
                    ticks: { display: false, min: 0, max: 100 }
                }
            }
        }
    });

    // Weak Area Detection
    const insights = document.getElementById('analysis-insights');
    insights.innerHTML = '';
    
    let weakSkills = Object.entries(skills).filter(([k,v]) => v < 60);
    if(weakSkills.length > 0) {
        weakSkills.forEach(([k,v]) => {
            insights.innerHTML += `<li>📉 <strong>${k} Needs Review:</strong> Score was ${v}/100. Focus on deeper technical explanations.</li>`;
        });
    } else {
        insights.innerHTML += `<li>🌟 <strong>Excellent Balance:</strong> No major weak areas detected across tested skills.</li>`;
    }
}

async function fetchLeaderboard() {
    switchView('leaderboard-view');
    const res = await fetch(`${API_BASE}/leaderboard/global`);
    if (res.ok) {
        const data = await res.json();
        const tbody = document.querySelector('#leaderboard-table tbody');
        tbody.innerHTML = '';
        data.forEach((r, i) => {
            tbody.innerHTML += `<tr>
                <td>#${i+1}</td>
                <td>${r.role}</td> <!-- Storing username in role DTO field -->
                <td><strong>${r.score}</strong></td>
                <td><span class="badge ${r.confidenceLevel.split(' ')[0]}">${r.confidenceLevel}</span></td>
            </tr>`;
        });
    }
}

async function fetchDashboard() {
    const res = await fetch(`${API_BASE}/interview/results`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const results = await res.json();
        if(results.length > 0) renderDashboard(results[0]);
        else alert("No past interviews found.");
    }
}

function resetSession() {
    clearInterval(sessionData.timer);
    questionsAsked = [];
    sessionData = { answers: [], currentQuestionStart: 0, timer: null, timeRemaining: 120, longHesitations: 0, veryFastAnswers: 0 };
}

document.getElementById('btn-restart').addEventListener('click', () => switchView('role-selection'));
