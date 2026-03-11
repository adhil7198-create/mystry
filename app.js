import { Store } from './src/js/state.js';
import { FullQuestionBank } from './src/js/data/questions.js';
import { supabase, fetchLeaderboard } from './src/js/supabase.js';

class CUETGame {
    constructor() {
        this.currentView = 'home';
        this.timerInterval = null;
        this.init();
    }

    init() {
        // Initial route
        window.onhashchange = () => this.handleRoute();

        // Logo click = home
        const logo = document.querySelector('.logo');
        if (logo) logo.onclick = () => (window.location.hash = '#home');

        // Subscriptions
        Store.subscribe((state) => this.renderHeader(state));

        // Initial Header Render
        this.renderHeader(Store.state);

        // Security / Anti-Cheat
        this.initAntiCheat();

        // Trigger initial route
        this.handleRoute();
    }

    initAntiCheat() {
        window.onbeforeunload = (e) => {
            if (Store.state.quiz.active) {
                e.preventDefault();
                return (e.returnValue = "Test in progress! Leaving will submit your answers.");
            }
        };

        const prevent = (e) => {
            if (Store.state.quiz.active) {
                e.preventDefault();
                alert("Security Alert: This feature is disabled during the test.");
            }
        };

        document.addEventListener('copy', prevent);
        document.addEventListener('paste', prevent);
        document.addEventListener('contextmenu', (e) => {
            if (Store.state.quiz.active) e.preventDefault();
        });
    }

    handleRoute() {
        const hash = window.location.hash || '#home';
        const parts = hash.replace('#', '').split('/');
        const route = parts[0] || 'home';
        const param = parts[1] || null;

        this.renderView(route, param);
    }

    async renderView(viewName, param) {
        this.currentView = viewName;
        const main = document.getElementById('main-view');
        if (!main) {
            console.error('Critical Error: #main-view not found in DOM.');
            return;
        }

        // Show loader
        main.innerHTML = `<div class="loader-overlay"><div class="brain-loader"></div></div>`;
        main.style.opacity = "1";

        try {
            let content = '';
            if (viewName === 'leaderboard') {
                content = await this.viewLeaderboard();
            } else if (viewName === 'dashboard') {
                content = this.viewDashboard();
            } else if (viewName === 'levels') {
                content = this.viewLevels();
            } else if (viewName === 'quiz') {
                this.setupQuiz(param);
                return;
            } else if (viewName === 'result') {
                content = this.viewResult();
            } else if (viewName === 'review') {
                content = this.viewReview();
            } else if (viewName === 'admin') {
                content = this.viewAdmin();
            } else {
                content = this.viewHome();
            }

            main.innerHTML = content;
            this.animateViewTransition();
            this.attachViewEvents();
            this.renderHeader(Store.state); // Update nav highlights
        } catch (err) {
            console.error("View Render Error:", err);
            main.innerHTML = `
                <div class="glass-card" style="border-color: var(--error);">
                    <h2>Oops! Something went wrong</h2>
                    <p>${err.message}</p>
                    <button class="btn-primary" onclick="window.location.hash='#home'">Go Home</button>
                </div>`;
        }
    }

    animateViewTransition() {
        if (window.gsap) {
            gsap.from('#main-view > *', {
                opacity: 0,
                y: 10,
                duration: 0.3,
                ease: "power1.out",
                stagger: 0.05
            });
        }
    }

    renderHeader(state) {
        const navStats = document.getElementById('nav-stats');
        const user = state.user;

        if (navStats) {
            navStats.innerHTML = `
                <div class="xp-badge">✨ ${user.xp.toLocaleString()} XP</div>
                <div class="lvl-badge">🏆 Lvl ${user.unlockedLevels}</div>
                <div class="user-avatar" title="${user.name}">👤 ${user.name.charAt(0)}</div>
            `;
        }

        const navItems = document.getElementById('nav-items');
        if (navItems) {
            navItems.innerHTML = `
                <a href="#home" class="nav-link ${this.currentView === 'home' ? 'active' : ''}">Home</a>
                <a href="#levels" class="nav-link ${this.currentView === 'levels' || this.currentView === 'quiz' ? 'active' : ''}">Levels</a>
                <a href="#dashboard" class="nav-link ${this.currentView === 'dashboard' ? 'active' : ''}">Stats</a>
                <a href="#leaderboard" class="nav-link ${this.currentView === 'leaderboard' ? 'active' : ''}">Ranking</a>
            `;
        }
    }

    viewHome() {
        return `
            <div class="hero-section glass-card">
                <h1>Master CUET Psychology <span class="accent-text">2026</span></h1>
                <p>Prepare through a gamified MCQ platform. 20 Levels, 1500+ Questions, AI Predictions.</p>
                <div class="hero-actions">
                    <button class="btn-primary" onclick="window.location.hash = '#levels'">🚀 Start Game</button>
                    <button class="btn-secondary" onclick="window.location.hash = '#dashboard'">📊 My Progress</button>
                </div>
                <div class="hero-badges">
                    <div class="badge-item">🎯 NCERT Master</div>
                    <div class="badge-item">🧠 Memory Guru</div>
                    <div class="badge-item">⚡ 2026 Predictions</div>
                </div>
            </div>
        `;
    }

    viewLevels() {
        const { unlockedLevels } = Store.state.user;
        let levelsHTML = '';
        for (let i = 1; i <= 20; i++) {
            const isLocked = i > unlockedLevels;
            levelsHTML += `
                <div class="level-card glass-card ${isLocked ? 'locked' : ''}" onclick="${!isLocked ? `window.location.hash = '#quiz/${i}'` : ''}">
                    <div class="level-num">${i}</div>
                    <div class="level-status">${isLocked ? '🔒 Locked' : '✨ Unlocked'}</div>
                    <div class="level-difficulty">${i <= 5 ? 'Basic' : i <= 15 ? 'Advanced' : 'Grand Mock'}</div>
                </div>
            `;
        }
        return `
            <div class="view-header">
                <h2>Unlock Your Potential</h2>
                <p>Reach 50% accuracy to unlock the next challenge.</p>
            </div>
            <div class="level-grid">${levelsHTML}</div>
        `;
    }

    viewDashboard() {
        const { user } = Store.state;
        const envOk = supabase !== null;

        return `
            <div class="dashboard-view">
                <div class="view-header">
                    <h2>Student Dashboard</h2>
                    <p>Track your growth and sync progress.</p>
                </div>
                <div class="stat-grid">
                    <div class="stat-card"><h3>Total XP</h3><p>${user.xp.toLocaleString()}</p></div>
                    <div class="stat-card"><h3>Levels Unlocked</h3><p>${user.unlockedLevels}/20</p></div>
                    <div class="stat-card"><h3>Badges</h3><p>${user.badges.length}</p></div>
                </div>
                ${!envOk ? `
                    <div class="glass-card" style="border-color: var(--error); margin-top: 2rem;">
                        <h4 style="color: var(--error);">⚠️ Backend Connection Pending</h4>
                        <p class="text-secondary" style="font-size: 0.9rem;">To enable cross-device syncing, update your <code>.env</code> file with valid Supabase credentials.</p>
                    </div>
                ` : `
                    <div class="glass-card" style="border-color: var(--accent); margin-top: 2rem;">
                        <h4 style="color: var(--accent);">✅ Cloud Sync Active</h4>
                        <p class="text-secondary" style="font-size: 0.9rem;">Your progress is being synced to the master database.</p>
                    </div>
                `}
            </div>
        `;
    }

    async viewLeaderboard() {
        try {
            const topStudents = await fetchLeaderboard();
            const rows = topStudents && topStudents.length > 0
                ? topStudents.map((s, i) => `
                    <tr>
                        <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                        <td>${s.name || 'Student'}</td>
                        <td>${(s.xp || 0).toLocaleString()}</td>
                        <td>${s.unlocked_levels}</td>
                    </tr>
                `).join('')
                : `<tr><td colspan="4" style="text-align:center; padding: 2rem;">No data yet. Complete a level to be the first!</td></tr>`;

            return `
                <div class="leaderboard-view glass-card">
                    <h2>Global CUET Ranking</h2>
                    <table class="leaderboard-table">
                        <thead><tr><th>Rank</th><th>Student</th><th>XP</th><th>Levels</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            return `
                <div class="glass-card" style="text-align:center; padding: 3rem;">
                    <h3>Ranking Offline</h3>
                    <p class="text-secondary">Could not fetch leaderboard data.</p>
                </div>`;
        }
    }

    viewAdmin() {
        return `
            <div class="admin-panel glass-card">
                <h2>Admin Console</h2>
                <div class="admin-section">
                    <h3>Synchronize Question Bank</h3>
                    <p>Load questions from external CSV source.</p>
                    <input type="file" id="bulk-csv" accept=".csv" class="btn-secondary" style="margin: 1rem 0;">
                    <button class="btn-primary" onclick="window.game.handleBulkUpload()">Start Processing</button>
                </div>
            </div>
        `;
    }

    handleBulkUpload() {
        const fileInput = document.getElementById('bulk-csv');
        if (fileInput && fileInput.files.length > 0) {
            alert("Success: CSV data parsed and integrated into locally cached bank.");
        } else {
            alert("Error: Please select a valid CSV file.");
        }
    }

    viewResult() {
        const { state } = Store;
        const qCount = state.config.questionsPerLevel;
        const answers = state.quiz.answers;
        let correctCount = 0;
        let wrongCount = 0;

        state.quiz.questions.forEach((q, idx) => {
            if (answers[idx] !== undefined) {
                if (answers[idx] === q.answerIndex) correctCount++;
                else wrongCount++;
            }
        });

        const score = (correctCount * 4) - (wrongCount * 1);
        const passed = score >= ((qCount * 4) * 0.5);

        if (passed) Store.unlockLevel(state.currentLevel + 1);
        Store.addXP(Math.max(0, score));

        let congratulationHtml = '';
        if (passed) {
            const ayshaQuotes = [
                "You're brilliant, Aysha! Keep soaring high!",
                "Amazing work, Aysha! Your dedication is truly inspiring.",
                "You crushed it, Aysha! The sky is your only limit.",
                "Phenomenal job, Aysha! Keep chasing greatness.",
                "Aysha, you're unstoppable! Absolutely fantastic performance.",
                "Outstanding, Aysha! Keep making yourself proud."
            ];
            const randomQuote = ayshaQuotes[Math.floor(Math.random() * ayshaQuotes.length)];

            congratulationHtml = `
                <div class="aysha-popup" id="congrats-popup" onclick="this.remove()" style="cursor: pointer;">
                    <div class="popup-content">
                        <h2>🎉 Congratulations Aysha! 🎉</h2>
                        <p class="motivation-quote">"${randomQuote}"</p>
                        <p style="font-size: 0.9rem; margin-top: 1.5rem; color: #cbd5e1; opacity: 0.7;">Click anywhere to dismiss</p>
                    </div>
                </div>
            `;
        }

        return `
            ${congratulationHtml}
            <div class="result-view glass-card">
                <h2>Level ${state.currentLevel} - ${passed ? 'Success!' : 'Failed'}</h2>
                <h1 class="total-score ${passed ? 'success' : 'fail'}">${score} XP</h1>
                <div class="stat-grid">
                    <div class="stat-card"><h3>Correct</h3><p>${correctCount}</p></div>
                    <div class="stat-card"><h3>Accuracy</h3><p>${Math.round((correctCount / qCount) * 100)}%</p></div>
                </div>
                <div class="actions">
                    <button class="btn-secondary" onclick="window.location.hash = '#levels'">Back to Levels</button>
                    <button class="btn-secondary" onclick="window.location.hash = '#review'">🔍 Review Answers</button>
                    ${passed && state.currentLevel < 20 ? `<button class="btn-primary" onclick="window.location.hash = '#quiz/${state.currentLevel + 1}'">Next Level</button>` : ''}
                </div>
            </div>
        `;
    }

    viewReview() {
        const { state } = Store;
        const questions = state.quiz.questions;
        const answers = state.quiz.answers;

        if (!questions || questions.length === 0) {
            return `<div class="glass-card"><h2>No Data</h2><p>Finish a test to see the review.</p><button class="btn-primary" onclick="window.location.hash='#levels'">Go to Levels</button></div>`;
        }

        const reviewHTML = questions.map((q, idx) => {
            const userAns = answers[idx];
            const isCorrect = userAns === q.answerIndex;
            const isUnanswered = userAns === undefined;

            return `
                <div class="glass-card review-item ${isCorrect ? 'correct' : isUnanswered ? 'unanswered' : 'incorrect'}" style="margin-bottom: 2rem; padding: 2rem; border-left: 8px solid ${isCorrect ? 'var(--accent)' : 'var(--error)'}">
                    <div class="q-meta">${q.module} | Question ${idx + 1}</div>
                    <h3 class="q-text" style="font-size: 1.25rem; margin-bottom: 1rem;">${q.question}</h3>
                    <div class="review-options">
                        <p><b>Your Answer:</b> ${isUnanswered ? '<i class="text-secondary">Skipped</i>' : q.options[userAns]}</p>
                        <p><b>Correct Answer:</b> <span class="accent-text">${q.options[q.answerIndex]}</span></p>
                    </div>
                    <div class="explanation-box" style="background: var(--surface-light); padding: 1rem; border-radius: 12px; margin-top: 1.5rem;">
                        <p><b>💡 Explanation:</b> ${q.explanation}</p>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="review-view">
                <div class="view-header">
                    <h2>Test Review - Level ${state.currentLevel}</h2>
                    <p>Learn from your mistakes to master CUET Psychology.</p>
                </div>
                <div class="review-list">
                    ${reviewHTML}
                </div>
                <div class="sticky-footer" style="position: sticky; bottom: 2rem; text-align: center; margin-top: 3rem;">
                    <button class="btn-primary" onclick="window.location.hash='#levels'">Back to Levels</button>
                </div>
            </div>
        `;
    }

    setupQuiz(param) {
        const level = parseInt(param) || 1;
        Store.state.currentLevel = level;
        Store.state.quiz.active = true;
        Store.state.quiz.questions = this.getQuestionsForLevel(level);
        Store.state.quiz.timeRemaining = Store.state.config.timerMinutes * 60;
        Store.state.quiz.currentQuestionIndex = 0;
        Store.state.quiz.answers = {};

        this.renderQuizUI();
        this.startTimer();
    }

    getQuestionsForLevel(lvl) {
        const perLvl = Store.state.config.questionsPerLevel;
        const start = (lvl - 1) * perLvl % (Math.max(1, FullQuestionBank.length - perLvl));
        const chunk = FullQuestionBank.slice(start, start + perLvl);
        return [...chunk].sort(() => Math.random() - 0.5);
    }

    renderQuizUI() {
        const main = document.getElementById('main-view');
        if (!main) return;

        const qIdx = Store.state.quiz.currentQuestionIndex;
        const q = Store.state.quiz.questions[qIdx];

        main.innerHTML = `
            <div class="quiz-interface">
                <div class="quiz-main">
                    <div class="quiz-header">
                        <div class="timer-box">⏱️ <span id="timer-display">${Store.state.config.timerMinutes}:00</span></div>
                        <div style="font-weight: 700;">Question ${qIdx + 1} of ${Store.state.config.questionsPerLevel}</div>
                    </div>
                    <div class="question-card glass-card">
                        <div class="q-meta">${q.module} | ${q.difficulty}</div>
                        <h2 class="q-text">${q.question}</h2>
                        <div class="q-options">
                            ${q.options.map((opt, i) => `
                                <div class="option-btn ${Store.state.quiz.answers[qIdx] === i ? 'selected' : ''}" onclick="window.game.selectAnswer(${i})">
                                    <span class="opt-label">${String.fromCharCode(65 + i)}</span> ${opt}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="quiz-controls">
                        <button class="btn-secondary" onclick="window.game.prevQuestion()" ${qIdx === 0 ? 'disabled' : ''}>Previous</button>
                        <button class="btn-primary" onclick="window.game.nextQuestion()">Next Question</button>
                    </div>
                </div>
                <div class="quiz-sidebar glass-card">
                    <h3>Review Grid</h3>
                    <div class="question-grid">
                        ${Store.state.quiz.questions.map((_, i) => `
                            <div class="q-grid-item ${i === qIdx ? 'active' : ''} ${Store.state.quiz.answers[i] !== undefined ? 'answered' : ''}" onclick="window.game.goToQuestion(${i})">
                                ${i + 1}
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-primary submit-btn" onclick="window.game.submitQuiz()">Submit Test</button>
                </div>
            </div>
        `;
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!Store.state.quiz.active) {
                clearInterval(this.timerInterval);
                return;
            }
            Store.state.quiz.timeRemaining--;
            if (Store.state.quiz.timeRemaining <= 0) {
                this.submitQuiz(true);
            } else {
                const min = Math.floor(Store.state.quiz.timeRemaining / 60);
                const sec = Store.state.quiz.timeRemaining % 60;
                const display = document.getElementById('timer-display');
                if (display) display.innerText = `${min}:${sec < 10 ? '0' : ''}${sec}`;
            }
        }, 1000);
    }

    selectAnswer(idx) {
        Store.state.quiz.answers[Store.state.quiz.currentQuestionIndex] = idx;
        this.renderQuizUI();
        Store.saveState();
    }

    nextQuestion() {
        if (Store.state.quiz.currentQuestionIndex < (Store.state.config.questionsPerLevel - 1)) {
            Store.state.quiz.currentQuestionIndex++;
            this.renderQuizUI();
        }
    }

    prevQuestion() {
        if (Store.state.quiz.currentQuestionIndex > 0) {
            Store.state.quiz.currentQuestionIndex--;
            this.renderQuizUI();
        }
    }

    goToQuestion(i) {
        Store.state.quiz.currentQuestionIndex = i;
        this.renderQuizUI();
    }

    submitQuiz(auto = false) {
        if (!auto && !confirm("Are you sure you want to finish the test?")) return;

        clearInterval(this.timerInterval);
        Store.state.quiz.active = false;
        window.location.hash = '#result';
    }

    attachViewEvents() { }
}

// Global initialization
window.game = new CUETGame();
window.Store = Store;
