//! Own executable aliases, friendly metadata and narrowly owned per-user startup.
//! UI/package identity remains Fluely. Only our managed binary is copied/patched.
#[path = "identity_core.rs"]
mod core;
#[path = "identity_native.rs"]
mod native;
use serde::{Deserialize, Serialize};
use std::{
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "identity.json";
const PROFILE_ARGUMENT: &str = "--fluely-profile";
const LOOP_ENV: &str = "FLUELY_ALIAS_RELAUNCH";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct IdentityConfig {
    pub executable_alias: String,
    pub startup_name: String,
    pub autostart: bool,
}
impl Default for IdentityConfig {
    fn default() -> Self {
        Self {
            executable_alias: "my program.exe".into(),
            startup_name: "my program.exe".into(),
            autostart: false,
        }
    }
}
impl IdentityConfig {
    fn validate(&self) -> Result<(), String> {
        core::validate_alias(&self.executable_alias)?;
        core::validate_startup_name(&self.startup_name)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnedRun {
    name: String,
    command: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredIdentity {
    version: u32,
    config: IdentityConfig,
    source_executable: PathBuf,
    target_executable: PathBuf,
    owned_run: Option<OwnedRun>,
}
#[derive(Clone, Debug, Serialize)]
pub struct IdentityStatus {
    pub config: IdentityConfig,
    pub current_executable: String,
    pub managed_executable: String,
    pub alias_active: bool,
    pub restart_required: bool,
    pub autostart_active: bool,
    pub metadata_patched: bool,
    pub automatic_alias_enabled: bool,
    pub warning: Option<String>,
}
#[derive(Default)]
pub struct IdentityState {
    mutation: Mutex<()>,
}

fn equivalent(left: &Path, right: &Path) -> bool {
    // Windows paths are case-insensitive; canonicalization also resolves owned links.
    let left = left.canonicalize().unwrap_or_else(|_| left.into());
    let right = right.canonicalize().unwrap_or_else(|_| right.into());
    if cfg!(windows) {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}
fn read_stored(profile: &Path) -> Result<Option<StoredIdentity>, String> {
    let stored: StoredIdentity = match std::fs::read(profile.join(CONFIG_FILE)) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| format!("Load identity settings: {e}"))?
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Read identity settings: {e}")),
    };
    if stored.version != 1 {
        return Err("Unsupported identity settings version".into());
    }
    stored.config.validate()?;
    if !stored.source_executable.is_absolute()
        || !managed_path(
            profile,
            &stored.target_executable,
            &stored.config.executable_alias,
        )
    {
        return Err("Invalid managed executable path in identity settings".into());
    }
    if let Some(run) = &stored.owned_run {
        core::validate_startup_name(&run.name)?;
        if !owned_command(profile, &run.command, &stored.source_executable) {
            return Err("Invalid owned startup command in identity settings".into());
        }
    }
    Ok(Some(stored))
}
fn persist(profile: &Path, stored: &StoredIdentity) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(stored).map_err(|e| e.to_string())?;
    crate::shell_store::replace_file(&profile.join(CONFIG_FILE), &bytes)
        .map_err(|e| format!("Save identity settings: {e}"))
}
fn managed_path(profile: &Path, path: &Path, alias: &str) -> bool {
    let bin = profile.join("bin");
    if !path.is_absolute()
        || path.file_name().and_then(|name| name.to_str()) != Some(alias)
        || !path.starts_with(&bin)
    {
        return false;
    }
    match (
        profile.canonicalize(),
        bin.canonicalize(),
        path.parent().and_then(|p| p.canonicalize().ok()),
    ) {
        (Ok(profile), Ok(root), Some(parent)) => {
            root.starts_with(profile)
                && parent.starts_with(&root)
                && (!path.exists()
                    || path
                        .canonicalize()
                        .is_ok_and(|target| target.starts_with(&root)))
        }
        _ => false,
    }
}
fn command_executable(command: &str) -> Option<PathBuf> {
    // We write quoted absolute paths. Never infer ownership from an unquoted prefix.
    let rest = command.strip_prefix('"')?;
    let end = rest.find('"')?;
    Some(PathBuf::from(&rest[..end]))
}
fn owned_command(profile: &Path, command: &str, source: &Path) -> bool {
    // The old plugin wrote an unquoted path with no arguments. Adopt only an
    // exact path match; never treat an unquoted prefix as executable ownership.
    let Some(path) = command_executable(command) else {
        return equivalent(Path::new(command.trim()), source);
    };
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    equivalent(&path, source) || managed_path(profile, &path, name)
}
fn startup_command(target: &Path, profile: &Path) -> String {
    // Pin the profile for login, when inherited portable env variables are absent.
    format!(
        "\"{}\" {PROFILE_ARGUMENT} \"{}\"",
        target.display(),
        profile.display()
    )
}
fn source_for(current: &Path, profile: &Path, stored: Option<&StoredIdentity>) -> PathBuf {
    if let Some(stored) = stored {
        if current.starts_with(profile.join("bin")) && stored.source_executable.is_file() {
            return stored.source_executable.clone();
        }
    }
    current.into()
}
fn legacy_previous(current: &Path) -> Option<StoredIdentity> {
    for name in ["pluely", "Fluely"] {
        let Some(command) = native::read_run(name).ok().flatten() else {
            continue;
        };
        let path = command_executable(&command).unwrap_or_else(|| PathBuf::from(command.trim()));
        if equivalent(&path, current) {
            return Some(StoredIdentity {
                version: 1,
                config: IdentityConfig {
                    autostart: true,
                    ..Default::default()
                },
                source_executable: current.into(),
                target_executable: current.into(),
                owned_run: Some(OwnedRun {
                    name: name.into(),
                    command,
                }),
            });
        }
    }
    None
}
fn prepare_alias(profile: &Path, source: &Path, alias: &str) -> Result<PathBuf, String> {
    core::validate_alias(alias)?;
    let metadata = std::fs::metadata(source).map_err(|e| format!("Read own executable: {e}"))?;
    if !metadata.is_file() {
        return Err("The current executable is not a regular file".into());
    }
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hash);
    metadata.len().hash(&mut hash);
    metadata.modified().ok().hash(&mut hash);
    alias.hash(&mut hash);
    let directory = profile
        .join("bin")
        .join(format!("alias-{:016x}", hash.finish()));
    std::fs::create_dir_all(&directory).map_err(|e| format!("Create own alias directory: {e}"))?;
    let target = directory.join(alias);
    if !managed_path(profile, &target, alias) {
        return Err("Alias directory must stay inside the own profile/bin directory".into());
    }
    // A versioned directory lets us prepare an updated binary while its old copy runs.
    if target.is_file() {
        return Ok(target);
    }
    let temporary = directory.join(format!(".preparing-{}.exe", std::process::id()));
    let result = (|| {
        std::fs::copy(source, &temporary).map_err(|e| format!("Copy own executable: {e}"))?;
        native::patch_version(&temporary, alias)?;
        std::fs::rename(&temporary, &target)
            .map_err(|e| format!("Publish own executable alias: {e}"))?;
        Ok(target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}
fn apply_startup(
    profile: &Path,
    previous: Option<&StoredIdentity>,
    next: &mut StoredIdentity,
) -> Result<(), String> {
    let old = previous.and_then(|state| state.owned_run.as_ref());
    let next_run = next.config.autostart.then(|| OwnedRun {
        name: next.config.startup_name.clone(),
        command: startup_command(&next.target_executable, profile),
    });
    if let Some(new) = &next_run {
        if let Some(existing) = native::read_run(&new.name)? {
            let ours = existing == new.command
                || old.is_some_and(|old| {
                    old.name == new.name
                        && old.command == existing
                        && owned_command(profile, &existing, &next.source_executable)
                });
            if !ours {
                return Err(
                    "That startup name is already used by another application; choose another name"
                        .into(),
                );
            }
        }
    }
    if let Some(old) = old {
        if !owned_command(profile, &old.command, &next.source_executable) {
            return Err(
                "Previous startup entry is not owned by Fluely; it was left untouched".into(),
            );
        }
        let existing = native::read_run(&old.name)?;
        if existing.as_ref().is_some_and(|value| value != &old.command) {
            return Err(
                "Previous startup entry was changed outside Fluely; it was left untouched".into(),
            );
        }
    }
    if let Some(new) = &next_run {
        native::write_run(&new.name, &new.command)?;
    }
    if let Some(old) = old {
        if next_run.as_ref().is_none_or(|new| new.name != old.name)
            && native::read_run(&old.name)?.as_deref() == Some(&old.command)
        {
            if let Err(error) = native::delete_run_if_equal(&old.name, &old.command) {
                if let Some(new) = &next_run {
                    let _ = native::delete_run_if_equal(&new.name, &new.command);
                }
                return Err(error);
            }
        }
    }
    next.owned_run = next_run;
    Ok(())
}
fn rollback_startup(previous: Option<&StoredIdentity>, next: &StoredIdentity) {
    if let Some(new) = &next.owned_run {
        let _ = native::delete_run_if_equal(&new.name, &new.command);
    }
    if let Some(old) = previous.and_then(|value| value.owned_run.as_ref()) {
        if native::read_run(&old.name).ok().flatten().is_none() {
            let _ = native::write_run(&old.name, &old.command);
        }
    }
}
fn save_for_profile(profile: &Path, config: IdentityConfig) -> Result<StoredIdentity, String> {
    config.validate()?;
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let previous = read_stored(profile)?.or_else(|| legacy_previous(&current));
    let source = source_for(&current, profile, previous.as_ref());
    let target = prepare_alias(profile, &source, &config.executable_alias)?;
    let mut next = StoredIdentity {
        version: 1,
        config,
        source_executable: source,
        target_executable: target,
        owned_run: None,
    };
    apply_startup(profile, previous.as_ref(), &mut next)?;
    if let Err(error) = persist(profile, &next) {
        rollback_startup(previous.as_ref(), &next);
        return Err(error);
    }
    Ok(next)
}
fn status(profile: &Path) -> Result<IdentityStatus, String> {
    let stored = read_stored(profile)?;
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let config = stored
        .as_ref()
        .map(|value| value.config.clone())
        .unwrap_or_default();
    let target = stored.as_ref().map(|value| value.target_executable.clone());
    let active = target
        .as_ref()
        .is_some_and(|value| equivalent(value, &current));
    let autostart_active =
        if let Some(run) = stored.as_ref().and_then(|value| value.owned_run.as_ref()) {
            native::read_run(&run.name)?.as_deref() == Some(&run.command)
        } else {
            false
        };
    Ok(IdentityStatus {
        config,
        current_executable: current.to_string_lossy().into(),
        managed_executable: target
            .map(|path| path.to_string_lossy().into())
            .unwrap_or_default(),
        alias_active: active,
        restart_required: !active,
        autostart_active,
        metadata_patched: stored.is_some(),
        automatic_alias_enabled: alias_enabled(),
        warning: if cfg!(not(windows)) {
            Some("Executable and startup aliases require Windows".into())
        } else if !alias_enabled() {
            Some("Automatic alias launch is disabled for this development/test process".into())
        } else {
            None
        },
    })
}
fn alias_enabled() -> bool {
    cfg!(windows)
        && !cfg!(debug_assertions)
        && std::env::var_os("FLUELY_DISABLE_ALIAS").as_deref() != Some(std::ffi::OsStr::new("1"))
}
fn launch(target: &Path) -> Result<(), String> {
    let mut command = std::process::Command::new(target);
    command
        .args(std::env::args_os().skip(1))
        .env(LOOP_ENV, target);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Start own executable alias: {e}"))
}

/// Call before creating Tauri windows; true means the parent should exit(0).
/// Debug/FLUELY_DISABLE_ALIAS=1 bypass copy/relaunch. Test profiles remain inherited.
pub fn bootstrap(identifier: &str) -> Result<bool, String> {
    let args: Vec<_> = std::env::args_os().collect();
    if let Some(index) = args
        .iter()
        .position(|argument| argument == PROFILE_ARGUMENT)
    {
        let value = args.get(index + 1).ok_or("Missing own profile directory")?;
        let path = PathBuf::from(value);
        if !path.is_absolute() {
            return Err("Own profile directory must be absolute".into());
        }
        std::env::set_var("FLUELY_DATA_DIR", path);
    }
    if !alias_enabled() {
        return Ok(false);
    }
    let profile = if let Some(path) =
        std::env::var_os("FLUELY_DATA_DIR").or_else(|| std::env::var_os("PLUELY_DATA_DIR"))
    {
        PathBuf::from(path)
    } else {
        PathBuf::from(
            std::env::var_os("APPDATA").ok_or("AppData unavailable for own identity profile")?,
        )
        .join(identifier)
    };
    if !profile.is_absolute() {
        return Err("Identity profile must be absolute".into());
    }
    std::fs::create_dir_all(&profile).map_err(|e| format!("Create own identity profile: {e}"))?;
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let previous = read_stored(&profile)?.or_else(|| legacy_previous(&current));
    if previous
        .as_ref()
        .is_some_and(|stored| equivalent(&current, &stored.target_executable))
    {
        return Ok(false);
    }
    // An unexpected child path cannot recursively copy/spawn itself.
    if std::env::var_os(LOOP_ENV).is_some() {
        return Err(
            "Alias relaunch did not reach the selected executable; restart was stopped".into(),
        );
    }
    let config = previous.map(|stored| stored.config).unwrap_or_default();
    let next = save_for_profile(&profile, config)?;
    launch(&next.target_executable)?;
    Ok(true)
}

#[tauri::command]
pub fn get_identity_status(app: AppHandle) -> Result<IdentityStatus, String> {
    status(&crate::app_paths::data_dir(&app)?)
}
#[tauri::command]
pub async fn save_identity_config(
    app: AppHandle,
    config: IdentityConfig,
) -> Result<IdentityStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<IdentityState>();
        let _guard = state
            .mutation
            .lock()
            .map_err(|_| "Identity settings lock unavailable")?;
        let profile = crate::app_paths::data_dir(&app)?;
        save_for_profile(&profile, config)?;
        status(&profile)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn restart_identity(app: AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<IdentityState>();
        let _guard = state
            .mutation
            .lock()
            .map_err(|_| "Identity settings lock unavailable")?;
        let profile = crate::app_paths::data_dir(&app2)?;
        let stored = read_stored(&profile)?.ok_or("Save identity settings before restarting")?;
        if !stored.target_executable.is_file() {
            return Err("Own alias executable is missing; save the settings again".into());
        }
        launch(&stored.target_executable)
    })
    .await
    .map_err(|e| e.to_string())??;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_config_members_receive_neutral_defaults() {
        let config: IdentityConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(config, IdentityConfig::default());
        config.validate().unwrap();
    }
    #[test]
    fn configuration_roundtrip_preserves_unicode_and_rejects_unknown_fields() {
        let config = IdentityConfig {
            executable_alias: "Мій помічник.exe".into(),
            startup_name: "Мій помічник".into(),
            autostart: true,
        };
        assert_eq!(
            serde_json::from_slice::<IdentityConfig>(&serde_json::to_vec(&config).unwrap())
                .unwrap(),
            config
        );
        assert!(serde_json::from_str::<IdentityConfig>("{\"system_policy\":true}").is_err());
    }
    #[test]
    fn startup_ownership_never_accepts_unquoted_or_prefix_paths() {
        assert!(command_executable("C:\\a.exe --x").is_none());
        assert_eq!(
            command_executable("\"C:\\own\\app.exe\" --x"),
            Some(PathBuf::from("C:\\own\\app.exe"))
        );
    }
    #[test]
    fn owned_legacy_command_requires_an_exact_executable_path() {
        let source = Path::new("C:\\Fluely\\fluely.exe");
        let profile = Path::new("C:\\own-profile");
        assert!(owned_command(profile, "C:\\Fluely\\fluely.exe ", source));
        assert!(owned_command(profile, "\"C:\\Fluely\\fluely.exe\"", source));
        assert!(!owned_command(
            profile,
            "C:\\Fluely\\fluely.exe.other ",
            source
        ));
        assert!(!owned_command(
            profile,
            "C:\\AnotherApp\\fluely.exe ",
            source
        ));
    }
    #[test]
    fn managed_targets_cannot_traverse_outside_profile() {
        let profile =
            std::env::temp_dir().join(format!("fluely-identity-path-test-{}", std::process::id()));
        std::fs::create_dir_all(profile.join("bin/version")).unwrap();
        assert!(managed_path(
            &profile,
            &profile.join("bin/version/my program.exe"),
            "my program.exe"
        ));
        assert!(!managed_path(
            &profile,
            &profile.join("bin/../my program.exe"),
            "my program.exe"
        ));
        assert!(!managed_path(
            &profile,
            &profile.join("foreign/my program.exe"),
            "my program.exe"
        ));
        let _ = std::fs::remove_dir_all(profile);
    }
}
