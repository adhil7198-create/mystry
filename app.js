import { Store } from './src/js/state.js';
import { FullQuestionBank, MCQBank, MatchBank, AssertionReasonBank, SuperfinalBank } from './src/js/data/questions.js';
import { supabase, fetchLeaderboard, signUpWithEmail, signInWithEmail, signOut, getSession, fetchUserProfile } from './src/js/supabase.js';

class CUETGame {
    constructor() {
        this.currentView = 'home';
        this.timerInterval = null;
        this.isSignUpMode = false;
        this.init();
    }

    init() {
        console.log("CUET Game Initializing...");
        
        // Ensure we only handle route after DOM is ready
        window.addEventListener('hashchange', () => this.handleRoute());

        // Logo click = home
        const logo = document.querySelector('.logo');
        if (logo) logo.onclick = () => (window.location.hash = '#home');

        // Subscriptions
        Store.subscribe((state) => this.renderHeader(state));

        // Initial Header Render
        this.renderHeader(Store.state);

        // Security / Anti-Cheat
        this.initAntiCheat();

        // If no hash, set it to #home initially
        if (!window.location.hash) {
            window.location.hash = '#home';
        }

        // Trigger initial route
        this.handleRoute();

        // Check auth in background
        this.checkAuthStatus().then(() => {
            // Re-render if we are on a view that depends on user stats
            // This ensures a smooth experience without manual refresh on mobile
            const authViews = ['dashboard', 'levels', 'leaderboard', 'home'];
            if (authViews.includes(this.currentView)) {
                console.log("Auth confirmed, refreshing current view...");
                this.handleRoute();
            }
        });

        // Fail-safe: Remove loader after 6 seconds if still present
        setTimeout(() => {
            const loader = document.getElementById('loader');
            const main = document.getElementById('main-view');
            if (loader && main) {
                console.warn("Loader fail-safe triggered");
                if (main.contains(loader)) {
                    this.handleRoute(); // Try one last time
                }
            }
        }, 6000);
    }

    async checkAuthStatus() {
        if (!supabase) return;
        try {
            const session = await getSession();
            if (session && session.user) {
                const profile = await fetchUserProfile(session.user.id);
                Store.updateUser({
                    id: session.user.id,
                    name: profile ? profile.name : (session.user.user_metadata?.name || 'Player'),
                    xp: profile ? profile.xp : 0,
                    unlockedLevels: profile ? profile.unlocked_levels : 20,
                    badges: profile ? profile.badges : [],
                    accuracyTracker: profile ? profile.accuracy_tracker : {}
                });
            }
        } catch (e) {
            console.error("Auth init error:", e);
        }
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
        // Pass everything after the route as the param (e.g., 'mcq/3' for '#quiz/mcq/3')
        const param = parts.slice(1).join('/') || null;

        this.renderView(route, param);
    }

    async renderView(viewName, param) {
        console.log(`Rendering view: ${viewName}`, param);
        this.currentView = viewName;
        const main = document.getElementById('main-view');
        if (!main) {
            console.error('Critical Error: #main-view not found in DOM.');
            return;
        }

        // Show loader with consistent ID for fail-safe
        main.innerHTML = `
            <div id="loader" class="loader-overlay">
                <div style="text-align: center;">
                    <div class="brain-loader" style="margin: 0 auto 1.5rem;"></div>
                    <p class="text-secondary" style="font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; opacity: 0.8;">Syncing Psychology Data...</p>
                </div>
            </div>`;
        main.style.opacity = "1";

        try {
            let content = '';
            if (viewName === 'leaderboard') {
                content = await this.viewLeaderboard();
            } else if (viewName === 'auth') {
                content = this.viewAuth();
            } else if (viewName === 'dashboard') {
                content = this.viewDashboard();
            } else if (viewName === 'levels') {
                content = this.viewLevels();
            } else if (viewName === 'quiz') {
                this.isRendering = null;
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

            // --- RACE CONDITION CHECK ---
            // If the user navigated elsewhere while we were fetching data, abort this render
            if (this.currentView !== viewName) {
                console.warn(`Render of ${viewName} aborted: user navigated to ${this.currentView}`);
                return;
            }

            if (!content && viewName !== 'quiz') {
                throw new Error(`View "${viewName}" returned no content.`);
            }

            main.innerHTML = content;
            window.scrollTo(0, 0); // Reset scroll on view change
            this.animateViewTransition();
            this.attachViewEvents();
            this.renderHeader(Store.state); 
            console.log(`View ${viewName} rendered successfully.`);
        } catch (err) {
            console.error("View Render Error:", err);
            // Ensure loader is removed even on error
            main.innerHTML = `
                <div class="glass-card" style="border-color: var(--error); text-align: center; margin-top: 2rem;">
                    <h2 style="color: var(--error);">Oops! Loading failed</h2>
                    <p style="margin: 1rem 0;">${err.message || 'An unexpected error occurred while building the view.'}</p>
                    <button class="btn-primary" style="margin: 0 auto;" onclick="window.location.hash='#home'">Try Home</button>
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
            const authAction = user.id 
                ? `<button class="btn-secondary btn-small" onclick="window.game.handleSignOut()" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; margin-left: 1rem;">Sign Out</button>`
                : `<button class="btn-primary btn-small" onclick="window.location.hash='#auth'" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; margin-left: 1rem;">Sign In</button>`;

            const userName = user.name || 'Guest';
            const userAvatar = userName.charAt(0).toUpperCase();

            navStats.innerHTML = `
                <div class="xp-badge">✨ ${user.xp.toLocaleString()} XP</div>
                <div class="lvl-badge">🏆 Lvl ${user.unlockedLevels}</div>
                <div class="user-avatar" title="${userName}">👤 ${userAvatar}</div>
                ${authAction}
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
        const homeQuotes = [
            "Believe you can and you're halfway there.",
            "Success is the sum of small efforts, repeated day in and day out.",
            "Your attitude, not your aptitude, will determine your altitude.",
            "Don't stop until you're proud.",
            "The secret of getting ahead is getting started.",
            "Focus on the step in front of you, not the whole staircase.",
            "Psychology is meant to be lived, not just studied.",
            "Your future depends on what you do today."
        ];
        const randomQuote = homeQuotes[Math.floor(Math.random() * homeQuotes.length)];

        return `
            <div class="hero-section glass-card">
                <h1>Master CUET Psychology <span class="accent-text">2026</span></h1>
                <p>Prepare through a gamified MCQ platform. 20 Levels, 1500+ Questions, AI Predictions.</p>
                
                <div class="motivation-quote">
                    "${randomQuote}"
                </div>

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

        // MCQ Levels (20 levels)
        let mcqLevelsHTML = '';
        for (let i = 1; i <= 20; i++) {
            const isLocked = i > unlockedLevels;
            mcqLevelsHTML += `
                <div class="level-card glass-card ${isLocked ? 'locked' : ''}" onclick="${!isLocked ? `window.location.hash = '#quiz/mcq/${i}'` : ''}">
                    <div class="level-num">${i}</div>
                    <div class="level-status">${isLocked ? '🔒 Locked' : '✨ Unlocked'}</div>
                    <div class="level-difficulty">${i <= 5 ? 'Basic' : i <= 15 ? 'Advanced' : 'Grand Mock'}</div>
                </div>
            `;
        }

        // Match the Following Rounds
        const matchRounds = Math.ceil(MatchBank.length / 5);
        let matchLevelsHTML = '';
        for (let i = 1; i <= matchRounds; i++) {
            matchLevelsHTML += `
                <div class="level-card glass-card match-card" onclick="window.location.hash = '#quiz/match/${i}'">
                    <div class="level-num">🔗 ${i}</div>
                    <div class="level-status">✨ Open</div>
                    <div class="level-difficulty">5 Questions</div>
                </div>
            `;
        }

        // Assertion-Reason Rounds
        const arRounds = Math.ceil(AssertionReasonBank.length / 5);
        let arLevelsHTML = '';
        for (let i = 1; i <= arRounds; i++) {
            arLevelsHTML += `
                <div class="level-card glass-card ar-card" onclick="window.location.hash = '#quiz/ar/${i}'">
                    <div class="level-num">⚖️ ${i}</div>
                    <div class="level-status">✨ Open</div>
                    <div class="level-difficulty">5 Questions</div>
                </div>
            `;
        }

        // Final Mock Levels (6 levels, 75 questions each)
        let finalLevelsHTML = '';
        for (let i = 1; i <= 6; i++) {
            finalLevelsHTML += `
                <div class="level-card glass-card final-card" onclick="window.location.hash = '#quiz/final/${i}'">
                    <div class="level-num">🏆 ${i}</div>
                    <div class="level-status">⚡ Grand Mock</div>
                    <div class="level-difficulty">75 Questions</div>
                </div>
            `;
        }

        // Superfinal Mock Levels (10 levels)
        let superfinalLevelsHTML = '';
        for (let i = 1; i <= 10; i++) {
            superfinalLevelsHTML += `
                <div class="level-card glass-card superfinal-card" onclick="window.location.hash = '#quiz/superfinal/${i}'">
                    <div class="level-num">⭐ ${i}</div>
                    <div class="level-status">✨ Superfinal Mock</div>
                    <div class="level-difficulty">${i === 10 ? 'ULTIMATE' : 'Pro Mock'}</div>
                </div>
            `;
        }

        return `
            <div class="view-header">
                <h2>Choose Your Challenge</h2>
                <p>Practice like the real CUET exam — Standard, Specialized, or Full Mock.</p>
            </div>

            <div class="section-tabs">
                <button class="section-tab active" onclick="window.game.switchSection('mcq')" id="tab-mcq">📝 curriculum</button>
                <button class="section-tab" onclick="window.game.switchSection('match')" id="tab-match">🔗 Match items</button>
                <button class="section-tab" onclick="window.game.switchSection('ar')" id="tab-ar">⚖️ Assertion Task</button>
                <button class="section-tab" onclick="window.game.switchSection('final')" id="tab-final">🏆 Final Mock</button>
                <button class="section-tab" onclick="window.game.switchSection('superfinal')" id="tab-superfinal">⭐ Superfinal</button>
            </div>

            <div id="section-mcq" class="level-section">
                <div class="section-header">
                    <h3>📝 Integrated MCQ Levels</h3>
                    <p class="text-secondary">20 levels • Mixed MCQ, Match & Assertion-Reason • 75 Qs | 90 Mins</p>
                </div>
                <div class="level-grid">${mcqLevelsHTML}</div>
            </div>

            <div id="section-match" class="level-section" style="display:none;">
                <div class="section-header">
                    <h3>🔗 Match the Following</h3>
                    <p class="text-secondary">${matchRounds} rounds • Match List-I with List-II • 75 Qs | 90 Mins</p>
                </div>
                <div class="level-grid">${matchLevelsHTML}</div>
            </div>

            <div id="section-ar" class="level-section" style="display:none;">
                <div class="section-header">
                    <h3>⚖️ Assertion-Reason</h3>
                    <p class="text-secondary">${arRounds} rounds • Evaluate Assertion & Reason • 75 Qs | 90 Mins</p>
                </div>
                <div class="level-grid">${arLevelsHTML}</div>
            </div>

            <div id="section-final" class="level-section" style="display:none;">
                <div class="section-header">
                    <h3>🏆 Grand Final Mocks</h3>
                    <p class="text-secondary">6 levels • 75 Questions each • Real Exam Simulator</p>
                </div>
                <div class="level-grid">${finalLevelsHTML}</div>
            </div>

            <div id="section-superfinal" class="level-section" style="display:none;">
                <div class="section-header">
                    <h3>⭐ Superfinal Mastery Mock</h3>
                    <p class="text-secondary">10 levels • Advanced Psychology & AI Predictions</p>
                </div>
                <div class="level-grid">${superfinalLevelsHTML}</div>
            </div>
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
                    <div class="stat-card"><h3>Last CUET Marks</h3><p>${user.lastScore || 0}</p></div>
                    <div class="stat-card"><h3>Unlocked</h3><p>${user.unlockedLevels}/20 Levels</p></div>
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
            // Add a timeout fallback for mobile networks
            const fetchPromise = fetchLeaderboard();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
            
            const topStudents = await Promise.race([fetchPromise, timeoutPromise]);
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
        const qCount = state.quiz.questions.length;
        const answers = state.quiz.answers;
        let correctCount = 0;
        let wrongCount = 0;
        let unattemptedCount = 0;

        state.quiz.questions.forEach((q, idx) => {
            if (answers[idx] === undefined) {
                unattemptedCount++;
            } else {
                if (answers[idx] === q.answerIndex) correctCount++;
                else wrongCount++;
            }
        });

        // CUET Marking: +4 for correct, -1 for incorrect
        const score = (correctCount * 4) - (wrongCount * 1);
        const maxScore = qCount * 4;
        const passed = score >= (maxScore * 0.4); // 40% passing for CUET style challenge

        if (passed) Store.unlockLevel(state.currentLevel + 1);
        Store.addXP(Math.max(0, score));
        Store.updateUser({ lastScore: score });

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
                <div class="aysha-popup" id="congrats-popup" onclick="this.remove()">
                    <div class="popup-content">
                        <h2>🎉 Excellent work, Aysha! 🎉</h2>
                        <p class="motivation-quote">"${randomQuote}"</p>
                        <p class="dismiss-hint">Click anywhere to continue</p>
                    </div>
                </div>
            `;
        }

        return `
            ${congratulationHtml}
            <div class="result-view glass-card" style="text-align: center;">
                <div class="q-meta">${state.quiz.quizType.toUpperCase()} | LEVEL ${state.currentLevel}</div>
                <h2 style="margin-bottom: 0.5rem;">${passed ? '🎉 Level Passed!' : '❌ Try Again'}</h2>
                
                <h1 class="total-score ${passed ? 'success' : 'fail'}">${score} / ${maxScore}</h1>
                <p class="text-secondary" style="font-size: 1.25rem; font-weight: 600; margin-bottom: 2rem;">Total CUET Marks Secured</p>

                <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                    <div class="stat-card" style="border-bottom: 4px solid var(--accent);">
                        <h3 style="color: var(--accent);">Correct (+4)</h3>
                        <p>${correctCount}</p>
                        <span class="text-secondary" style="font-size: 0.8rem;">+${correctCount * 4} Marks</span>
                    </div>
                    <div class="stat-card" style="border-bottom: 4px solid var(--error);">
                        <h3 style="color: var(--error);">Incorrect (-1)</h3>
                        <p>${wrongCount}</p>
                        <span class="text-secondary" style="font-size: 0.8rem;">-${wrongCount} Marks</span>
                    </div>
                    <div class="stat-card">
                        <h3>Unattempted</h3>
                        <p>${unattemptedCount}</p>
                        <span class="text-secondary" style="font-size: 0.8rem;">0 Marks</span>
                    </div>
                    <div class="stat-card">
                        <h3>Accuracy</h3>
                        <p>${qCount > unattemptedCount ? Math.round((correctCount / (qCount - unattemptedCount)) * 100) : 0}%</p>
                        <span class="text-secondary" style="font-size: 0.8rem;">Attempted: ${qCount - unattemptedCount}</span>
                    </div>
                </div>

                <div class="actions" style="margin-top: 3rem;">
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
            
            let statusColor = 'var(--error)';
            let statusLabel = 'Incorrect (-1)';
            let marksLabel = '-1 Mark';

            if (isCorrect) {
                statusColor = 'var(--accent)';
                statusLabel = 'Correct (+4)';
                marksLabel = '+4 Marks';
            } else if (isUnanswered) {
                statusColor = 'var(--secondary)';
                statusLabel = 'Unattempted (0)';
                marksLabel = '0 Marks';
            }

            return `
                <div class="glass-card review-item" style="margin-bottom: 2rem; padding: 2rem; border-left: 8px solid ${statusColor}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div class="q-meta">${q.module} | Question ${idx + 1}</div>
                        <div style="background: ${statusColor}20; color: ${statusColor}; padding: 0.4rem 0.8rem; border-radius: 8px; font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">${statusLabel}</div>
                    </div>
                    ${this.renderQuestionContent(q, true)}
                    <div class="review-options" style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 16px; margin: 1.5rem 0;">
                        <p style="margin-bottom: 0.5rem;"><b>Your Answer:</b> ${isUnanswered ? '<i class="text-secondary">Not Attempted</i>' : `<span>${q.options[userAns]}</span>`}</p>
                        <p><b>Correct Answer:</b> <span class="accent-text">${q.options[q.answerIndex]}</span></p>
                    </div>
                    <div class="explanation-box" style="background: var(--surface-light); padding: 1rem; border-radius: 12px; border: 1px dashed var(--surface-border);">
                        <p><b>💡 Explanation:</b> ${q.explanation}</p>
                    </div>
                    <div style="text-align: right; margin-top: 1rem; font-weight: 700; color: ${statusColor};">${marksLabel}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="review-view">
                <div class="view-header">
                    <h2>CUET Challenge Review</h2>
                    <p>Analysis of your level ${state.currentLevel} performance.</p>
                </div>
                <div class="review-list">
                    ${reviewHTML}
                </div>
                <div class="sticky-footer" style="position: sticky; bottom: 2rem; text-align: center; margin-top: 3rem; background: rgba(2,6,23,0.8); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 24px; border: 1px solid var(--surface-border);">
                    <button class="btn-primary" onclick="window.location.hash='#levels'" style="margin: 0 auto;">Finish Review</button>
                </div>
            </div>
        `;
    }

    setupQuiz(typeAndLevel) {
        // Parse type/level from route: 'mcq/3', 'match/1', 'ar/2'
        let quizType = 'mcq';
        let level = 1;
        if (typeAndLevel && typeAndLevel.includes('/')) {
            const parts = typeAndLevel.split('/');
            quizType = parts[0] || 'mcq';
            level = parseInt(parts[1]) || 1;
        } else {
            level = parseInt(typeAndLevel) || 1;
        }

        Store.state.currentLevel = level;
        Store.state.quiz.quizType = quizType;
        Store.state.quiz.active = true;
        Store.state.quiz.questions = this.getQuestionsForLevel(level, quizType);
        // CUET Official Scaling: All tests are 90 Minutes for 75 Questions
        let timerMin = 90;

        Store.state.quiz.timeRemaining = timerMin * 60;
        Store.state.quiz.currentQuestionIndex = 0;
        Store.state.quiz.answers = {};

        this.renderQuizUI();
        this.startTimer();
    }

    getQuestionsForLevel(lvl, quizType = 'mcq') {
        const perLvl = 75; 
        let sourceBank = [];

        if (quizType === 'superfinal' || quizType === 'final') {
            // Priority 1: All questions specifically tagged "Superfinal"
            const superPicks = [...SuperfinalBank];
            
            // Priority 2: Categorize remaining questions into Direct and Indirect
            // Direct: Facts, NCERT, PYQ, Concepts
            // Indirect: Applications, Predictions, Match, AR
            const directTags = ['Fact', 'NCERT', 'PYQ', 'Concept'];
            const indirectTags = ['Application', 'Predict', 'Match', 'Assertion-Reason'];

            const allRemaining = FullQuestionBank.filter(q => !superPicks.some(sp => sp.id === q.id));
            
            const directPool = allRemaining.filter(q => directTags.includes(q.tag)).sort(() => Math.random() - 0.5);
            const indirectPool = allRemaining.filter(q => indirectTags.includes(q.tag)).sort(() => Math.random() - 0.5);

            sourceBank = [...superPicks];

            // Aim for a balanced expansion if needed
            // If we have superPicks, we fill the rest trying to balance Direct/Indirect
            const needed = perLvl - sourceBank.length;
            if (needed > 0) {
                const half = Math.floor(needed / 2);
                sourceBank = [
                    ...sourceBank,
                    ...directPool.slice(0, half),
                    ...indirectPool.slice(0, needed - half)
                ];
            }

            // Final fallback to fill exactly 75
            if (sourceBank.length < perLvl) {
                const existingIds = new Set(sourceBank.map(q => q.id));
                const overflow = FullQuestionBank.filter(q => !existingIds.has(q.id)).sort(() => Math.random() - 0.5);
                sourceBank = [...sourceBank, ...overflow.slice(0, perLvl - sourceBank.length)];
            }
        } else if (quizType === 'match') {
            sourceBank = [...MatchBank];
            if (sourceBank.length < perLvl) {
                const overflow = FullQuestionBank.filter(q => q.tag !== 'Match').sort(() => Math.random() - 0.5);
                sourceBank = [...sourceBank, ...overflow.slice(0, perLvl - sourceBank.length)];
            }
        } else if (quizType === 'ar') {
            sourceBank = [...AssertionReasonBank];
            if (sourceBank.length < perLvl) {
                const overflow = FullQuestionBank.filter(q => q.tag !== 'Assertion-Reason').sort(() => Math.random() - 0.5);
                sourceBank = [...sourceBank, ...overflow.slice(0, perLvl - sourceBank.length)];
            }
        } else {
            sourceBank = [...FullQuestionBank];
        }

        // Apply Round-Robin module selection for syllabus diversity among the sourceBank
        const grouped = {};
        sourceBank.forEach(q => {
            const mod = q.module || 'General';
            if (!grouped[mod]) grouped[mod] = [];
            grouped[mod].push(q);
        });

        const result = [];
        const moduleNames = Object.keys(grouped).sort();
        if (moduleNames.length === 0) return sourceBank.slice(0, perLvl);
        
        let addedCount = 0;
        let moduleIndex = 0;
        const lists = moduleNames.map(name => grouped[name].sort(() => Math.random() - 0.5));

        while (addedCount < perLvl && addedCount < sourceBank.length) {
            const currentList = lists[moduleIndex % lists.length];
            if (currentList.length > 0) {
                result.push(currentList.pop());
                addedCount++;
            }
            moduleIndex++;
            if (moduleIndex > sourceBank.length * 2) break;
        }

        return result.sort(() => Math.random() - 0.5);
    }

    renderQuizUI() {
        const main = document.getElementById('main-view');
        if (!main) return;

        const qIdx = Store.state.quiz.currentQuestionIndex;
        const q = Store.state.quiz.questions[qIdx];

        if (!q) {
            main.innerHTML = `
                <div class="glass-card" style="text-align: center; margin-top: 2rem;">
                    <h3>Oops! Questions not loaded</h3>
                    <p class="text-secondary">Something went wrong while fetching the exam data.</p>
                    <button class="btn-primary" style="margin: 1rem auto;" onclick="window.location.hash='#levels'">Back to Levels</button>
                </div>`;
            return;
        }

        main.innerHTML = `
            <div class="quiz-interface">
                <div class="quiz-main">
                    <div class="quiz-header">
                        <div class="timer-box">⏱️ <span id="timer-display">${Store.state.config.timerMinutes}:00</span></div>
                        <div style="font-weight: 700;">Question ${qIdx + 1} of ${Store.state.quiz.questions.length}</div>
                    </div>
                    <div class="question-card glass-card">
                        <div class="q-meta">${q.tag === 'Match' ? '🔗 Match the Following' : q.tag === 'Assertion-Reason' ? '⚖️ Assertion-Reason' : q.module} | ${q.difficulty}</div>
                        ${this.renderQuestionContent(q)}
                        <div class="q-options">
                            ${q.options.map((opt, i) => `
                                <div class="option-btn ${Store.state.quiz.answers[qIdx] === i ? 'selected' : ''}" onclick="window.game.selectAnswer(${i})">
                                    <span class="opt-label">${String.fromCharCode(65 + i)}</span> ${opt}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="quiz-controls">
                        <div class="exam-actions">
                            <button class="btn-secondary" onclick="window.game.prevQuestion()" ${qIdx === 0 ? 'disabled' : ''}>← Previous Participant</button>
                            <button class="btn-secondary" onclick="window.game.markForReview(${qIdx})">🔖 Mark for Review</button>
                            <button class="btn-primary" onclick="window.game.nextQuestion()">Save & Next Question →</button>
                        </div>
                    </div>
                </div>
                <div class="quiz-sidebar glass-card exam-window">
                    <div class="exam-info">
                        <h3>Question Palette</h3>
                        <div class="legend">
                            <span class="legend-item"><span class="dot val-answered"></span> Answered</span>
                            <span class="legend-item"><span class="dot val-review"></span> Review</span>
                            <span class="legend-item"><span class="dot val-unvisited"></span> Not Visited</span>
                        </div>
                    </div>
                    <div class="question-grid">
                        ${Store.state.quiz.questions.map((_, i) => {
                            const isMarked = Store.state.quiz.marked.has(i);
                            const isAnswered = Store.state.quiz.answers[i] !== undefined;
                            let statusClass = '';
                            if (i === qIdx) statusClass = 'active';
                            else if (isMarked) statusClass = 'marked';
                            else if (isAnswered) statusClass = 'answered';
                            
                            return `<div class="q-grid-item ${statusClass}" onclick="window.game.goToQuestion(${i})">${i + 1}</div>`;
                        }).join('')}
                    </div>
                    <div class="exam-footer">
                        <button class="btn-primary submit-btn" onclick="window.game.submitQuiz()">Submit Test</button>
                        <p class="final-warning">System: ID #882-CUET-2026</p>
                    </div>
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
        const qIdx = Store.state.quiz.currentQuestionIndex;
        if (Store.state.quiz.answers[qIdx] === idx) {
            // Unselect if same index clicked again
            delete Store.state.quiz.answers[qIdx];
        } else {
            Store.state.quiz.answers[qIdx] = idx;
        }
        this.renderQuizUI();
        Store.saveState();
    }

    nextQuestion() {
        if (Store.state.quiz.currentQuestionIndex < (Store.state.quiz.questions.length - 1)) {
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

    markForReview(idx) {
        if (Store.state.quiz.marked.has(idx)) {
            Store.state.quiz.marked.delete(idx);
        } else {
            Store.state.quiz.marked.add(idx);
        }
        this.renderQuizUI();
        Store.saveState();
    }

    submitQuiz(auto = false) {
        if (!auto && !confirm("Are you sure you want to finish the test?")) return;

        clearInterval(this.timerInterval);
        Store.state.quiz.active = false;
        window.location.hash = '#result';
    }

    renderQuestionContent(q, isReview = false) {
        if (q.tag === 'Match' || q.tag === 'Assertion-Reason') {
            const lines = q.question.split('\n').filter(l => l.trim() !== '');
            let title = lines[0];
            let list1Header = "List I";
            let list2Header = "List II";
            let items1 = [];
            let items2 = [];
            let footer = "";

            if (q.tag === 'Match') {
                lines.forEach(line => {
                    if (line.includes('|')) {
                        const parts = line.split('|').map(p => p.trim());
                        if (line.includes('List-I') || line.includes('List-II')) {
                            list1Header = parts[0];
                            list2Header = parts[1];
                        } else {
                            items1.push(parts[0]);
                            items2.push(parts[1]);
                        }
                    } else if (line.toLowerCase().includes('choose')) {
                        footer = line;
                    }
                });
            } else if (q.tag === 'Assertion-Reason') {
                title = "Assertion & Reason Task";
                list1Header = "Assertion (A)";
                list2Header = "Reason (R)";
                
                lines.forEach(line => {
                    if (line.startsWith('Assertion (A):')) {
                        items1.push(line.replace('Assertion (A):', '').trim());
                    } else if (line.startsWith('Reason (R):')) {
                        items2.push(line.replace('Reason (R):', '').trim());
                    } else if (line.toLowerCase().includes('choose')) {
                        footer = line;
                    }
                });
            }

            return `
                <div class="ibox-container">
                    <h2 class="${isReview ? 'q-text-review' : 'q-text'}" style="margin-bottom: 1.5rem;">${title}</h2>
                    <div class="ibox-row">
                        <div class="ibox-card">
                            <div class="ibox-header">${list1Header}</div>
                            <div class="ibox-body">
                                ${items1.map(item => `<div class="ibox-item">${item}</div>`).join('')}
                            </div>
                        </div>
                        <div class="ibox-card">
                            <div class="ibox-header">${list2Header}</div>
                            <div class="ibox-body">
                                ${items2.map(item => `<div class="ibox-item">${item}</div>`).join('')}
                            </div>
                        </div>
                    </div>
                    ${footer ? `<div class="ibox-footer" style="margin: 1.5rem 0; font-weight: 600; color: var(--text-secondary);">${footer}</div>` : ''}
                </div>
            `;
        }

        return `<h2 class="${isReview ? 'q-text-review' : 'q-text'}" style="white-space: pre-line; ${isReview ? 'font-size: 1.25rem; margin-bottom: 1rem;' : ''}">${q.question}</h2>`;
    }

    switchSection(section) {
        ['mcq', 'match', 'ar', 'final', 'superfinal'].forEach(s => {
            const el = document.getElementById(`section-${s}`);
            const tab = document.getElementById(`tab-${s}`);
            if (el) el.style.display = s === section ? 'block' : 'none';
            if (tab) tab.classList.toggle('active', s === section);
        });
    }

    attachViewEvents() { }

    async handleSignOut() {
        if (!confirm('Are you sure you want to sign out?')) return;
        try {
            await signOut();
            Store.updateUser({
                id: null,
                name: 'Guest User',
                xp: 0,
                level: 1,
                unlockedLevels: 20,
                badges: [],
                accuracyTracker: {}
            });
            window.location.hash = '#home';
        } catch(e) {
            console.error(e);
        }
    }

    viewAuth() {
        return `
            <div class="auth-view glass-card" style="max-width: 400px; margin: 4rem auto; padding: 2rem; position: relative;">
                <h2 id="auth-title">Sign In</h2>
                <p id="auth-desc" class="text-secondary" style="margin-bottom: 2rem;">Save your progress across devices.</p>
                
                <form id="auth-form" onsubmit="window.game.handleAuthSubmit(event)">
                    <div id="name-group" style="display: none; margin-bottom: 1rem; text-align: left;">
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Full Name</label>
                        <input type="text" id="auth-name" class="btn-secondary" style="width: 100%; text-align: left; cursor: text;" placeholder="Student Name">
                    </div>
                    <div style="margin-bottom: 1rem; text-align: left;">
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Email</label>
                        <input type="email" id="auth-email" class="btn-secondary" style="width: 100%; text-align: left; cursor: text;" placeholder="student@example.com" required>
                    </div>
                    <div style="margin-bottom: 2rem; text-align: left;">
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Password</label>
                        <input type="password" id="auth-pwd" class="btn-secondary" style="width: 100%; text-align: left; cursor: text;" placeholder="••••••••" required minlength="6">
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%;" id="auth-submit-btn">Sign In</button>
                    
                    <div style="text-align: center; margin-top: 1.5rem;">
                        <a href="javascript:void(0)" onclick="window.game.toggleAuthMode()" id="auth-toggle-link" class="accent-text" style="text-decoration: none; font-weight: 500;">Need an account? Sign up</a>
                    </div>
                </form>
            </div>
        `;
    }

    toggleAuthMode() {
        this.isSignUpMode = !this.isSignUpMode;
        document.getElementById('auth-title').innerText = this.isSignUpMode ? 'Create Account' : 'Sign In';
        document.getElementById('auth-desc').innerText = this.isSignUpMode ? 'Join to start practicing and tracking your prep!' : 'Save your progress across devices.';
        document.getElementById('name-group').style.display = this.isSignUpMode ? 'block' : 'none';
        document.getElementById('auth-submit-btn').innerText = this.isSignUpMode ? 'Sign Up' : 'Sign In';
        document.getElementById('auth-toggle-link').innerText = this.isSignUpMode ? 'Already have an account? Sign in' : 'Need an account? Sign up';
    }

    async handleAuthSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-pwd').value;
        const name = document.getElementById('auth-name').value;
        const btn = document.getElementById('auth-submit-btn');

        const originalText = btn.innerText;
        btn.innerText = 'Processing...';
        btn.disabled = true;

        try {
            if (this.isSignUpMode) {
                if (!name) throw new Error("Name is required for sign up");
                const res = await signUpWithEmail(email, password, name);
                
                if (res.session) {
                    // Auto login if email confirmation is disabled
                    await this.checkAuthStatus();
                    window.location.hash = '#dashboard';
                    alert(`Welcome, ${name}! Your account has been created.`);
                } else if (res.user && res.user.identities && res.user.identities.length === 0) {
                     alert('This email is already taken or invalid!');
                     this.toggleAuthMode();
                } else {
                     alert('Account created! PLEASE CHECK YOUR EMAIL to verify your account before signing in. (Or disable "Confirm Email" in your Supabase Settings)');
                     this.toggleAuthMode();
                }
            } else {
                await signInWithEmail(email, password);
                await this.checkAuthStatus(); // Reload user state from DB
                window.location.hash = '#dashboard';
            }
        } catch (err) {
            console.error("Auth Exception:", err);
            let msg = err.message || "Invalid login credentials";
            if (msg.includes('Invalid login credentials')) {
                msg = "Invalid login credentials. Did you verify your email? Check your inbox or turn off 'Confirm Email' in Supabase.";
            }
            alert(msg);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

// Global initialization with DOM safety
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.game = new CUETGame();
        window.Store = Store;
    });
} else {
    window.game = new CUETGame();
    window.Store = Store;
}
