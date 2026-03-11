import { syncUserProgress } from './supabase.js';

export const INITIAL_STATE = {
    user: {
        id: null,
        name: 'Guest User',
        xp: 0,
        level: 1,
        unlockedLevels: 1,
        badges: [],
        accuracyTracker: {}
    },
    currentLevel: null,
    quiz: {
        active: false,
        questions: [],
        answers: {},
        marked: new Set(),
        startTime: null,
        timeRemaining: 0,
        currentQuestionIndex: 0
    },
    config: {
        timerMinutes: 90,
        questionsPerLevel: 75,
        passingScore: 50
    }
};

class StateManager {
    constructor() {
        this.state = this.loadState();
        this.listeners = [];
    }

    loadState() {
        const saved = localStorage.getItem('psych_mastery_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            parsed.config = { ...INITIAL_STATE.config };
            return parsed;
        }
        return { ...INITIAL_STATE };
    }

    saveState() {
        localStorage.setItem('psych_mastery_state', JSON.stringify(this.state));
        this.notify();
        this.syncToSupabase();
    }

    async syncToSupabase() {
        if (this.state.user && this.state.user.id) {
            await syncUserProgress(this.state.user);
        }
    }

    updateUser(updates) {
        this.state.user = { ...this.state.user, ...updates };
        this.saveState();
    }

    unlockLevel(level) {
        if (level > this.state.user.unlockedLevels) {
            this.state.user.unlockedLevels = level;
            this.saveState();
        }
    }

    addXP(amount) {
        this.state.user.xp += amount;
        this.saveState();
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => (this.listeners = this.listeners.filter(l => l !== callback));
    }

    notify() {
        this.listeners.forEach(callback => callback(this.state));
    }

    resetQuiz() {
        this.state.quiz = {
            active: false,
            questions: [],
            answers: {},
            marked: new Set(),
            startTime: null,
            timeRemaining: 0,
            currentQuestionIndex: 0
        };
        this.saveState();
    }
}

export const Store = new StateManager();
