//! Atomic request and token accounting. Times are Unix milliseconds.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const WINDOWS_MS: [u64; 4] = [1_000, 60_000, 3_600_000, 86_400_000];

#[derive(Debug, Clone)]
pub struct Candidate {
    pub id: String,
    pub kind: String,
    pub rank: i32,
    pub enabled: bool,
    pub supports_images: bool,
    pub limits: [u32; 4],
    pub token_limits: [u64; 4],
    pub output_tokens: u64,
    pub manual_neutral: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEvent {
    pub id: u64,
    pub at: u64,
    pub tokens: u64,
    pub settled: bool,
}

#[derive(Debug, Clone, Default)]
pub struct RegistryCore {
    pub requests: HashMap<String, Vec<u64>>,
    pub global_requests: Vec<u64>,
    pub cooldowns: HashMap<String, u64>,
    pub global_limits: [u32; 4],
    pub manual_neutral: bool,
    pub current_provider_id: Option<String>,
    pub tokens: HashMap<String, Vec<TokenEvent>>,
    pub next_token_id: u64,
}

impl RegistryCore {
    #[cfg(test)]
    pub fn pick(
        &mut self,
        candidates: &[Candidate],
        kind: &str,
        needs_images: bool,
        exclude_ids: &[String],
        now: u64,
    ) -> Option<String> {
        self.pick_with_tokens(candidates, kind, needs_images, exclude_ids, now, 0)
            .map(|(id, _)| id)
    }

    pub fn pick_with_tokens(
        &mut self,
        candidates: &[Candidate],
        kind: &str,
        needs_images: bool,
        exclude_ids: &[String],
        now: u64,
        input_tokens: u64,
    ) -> Option<(String, u64)> {
        self.pick_with_token_estimates(candidates, kind, needs_images, exclude_ids, now, input_tokens, &HashMap::new())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn pick_with_token_estimates(
        &mut self, candidates: &[Candidate], kind: &str, needs_images: bool,
        exclude_ids: &[String], now: u64, input_tokens: u64,
        estimates: &HashMap<String,u64>,
    ) -> Option<(String, u64)> {
        self.prune(now);
        if self.manual_neutral {
            return None;
        }
        let mut eligible: Vec<_> = candidates
            .iter()
            .filter(|p| {
                p.enabled
                    && !p.manual_neutral
                    && p.kind == kind
                    && (!needs_images || p.supports_images)
                    && !exclude_ids.contains(&p.id)
            })
            .collect();
        eligible.sort_by(|a, b| a.rank.cmp(&b.rank).then(a.id.cmp(&b.id)));
        let selected = eligible.into_iter().find(|p| {
            self.next_allowed_with_tokens(p, now, estimates.get(&p.id).copied().unwrap_or(input_tokens).saturating_add(p.output_tokens))
                .is_none()
        })?;
        // Check every gate before mutating either budget. One event, regardless
        // of how many windows are limited, charges exactly one attempted request.
        self.requests
            .entry(selected.id.clone())
            .or_default()
            .push(now);
        self.global_requests.push(now);
        self.current_provider_id = Some(selected.id.clone());
        self.next_token_id = self.next_token_id.saturating_add(1);
        let token_id = self.next_token_id;
        self.tokens
            .entry(selected.id.clone())
            .or_default()
            .push(TokenEvent {
                id: token_id,
                at: now,
                tokens: estimates.get(&selected.id).copied().unwrap_or(input_tokens).saturating_add(selected.output_tokens),
                settled: false,
            });
        Some((selected.id.clone(), token_id))
    }

    pub fn prune(&mut self, now: u64) {
        self.global_requests
            .retain(|t| now.saturating_sub(*t) < WINDOWS_MS[3]);
        for requests in self.requests.values_mut() {
            requests.retain(|t| now.saturating_sub(*t) < WINDOWS_MS[3]);
        }
        self.cooldowns.retain(|_, until| *until > now);
        for events in self.tokens.values_mut() {
            events.retain(|event| now.saturating_sub(event.at) < WINDOWS_MS[3]);
        }
    }

    pub fn used(requests: &[u64], now: u64) -> [u32; 4] {
        WINDOWS_MS.map(|window| {
            requests
                .iter()
                .filter(|t| now.saturating_sub(**t) < window)
                .count()
                .min(u32::MAX as usize) as u32
        })
    }

    fn budget_deadline(requests: &[u64], limits: [u32; 4], now: u64) -> Option<u64> {
        let mut deadline = None;
        for (window, limit) in WINDOWS_MS.into_iter().zip(limits) {
            if limit == 0 {
                continue;
            }
            let mut active: Vec<_> = requests
                .iter()
                .copied()
                .filter(|t| now.saturating_sub(*t) < window)
                .collect();
            if active.len() >= limit as usize {
                active.sort_unstable();
                let until = active[active.len() - limit as usize].saturating_add(window);
                deadline = Some(deadline.unwrap_or(0).max(until));
            }
        }
        deadline
    }

    pub fn next_allowed_at(&self, provider: &Candidate, now: u64) -> Option<u64> {
        self.next_allowed_with_tokens(provider, now, 1)
    }

    pub fn token_used(&self, id: &str, now: u64) -> [u64; 4] {
        WINDOWS_MS.map(|window| {
            self.tokens
                .get(id)
                .into_iter()
                .flatten()
                .filter(|event| now.saturating_sub(event.at) < window)
                .fold(0u64, |sum, event| sum.saturating_add(event.tokens))
        })
    }

    fn token_deadline(
        &self,
        provider: &Candidate,
        now: u64,
        required: u64,
        exclude: Option<u64>,
    ) -> Option<u64> {
        let mut deadline = None;
        for (window, limit) in WINDOWS_MS.into_iter().zip(provider.token_limits) {
            if limit == 0 {
                continue;
            }
            if required > limit {
                return Some(u64::MAX);
            }
            let mut events: Vec<_> = self
                .tokens
                .get(&provider.id)
                .into_iter()
                .flatten()
                .filter(|event| Some(event.id) != exclude && now.saturating_sub(event.at) < window)
                .collect();
            let mut used = events
                .iter()
                .fold(0u64, |sum, event| sum.saturating_add(event.tokens));
            if used.saturating_add(required) <= limit {
                continue;
            }
            events.sort_by_key(|event| event.at);
            for event in events {
                used = used.saturating_sub(event.tokens);
                if used.saturating_add(required) <= limit {
                    deadline = Some(deadline.unwrap_or(0).max(event.at.saturating_add(window)));
                    break;
                }
            }
        }
        deadline
    }

    pub fn adjust_tokens(
        &mut self,
        provider: &Candidate,
        id: u64,
        required: u64,
        now: u64,
    ) -> Result<(), String> {
        if provider.token_limits.iter().any(|limit| *limit > 0 && required > *limit) {
            return Err(
                "Token quota cannot fit this request; reduce input or max output tokens".into(),
            );
        }
        if let Some(until) = self.token_deadline(provider, now, required, Some(id)) {
            return Err(format!("Neutral mode: token quota available at {until}"));
        }
        let event = self
            .tokens
            .get_mut(&provider.id)
            .into_iter()
            .flatten()
            .find(|event| event.id == id && !event.settled)
            .ok_or("Token reservation is unavailable")?;
        event.tokens = required;
        event.at = now;
        Ok(())
    }

    pub fn settle_tokens(&mut self, provider_id: &str, id: u64, actual: u64) {
        if let Some(event) = self
            .tokens
            .get_mut(provider_id)
            .into_iter()
            .flatten()
            .find(|event| event.id == id && !event.settled)
        {
            event.tokens = actual;
            event.settled = true;
        }
    }

    pub fn next_allowed_with_tokens(
        &self,
        provider: &Candidate,
        now: u64,
        required: u64,
    ) -> Option<u64> {
        let requests = self
            .requests
            .get(&provider.id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        [
            Self::budget_deadline(requests, provider.limits, now),
            Self::budget_deadline(&self.global_requests, self.global_limits, now),
            self.cooldowns
                .get(&provider.id)
                .copied()
                .filter(|until| *until > now),
            self.token_deadline(provider, now, required, None),
        ]
        .into_iter()
        .flatten()
        .max()
    }

    /// None means no matching configuration; Some(now) means immediately ready.
    pub fn next_available_at(
        &self,
        candidates: &[Candidate],
        kind: &str,
        needs_images: bool,
        exclude_ids: &[String],
        now: u64,
    ) -> Option<u64> {
        if self.manual_neutral {
            return None;
        }
        candidates
            .iter()
            .filter(|p| {
                p.enabled
                    && !p.manual_neutral
                    && p.kind == kind
                    && (!needs_images || p.supports_images)
                    && !exclude_ids.contains(&p.id)
            })
            .map(|p| self.next_allowed_at(p, now).unwrap_or(now))
            .min()
    }

    pub fn record_result(&mut self, id: &str, ok: bool, retry_after_secs: Option<u64>, now: u64) {
        if ok {
            self.cooldowns.remove(id);
        } else {
            self.cooldowns.insert(
                id.into(),
                now.saturating_add(retry_after_secs.unwrap_or(60).saturating_mul(1_000)),
            );
        }
    }

    pub fn remove(&mut self, id: &str) {
        self.requests.remove(id);
        self.cooldowns.remove(id);
        self.tokens.remove(id);
        if self.current_provider_id.as_deref() == Some(id) {
            self.current_provider_id = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_reservations_block_concurrent_spending_and_settle_the_matching_attempt() {
        let mut core = RegistryCore::default();
        let mut p = candidate("p", 0, [0; 4]);
        p.token_limits = [0, 100, 0, 0];
        p.output_tokens = 30;
        let list = [p];
        let (_, first) = core
            .pick_with_tokens(&list, "brain", false, &[], 10, 20)
            .unwrap();
        let (_, second) = core
            .pick_with_tokens(&list, "brain", false, &[], 11, 20)
            .unwrap();
        assert!(core
            .pick_with_tokens(&list, "brain", false, &[], 12, 1)
            .is_none());
        assert_eq!(core.token_used("p", 12), [100, 100, 100, 100]);
        core.settle_tokens("p", first, 10);
        assert_eq!(core.token_used("p", 12)[1], 60);
        core.settle_tokens("p", second, 20);
        assert_eq!(core.token_used("p", 12)[1], 30);
        // Duplicate reports cannot refund the same attempt twice.
        core.settle_tokens("p", first, 0);
        assert_eq!(core.token_used("p", 12)[1], 30);
        assert!(core
            .pick_with_tokens(&list, "brain", false, &[], 12, 20)
            .is_some());
    }

    #[test]
    fn candidate_specific_input_estimates_allow_a_smaller_context_fallback() {
        let mut core = RegistryCore::default();
        let mut first = candidate("first", 0, [0; 4]);
        first.token_limits = [0, 100, 0, 0];
        first.output_tokens = 20;
        let mut fallback = first.clone();
        fallback.id = "fallback".into();
        fallback.rank = 1;
        let estimates = HashMap::from([("first".into(), 90), ("fallback".into(), 50)]);
        let (id, _) = core.pick_with_token_estimates(&[first, fallback], "brain", false, &[], 10, 9000, &estimates).unwrap();
        assert_eq!(id, "fallback");
        assert_eq!(core.token_used("fallback", 10)[1], 70);
        assert!(!core.tokens.contains_key("first"));
    }

    #[test]
    fn simultaneous_token_reservations_cannot_exceed_a_model_cap() {
        use std::sync::{Arc, Mutex};
        let core = Arc::new(Mutex::new(RegistryCore::default()));
        let handles: Vec<_> = (0..32)
            .map(|_| {
                let core = core.clone();
                std::thread::spawn(move || {
                    let mut p = candidate("p", 0, [0; 4]);
                    p.token_limits = [0, 100, 0, 0];
                    p.output_tokens = 20;
                    core.lock()
                        .unwrap()
                        .pick_with_tokens(&[p], "brain", false, &[], 10, 10)
                        .is_some()
                })
            })
            .collect();
        assert_eq!(
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap() as usize)
                .sum::<usize>(),
            3
        );
        assert_eq!(core.lock().unwrap().token_used("p", 10)[1], 90);
    }

    #[test]
    fn pre_send_adjustment_is_atomic_and_refreshes_the_send_window() {
        let mut core = RegistryCore::default();
        let mut p = candidate("p", 0, [0; 4]);
        p.token_limits = [100, 100, 0, 0];
        p.output_tokens = 20;
        let (_, first) = core
            .pick_with_tokens(&[p.clone()], "brain", false, &[], 10, 10)
            .unwrap();
        core.adjust_tokens(&p, first, 70, 1500).unwrap();
        assert_eq!(core.token_used("p", 1500)[0], 70);
        let (_, second) = core
            .pick_with_tokens(&[p.clone()], "brain", false, &[], 1500, 10)
            .unwrap();
        assert!(core.adjust_tokens(&p, second, 31, 1500).is_err());
        assert_eq!(core.token_used("p", 1500)[0], 100);
        assert!(core
            .pick_with_tokens(&[p], "brain", false, &[], 1500, 1)
            .is_none());
    }

    #[test]
    fn manual_neutral_applies_to_one_model_and_token_windows_recover_exactly() {
        for (index, span) in WINDOWS_MS.into_iter().enumerate() {
            let mut core = RegistryCore::default();
            let mut p = candidate("p", 0, [0; 4]);
            p.token_limits[index] = 50;
            p.output_tokens = 10;
            let mut list = [p, candidate("fallback", 1, [0; 4])];
            list[1].manual_neutral = true;
            assert!(core
                .pick_with_tokens(&list, "brain", false, &[], 10, 40)
                .is_some());
            assert!(core
                .pick_with_tokens(&list, "brain", false, &[], 10 + span - 1, 40)
                .is_none());
            assert!(core
                .pick_with_tokens(&list, "brain", false, &[], 10 + span, 40)
                .is_some());
            list[0].manual_neutral = true;
            list[1].manual_neutral = false;
            assert_eq!(
                core.pick(&list, "brain", false, &[], 11 + span),
                Some("fallback".into())
            );
        }
    }

    fn candidate(id: &str, rank: i32, limits: [u32; 4]) -> Candidate {
        Candidate {
            id: id.into(),
            kind: "brain".into(),
            rank,
            enabled: true,
            supports_images: true,
            limits,
            token_limits: [0; 4],
            output_tokens: 0,
            manual_neutral: false,
        }
    }

    #[test]
    fn single_pick_consumes_one_request_across_all_windows() {
        let mut core = RegistryCore::default();
        let list = [candidate("primary", 0, [2, 2, 2, 2])];
        assert_eq!(
            core.pick(&list, "brain", false, &[], 100_000),
            Some("primary".into())
        );
        assert_eq!(
            core.pick(&list, "brain", false, &[], 100_000),
            Some("primary".into())
        );
        assert_eq!(core.pick(&list, "brain", false, &[], 100_000), None);
        assert_eq!(core.requests["primary"].len(), 2);
        assert_eq!(core.global_requests.len(), 2);
    }

    #[test]
    fn every_window_recovers_at_its_exact_boundary() {
        for (index, span) in WINDOWS_MS.into_iter().enumerate() {
            let mut core = RegistryCore::default();
            let mut limits = [0; 4];
            limits[index] = 1;
            let list = [candidate("p", 0, limits)];
            assert!(core.pick(&list, "brain", false, &[], 0).is_some());
            assert_eq!(
                core.next_available_at(&list, "brain", false, &[], span - 1),
                Some(span)
            );
            assert!(core.pick(&list, "brain", false, &[], span - 1).is_none());
            assert!(core.pick(&list, "brain", false, &[], span).is_some());
        }
    }

    #[test]
    fn minute_pruning_never_forgets_hour_or_day_usage() {
        let mut core = RegistryCore::default();
        let list = [candidate("p", 0, [0, 1, 2, 3])];
        assert!(core.pick(&list, "brain", false, &[], 0).is_some());
        assert!(core.pick(&list, "brain", false, &[], 60_000).is_some());
        assert!(core.pick(&list, "brain", false, &[], 120_000).is_none());
        assert_eq!(
            RegistryCore::used(&core.requests["p"], 120_000),
            [0, 0, 2, 2]
        );
        assert_eq!(
            core.next_available_at(&list, "brain", false, &[], 120_000),
            Some(3_600_000)
        );
    }

    #[test]
    fn exhausted_candidate_falls_back_without_charging_it_again() {
        let mut core = RegistryCore::default();
        let list = [
            candidate("fallback", 2, [0; 4]),
            candidate("first", 1, [0, 1, 0, 0]),
        ];
        assert_eq!(
            core.pick(&list, "brain", false, &[], 100),
            Some("first".into())
        );
        assert_eq!(
            core.pick(&list, "brain", false, &[], 200),
            Some("fallback".into())
        );
        assert_eq!(core.requests["first"], [100]);
        assert_eq!(core.global_requests, [100, 200]);
    }

    #[test]
    fn exclusions_disabled_kind_and_image_gate_do_not_consume_budget() {
        let mut core = RegistryCore::default();
        let mut disabled = candidate("disabled", 0, [0; 4]);
        disabled.enabled = false;
        let mut text = candidate("text", 0, [0; 4]);
        text.supports_images = false;
        let mut other = candidate("other", 0, [0; 4]);
        other.kind = "stt".into();
        let list = [
            disabled,
            text,
            other,
            candidate("excluded", 0, [0; 4]),
            candidate("vision", 9, [0; 4]),
        ];
        assert_eq!(
            core.pick(&list, "brain", true, &["excluded".into()], 100),
            Some("vision".into())
        );
        assert_eq!(core.requests.len(), 1);
        assert_eq!(core.global_requests, [100]);
    }

    #[test]
    fn all_global_windows_share_budget_across_provider_kinds() {
        for (index, span) in WINDOWS_MS.into_iter().enumerate() {
            let mut core = RegistryCore::default();
            core.global_limits[index] = 1;
            let mut stt = candidate("stt", 0, [0; 4]);
            stt.kind = "stt".into();
            let list = [candidate("brain", 0, [0; 4]), stt];
            assert!(core.pick(&list, "brain", false, &[], 10).is_some());
            assert!(core.pick(&list, "stt", false, &[], 11).is_none());
            assert!(!core.requests.contains_key("stt"));
            assert!(core.pick(&list, "stt", false, &[], 10 + span).is_some());
        }
    }

    #[test]
    fn disabled_global_limits_still_track_usage_for_later_limits() {
        let mut core = RegistryCore::default();
        let list = [candidate("p", 0, [0; 4])];
        assert!(core.pick(&list, "brain", false, &[], 10).is_some());
        core.global_limits = [1; 4];
        assert!(core.pick(&list, "brain", false, &[], 11).is_none());
        assert_eq!(
            core.next_available_at(&list, "brain", false, &[], 11),
            Some(86_400_010)
        );
    }

    #[test]
    fn reduced_cap_waits_until_enough_events_expire() {
        let mut core = RegistryCore::default();
        let mut list = [candidate("p", 0, [0; 4])];
        for now in [1_000, 2_000, 3_000] {
            assert!(core.pick(&list, "brain", false, &[], now).is_some());
        }
        list[0].limits = [0, 2, 0, 0];
        assert_eq!(
            core.next_available_at(&list, "brain", false, &[], 4_000),
            Some(62_000)
        );
        assert!(core.pick(&list, "brain", false, &[], 61_000).is_none());
        assert!(core.pick(&list, "brain", false, &[], 62_000).is_some());
    }

    #[test]
    fn retry_after_and_success_recover_without_double_charging() {
        let mut core = RegistryCore::default();
        let list = [candidate("a", 1, [0; 4]), candidate("b", 2, [0; 4])];
        core.record_result("a", false, Some(90), 100);
        core.record_result("b", false, Some(30), 100);
        assert_eq!(
            core.next_available_at(&list, "brain", false, &[], 101),
            Some(30_100)
        );
        assert!(core.pick(&list, "brain", false, &[], 30_099).is_none());
        assert_eq!(
            core.pick(&list, "brain", false, &[], 30_100),
            Some("b".into())
        );
        core.record_result("a", true, None, 30_100);
        assert_eq!(
            core.pick(&list, "brain", false, &[], 30_100),
            Some("a".into())
        );
        assert_eq!(core.global_requests.len(), 2);
    }

    #[test]
    fn neutral_and_status_queries_never_consume_capacity() {
        let mut core = RegistryCore::default();
        let list = [candidate("p", 0, [1; 4])];
        core.manual_neutral = true;
        assert!(core.pick(&list, "brain", false, &[], 10).is_none());
        assert_eq!(core.next_available_at(&list, "brain", false, &[], 10), None);
        core.manual_neutral = false;
        for _ in 0..10 {
            assert_eq!(
                core.next_available_at(&list, "brain", false, &[], 10),
                Some(10)
            );
        }
        assert!(core.global_requests.is_empty());
        assert!(core.pick(&list, "brain", false, &[], 10).is_some());
    }

    #[test]
    fn simultaneous_requests_cannot_exceed_the_global_cap() {
        use std::sync::{Arc, Mutex};
        let core = Arc::new(Mutex::new(RegistryCore {
            global_limits: [0, 7, 0, 0],
            ..RegistryCore::default()
        }));
        let handles: Vec<_> = (0..32)
            .map(|_| {
                let core = core.clone();
                std::thread::spawn(move || {
                    core.lock()
                        .unwrap()
                        .pick(&[candidate("p", 0, [0; 4])], "brain", false, &[], 10)
                        .is_some()
                })
            })
            .collect();
        assert_eq!(
            handles
                .into_iter()
                .map(|h| h.join().unwrap() as usize)
                .sum::<usize>(),
            7
        );
        assert_eq!(core.lock().unwrap().global_requests.len(), 7);
    }

    #[test]
    fn remove_preserves_global_accounting_and_clears_current_provider() {
        let mut core = RegistryCore::default();
        let list = [candidate("p", 0, [0; 4])];
        core.pick(&list, "brain", false, &[], 100);
        core.record_result("p", false, None, 100);
        core.remove("p");
        assert!(core.requests.is_empty());
        assert!(core.cooldowns.is_empty());
        assert_eq!(core.current_provider_id, None);
        assert_eq!(core.global_requests, [100]);
    }
}
