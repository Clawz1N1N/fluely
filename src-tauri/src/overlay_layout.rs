//! Pure custom panel layout contract. Positions are physical; sizes are CSS pixels.
use serde::{Deserialize, Serialize};
pub const ACTIONS: [&str; 8] = [
    "listen",
    "screenshot",
    "continuous",
    "answer",
    "chat",
    "tts",
    "mode",
    "settings",
];
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PanelAction {
    pub action: String,
    pub enabled: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CustomPanel {
    pub id: String,
    #[serde(default)]
    pub monitor: Option<String>,
    pub x: i32,
    pub y: i32,
    pub columns: u32,
    pub gap: u32,
    pub padding: u32,
    pub button_size: u32,
    pub opacity: f64,
    pub actions: Vec<PanelAction>,
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PanelExtent {
    pub width: u32,
    pub height: u32,
}
fn validate_panel(panel: &CustomPanel) -> Result<(), String> {
    let id = &panel.id;
    if id.is_empty()
        || id.len() > 48
        || !id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        || id.starts_with('-')
        || id.ends_with('-')
    {
        return Err("Panel IDs must be 1–48 lowercase letters, digits or hyphens".into());
    }
    if panel
        .monitor
        .as_ref()
        .is_some_and(|key| key.is_empty() || key.len() > 512 || key.chars().any(char::is_control))
    {
        return Err("Invalid panel monitor key".into());
    }
    if !(1..=8).contains(&panel.columns)
        || !(24..=96).contains(&panel.button_size)
        || panel.gap > 32
        || panel.padding > 24
    {
        return Err(
            "Panel columns, button size, gap or padding is outside its allowed range".into(),
        );
    }
    if !panel.opacity.is_finite() || !(0.05..=1.0).contains(&panel.opacity) {
        return Err("Panel opacity must be between 0.05 and 1".into());
    }
    if panel.actions.len() > ACTIONS.len() {
        return Err("Too many actions in a panel".into());
    }
    let mut assigned = std::collections::HashSet::new();
    for action in &panel.actions {
        if !ACTIONS.contains(&action.action.as_str()) || !assigned.insert(&action.action) {
            return Err("Panel contains an unknown or duplicate action".into());
        }
    }
    Ok(())
}
pub fn validate_layout(panels: &[CustomPanel]) -> Result<(), String> {
    if panels.is_empty() || panels.len() > 16 {
        return Err("A layout must contain 1–16 groups".into());
    }
    let mut ids = std::collections::HashSet::new();
    let mut assigned = std::collections::HashSet::new();
    for panel in panels {
        validate_panel(panel)?;
        if !ids.insert(&panel.id) {
            return Err("Duplicate panel ID".into());
        }
        for action in &panel.actions {
            if !assigned.insert(&action.action) {
                return Err("Each action must belong to exactly one group".into());
            }
        }
    }
    if assigned.len() != ACTIONS.len() {
        return Err("Every action must belong to a group, including disabled actions".into());
    }
    Ok(())
}
/// Zero extent means all controls are disabled; native callers must skip that window.
pub fn panel_extent(panel: &CustomPanel) -> Result<PanelExtent, String> {
    validate_panel(panel)?;
    let count = panel.actions.iter().filter(|action| action.enabled).count() as u32;
    if count == 0 {
        return Ok(PanelExtent {
            width: 0,
            height: 0,
        });
    }
    let columns = panel.columns.min(count);
    let rows = count.div_ceil(columns);
    Ok(PanelExtent {
        width: columns * panel.button_size + (columns - 1) * panel.gap + 2 * panel.padding,
        height: rows * panel.button_size + (rows - 1) * panel.gap + 2 * panel.padding,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn panel() -> CustomPanel {
        CustomPanel {
            id: "main".into(),
            monitor: Some("display@-1920,0".into()),
            x: -1900,
            y: 100,
            columns: 3,
            gap: 8,
            padding: 4,
            button_size: 40,
            opacity: 0.28,
            actions: ACTIONS
                .iter()
                .map(|a| PanelAction {
                    action: (*a).into(),
                    enabled: true,
                })
                .collect(),
        }
    }
    #[test]
    fn complete_layout_keeps_disabled_actions_assigned() {
        let mut item = panel();
        item.actions[0].enabled = false;
        validate_layout(&[item]).unwrap();
    }
    #[test]
    fn grid_extent_has_no_empty_trailing_columns_and_counts_only_visible_buttons() {
        let mut item = panel();
        assert_eq!(
            panel_extent(&item).unwrap(),
            PanelExtent {
                width: 144,
                height: 144
            }
        );
        item.actions
            .iter_mut()
            .skip(2)
            .for_each(|a| a.enabled = false);
        assert_eq!(
            panel_extent(&item).unwrap(),
            PanelExtent {
                width: 96,
                height: 48
            }
        );
        item.actions.iter_mut().for_each(|a| a.enabled = false);
        assert_eq!(
            panel_extent(&item).unwrap(),
            PanelExtent {
                width: 0,
                height: 0
            }
        );
    }
    #[test]
    fn rejects_unknown_duplicate_missing_actions_and_duplicate_groups() {
        let mut item = panel();
        item.actions[0].action = "foreign".into();
        assert!(validate_layout(&[item]).is_err());
        let mut item = panel();
        item.actions[0].action = "tts".into();
        assert!(validate_layout(&[item]).is_err());
        let mut item = panel();
        item.actions.pop();
        assert!(validate_layout(&[item]).is_err());
        assert!(validate_layout(&[panel(), panel()]).is_err());
        assert!(validate_layout(&[]).is_err());
    }
    #[test]
    fn rejects_nonfinite_opacity_bad_slugs_and_out_of_range_grid_fields() {
        for id in ["../main", "panel/main", "UPPER", "", "x y"] {
            let mut item = panel();
            item.id = id.into();
            assert!(validate_layout(&[item]).is_err());
        }
        for value in [f64::NAN, f64::INFINITY, 0.0, 1.1] {
            let mut item = panel();
            item.opacity = value;
            assert!(validate_layout(&[item]).is_err());
        }
        let mut item = panel();
        item.columns = 0;
        assert!(panel_extent(&item).is_err());
        let mut item = panel();
        item.button_size = 97;
        assert!(panel_extent(&item).is_err());
    }
    #[test]
    fn layout_serialization_preserves_physical_positions_and_order() {
        let item = panel();
        assert_eq!(
            serde_json::from_slice::<CustomPanel>(&serde_json::to_vec(&item).unwrap()).unwrap(),
            item
        );
    }
}
