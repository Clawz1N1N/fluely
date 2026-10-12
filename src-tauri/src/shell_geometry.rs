//! Physical desktop geometry, independent of native GUI libraries.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Point { pub x: i32, pub y: i32 }
#[derive(Clone, Copy, Debug)]
pub struct Bounds { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }
#[derive(Clone, Copy, Debug)]
pub struct Extent { pub width: u32, pub height: u32 }

pub fn physical_extent(width: f64, height: f64, scale: f64) -> Extent {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    Extent { width: (width * scale).round().clamp(1.0, u32::MAX as f64) as u32,
        height: (height * scale).round().clamp(1.0, u32::MAX as f64) as u32 }
}
fn coordinate(value: i64) -> i32 { value.clamp(i32::MIN as i64, i32::MAX as i64) as i32 }
pub fn clamp(point: Point, size: Extent, monitor: Bounds) -> Point {
    let mx = monitor.x as i64;
    let my = monitor.y as i64;
    Point { x: coordinate((point.x as i64).clamp(mx, (mx + monitor.width as i64 - size.width as i64).max(mx))),
        y: coordinate((point.y as i64).clamp(my, (my + monitor.height as i64 - size.height as i64).max(my))) }
}
pub fn choose_monitor(point: Point, size: Extent, monitors: &[Bounds]) -> Option<usize> {
    let x = point.x as i64 + size.width as i64 / 2;
    let y = point.y as i64 + size.height as i64 / 2;
    monitors.iter().enumerate().min_by_key(|(_, monitor)| {
        let mx = monitor.x as i64;
        let my = monitor.y as i64;
        let dx = (x - x.clamp(mx, mx + monitor.width.saturating_sub(1) as i64)) as i128;
        let dy = (y - y.clamp(my, my + monitor.height.saturating_sub(1) as i64)) as i128;
        dx * dx + dy * dy
    }).map(|(index, _)| index)
}
pub fn constrained_move(current: Point, requested: Point, size: Extent, monitors: &[Bounds], axis: &str) -> Option<(Point, usize)> {
    let proposed = Point { x: if axis == "y" { current.x } else { requested.x },
        y: if axis == "x" { current.y } else { requested.y } };
    let monitor = choose_monitor(proposed, size, monitors)?;
    let mut result = clamp(proposed, size, monitors[monitor]);
    if axis == "x" { result.y = current.y; }
    if axis == "y" { result.x = current.x; }
    Some((result, monitor))
}
pub fn default_position(label: &str, monitor: Bounds, size: Extent, button_index: usize, scale: f64) -> Point {
    let mx = monitor.x as i64;
    let my = monitor.y as i64;
    let centered_x = mx + (monitor.width as i64 - size.width as i64) / 2;
    let centered_y = my + (monitor.height as i64 - size.height as i64) / 2;
    let (x, y) = match label {
        "strip-left" => (mx, centered_y),
        "strip-right" => (mx + monitor.width as i64 - size.width as i64, centered_y),
        "strip-top" => (centered_x, my),
        "strip-bottom" => (centered_x, my + monitor.height as i64 - size.height as i64),
        label if label.starts_with("button-") => (mx + (16.0 * scale).round() as i64,
            my + monitor.height as i64 / 6 + button_index as i64 * (56.0 * scale).round() as i64),
        _ => (centered_x, centered_y),
    };
    clamp(Point { x: coordinate(x), y: coordinate(y) }, size, monitor)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn left() -> Bounds { Bounds { x: -1920, y: -240, width: 1920, height: 1080 } }
    #[test]
    fn oversized_window_anchors_without_inverted_clamp_range() {
        assert_eq!(clamp(Point { x: 100, y: 100 }, Extent { width: 3000, height: 2000 }, left()), Point { x: -1920, y: -240 });
    }
    #[test]
    fn proposed_location_can_cross_to_another_monitor() {
        let monitors = [left(), Bounds { x: 0, y: 0, width: 2560, height: 1440 }];
        assert_eq!(choose_monitor(Point { x: 300, y: 200 }, Extent { width: 44, height: 44 }, &monitors), Some(1));
        let (position, monitor) = constrained_move(Point { x: -100, y: 100 }, Point { x: 500, y: 200 }, Extent { width: 44, height: 44 }, &monitors, "free").unwrap();
        assert_eq!(monitor, 1);
        assert_eq!(position, Point { x: 500, y: 200 });
    }
    #[test]
    fn locked_axis_uses_the_start_coordinate_on_a_negative_monitor() {
        let (position, _) = constrained_move(Point { x: -1800, y: 50 }, Point { x: -1600, y: 400 }, Extent { width: 84, height: 600 }, &[left()], "x").unwrap();
        assert_eq!(position, Point { x: -1600, y: 50 });
    }
    #[test]
    fn high_dpi_defaults_include_physical_monitor_origin() {
        let size = physical_extent(56.0, 400.0, 1.5);
        assert_eq!(size.width, 84);
        let right = default_position("strip-right", left(), size, 0, 1.5);
        assert_eq!(right, Point { x: -84, y: 0 });
        let button = default_position("button-listen", left(), physical_extent(44.0, 44.0, 1.5), 0, 1.5);
        assert_eq!(button, Point { x: -1896, y: -60 });
    }
    #[test]
    fn offscreen_saved_placement_finds_nearest_display() {
        let monitor = choose_monitor(Point { x: -5000, y: -3000 }, Extent { width: 44, height: 44 }, &[left()]).unwrap();
        assert_eq!(monitor, 0);
        assert_eq!(clamp(Point { x: -5000, y: -3000 }, Extent { width: 44, height: 44 }, left()), Point { x: -1920, y: -240 });
    }
}
