//! Meter original capture samples, independently of voice detection/transcription.
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct AudioLevel<'a> { channel: &'a str, level: f32 }

pub struct Meter { last: Option<Instant> }
impl Meter {
    pub fn new() -> Self { Self { last: None } }
    pub fn update(&mut self, app: &AppHandle, channel: &str, samples: &[f32]) {
        let now=Instant::now();
        if self.last.is_some_and(|last|now.duration_since(last)<Duration::from_millis(80)){return;}
        self.last=Some(now);
        let _=app.emit("audio-level",AudioLevel { channel, level: rms_level(samples) });
    }
}
fn rms_level(samples: &[f32]) -> f32 {
    if samples.is_empty(){return 0.0;}
    let sum=samples.iter().filter(|value|value.is_finite()).map(|value|(*value as f64).clamp(-1.0,1.0).powi(2)).sum::<f64>();
    ((sum/samples.len() as f64).sqrt()*4.0).clamp(0.0,1.0) as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silence_invalid_samples_and_full_scale_stay_bounded() {
        assert_eq!(rms_level(&[]),0.0);assert_eq!(rms_level(&[0.0;100]),0.0);
        assert_eq!(rms_level(&[f32::NAN,f32::INFINITY]),0.0);
        assert_eq!(rms_level(&[1.0,-1.0,10.0]),1.0);
        assert!(rms_level(&[0.1,-0.1])>rms_level(&[0.01,-0.01]));
    }
}
