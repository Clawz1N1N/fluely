// Provider registry, ranking/fallback, and request limiting.
//
// The single source of truth for:
//   * the ordered list of brain/STT/TTS providers,
//   * per-provider limits (per second/minute/hour/day),
//   * cooldowns and automatic fallback,
//   * the "neutral mode" global limit.
//
// State lives in Rust and is broadcast to all windows.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// One configured provider/model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderEntry {
    pub id: String,
    /// "brain" | "stt" | "tts"
    pub kind: String,
    /// preset: "openrouter" | "google" | "openai-compatible" | "local" | "custom"
    pub preset: String,
    pub base_url: String,
    pub model: String,
    pub supports_images: bool,
    /// lower = tried first
    pub rank: i32,
    /// per-minute request cap (0 = unlimited)
    pub limit_per_minute: u32,
    /// per-hour request cap (0 = unlimited)
    pub limit_per_hour: u32,
    /// per-day request cap (0 = unlimited)
    pub limit_per_day: u32,
}

/// Rolling-window limiter for one provider.
#[derive(Debug, Clone, Default)]
struct RateWindow {
    timestamps: Vec<u64>, // epoch seconds
}

impl RateWindow {
    fn allow(&mut self, now: u64, window_secs: u64, limit: u32) -> bool {
        if limit == 0 {
            return true;
        }
        let cutoff = now.saturating_sub(window_secs);
        self.timestamps.retain(|t| *t > cutoff);
        if (self.timestamps.len() as u32) < limit {
            self.timestamps.push(now);
            true
        } else {
            false
        }
    }
}

/// Cooldown for a provider that failed.
#[derive(Debug, Clone)]
struct Cooldown {
    until: Instant,
    retry_after_secs: u64,
}

/// The full registry state.
pub struct ProvidersState {
    pub providers: Mutex<Vec<ProviderEntry>>,
    pub windows: Mutex<HashMap<String, RateWindow>>,
    pub cooldowns: Mutex<HashMap<String, Cooldown>>,
    /// global requests per day (0 = unlimited)
    pub global_daily_limit: Mutex<u32>,
    pub global_daily_count: Mutex<HashMap<u64, u32>>, // epoch day -> count
    /// neutral mode: when true, nothing is sent
    pub neutral_mode: Mutex<bool>,
}

impl Default for ProvidersState {
    fn default() -> Self {
        ProvidersState {
            providers: Mutex::new(Vec::new()),
            windows: Mutex::new(HashMap::new()),
            cooldowns: Mutex::new(HashMap::new()),
            global_daily_limit: Mutex::new(0),
            global_daily_count: Mutex::new(HashMap::new()),
            neutral_mode: Mutex::new(false),
        }
    }
}

fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn epoch_day() -> u64 {
    epoch_secs() / 86400
}

impl ProvidersState {
    /// Pick the next provider: highest rank (lowest number),
    /// not in cooldown, within its limits. Returns None if
    /// neutral mode is on or all are exhausted/cooling down.
    pub fn pick(&self, kind: &str, needs_images: bool) -> Option<ProviderEntry> {
        if *self.neutral_mode.lock().unwrap() {
            return None;
        }
        let mut list = self.providers.lock().unwrap().clone();
        // Sort by rank ascending.
        list.sort_by_key(|p| p.rank);
        let now = epoch_secs();
        let day = epoch_day();

        // Global daily limit.
        let global_limit = *self.global_daily_limit.lock().unwrap();
        if global_limit > 0 {
            let mut counts = self.global_daily_count.lock().unwrap();
            let used = counts.get(&day).copied().unwrap_or(0);
            if used >= global_limit {
                return None; // neutral: limits exhausted
            }
        }

        for provider in &list {
            if provider.kind != kind {
                continue;
            }
            // Capability gate: if the request needs images
            // and this provider cannot take them, skip it
            // (the caller may use the vision proxy instead).
            if needs_images && !provider.supports_images {
                continue;
            }
            // Cooldown gate.
            {
                let cooldowns = self.cooldowns.lock().unwrap();
                if let Some(cd) = cooldowns.get(&provider.id) {
                    if Instant::now() < cd.until {
                        continue;
                    }
                }
            }
            // Per-provider rate limits.
            let allowed = {
                let mut windows = self.windows.lock().unwrap();
                let win = windows
                    .entry(provider.id.clone())
                    .or_default();
                let per_min = win.allow(now, 60, provider.limit_per_minute);
                let per_hour = win.allow(now, 3600, provider.limit_per_hour);
                let per_day = win.allow(now, 86400, provider.limit_per_day);
                per_min && per_hour && per_day
            };
            if !allowed {
                continue;
            }
            // Global daily count increment.
            if global_limit > 0 {
                let mut counts = self.global_daily_count.lock().unwrap();
                let used = counts.entry(day).or_insert(0);
                *used += 1;
            }
            return Some(provider.clone());
        }
        None
    }

    /// Record a failure: set a cooldown (honouring
    /// Retry-After when present).
    pub fn record_failure(
        &self,
        provider_id: &str,
        retry_after_secs: Option<u64>,
    ) {
        let secs = retry_after_secs.unwrap_or(60).max(5);
        let mut cooldowns = self.cooldowns.lock().unwrap();
        cooldowns.insert(
            provider_id.to_string(),
            Cooldown {
                until: Instant::now() + Duration::from_secs(secs),
                retry_after_secs: secs,
            },
        );
    }

    /// Record a success: clear any cooldown.
    pub fn record_success(&self, provider_id: &str) {
        let mut cooldowns = self.cooldowns.lock().unwrap();
        cooldowns.remove(provider_id);
    }

    /// Seconds until the next provider leaves cooldown
    /// (for the neutral-mode countdown).
    pub fn next_available_secs(&self, kind: &str) -> Option<u64> {
        let cooldowns = self.cooldowns.lock().unwrap();
        let list = self.providers.lock().unwrap();
        let mut soonest: Option<u64> = None;
        for p in list.iter().filter(|p| p.kind == kind) {
            if let Some(cd) = cooldowns.get(&p.id) {
                let remaining = cd
                    .until
                    .saturating_duration_from(Instant::now())
                    .as_secs();
                soonest = Some(match soonest {
                    Some(cur) => cur.min(remaining),
                    None => remaining,
                });
            }
        }
        soonest
    }
}

/// Broadcast the current status to all shell windows.
fn broadcast_status(app: &AppHandle) {
    let state = app.state::<ProvidersState>();
    let providers = state.providers.lock().unwrap().clone();
    let mut status = serde_json::json!({});
    let mut arr = Vec::new();
    for p in &providers {
        let in_cooldown = {
            let cooldowns = state.cooldowns.lock().unwrap();
            cooldowns
                .get(&p.id)
                .map(|cd| Instant::now() < cd.until)
                .unwrap_or(false)
        };
        arr.push(serde_json::json!({
            "id": p.id,
            "kind": p.kind,
            "rank": p.rank,
            "inCooldown": in_cooldown,
        }));
    }
    status["providers"] = serde_json::Value::Array(arr);
    status["neutral"] = serde_json::json!(*state.neutral_mode.lock().unwrap());
    app.emit("providers-status", status).ok();
}

// --------------------------- Tauri commands ---------------------------

#[tauri::command]
pub fn list_providers(app: AppHandle) -> Result<Vec<ProviderEntry>, String> {
    let state = app.state::<ProvidersState>();
    Ok(state.providers.lock().unwrap().clone())
}

#[tauri::command]
pub fn upsert_provider(
    app: AppHandle,
    provider: ProviderEntry,
) -> Result<(), String> {
    let state = app.state::<ProvidersState>();
    let mut list = state.providers.lock().unwrap();
    if let Some(pos) = list.iter().position(|p| p.id == provider.id) {
        list[pos] = provider;
    } else {
        list.push(provider);
    }
    drop(list);
    broadcast_status(&app);
    Ok(())
}

#[tauri::command]
pub fn remove_provider(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let state = app.state::<ProvidersState>();
    let mut list = state.providers.lock().unwrap();
    list.retain(|p| p.id != id);
    drop(list);
    broadcast_status(&app);
    Ok(())
}

/// Try to pick a provider for a request. Returns the
/// chosen provider or an error when neutral/exhausted.
#[tauri::command]
pub fn pick_provider(
    app: AppHandle,
    kind: String,
    needs_images: bool,
) -> Result<ProviderEntry, String> {
    let state = app.state::<ProvidersState>();
    let entry = state
        .pick(&kind, needs_images)
        .ok_or_else(|| {
            let secs = state.next_available_secs(&kind);
            match secs {
                Some(s) => format!(
                    "Neutral mode: all providers cooling down. Next available in ~{}s",
                    s
                ),
                None => "Neutral mode: no provider available".to_string(),
            }
        })?;
    broadcast_status(&app);
    Ok(entry)
}

#[tauri::command]
pub fn report_provider_result(
    app: AppHandle,
    provider_id: String,
    ok: bool,
    retry_after_secs: Option<u64>,
) -> Result<(), String> {
    let state = app.state::<ProvidersState>();
    if ok {
        state.record_success(&provider_id);
    } else {
        state.record_failure(&provider_id, retry_after_secs);
    }
    broadcast_status(&app);
    Ok(())
}

#[tauri::command]
pub fn set_global_daily_limit(
    app: AppHandle,
    limit: u32,
) -> Result<(), String> {
    let state = app.state::<ProvidersState>();
    *state.global_daily_limit.lock().unwrap() = limit;
    Ok(())
}

#[tauri::command]
pub fn set_neutral_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<ProvidersState>();
    *state.neutral_mode.lock().unwrap() = enabled;
    broadcast_status(&app);
    Ok(())
}

/// Status for the UI: providers, cooldowns, neutral mode,
/// and the countdown to the next available provider.
#[tauri::command]
pub fn get_providers_status(
    app: AppHandle,
    kind: String,
) -> Result<serde_json::Value, String> {
    let state = app.state::<ProvidersState>();
    let providers = state.providers.lock().unwrap().clone();
    let mut arr = Vec::new();
    for p in &providers {
        let (in_cooldown, remaining) = {
            let cooldowns = state.cooldowns.lock().unwrap();
            match cooldowns.get(&p.id) {
                Some(cd) => {
                    let r = cd
                        .until
                        .saturating_duration_from(Instant::now())
                        .as_secs();
                    (Instant::now() < cd.until, r)
                }
                None => (false, 0),
            }
        };
        arr.push(serde_json::json!({
            "id": p.id,
            "kind": p.kind,
            "rank": p.rank,
            "model": p.model,
            "inCooldown": in_cooldown,
            "cooldownRemainingSecs": remaining,
        }));
    }
    Ok(serde_json::json!({
        "providers": arr,
        "neutral": *state.neutral_mode.lock().unwrap(),
        "nextAvailableSecs": state.next_available_secs(&kind),
    }))
}

// --------------------------- unit tests ---------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, rank: i32, limit_per_minute: u32) -> ProviderEntry {
        ProviderEntry {
            id: id.to_string(),
            kind: "brain".to_string(),
            preset: "custom".to_string(),
            base_url: "http://localhost".to_string(),
            model: "test-model".to_string(),
            supports_images: true,
            rank,
            limit_per_minute,
            limit_per_hour: 0,
            limit_per_day: 0,
        }
    }

    #[test]
    fn pick_returns_highest_rank_first() {
        let state = ProvidersState::default();
        {
            let mut list = state.providers.lock().unwrap();
            list.push(entry("low", 10, 0));
            list.push(entry("high", 1, 0));
        }
        let picked = state.pick("brain", false).unwrap();
        assert_eq!(picked.id, "high");
    }

    #[test]
    fn pick_skips_cooldown() {
        let state = ProvidersState::default();
        {
            let mut list = state.providers.lock().unwrap();
            list.push(entry("first", 1, 0));
            list.push(entry("second", 2, 0));
        }
        state.record_failure("first", Some(300));
        let picked = state.pick("brain", false).unwrap();
        assert_eq!(picked.id, "second");
    }

    #[test]
    fn pick_skips_rate_limited() {
        let state = ProvidersState::default();
        {
            let mut list = state.providers.lock().unwrap();
            list.push(entry("limited", 1, 1)); // 1 per minute
        }
        // First pick consumes the minute budget.
        assert!(state.pick("brain", false).is_some());
        // Second pick is rate limited -> falls through to None.
        assert!(state.pick("brain", false).is_none());
    }

    #[test]
    fn pick_neutral_mode_blocks_all() {
        let state = ProvidersState::default();
        {
            let mut list = state.providers.lock().unwrap();
            list.push(entry("any", 1, 0));
        }
        *state.neutral_mode.lock().unwrap() = true;
        assert!(state.pick("brain", false).is_none());
    }

    #[test]
    fn record_success_clears_cooldown() {
        let state = ProvidersState::default();
        state.record_failure("p", Some(300));
        state.record_success("p");
        assert!(state.next_available_secs("brain").is_none());
    }

    #[test]
    fn capability_gate_skips_non_vision() {
        let state = ProvidersState::default();
        {
            let mut list = state.providers.lock().unwrap();
            let mut p = entry("text-only", 1, 0);
            p.supports_images = false;
            list.push(p);
        }
        // Request needs images -> text-only provider skipped.
        assert!(state.pick("brain", true).is_none());
        // Text request -> allowed.
        assert!(state.pick("brain", false).is_some());
    }

    #[test]
    fn global_daily_limit_enforced() {
        let state = ProvidersState::default();
        {
            let mut list = state.providers.lock().unwrap();
            list.push(entry("p", 1, 0));
        }
        *state.global_daily_limit.lock().unwrap() = 1;
        assert!(state.pick("brain", false).is_some());
        assert!(state.pick("brain", false).is_none());
    }
}
