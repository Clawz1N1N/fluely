//! The production batching and raw-frame comparison core. No native dependencies.
use std::time::{Duration, Instant};

pub fn capture_due(mode: &str, elapsed: Duration, interval: u64) -> bool {
    matches!(mode, "interval" | "after_speech") && elapsed >= Duration::from_secs(interval.max(2))
}

#[derive(Default)]
pub struct RunGeneration {
    running: std::sync::atomic::AtomicBool,
    generation: std::sync::atomic::AtomicU64,
}

impl RunGeneration {
    pub fn active_token(&self) -> Option<u64> {
        use std::sync::atomic::Ordering;
        let token = self.generation.load(Ordering::SeqCst);
        self.is_active(token).then_some(token)
    }
    // The caller serializes start/stop with its lifecycle lock.
    pub fn start(&self) -> Option<u64> {
        use std::sync::atomic::Ordering;
        if self.running.load(Ordering::SeqCst) {
            return None;
        }
        let token = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.running.store(true, Ordering::SeqCst);
        Some(token)
    }
    pub fn stop(&self) {
        use std::sync::atomic::Ordering;
        self.running.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
    pub fn is_active(&self, token: u64) -> bool {
        use std::sync::atomic::Ordering;
        self.running.load(Ordering::SeqCst) && self.generation.load(Ordering::SeqCst) == token
    }
}

pub struct RawFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

impl RawFrame {
    pub fn difference(&self, other: &Self) -> f32 {
        let expected = self.width as usize * self.height as usize * 4;
        if self.width != other.width
            || self.height != other.height
            || self.rgba.len() != expected
            || other.rgba.len() != expected
        {
            return 1.0;
        }
        let mut total = 0;
        let mut changed = 0;
        for y in (0..self.height as usize).step_by(8) {
            for x in (0..self.width as usize).step_by(8) {
                let offset = (y * self.width as usize + x) * 4;
                total += 1;
                if (0..3).any(|c| self.rgba[offset + c].abs_diff(other.rgba[offset + c]) > 16) {
                    changed += 1;
                }
            }
        }
        if total == 0 {
            0.0
        } else {
            changed as f32 / total as f32
        }
    }
}

pub struct Dispatch<F, T> {
    pub request_id: u64,
    pub frames: Vec<F>,
    pub transcript: Vec<T>,
    pub questions: Vec<String>,
    pub client_ids: Vec<String>,
}

pub struct BatchQueue<F, T> {
    frames: Vec<F>,
    transcript: Vec<T>,
    questions: Vec<String>,
    client_ids: Vec<String>,
    first_pending: Option<Instant>,
    in_flight: Option<u64>,
    next_request_id: u64,
    audio_pending: usize,
}

impl<F, T> Default for BatchQueue<F, T> {
    fn default() -> Self {
        Self {
            frames: vec![],
            transcript: vec![],
            questions: vec![],
            client_ids: vec![],
            first_pending: None,
            in_flight: None,
            next_request_id: 1,
            audio_pending: 0,
        }
    }
}

impl<F, T> BatchQueue<F, T> {
    pub fn discard_context(&mut self) -> Vec<String> {
        self.frames.clear();
        self.transcript.clear();
        self.questions.clear();
        self.first_pending = None;
        // Keep in_flight, next_request_id and audio_pending: their owners still
        // acknowledge/release exactly once after the transition cancels them.
        std::mem::take(&mut self.client_ids)
    }
    fn mark_pending(&mut self, now: Instant) {
        self.first_pending.get_or_insert(now);
    }

    pub fn frames(&mut self, items: Vec<F>, limit: usize, now: Instant) {
        if items.is_empty() {
            return;
        }
        self.mark_pending(now);
        self.frames.extend(items);
        self.frames
            .drain(..self.frames.len().saturating_sub(limit.max(1)));
    }
    pub fn transcript(&mut self, item: T, now: Instant) {
        self.mark_pending(now);
        self.transcript.push(item);
        self.transcript
            .drain(..self.transcript.len().saturating_sub(256));
    }
    pub fn question(&mut self, text: String, now: Instant) -> Result<(), String> {
        let text = text.trim();
        if text.is_empty() {
            return Err("Question is empty".into());
        }
        if text.len() > 32_768 {
            return Err("Question exceeds 32768 bytes".into());
        }
        if self.questions.len() >= 64 {
            return Err("Pending question queue is full".into());
        }
        self.mark_pending(now);
        self.questions.push(text.into());
        Ok(())
    }
    pub fn audio(&mut self, pending: bool) -> Result<(), String> {
        self.audio_pending = if pending {
            self.audio_pending
                .checked_add(1)
                .ok_or("Audio pending count overflow")?
        } else {
            self.audio_pending
                .checked_sub(1)
                .ok_or("No pending transcription to finish")?
        };
        Ok(())
    }
    pub fn client(&mut self, id: String) {
        if !self.client_ids.contains(&id) {
            self.client_ids.push(id);
        }
    }
    pub fn dispatch(&mut self) -> Option<Dispatch<F, T>> {
        if self.in_flight.is_some() || self.audio_pending > 0 || self.first_pending.is_none() {
            return None;
        }
        let id = self.next_request_id;
        self.next_request_id = self.next_request_id.checked_add(1)?;
        self.in_flight = Some(id);
        self.first_pending = None;
        Some(Dispatch {
            request_id: id,
            frames: std::mem::take(&mut self.frames),
            transcript: std::mem::take(&mut self.transcript),
            questions: std::mem::take(&mut self.questions),
            client_ids: std::mem::take(&mut self.client_ids),
        })
    }
    pub fn acknowledge(&mut self, id: u64) -> Result<(), String> {
        if self.in_flight != Some(id) {
            return Err(format!("Request {id} is not the active continuous request"));
        }
        self.in_flight = None;
        Ok(())
    }
    // Caller holds its queue lock across emission and rollback.
    pub fn restore(&mut self, batch: Dispatch<F, T>, now: Instant) {
        self.in_flight = None;
        self.frames = batch.frames;
        self.transcript = batch.transcript;
        self.questions = batch.questions;
        self.client_ids = batch.client_ids;
        self.first_pending = Some(now);
    }
    pub fn max_wait_elapsed(&self, now: Instant, wait: Duration) -> bool {
        self.first_pending
            .is_some_and(|first| now.saturating_duration_since(first) >= wait)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn sleep_boundary_discards_stale_context_preserving_inflight_ack_and_counted_stt() {
        let now = Instant::now();
        let mut queue = BatchQueue::<u8, String>::default();
        queue.question("active".into(), now).unwrap();
        let active = queue.dispatch().unwrap();
        queue.frames(vec![1], 3, now);
        queue.transcript("old system".into(), now);
        queue.question("old mic question".into(), now).unwrap();
        queue.client("pending-client".into());
        queue.audio(true).unwrap();
        assert_eq!(queue.discard_context(), ["pending-client"]);
        queue.transcript("new system".into(), now);
        assert!(queue.dispatch().is_none());
        queue.acknowledge(active.request_id).unwrap();
        assert!(queue.dispatch().is_none());
        queue.audio(false).unwrap();
        let fresh = queue.dispatch().unwrap();
        assert!(fresh.frames.is_empty());
        assert!(fresh.questions.is_empty());
        assert!(fresh.client_ids.is_empty());
        assert_eq!(fresh.transcript, ["new system"]);
        assert!(fresh.request_id > active.request_id);
    }

    #[test]
    fn restarting_never_reactivates_the_old_worker() {
        let run = RunGeneration::default();
        let old = run.start().unwrap();
        assert!(run.is_active(old));
        assert!(run.start().is_none());
        run.stop();
        assert!(!run.is_active(old));
        let fresh = run.start().unwrap();
        assert!(run.is_active(fresh));
        assert!(!run.is_active(old));
        assert!(fresh > old);
    }

    #[test]
    fn manual_mode_never_takes_an_automatic_capture() {
        assert!(!capture_due("manual", Duration::from_secs(3600), 2));
        assert!(!capture_due("interval", Duration::from_secs(4), 5));
        assert!(capture_due("interval", Duration::from_secs(5), 5));
        assert!(capture_due("after_speech", Duration::from_secs(5), 5));
    }

    #[test]
    fn questions_append_without_releasing_active_request() {
        let now = Instant::now();
        let mut queue = BatchQueue::<u8, String>::default();
        queue.question("first".into(), now).unwrap();
        let first = queue.dispatch().unwrap();
        queue.question("second".into(), now).unwrap();
        queue.question("third".into(), now).unwrap();
        assert!(queue.dispatch().is_none());
        assert!(queue.acknowledge(first.request_id + 1).is_err());
        assert!(queue.dispatch().is_none());
        queue.acknowledge(first.request_id).unwrap();
        let next = queue.dispatch().unwrap();
        assert_eq!(next.questions, ["second", "third"]);
        assert!(next.request_id > first.request_id);
        assert!(queue.acknowledge(first.request_id).is_err());
    }

    #[test]
    fn transcriptions_form_one_combined_request_after_all_channels_finish() {
        let now = Instant::now();
        let mut queue = BatchQueue::<u8, String>::default();
        queue.audio(true).unwrap();
        queue.audio(true).unwrap();
        queue.frames(vec![1], 3, now);
        queue.question("explain".into(), now).unwrap();
        queue.transcript("system words".into(), now);
        queue.audio(false).unwrap();
        assert!(queue.dispatch().is_none());
        queue.transcript("mic words".into(), now);
        queue.audio(false).unwrap();
        let batch = queue.dispatch().unwrap();
        assert_eq!(batch.frames, [1]);
        assert_eq!(batch.transcript, ["system words", "mic words"]);
        assert_eq!(batch.questions, ["explain"]);
        assert!(queue.audio(false).is_err());
    }

    #[test]
    fn bounded_context_keeps_recent_frames_and_transcript() {
        let now = Instant::now();
        let mut queue = BatchQueue::<usize, usize>::default();
        queue.frames(vec![1, 2, 3, 4], 2, now);
        for i in 0..300 {
            queue.transcript(i, now);
        }
        let batch = queue.dispatch().unwrap();
        assert_eq!(batch.frames, [3, 4]);
        assert_eq!(batch.transcript.len(), 256);
        assert_eq!(batch.transcript[0], 44);
    }

    #[test]
    fn questions_report_overflow_instead_of_silently_dropping() {
        let now = Instant::now();
        let mut queue = BatchQueue::<u8, u8>::default();
        for i in 0..64 {
            queue.question(i.to_string(), now).unwrap();
        }
        assert!(queue.question("overflow".into(), now).is_err());
        assert_eq!(queue.dispatch().unwrap().questions.len(), 64);
    }

    #[test]
    fn after_speech_deadline_starts_with_first_context() {
        let now = Instant::now();
        let mut queue = BatchQueue::<u8, u8>::default();
        assert!(!queue.max_wait_elapsed(now, Duration::ZERO));
        queue.frames(vec![1], 3, now);
        queue.frames(vec![2], 3, now + Duration::from_secs(4));
        assert!(!queue.max_wait_elapsed(now + Duration::from_secs(9), Duration::from_secs(10)));
        assert!(queue.max_wait_elapsed(now + Duration::from_secs(10), Duration::from_secs(10)));
        queue.dispatch().unwrap();
        assert!(!queue.max_wait_elapsed(now + Duration::from_secs(100), Duration::ZERO));
    }

    #[test]
    fn delivery_failure_restores_context_and_unlocks() {
        let now = Instant::now();
        let mut queue = BatchQueue::<u8, u8>::default();
        queue.frames(vec![1], 3, now);
        queue.question("retry".into(), now).unwrap();
        let batch = queue.dispatch().unwrap();
        queue.restore(batch, now);
        let retry = queue.dispatch().unwrap();
        assert_eq!(retry.frames, [1]);
        assert_eq!(retry.questions, ["retry"]);
    }

    #[test]
    fn per_monitor_raw_frames_compare_without_encoded_image_decoding() {
        let mut previous = HashMap::new();
        previous.insert(
            1,
            RawFrame {
                width: 8,
                height: 8,
                rgba: vec![0; 256],
            },
        );
        previous.insert(
            2,
            RawFrame {
                width: 8,
                height: 8,
                rgba: vec![255; 256],
            },
        );
        let frame = RawFrame {
            width: 8,
            height: 8,
            rgba: vec![0; 256],
        };
        assert_eq!(previous[&1].difference(&frame), 0.0);
        assert_eq!(previous[&2].difference(&frame), 1.0);
        let resized = RawFrame {
            width: 16,
            height: 4,
            rgba: vec![0; 256],
        };
        assert_eq!(previous[&1].difference(&resized), 1.0);
    }
}
