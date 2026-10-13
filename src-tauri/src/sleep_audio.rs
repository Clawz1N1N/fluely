//! The same native output/decoder path is used by automatic alarms and the test button.
use cpal::traits::{DeviceTrait, HostTrait};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::SyncSender,
    },
    thread,
    time::Duration,
};
pub fn output(id: &str) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if id.is_empty() {
        return host
            .default_output_device()
            .ok_or("No default audio output device".into());
    }
    for (i, device) in host
        .output_devices()
        .map_err(|e| e.to_string())?
        .enumerate()
    {
        if format!("{i}:{}", device.name().map_err(|e| e.to_string())?) == id {
            return Ok(device);
        }
    }
    Err(
        "Selected alarm output device is unavailable. Choose another output in Audio settings."
            .into(),
    )
}
pub fn decode(path: &Path) -> Result<rodio::Decoder<std::io::BufReader<std::fs::File>>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    rodio::Decoder::new(std::io::BufReader::new(file))
        .map_err(|e| format!("Decode alarm track: {e}"))
}
pub fn play_track(
    path: &Path,
    device_id: &str,
    volume: f32,
    cancel: &AtomicBool,
    ready: &SyncSender<Result<String, String>>,
) -> Result<(), String> {
    let device = output(device_id)?;
    let route = device.name().map_err(|e| e.to_string())?;
    let (stream, handle) = rodio::OutputStream::try_from_device(&device)
        .map_err(|e| format!("Open alarm output: {e}"))?;
    let sink = rodio::Sink::try_new(&handle).map_err(|e| e.to_string())?;
    let decoder = decode(path)?;
    if cancel.load(Ordering::SeqCst) {
        return Ok(());
    }
    sink.set_volume(volume);
    sink.append(decoder);
    ready
        .send(Ok(route))
        .map_err(|_| "Alarm request was cancelled")?;
    while !cancel.load(Ordering::SeqCst) && !sink.empty() {
        thread::sleep(Duration::from_millis(25));
    }
    sink.stop();
    drop(stream);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use rodio::Source;
    #[test]
    fn malformed_track_is_rejected() {
        let path =
            std::env::temp_dir().join(format!("fluely-alarm-invalid-{}.wav", std::process::id()));
        std::fs::write(&path, b"invalid audio").unwrap();
        assert!(decode(&path).is_err());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn pcm_track_decodes_with_original_duration_and_channels() {
        let path =
            std::env::temp_dir().join(format!("fluely-alarm-pcm-{}.wav", std::process::id()));
        let mut wav = hound::WavWriter::create(
            &path,
            hound::WavSpec {
                channels: 1,
                sample_rate: 16000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .unwrap();
        for _ in 0..1600 {
            wav.write_sample(0i16).unwrap();
        }
        wav.finalize().unwrap();
        let source = decode(&path).unwrap();
        assert_eq!(source.channels(), 1);
        assert_eq!(source.sample_rate(), 16000);
        assert_eq!(source.total_duration(), Some(Duration::from_millis(100)));
        drop(source);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn invalid_selected_output_is_not_substituted_with_default() {
        assert!(output("missing-fluely-output-device").is_err());
    }
}
