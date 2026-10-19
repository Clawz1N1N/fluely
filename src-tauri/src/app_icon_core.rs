//! Bounded input checks and Windows RT_GROUP_ICON serialization.
pub const MAX_ICON_BYTES: usize = 4 * 1024 * 1024;
pub fn validate_container(bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > MAX_ICON_BYTES { return Err("Choose a PNG or ICO smaller than 4 MiB".into()); }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Ok(()); }
    ico_resources(bytes).map(|_| ())
}
/// Return the group directory and individual image resources. IDs start at 1.
pub fn ico_resources(bytes: &[u8]) -> Result<(Vec<u8>, Vec<Vec<u8>>), String> {
    if bytes.len() < 6 || bytes[..4] != [0, 0, 1, 0] { return Err("Choose a valid PNG or ICO image".into()); }
    let count = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if count == 0 || count > 64 || bytes.len() < 6 + count * 16 { return Err("Invalid ICO image directory".into()); }
    let mut group = bytes[..6].to_vec(); let mut images = Vec::new();
    for index in 0..count {
        let entry = &bytes[6 + index * 16..6 + (index + 1) * 16];
        let size = u32::from_le_bytes(entry[8..12].try_into().unwrap()) as usize;
        let offset = u32::from_le_bytes(entry[12..16].try_into().unwrap()) as usize;
        let end = offset.checked_add(size).ok_or("Invalid ICO image size")?;
        if size == 0 || offset < 6 + count * 16 || end > bytes.len() { return Err("Truncated ICO image data".into()); }
        group.extend_from_slice(&entry[..12]); group.extend_from_slice(&((index + 1) as u16).to_le_bytes());
        images.push(bytes[offset..end].to_vec());
    }
    Ok((group, images))
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn ico_directory_preserves_images_and_replaces_offsets_with_ids() {
        let mut bytes = vec![0,0,1,0,1,0,32,32,0,0,1,0,32,0,4,0,0,0,22,0,0,0]; bytes.extend([1,2,3,4]);
        let (group, images) = ico_resources(&bytes).unwrap(); assert_eq!(group.len(),20); assert_eq!(&group[18..], &[1,0]); assert_eq!(images,vec![vec![1,2,3,4]]);
        bytes[18]=255; assert!(ico_resources(&bytes).is_err());
    }
    #[test] fn rejects_empty_oversized_and_malformed_containers() {
        assert!(validate_container(&[]).is_err()); assert!(validate_container(&vec![0;MAX_ICON_BYTES+1]).is_err());
        assert!(ico_resources(&[0,0,1,0,65,0]).is_err()); assert!(validate_container(b"not an image").is_err());
    }
}
