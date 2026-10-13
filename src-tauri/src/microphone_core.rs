//! Bounded native speech segmentation. Independent of device and GUI runtimes.
pub const RATE: usize = 16_000;
use std::collections::VecDeque;
const FRAME: usize = 320;
pub struct Segmenter {
    frame: Vec<f32>,
    pre: VecDeque<f32>,
    speech: Vec<f32>,
    voiced: usize,
    quiet: usize,
}
impl Default for Segmenter {
    fn default() -> Self {
        Self::new()
    }
}
impl Segmenter {
    pub fn new() -> Self {
        Self {
            frame: Vec::with_capacity(FRAME),
            pre: VecDeque::new(),
            speech: Vec::new(),
            voiced: 0,
            quiet: 0,
        }
    }
    pub fn push(&mut self, sample: f32) -> Option<Vec<f32>> {
        self.frame.push(if sample.is_finite() {
            sample.clamp(-1.0, 1.0)
        } else {
            0.0
        });
        if self.frame.len() < FRAME {
            return None;
        }
        let rms = (self.frame.iter().map(|x| x * x).sum::<f32>() / FRAME as f32).sqrt();
        let voice = rms >= 0.012;
        if voice && self.speech.is_empty() {
            self.speech.extend(self.pre.drain(..));
        }
        if voice || !self.speech.is_empty() {
            self.speech.append(&mut self.frame);
            if voice {
                self.voiced += 1;
                self.quiet = 0;
            } else {
                self.quiet += 1;
            }
            if self.quiet >= 30 || self.speech.len() >= RATE * 30 {
                return self.finish();
            }
        } else {
            self.pre.extend(self.frame.drain(..));
            while self.pre.len() > RATE * 3 / 10 {
                self.pre.pop_front();
            }
        }
        None
    }
    pub fn finish(&mut self) -> Option<Vec<f32>> {
        if !self.speech.is_empty() {
            self.speech.append(&mut self.frame);
        }
        let speech = std::mem::take(&mut self.speech);
        let accepted = self.voiced >= 8;
        self.voiced = 0;
        self.quiet = 0;
        self.pre.clear();
        self.frame.clear();
        accepted.then_some(speech)
    }
}
pub fn wav(samples: &[f32]) -> Vec<u8> {
    let len = (samples.len() * 2) as u32;
    let mut bytes = Vec::with_capacity(44 + len as usize);
    bytes.extend(b"RIFF");
    bytes.extend((36 + len).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16u32.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend((RATE as u32).to_le_bytes());
    bytes.extend((RATE as u32 * 2).to_le_bytes());
    bytes.extend(2u16.to_le_bytes());
    bytes.extend(16u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(len.to_le_bytes());
    for sample in samples {
        bytes.extend(((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).to_le_bytes());
    }
    bytes
}
#[cfg(test)]
mod tests {
    use super::*;
    fn feed(s: &mut Segmenter, value: f32, count: usize) -> Vec<Vec<f32>> {
        (0..count).filter_map(|_| s.push(value)).collect()
    }
    #[test]
    fn silence_and_clicks_never_become_speech() {
        let mut s = Segmenter::new();
        assert!(feed(&mut s, 0.0, RATE * 2).is_empty());
        feed(&mut s, 0.2, 320);
        assert!(feed(&mut s, 0.0, RATE * 2).is_empty());
        assert!(s.finish().is_none());
    }
    #[test]
    fn speech_has_preroll_and_stops_after_trailing_silence() {
        let mut s = Segmenter::new();
        feed(&mut s, 0.0, RATE);
        assert!(feed(&mut s, 0.1, RATE).is_empty());
        let segments = feed(&mut s, 0.0, RATE);
        assert_eq!(segments.len(), 1);
        assert!(segments[0].len() >= RATE + RATE / 4);
        assert!(segments[0].len() < RATE * 3);
    }
    #[test]
    fn uninterrupted_speech_is_bounded_and_continues() {
        let mut s = Segmenter::new();
        let segments = feed(&mut s, 0.1, RATE * 65);
        assert_eq!(segments.len(), 2);
        assert!(segments.iter().all(|x| x.len() <= RATE * 30));
        assert!(s.finish().is_some());
    }
    #[test]
    fn stop_flushes_real_speech_and_wav_is_pcm16_mono() {
        let mut s = Segmenter::new();
        feed(&mut s, 0.1, RATE);
        let samples = s.finish().expect("speech at stop must be flushed");
        let data = wav(&samples);
        assert_eq!(&data[..4], b"RIFF");
        assert_eq!(&data[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes(data[22..24].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(data[24..28].try_into().unwrap()), 16_000);
        assert_eq!(u16::from_le_bytes(data[34..36].try_into().unwrap()), 16);
        assert_eq!(data.len(), 44 + samples.len() * 2);
    }
}
