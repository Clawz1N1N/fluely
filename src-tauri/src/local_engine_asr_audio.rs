//! PCM normalization for transcribe.cpp's actual 16 kHz mono f32 API.
pub fn language_hint(language: &str) -> Option<&str> {
    match language {
        "auto" => None,
        "uk" => Some("uk-UA"),
        "ru" => Some("ru-RU"),
        "en" => Some("en-US"),
        other => Some(other),
    }
}
pub fn decode_wav(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("ASR audio exceeds 16 MiB".into());
    }
    let mut reader = hound::WavReader::new(std::io::Cursor::new(bytes))
        .map_err(|e| format!("ASR requires a WAV recording: {e}"))?;
    let spec = reader.spec();
    if !(8000..=192000).contains(&spec.sample_rate) || !(1..=8).contains(&spec.channels) {
        return Err("Unsupported ASR recording sample rate or channels".into());
    }
    if reader.duration() > spec.sample_rate * 60 {
        return Err("ASR recordings must be at most 60 seconds".into());
    }
    let samples = if spec.sample_format == hound::SampleFormat::Float {
        reader.samples::<f32>().collect::<Result<Vec<_>, _>>()
    } else {
        if !(1..=32).contains(&spec.bits_per_sample) {
            return Err("Unsupported ASR PCM bit depth".into());
        }
        let scale = (1u64 << (spec.bits_per_sample - 1)) as f32;
        reader
            .samples::<i32>()
            .map(|sample| sample.map(|sample| sample as f32 / scale))
            .collect::<Result<Vec<_>, _>>()
    }
    .map_err(|e| format!("Read ASR recording: {e}"))?;
    let channels = spec.channels as usize;
    let mono = samples
        .chunks_exact(channels)
        .map(|frame| {
            frame
                .iter()
                .map(|sample| {
                    if sample.is_finite() {
                        sample.clamp(-1.0, 1.0)
                    } else {
                        0.0
                    }
                })
                .sum::<f32>()
                / channels as f32
        })
        .collect::<Vec<_>>();
    if mono.is_empty() {
        return Err("ASR recording is empty".into());
    }
    let count = mono.len() * 16000 / spec.sample_rate as usize;
    let ratio = spec.sample_rate as f64 / 16000.0;
    Ok((0..count)
        .map(|i| {
            let position = i as f64 * ratio;
            let index = position as usize;
            let next = (index + 1).min(mono.len() - 1);
            mono[index] + (mono[next] - mono[index]) * (position - index as f64) as f32
        })
        .collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nemotron_hints_use_actual_language_locales() {
        assert_eq!(language_hint("uk"), Some("uk-UA"));
        assert_eq!(language_hint("ru"), Some("ru-RU"));
        assert_eq!(language_hint("auto"), None);
    }
    #[test]
    fn normalizes_stereo_48khz_pcm_to_engine_required_16khz_mono() {
        let mut bytes = std::io::Cursor::new(Vec::new());
        {
            let mut writer = hound::WavWriter::new(
                &mut bytes,
                hound::WavSpec {
                    channels: 2,
                    sample_rate: 48000,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                },
            )
            .unwrap();
            for _ in 0..480 {
                writer.write_sample(16384i16).unwrap();
                writer.write_sample(0i16).unwrap();
            }
            writer.finalize().unwrap();
        }
        let pcm = decode_wav(bytes.get_ref()).unwrap();
        assert_eq!(pcm.len(), 160);
        assert!((pcm[0] - 0.25).abs() < 0.001);
        assert!(decode_wav(b"not an audio file").is_err());
    }
}
