//! Provider registry and atomic request reservation shared by all windows.
//! Persisted metadata contains templates and keychain names, never credentials.
#[path = "provider_core.rs"]
mod core;
#[path = "provider_metadata.rs"]
mod metadata;
pub use metadata::{ProviderEntry, RequestLimits};

use core::{Candidate, RegistryCore};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Default)]
struct Registry {
    providers: Vec<ProviderEntry>,
    core: RegistryCore,
    path: Option<PathBuf>,
}

#[derive(Default)]
pub struct ProvidersState {
    registry: Mutex<Registry>,
}

/// Versioned on-disk state retains quotas across restarts.
#[derive(Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct PersistedRegistry {
    version: u32,
    providers: Vec<ProviderEntry>,
    global_limits: RequestLimits,
    manual_neutral: bool,
    requests: HashMap<String, Vec<u64>>,
    global_requests: Vec<u64>,
    cooldowns: HashMap<String, u64>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

impl Registry {
    fn transaction<T>(
        &mut self,
        now: u64,
        action: impl FnOnce(&mut Registry, u64) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut next = self.clone();
        next.core.prune(now);
        let result = action(&mut next, now)?;
        next.persist()?;
        *self = next;
        Ok(result)
    }

    fn candidates(&self) -> Vec<Candidate> {
        self.providers
            .iter()
            .map(|p| Candidate {
                id: p.id.clone(),
                kind: p.kind.clone(),
                rank: p.rank,
                enabled: p.enabled,
                supports_images: p.supports_images,
                limits: p.limits(),
            })
            .collect()
    }

    fn persist(&self) -> Result<(), String> {
        let stored = PersistedRegistry {
            version: 1,
            providers: self.providers.clone(),
            global_limits: RequestLimits::from_array(self.core.global_limits),
            manual_neutral: self.core.manual_neutral,
            requests: self.core.requests.clone(),
            global_requests: self.core.global_requests.clone(),
            cooldowns: self.core.cooldowns.clone(),
        };
        let bytes = serde_json::to_vec_pretty(&stored)
            .map_err(|_| "Could not serialize provider metadata".to_string())?;
        let path = self
            .path
            .as_ref()
            .ok_or("Provider registry was not initialized")?;
        crate::shell_store::replace_file(path, &bytes)
            .map_err(|_| "Could not save provider registry".to_string())
    }

    fn status(
        &self,
        kind: &str,
        needs_images: bool,
        exclude_ids: &[String],
        now: u64,
    ) -> serde_json::Value {
        let candidates = self.candidates();
        let providers: Vec<_> = self
            .providers
            .iter()
            .zip(candidates.iter())
            .map(|(provider, candidate)| {
                let mut status = serde_json::to_value(provider)
                    .expect("Provider metadata serialization is infallible");
                let requests = self
                    .core
                    .requests
                    .get(&provider.id)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]);
                status["used"] =
                    serde_json::json!(RequestLimits::from_array(RegistryCore::used(requests, now)));
                status["nextAllowedAt"] =
                    serde_json::json!(self.core.next_allowed_at(candidate, now));
                status["inCooldown"] = serde_json::json!(self
                    .core
                    .cooldowns
                    .get(&provider.id)
                    .is_some_and(|until| *until > now));
                status
            })
            .collect();
        let next = self
            .core
            .next_available_at(&candidates, kind, needs_images, exclude_ids, now);
        serde_json::json!({
            "providers": providers,
            "neutral": self.core.manual_neutral || next.is_none_or(|until| until > now),
            "manualNeutral": self.core.manual_neutral,
            "nextAllowedAt": next.filter(|until| *until > now),
            "currentProviderId": self.core.current_provider_id,
            "globalLimits": RequestLimits::from_array(self.core.global_limits),
            "globalUsed": RequestLimits::from_array(RegistryCore::used(&self.core.global_requests, now)),
        })
    }
}

/// Safe to call from setup and commands. Failed/corrupt loads are reported,
/// rather than silently resetting persisted quotas or provider configuration.
pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ProvidersState>();
    let mut registry = state
        .registry
        .lock()
        .map_err(|_| "Provider registry lock unavailable")?;
    if registry.path.is_some() {
        return Ok(());
    }
    let path = crate::app_paths::data_dir(app)
        .map_err(|_| "Provider app data directory unavailable")?
        .join("providers.json");
    let mut loaded = Registry {
        path: Some(path.clone()),
        ..Registry::default()
    };
    match std::fs::read(&path) {
        Ok(bytes) => {
            let stored: PersistedRegistry = serde_json::from_slice(&bytes)
                .map_err(|_| "Stored provider registry is invalid")?;
            if stored.version != 1 {
                return Err("Stored provider registry version is unsupported".into());
            }
            let mut ids = HashSet::new();
            for provider in &stored.providers {
                provider.validate()?;
                if !ids.insert(provider.id.clone()) {
                    return Err("Stored provider registry contains duplicate IDs".into());
                }
            }
            loaded.providers = stored.providers;
            loaded.core = RegistryCore {
                requests: stored.requests,
                global_requests: stored.global_requests,
                cooldowns: stored.cooldowns,
                global_limits: stored.global_limits.array(),
                manual_neutral: stored.manual_neutral,
                current_provider_id: None,
            };
            loaded.core.requests.retain(|id, _| ids.contains(id));
            loaded.core.cooldowns.retain(|id, _| ids.contains(id));
            loaded.core.prune(now_ms());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Could not read stored provider registry".into()),
    }
    *registry = loaded;
    Ok(())
}

/// All eligibility gates, consumption and durable writes share one lock. A
/// failed save never changes live state or authorizes a network request.
fn update<T>(
    app: &AppHandle,
    action: impl FnOnce(&mut Registry, u64) -> Result<T, String>,
) -> Result<T, String> {
    initialize(app)?;
    let state = app.state::<ProvidersState>();
    let mut registry = state
        .registry
        .lock()
        .map_err(|_| "Provider registry lock unavailable")?;
    registry.transaction(now_ms(), action)
}

fn broadcast_status(app: &AppHandle, kind: &str) {
    let state = app.state::<ProvidersState>();
    if let Ok(registry) = state.registry.lock() {
        let _ = app.emit(
            "providers-status",
            registry.status(kind, false, &[], now_ms()),
        );
    };
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if ["brain", "stt", "tts", "vision"].contains(&kind) {
        Ok(())
    } else {
        Err("Unsupported provider kind".into())
    }
}

#[tauri::command]
pub fn list_providers(app: AppHandle) -> Result<Vec<ProviderEntry>, String> {
    initialize(&app)?;
    let state = app.state::<ProvidersState>();
    let registry = state
        .registry
        .lock()
        .map_err(|_| "Provider registry lock unavailable")?;
    let mut providers = registry.providers.clone();
    providers.sort_by(|a, b| a.rank.cmp(&b.rank).then(a.id.cmp(&b.id)));
    Ok(providers)
}

#[tauri::command]
pub fn upsert_provider(app: AppHandle, provider: ProviderEntry) -> Result<(), String> {
    provider.validate()?;
    update(&app, |registry, _| {
        if let Some(index) = registry.providers.iter().position(|p| p.id == provider.id) {
            registry.providers[index] = provider;
        } else {
            registry.providers.push(provider);
        }
        Ok(())
    })?;
    broadcast_status(&app, "brain");
    Ok(())
}

#[tauri::command]
pub fn remove_provider(app: AppHandle, id: String) -> Result<(), String> {
    update(&app, |registry, _| {
        registry.providers.retain(|p| p.id != id);
        registry.core.remove(&id);
        Ok(())
    })?;
    broadcast_status(&app, "brain");
    Ok(())
}

/// Reserves one attempted request. Failed sends still consume their reservation;
/// each retry/fallback must pick with the already attempted IDs excluded.
#[tauri::command]
pub fn pick_provider(
    app: AppHandle,
    kind: String,
    needs_images: bool,
    exclude_ids: Option<Vec<String>>,
) -> Result<ProviderEntry, String> {
    validate_kind(&kind)?;
    let exclude_ids = exclude_ids.unwrap_or_default();
    let result = update(&app, |registry, now| {
        let candidates = registry.candidates();
        let id = registry
            .core
            .pick(&candidates, &kind, needs_images, &exclude_ids, now)
            .ok_or_else(|| {
                if registry.core.manual_neutral {
                    "Neutral mode is enabled".into()
                } else {
                    match registry.core.next_available_at(
                        &candidates,
                        &kind,
                        needs_images,
                        &exclude_ids,
                        now,
                    ) {
                        Some(until) => format!(
                            "Neutral mode: next provider available in {}s",
                            until.saturating_sub(now).div_ceil(1_000)
                        ),
                        None => "Neutral mode: no matching enabled provider available".into(),
                    }
                }
            })?;
        registry
            .providers
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or_else(|| "Selected provider no longer exists".into())
    });
    broadcast_status(&app, &kind);
    result
}

#[tauri::command]
pub fn report_provider_result(
    app: AppHandle,
    provider_id: String,
    ok: bool,
    retry_after_secs: Option<u64>,
) -> Result<(), String> {
    update(&app, |registry, now| {
        if !registry.providers.iter().any(|p| p.id == provider_id) {
            return Err("Provider does not exist".into());
        }
        registry
            .core
            .record_result(&provider_id, ok, retry_after_secs, now);
        Ok(())
    })?;
    broadcast_status(&app, "brain");
    Ok(())
}

#[tauri::command]
pub fn set_global_limits(app: AppHandle, limits: RequestLimits) -> Result<(), String> {
    update(&app, |registry, _| {
        registry.core.global_limits = limits.array();
        Ok(())
    })?;
    broadcast_status(&app, "brain");
    Ok(())
}

#[tauri::command]
pub fn get_global_limits(app: AppHandle) -> Result<RequestLimits, String> {
    initialize(&app)?;
    let state = app.state::<ProvidersState>();
    let registry = state
        .registry
        .lock()
        .map_err(|_| "Provider registry lock unavailable")?;
    Ok(RequestLimits::from_array(registry.core.global_limits))
}

/// Compatibility command updates only the daily member of the global budget.
#[tauri::command]
pub fn set_global_daily_limit(app: AppHandle, limit: u32) -> Result<(), String> {
    update(&app, |registry, _| {
        registry.core.global_limits[3] = limit;
        Ok(())
    })?;
    broadcast_status(&app, "brain");
    Ok(())
}

#[tauri::command]
pub fn set_neutral_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    update(&app, |registry, _| {
        registry.core.manual_neutral = enabled;
        Ok(())
    })?;
    broadcast_status(&app, "brain");
    Ok(())
}

#[tauri::command]
pub fn get_providers_status(
    app: AppHandle,
    kind: Option<String>,
    needs_images: Option<bool>,
    exclude_ids: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let kind = kind.unwrap_or_else(|| "brain".into());
    validate_kind(&kind)?;
    initialize(&app)?;
    let state = app.state::<ProvidersState>();
    let registry = state
        .registry
        .lock()
        .map_err(|_| "Provider registry lock unavailable")?;
    Ok(registry.status(
        &kind,
        needs_images.unwrap_or(false),
        &exclude_ids.unwrap_or_default(),
        now_ms(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider() -> ProviderEntry {
        serde_json::from_str(r#"{"id":"p","kind":"brain","preset":"custom","base_url":"https://example.invalid/v1","model":"test","limit_per_minute":1}"#).unwrap()
    }

    #[test]
    fn status_is_neutral_for_limits_and_reports_the_exact_recovery_time() {
        let mut registry = Registry {
            providers: vec![provider()],
            ..Registry::default()
        };
        let candidates = registry.candidates();
        registry.core.pick(&candidates, "brain", false, &[], 100);
        let blocked = registry.status("brain", false, &[], 101);
        assert_eq!(blocked["neutral"], true);
        assert_eq!(blocked["manualNeutral"], false);
        assert_eq!(blocked["nextAllowedAt"], 60_100);
        assert_eq!(blocked["currentProviderId"], "p");
        assert_eq!(blocked["providers"][0]["used"]["per_minute"], 1);
        assert_eq!(blocked["globalUsed"]["per_minute"], 1);
        let recovered = registry.status("brain", false, &[], 60_100);
        assert_eq!(recovered["neutral"], false);
        assert_eq!(recovered["nextAllowedAt"], serde_json::Value::Null);
        assert_eq!(registry.core.global_requests, [100]);
    }

    #[test]
    fn cooldown_status_and_manual_neutral_are_distinct() {
        let mut registry = Registry {
            providers: vec![provider()],
            ..Registry::default()
        };
        registry.core.record_result("p", false, Some(5), 100);
        let blocked = registry.status("brain", false, &[], 101);
        assert_eq!(blocked["providers"][0]["inCooldown"], true);
        assert_eq!(blocked["nextAllowedAt"], 5_100);
        registry.core.manual_neutral = true;
        let manual = registry.status("brain", false, &[], 101);
        assert_eq!(manual["manualNeutral"], true);
        assert_eq!(manual["nextAllowedAt"], serde_json::Value::Null);
    }

    #[test]
    fn registry_persists_metadata_limits_and_usage_through_atomic_store() {
        let path = std::env::temp_dir().join(format!(
            "pluely-provider-registry-{}-{}.json",
            std::process::id(),
            now_ms()
        ));
        let mut registry = Registry {
            providers: vec![provider()],
            path: Some(path.clone()),
            ..Registry::default()
        };
        registry.core.global_limits = [1, 2, 3, 4];
        registry.core.manual_neutral = true;
        registry.core.requests.insert("p".into(), vec![100]);
        registry.core.global_requests = vec![100];
        registry.core.cooldowns.insert("p".into(), 5_100);
        registry.persist().unwrap();
        let stored: PersistedRegistry =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(stored.version, 1);
        assert_eq!(stored.providers[0].id, "p");
        assert_eq!(stored.global_limits.array(), [1, 2, 3, 4]);
        assert_eq!(stored.requests["p"], [100]);
        assert_eq!(stored.global_requests, [100]);
        assert_eq!(stored.cooldowns["p"], 5_100);
        assert!(stored.manual_neutral);
        registry.providers[0].model = "replacement".into();
        registry.persist().unwrap();
        let replaced: PersistedRegistry =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(replaced.providers[0].model, "replacement");
        assert!(!path.with_extension("json.tmp").exists());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn failed_disk_write_never_authorizes_a_request_or_changes_live_budget() {
        let root = std::env::temp_dir().join(format!(
            "pluely-provider-rollback-{}-{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("providers.json");
        let mut registry = Registry {
            providers: vec![provider()],
            path: Some(path.clone()),
            ..Registry::default()
        };
        registry.persist().unwrap();
        let original = std::fs::read(&path).unwrap();
        std::fs::create_dir(path.with_extension("json.tmp")).unwrap();
        let result = registry.transaction(100, |next, now| {
            let candidates = next.candidates();
            next.core
                .pick(&candidates, "brain", false, &[], now)
                .ok_or_else(|| "Unavailable".into())
        });
        assert!(result.is_err());
        assert!(registry.core.global_requests.is_empty());
        assert!(registry.core.requests.is_empty());
        assert!(registry.core.current_provider_id.is_none());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        std::fs::remove_dir(path.with_extension("json.tmp")).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&root).unwrap();
    }
}
