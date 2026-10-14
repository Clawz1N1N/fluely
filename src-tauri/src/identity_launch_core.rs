use std::{ffi::OsString, path::Path, process::Command};
pub fn command(target: &Path, profile: &Path, args: impl IntoIterator<Item = OsString>) -> Command {
    let mut command = Command::new(target);
    command.args(args).env("FLUELY_ALIAS_RELAUNCH", target)
        .env("FLUELY_DATA_DIR", profile).env("PLUELY_DATA_DIR", profile);
    command
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_alias_keeps_the_resolved_profile_when_no_cli_profile_was_given() {
        let profile = Path::new("C:\\Users\\owner\\AppData\\Roaming\\com.clawz1n1n.fluely");
        let child = command(Path::new("C:\\profile\\bin\\my program.exe"), profile, Vec::<OsString>::new());
        for key in ["FLUELY_DATA_DIR", "PLUELY_DATA_DIR"] {
            assert_eq!(child.get_envs().find(|(name, _)| *name == key).and_then(|(_, value)| value), Some(profile.as_os_str()));
        }
    }
}
