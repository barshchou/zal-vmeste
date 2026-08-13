window.ZalSync = (function () {
  const cfg = () => window.ZAL_CONFIG || {};
  let client = null;
  let user = null;
  let status = "disabled";
  let statusDetail = "";
  const listeners = new Set();
  const pushTimers = new Map();

  function configured() {
    return Boolean(cfg().supabaseUrl && cfg().supabaseAnonKey);
  }

  function setStatus(next, detail = "") {
    status = next;
    statusDetail = detail;
    listeners.forEach(fn => fn({ status, detail, user }));
  }

  function onStatus(fn) {
    listeners.add(fn);
    fn({ status, detail: statusDetail, user });
    return () => listeners.delete(fn);
  }

  function normalizeUrl(url) {
    if (!url) return "";
    return url.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  }

  async function init() {
    if (!configured()) {
      setStatus("disabled", "Добавьте ключи в js/config.js");
      return false;
    }
    if (!window.supabase?.createClient) {
      setStatus("error", "Не загружена библиотека Supabase");
      return false;
    }
    const baseUrl = normalizeUrl(cfg().supabaseUrl);
    if (baseUrl !== cfg().supabaseUrl.trim()) {
      console.warn("Supabase URL исправлен: уберите /rest/v1 из config.js");
    }
    client = window.supabase.createClient(baseUrl, cfg().supabaseAnonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    const { data, error } = await client.auth.getSession();
    if (error) {
      setStatus("error", error.message);
      return false;
    }
    user = data.session?.user ?? null;
    setStatus(user ? "ok" : "login", user ? "Вход выполнен" : "Войдите для синхронизации");
    client.auth.onAuthStateChange((_event, session) => {
      user = session?.user ?? null;
      setStatus(user ? "ok" : "login", user ? "Вход выполнен" : "Войдите для синхронизации");
    });
    return Boolean(user);
  }

  async function signIn(email, password) {
    if (!client) return { ok: false, error: "Supabase не настроен" };
    setStatus("syncing", "Вход…");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("error", error.message);
      return { ok: false, error: error.message };
    }
    user = data.user;
    setStatus("ok", "Вход выполнен");
    return { ok: true };
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    user = null;
    setStatus("login", "Вы вышли");
  }

  function requireUser() {
    if (!user || !client) throw new Error("not_authenticated");
  }

  async function pullPerson(personId) {
    requireUser();
    setStatus("syncing", "Загрузка…");
    const [{ data: prefs, error: prefsErr }, { data: sessions, error: sessErr }] = await Promise.all([
      client.from("user_prefs").select("phase, active_day, updated_at").eq("person", personId).maybeSingle(),
      client.from("workout_sessions").select("workout_day, log_data, updated_at").eq("person", personId)
    ]);
    if (prefsErr || sessErr) {
      setStatus("error", prefsErr?.message || sessErr?.message);
      return { ok: false };
    }
    if (prefs) {
      localStorage.setItem(`zal-phase-${personId}`, String(prefs.phase));
      localStorage.setItem(`zal-day-${personId}`, prefs.active_day);
    }
    (sessions || []).forEach(row => {
      localStorage.setItem(`zal-log-${personId}-${row.workout_day}`, JSON.stringify(row.log_data || {}));
      localStorage.setItem(`zal-log-ts-${personId}-${row.workout_day}`, row.updated_at || "");
    });
    setStatus("ok", "Синхронизировано");
    return { ok: true, prefs, sessions };
  }

  function schedulePush(personId, workoutDay, logData) {
    if (!user || !client) return;
    const key = `${personId}-${workoutDay}`;
    clearTimeout(pushTimers.get(key));
    pushTimers.set(key, setTimeout(() => {
      pushSession(personId, workoutDay, logData).catch(err => setStatus("error", err.message));
    }, 700));
  }

  async function pushSession(personId, workoutDay, logData) {
    requireUser();
    setStatus("syncing", "Сохранение…");
    const payload = {
      user_id: user.id,
      person: personId,
      workout_day: workoutDay,
      log_data: logData || {}
    };
    const { error } = await client.from("workout_sessions").upsert(payload, {
      onConflict: "user_id,person,workout_day"
    });
    if (error) {
      setStatus("error", error.message);
      throw error;
    }
    localStorage.setItem(`zal-log-ts-${personId}-${workoutDay}`, new Date().toISOString());
    setStatus("ok", "Сохранено в облаке");
  }

  async function pushPrefs(personId, phase, activeDay) {
    if (!user || !client) return;
    const { error } = await client.from("user_prefs").upsert({
      user_id: user.id,
      person: personId,
      phase,
      active_day: activeDay
    }, { onConflict: "user_id,person" });
    if (error) setStatus("error", error.message);
  }

  async function clearSession(personId, workoutDay) {
    localStorage.removeItem(`zal-log-${personId}-${workoutDay}`);
    localStorage.removeItem(`zal-log-ts-${personId}-${workoutDay}`);
    if (user && client) await pushSession(personId, workoutDay, {});
  }

  return {
    configured,
    init,
    signIn,
    signOut,
    pullPerson,
    schedulePush,
    pushPrefs,
    clearSession,
    onStatus,
    isLoggedIn: () => Boolean(user)
  };
})();
