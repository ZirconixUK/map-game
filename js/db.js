// js/db.js — Supabase database layer
// Requires: window.__supabase set by js/auth.js
// All functions are no-ops if user is not signed in; errors are swallowed silently.
(function () {
  const ACHIEVEMENT_DEFS = [
    { id: 'first_round',   check: ()  => true },
    { id: 'first_diamond', check: d  => d.grade_label === 'Diamond' },
    { id: 'no_tools',      check: d  => (d.tools_used_count || 0) === 0 },
    { id: 'hard_diamond',  check: d  => d.grade_label === 'Diamond' && d.difficulty === 'hard' },
    { id: 'long_run',      check: d  => d.game_length === 'long' },
    { id: 'ten_rounds',    check: d  => (d._roundsCount || 0) >= 10 },
  ];

  async function _getAuthedClient() {
    const client = window.__supabase;
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    return { client, userId: session.user.id };
  }

  async function saveRoundResult(data) {
    try {
      const auth = await _getAuthedClient();
      if (!auth) return;
      const { client, userId } = auth;

      const { error } = await client.from('rounds').insert({
        user_id:              userId,
        target_name:          data.target_name          || null,
        target_lat:           data.target_lat           ?? null,
        target_lon:           data.target_lon           ?? null,
        game_length:          data.game_length          || null,
        difficulty:           data.difficulty           || null,
        grade_label:          data.grade_label          || null,
        score_total:          data.score_total          ?? null,
        score_base:           data.score_base           ?? null,
        score_time_bonus:     data.score_time_bonus     ?? null,
        score_length_bonus:   data.score_length_bonus   ?? null,
        score_diff_bonus:     data.score_diff_bonus     ?? null,
        score_tool_bonus:     data.score_tool_bonus     ?? null,
        distance_m:           data.distance_m           ?? null,
        adjusted_distance_m:  data.adjusted_distance_m  ?? null,
        elapsed_ms:           data.elapsed_ms           ?? null,
        remaining_ms:         data.remaining_ms         ?? null,
        tools_used_count:     data.tools_used_count     ?? null,
        tools_used_json:      data.tools_used_json      || null,
        curses_active_json:   data.curses_active_json   || null,
        round_start_lat:      data.round_start_lat      ?? null,
        round_start_lon:      data.round_start_lon      ?? null,
      });

      if (error) {
        console.warn('[db] saveRoundResult error', error);
      } else {
        await _checkAndAwardAchievements(client, userId, data);
      }
    } catch (e) {
      // swallow — game works without DB
    }
  }

  async function _checkAndAwardAchievements(client, userId, data) {
    try {
      const { count } = await client
        .from('rounds')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const ctx = { ...data, _roundsCount: count || 0 };
      const toAward = ACHIEVEMENT_DEFS.filter(a => a.check(ctx));

      for (const a of toAward) {
        await client.from('user_achievements').upsert(
          { user_id: userId, achievement_id: a.id },
          { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
        );
      }
    } catch (e) {}
  }

  async function getRoundHistory(limit = 20) {
    try {
      const auth = await _getAuthedClient();
      if (!auth) return [];
      const { data, error } = await auth.client
        .from('rounds')
        .select('*')
        .order('played_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return data || [];
    } catch (e) {
      return [];
    }
  }

  async function getAchievements() {
    try {
      const auth = await _getAuthedClient();
      if (!auth) return [];
      const { data, error } = await auth.client
        .from('user_achievements')
        .select('achievement_id, earned_at')
        .eq('user_id', auth.userId);
      if (error) return [];
      return data || [];
    } catch (e) {
      return [];
    }
  }

  window.saveRoundResult = saveRoundResult;
  window.getRoundHistory = getRoundHistory;
  window.getAchievements = getAchievements;
})();
