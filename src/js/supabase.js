import { createClient } from '@supabase/supabase-js';

// --- Supabase Configuration ---
// These must be prefixed with VITE_ to be picked up by Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if variables are correctly configured and are valid URLs
const isConfigured = supabaseUrl &&
    supabaseUrl !== 'YOUR_SUPABASE_PROJECT_URL' &&
    supabaseUrl.startsWith('https://');

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

/**
 * Syncs user progress to Supabase
 */
export async function syncUserProgress(userData) {
    if (!supabase) {
        console.warn('Supabase not configured. Progress will only be saved locally.');
        return;
    }

    // Ensure we have a valid ID (Guest users don't sync to DB)
    if (!userData.id) {
        console.log('Guest user: Skipping Supabase sync.');
        return;
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: userData.id,
                xp: userData.xp,
                unlocked_levels: userData.unlockedLevels,
                badges: userData.badges,
                accuracy_tracker: userData.accuracyTracker,
                last_played: new Date().toISOString()
            });

        if (error) throw error;
        console.log('Supabase sync successful');
    } catch (err) {
        console.error('Supabase Sync Error:', err.message);
    }
}

/**
 * Fetches the global leaderboard from Supabase
 */
export async function fetchLeaderboard() {
    if (!supabase) {
        return []; // Return empty if not configured
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('name, xp, unlocked_levels')
            .order('xp', { ascending: false })
            .limit(10);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching leaderboard:', err.message);
        return [];
    }
}
