//! Profile-owned chat archive. This database has its own schema and never edits
//! the legacy SQL migration ledger or removes legacy conversations.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct ChatSessionsState(Mutex<Option<Store>>);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionEvent {
    pub id: String,
    pub kind: String,
    pub timestamp: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] pub through: Option<usize>,
    #[serde(skip_serializing_if="Option::is_none")] pub file_ref: Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] pub filename: Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] pub mime: Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] pub frame_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incomplete: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legacy_attachments: Option<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub events: Vec<SessionEvent>,
}
#[derive(Debug, Serialize)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub event_count: i64,
}
#[derive(Deserialize, Serialize)]
pub struct Media {
    pub mime: String,
    pub base64: String,
}
struct Store {
    pool: SqlitePool,
    root: PathBuf,
}

fn error(e: impl std::fmt::Display) -> String {
    format!("Chat storage: {e}")
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid chat identifier".into());
    }
    Ok(())
}
fn title(value: String) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 1024 {
        return Err("Chat title must contain 1 to 1024 bytes".into());
    }
    Ok(value.into())
}
fn owned_directory(root: &Path, id: &str) -> Result<PathBuf, String> {
    identifier(id)?;
    let path = root.join(id);
    std::fs::create_dir_all(&path).map_err(error)?;
    let canonical = path.canonicalize().map_err(error)?;
    if canonical.parent() != Some(root) {
        return Err("Chat media directory must stay inside its profile".into());
    }
    Ok(canonical)
}
impl Store {
    async fn open(profile: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(profile).map_err(error)?;
        let profile = profile.canonicalize().map_err(error)?;
        let media = profile.join("chat_media");
        std::fs::create_dir_all(&media).map_err(error)?;
        let root = media.canonicalize().map_err(error)?;
        if root.parent() != Some(profile.as_path()) {
            return Err("Chat media directory must stay inside its profile".into());
        }
        let database = profile.join("chat_sessions.sqlite");
        if database.exists()
            && database.canonicalize().map_err(error)?.parent() != Some(profile.as_path())
        {
            return Err("Chat database must stay inside its profile".into());
        }
        let options = SqliteConnectOptions::new()
            .filename(database)
            .create_if_missing(true)
            .foreign_keys(true)
            .busy_timeout(std::time::Duration::from_secs(10));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .map_err(error)?;
        sqlx::raw_sql("CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,timestamp INTEGER NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_session ON events(session_id,sequence); CREATE INDEX IF NOT EXISTS sessions_updated ON sessions(updated_at DESC); CREATE TABLE IF NOT EXISTS archive_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);").execute(&pool).await.map_err(error)?;
        let store = Self { pool, root };
        store.import_legacy(&profile).await?;
        Ok(store)
    }
    async fn import_legacy(&self, profile: &Path) -> Result<(), String> {
        if sqlx::query("SELECT key FROM archive_meta WHERE key='legacy_import_complete'")
            .fetch_optional(&self.pool)
            .await
            .map_err(error)?
            .is_some()
        {
            return Ok(());
        }
        let database = profile.join("pluely.db");
        if !database.exists() {
            return Ok(());
        }
        if database.canonicalize().map_err(error)?.parent() != Some(profile) {
            return Err("Legacy chat database must stay inside its profile".into());
        }
        let options = SqliteConnectOptions::new()
            .filename(database)
            .read_only(true)
            .busy_timeout(std::time::Duration::from_secs(10));
        let legacy = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .map_err(error)?;
        let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('conversations','messages')").fetch_one(&legacy).await.map_err(error)?;
        if count != 2 {
            legacy.close().await;
            return Ok(());
        }
        let mut source = legacy.begin().await.map_err(error)?;
        let conversations = sqlx::query(
            "SELECT id,title,created_at,updated_at FROM conversations ORDER BY created_at,id",
        )
        .fetch_all(&mut *source)
        .await
        .map_err(error)?;
        let messages=sqlx::query("SELECT id,conversation_id,role,content,timestamp,attached_files FROM messages ORDER BY timestamp,id").fetch_all(&mut *source).await.map_err(error)?;
        source.commit().await.map_err(error)?;
        legacy.close().await;
        let mut transaction = self.pool.begin().await.map_err(error)?;
        let mut files = Vec::<PathBuf>::new();
        let result=async{
            for conversation in conversations{
                let original:String=conversation.try_get("id").map_err(error)?;let id=legacy_id("chat",&original);
                sqlx::query("INSERT OR IGNORE INTO sessions(id,title,created_at,updated_at) VALUES(?,?,?,?)").bind(&id).bind(conversation.try_get::<String,_>("title").map_err(error)?).bind(conversation.try_get::<i64,_>("created_at").map_err(error)?.max(0)).bind(conversation.try_get::<i64,_>("updated_at").map_err(error)?.max(0)).execute(&mut *transaction).await.map_err(error)?;
                for message in messages.iter().filter(|row|row.get::<String,_>("conversation_id")==original){
                    let message_id=legacy_id("message",&format!("{}:{}",original,message.try_get::<String,_>("id").map_err(error)?));
                    let role:String=message.try_get("role").map_err(error)?;let timestamp=message.try_get::<i64,_>("timestamp").map_err(error)?.max(0);
                    let attachments:Vec<serde_json::Value>=message.try_get::<Option<String>,_>("attached_files").map_err(error)?.and_then(|value|serde_json::from_str(&value).ok()).unwrap_or_default();
                    let mut events=Vec::new();
                    for (index,attachment) in attachments.iter().enumerate(){
                        let attachment_id=legacy_id("media",&format!("{message_id}:{index}"));
                        if let Some((mime,bytes))=legacy_media(attachment){
                            let extension=if mime=="audio/wav"{"wav"}else{"jpg"};let reference=format!("{attachment_id}.{extension}");let path=owned_directory(&self.root,&id)?.join(&reference);
                            // Recover an interrupted import only when the existing owned file
                            // matches the source bytes; never follow/overwrite another file.
                            if path.exists(){
                                if path.canonicalize().map_err(error)?.parent()!=Some(owned_directory(&self.root,&id)?.as_path())||tokio::fs::read(&path).await.map_err(error)?!=bytes{return Err("Legacy import media conflicts with an existing file".into());}
                            }else{
                                use tokio::io::AsyncWriteExt;let mut file=tokio::fs::OpenOptions::new().write(true).create_new(true).open(&path).await.map_err(error)?;files.push(path);file.write_all(&bytes).await.map_err(error)?;file.sync_all().await.map_err(error)?;
                            }
                            let mut media_event:SessionEvent=serde_json::from_value(serde_json::json!({"id":attachment_id,"kind":if extension=="wav"{"audio"}else{"screenshot"},"timestamp":timestamp,"text":attachment.get("name").and_then(|v|v.as_str()).unwrap_or("Legacy attachment")})).map_err(error)?;
                            if extension=="wav"{media_event.audio_ref=Some(reference);}else{media_event.image_ref=Some(reference);}events.push(media_event);
                        }
                    }
                    let metadata:Vec<_>=attachments.iter().map(|attachment|serde_json::json!({"id":attachment.get("id"),"name":attachment.get("name"),"type":attachment.get("type"),"size":attachment.get("size")})).collect();
                    events.push(serde_json::from_value::<SessionEvent>(serde_json::json!({"id":message_id,"kind":if role=="assistant"{"answer"}else if role=="system"{"transcript"}else{"question"},"timestamp":timestamp,"text":message.try_get::<String,_>("content").map_err(error)?,"legacy_attachments":if metadata.is_empty(){None}else{Some(metadata)}})).map_err(error)?);
                    for event in events{sqlx::query("INSERT OR IGNORE INTO events(id,session_id,timestamp,payload) VALUES(?,?,?,?)").bind(&event.id).bind(&id).bind(event.timestamp).bind(serde_json::to_string(&event).map_err(error)?).execute(&mut *transaction).await.map_err(error)?;}
                }
            }
            sqlx::query("INSERT INTO archive_meta(key,value) VALUES('legacy_import_complete','1')").execute(&mut *transaction).await.map_err(error)?;
            Ok::<(),String>(())
        }.await;
        if let Err(e) = result {
            drop(transaction);
            for path in files {
                let _ = tokio::fs::remove_file(path).await;
            }
            return Err(e);
        }
        transaction.commit().await.map_err(error)?;
        Ok(())
    }
    async fn create(&self, id: String, value: String) -> Result<Session, String> {
        identifier(&id)?;
        let title = title(value)?;
        let timestamp = now();
        sqlx::query("INSERT INTO sessions(id,title,created_at,updated_at) VALUES(?,?,?,?)")
            .bind(&id)
            .bind(&title)
            .bind(timestamp)
            .bind(timestamp)
            .execute(&self.pool)
            .await
            .map_err(error)?;
        Ok(Session {
            id,
            title,
            created_at: timestamp,
            updated_at: timestamp,
            events: vec![],
        })
    }
    async fn get(&self, id: &str) -> Result<Session, String> {
        identifier(id)?;
        let row = sqlx::query("SELECT title,created_at,updated_at FROM sessions WHERE id=?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(error)?
            .ok_or("Chat session does not exist")?;
        let rows = sqlx::query("SELECT payload FROM events WHERE session_id=? ORDER BY sequence")
            .bind(id)
            .fetch_all(&self.pool)
            .await
            .map_err(error)?;
        let events = rows
            .into_iter()
            .map(|row| serde_json::from_str(&row.get::<String, _>("payload")).map_err(error))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Session {
            id: id.into(),
            title: row.get("title"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            events,
        })
    }
    async fn append(
        &self,
        id: &str,
        mut event: SessionEvent,
        media: Option<Media>,
    ) -> Result<SessionEvent, String> {
        identifier(id)?;
        identifier(&event.id)?;
        if !matches!(
            event.kind.as_str(),
            "question" | "answer" | "transcript" | "audio" | "screenshot" | "vision" | "summary" | "file"
        ) || event.timestamp < 0
        {
            return Err("Invalid chat event".into());
        }
        // A replay returns the previously committed event without rewriting its media.
        if let Some(row) = sqlx::query("SELECT payload,session_id FROM events WHERE id=?")
            .bind(&event.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(error)?
        {
            if row.get::<String, _>("session_id") != id {
                return Err("Chat event belongs to another session".into());
            }
            return serde_json::from_str(&row.get::<String, _>("payload")).map_err(error);
        }
        if sqlx::query("SELECT id FROM sessions WHERE id=?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(error)?
            .is_none()
        {
            return Err("Chat session does not exist".into());
        }
        // Paths supplied by a webview are never accepted as archive references.
        if event.audio_ref.as_ref().is_some_and(|s| !valid_ref(s))
            || event.image_ref.as_ref().is_some_and(|s| !valid_ref(s))
            || event.file_ref.as_ref().is_some_and(|s| !valid_ref(s))
        {
            return Err("Invalid chat media reference".into());
        }
        let mut created = None;
        if let Some(media) = media {
            if media.base64.len() > 90 * 1024 * 1024 {
                return Err("Chat media exceeds 64 MiB".into());
            }
            let bytes = STANDARD.decode(&media.base64).map_err(error)?;
            let extension = match media.mime.as_str() {
                _ if event.kind=="file" => "bin",
                "image/png" if event.kind=="screenshot"&&bytes.starts_with(b"\x89PNG\r\n\x1a\n")=>"png",
                "image/gif" if event.kind=="screenshot"&&bytes.starts_with(b"GIF8")=>"gif",
                "image/webp" if event.kind=="screenshot"&&bytes.starts_with(b"RIFF")&&bytes.get(8..12)==Some(b"WEBP".as_slice())=>"webp",
                "audio/wav"
                    if event.kind == "audio"
                        && bytes.starts_with(b"RIFF")
                        && bytes.get(8..12) == Some(b"WAVE".as_slice()) =>
                {
                    "wav"
                }
                "image/jpeg"
                    if event.kind == "screenshot" && bytes.starts_with(&[0xff, 0xd8, 0xff]) =>
                {
                    "jpg"
                }
                _ => return Err("Chat media must be WAV audio or a supported image".into()),
            };
            if bytes.len() > 64 * 1024 * 1024 {
                return Err("Chat media exceeds 64 MiB".into());
            }
            let reference = format!("{}.{}", event.id, extension);
            let path = owned_directory(&self.root, id)?.join(&reference);
            let mut options = tokio::fs::OpenOptions::new();
            options.write(true).create_new(true);
            let mut file = options.open(&path).await.map_err(error)?;
            use tokio::io::AsyncWriteExt;
            if let Err(e) = file.write_all(&bytes).await {
                let _ = tokio::fs::remove_file(&path).await;
                return Err(error(e));
            }
            file.sync_all().await.map_err(error)?;
            created = Some(path);
            if extension == "wav" {
                event.audio_ref = Some(reference);
            } else if extension=="bin" {
                event.file_ref=Some(reference);event.mime=Some(media.mime);
            } else {
                event.image_ref = Some(reference);
            }
        }
        let payload = serde_json::to_string(&event).map_err(error)?;
        if payload.len() > 12 * 1024 * 1024 {
            if let Some(path) = created {
                let _ = tokio::fs::remove_file(path).await;
            }
            return Err("Chat event exceeds 12 MiB".into());
        }
        let result = async {
            let mut transaction = self.pool.begin().await.map_err(error)?;
            sqlx::query("INSERT INTO events(id,session_id,timestamp,payload) VALUES(?,?,?,?)")
                .bind(&event.id)
                .bind(id)
                .bind(event.timestamp)
                .bind(payload)
                .execute(&mut *transaction)
                .await
                .map_err(error)?;
            sqlx::query("UPDATE sessions SET updated_at=MAX(updated_at,?) WHERE id=?")
                .bind(event.timestamp)
                .bind(id)
                .execute(&mut *transaction)
                .await
                .map_err(error)?;
            transaction.commit().await.map_err(error)
        }
        .await;
        if let Err(e) = result {
            if let Some(path) = created {
                let _ = tokio::fs::remove_file(path).await;
            }
            return Err(e);
        }
        Ok(event)
    }
    async fn list(&self, query: &str) -> Result<Vec<SessionSummary>, String> {
        if query.len() > 4096 {
            return Err("Chat search is too long".into());
        }
        let search = format!(
            "%{}%",
            query
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        let rows=sqlx::query("SELECT s.*,COUNT(e.id) AS event_count FROM sessions s LEFT JOIN events e ON e.session_id=s.id WHERE s.title LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM events matching WHERE matching.session_id=s.id AND matching.payload LIKE ? ESCAPE '\\') GROUP BY s.id ORDER BY s.updated_at DESC,s.created_at DESC").bind(&search).bind(&search).fetch_all(&self.pool).await.map_err(error)?;
        Ok(rows
            .into_iter()
            .map(|r| SessionSummary {
                id: r.get("id"),
                title: r.get("title"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
                event_count: r.get("event_count"),
            })
            .collect())
    }
    async fn read(&self, id: &str, reference: &str) -> Result<Media, String> {
        if !valid_ref(reference) {
            return Err("Invalid chat media reference".into());
        }
        let session = self.get(id).await?;
        if !session.events.iter().any(|e| {
            e.audio_ref.as_deref() == Some(reference) || e.image_ref.as_deref() == Some(reference) || e.file_ref.as_deref()==Some(reference)
        }) {
            return Err("Media does not belong to this chat session".into());
        }
        let directory = owned_directory(&self.root, id)?;
        let path = directory.join(reference).canonicalize().map_err(error)?;
        if path.parent() != Some(directory.as_path()) {
            return Err("Media must stay inside its chat session".into());
        }
        if tokio::fs::metadata(&path).await.map_err(error)?.len() > 64 * 1024 * 1024 {
            return Err("Chat media exceeds 64 MiB".into());
        }
        let bytes = tokio::fs::read(path).await.map_err(error)?;
        let file_mime=session.events.iter().find(|e|e.file_ref.as_deref()==Some(reference)).and_then(|e|e.mime.as_deref()).unwrap_or("application/octet-stream");
        Ok(Media {
            mime: if reference.ends_with(".bin") {file_mime} else if reference.ends_with(".png") {"image/png"} else if reference.ends_with(".gif") {"image/gif"} else if reference.ends_with(".webp") {"image/webp"} else if reference.ends_with(".wav") {
                "audio/wav"
            } else {
                "image/jpeg"
            }
            .into(),
            base64: STANDARD.encode(bytes),
        })
    }
}
fn valid_ref(value: &str) -> bool {
    value
        .rsplit_once('.')
        .is_some_and(|(id, extension)| identifier(id).is_ok() && matches!(extension, "wav" | "jpg" | "bin" | "png" | "gif" | "webp"))
}
fn legacy_id(kind: &str, value: &str) -> String {
    format!(
        "legacy-{kind}-{}",
        ring::digest::digest(&ring::digest::SHA256, value.as_bytes())
            .as_ref()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    )
}
fn legacy_media(attachment: &serde_json::Value) -> Option<(String, Vec<u8>)> {
    // Embedded bytes are portable. Legacy paths are metadata only and are never read.
    let encoded = attachment.get("base64")?.as_str()?;
    if encoded.len() > 90 * 1024 * 1024 {
        return None;
    }
    let encoded = if encoded.starts_with("data:") {
        encoded.split_once(',')?.1
    } else {
        encoded
    };
    let bytes = STANDARD.decode(encoded).ok()?;
    if bytes.len() > 64 * 1024 * 1024 {
        return None;
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE".as_slice()) {
        return Some(("audio/wav".into(), bytes));
    }
    let reader = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .ok()?;
    let (width, height) = reader.into_dimensions().ok()?;
    if u64::from(width) * u64::from(height) > 33_554_432 {
        return None;
    }
    let image = image::load_from_memory(&bytes).ok()?.to_rgb8();
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 90)
        .encode(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .ok()?;
    Some(("image/jpeg".into(), jpeg))
}
async fn store<'a>(
    app: &AppHandle,
    state: &'a ChatSessionsState,
) -> Result<tokio::sync::MutexGuard<'a, Option<Store>>, String> {
    let mut guard = state.0.lock().await;
    if guard.is_none() {
        *guard = Some(Store::open(&crate::app_paths::data_dir(app)?).await?);
    }
    Ok(guard)
}
fn changed(app: &AppHandle, id: &str, deleted: bool) {
    let _ = app.emit(
        "chat-sessions-changed",
        serde_json::json!({"sessionId":id,"deleted":deleted}),
    );
}

#[tauri::command]
pub async fn create_chat_session(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    id: String,
    title: String,
) -> Result<Session, String> {
    let guard = store(&app, &state).await?;
    let value = guard.as_ref().unwrap().create(id, title).await?;
    changed(&app, &value.id, false);
    Ok(value)
}
#[tauri::command]
pub async fn get_chat_session(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    session_id: String,
) -> Result<Session, String> {
    store(&app, &state)
        .await?
        .as_ref()
        .unwrap()
        .get(&session_id)
        .await
}
#[tauri::command]
pub async fn list_chat_sessions(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    query: Option<String>,
) -> Result<Vec<SessionSummary>, String> {
    store(&app, &state)
        .await?
        .as_ref()
        .unwrap()
        .list(query.as_deref().unwrap_or(""))
        .await
}
#[tauri::command]
pub async fn append_chat_session_event(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    session_id: String,
    event: SessionEvent,
    media: Option<Media>,
) -> Result<SessionEvent, String> {
    let guard = store(&app, &state).await?;
    let event = guard
        .as_ref()
        .unwrap()
        .append(&session_id, event, media)
        .await?;
    changed(&app, &session_id, false);
    Ok(event)
}
#[tauri::command]
pub async fn rename_chat_session(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    identifier(&session_id)?;
    let guard = store(&app, &state).await?;
    let result = sqlx::query("UPDATE sessions SET title=? WHERE id=?")
        .bind(crate::chat_sessions::title(title)?)
        .bind(&session_id)
        .execute(&guard.as_ref().unwrap().pool)
        .await
        .map_err(error)?;
    if result.rows_affected() == 0 {
        return Err("Chat session does not exist".into());
    }
    changed(&app, &session_id, false);
    Ok(())
}
#[tauri::command]
pub async fn delete_chat_session(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    session_id: String,
) -> Result<(), String> {
    identifier(&session_id)?;
    let guard = store(&app, &state).await?;
    let store = guard.as_ref().unwrap();
    // Verify the resolved directory before removing any owned media.
    let directory = store.root.join(&session_id);
    let directory = if directory.exists() {
        Some(owned_directory(&store.root, &session_id)?)
    } else {
        None
    };
    sqlx::query("DELETE FROM sessions WHERE id=?")
        .bind(&session_id)
        .execute(&store.pool)
        .await
        .map_err(error)?;
    if let Some(directory) = directory {
        tokio::fs::remove_dir_all(directory).await.map_err(error)?;
    }
    changed(&app, &session_id, true);
    Ok(())
}
#[tauri::command]
pub async fn read_chat_media(
    app: AppHandle,
    state: State<'_, ChatSessionsState>,
    session_id: String,
    media_ref: String,
) -> Result<Media, String> {
    store(&app, &state)
        .await?
        .as_ref()
        .unwrap()
        .read(&session_id, &media_ref)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temporary() -> PathBuf {
        std::env::temp_dir().join(format!(
            "fluely-chat-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    fn event(id: &str, kind: &str, text: &str) -> SessionEvent {
        serde_json::from_value(serde_json::json!({"id":id,"kind":kind,"text":text,"timestamp":now(),"speaker":"Speaker 1","channel":"[mic]"})).unwrap()
    }
    #[tokio::test]
    async fn archive_roundtrip_preserves_metadata_media_and_search() {
        let root = temporary();
        let store = Store::open(&root).await.unwrap();
        store
            .create("chat-1".into(), "Local title".into())
            .await
            .unwrap();
        let wav = b"RIFF\0\0\0\0WAVEraw recording";
        let audio = store
            .append(
                "chat-1",
                event("audio-1", "audio", ""),
                Some(Media {
                    mime: "audio/wav".into(),
                    base64: STANDARD.encode(wav),
                }),
            )
            .await
            .unwrap();
        let mut transcript = event("text-1", "transcript", "hello archive");
        transcript.audio_ref = audio.audio_ref.clone();
        transcript.start = Some(0.5);
        store.append("chat-1", transcript, None).await.unwrap();
        let same = store
            .append("chat-1", event("audio-1", "audio", ""), None)
            .await
            .unwrap();
        assert_eq!(same.audio_ref, audio.audio_ref);
        assert_eq!(store.list("hello archive").await.unwrap()[0].event_count, 2);
        assert_eq!(store.list("%_").await.unwrap().len(), 0);
        let media = store
            .read("chat-1", audio.audio_ref.as_ref().unwrap())
            .await
            .unwrap();
        assert_eq!(STANDARD.decode(media.base64).unwrap(), wav);
        store.pool.close().await;
        drop(store);
        let reopened = Store::open(&root).await.unwrap();
        let loaded = reopened.get("chat-1").await.unwrap();
        assert_eq!(loaded.events[1].speaker.as_deref(), Some("Speaker 1"));
        assert_eq!(loaded.events[1].start, Some(0.5));
        reopened.pool.close().await;
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn archive_rejects_cross_session_media_and_traversal() {
        let root = temporary();
        let store = Store::open(&root).await.unwrap();
        store
            .create("chat-1".into(), "Own chat".into())
            .await
            .unwrap();
        assert!(store
            .create("../foreign".into(), "bad".into())
            .await
            .is_err());
        assert!(store.read("chat-1", "../foreign.wav").await.is_err());
        let mut text = event("event-1", "transcript", "hello");
        text.audio_ref = Some("../../outside.wav".into());
        assert!(store.append("chat-1", text, None).await.is_err());
        assert!(store
            .append(
                "chat-1",
                event("event-2", "audio", ""),
                Some(Media {
                    mime: "audio/wav".into(),
                    base64: STANDARD.encode(b"not wav")
                })
            )
            .await
            .is_err());
        store.pool.close().await;
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn legacy_import_is_readonly_complete_and_does_not_repeat_or_revert_renames() {
        let root = temporary();
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("pluely.db");
        let legacy = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::raw_sql("CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE messages(id TEXT,conversation_id TEXT,role TEXT,content TEXT,timestamp INTEGER,attached_files TEXT);CREATE TABLE _sqlx_migrations(version INTEGER,checksum BLOB);INSERT INTO _sqlx_migrations VALUES(3,X'012345');INSERT INTO conversations VALUES('../unsafe original ID','Old saved chat',1000,2000);").execute(&legacy).await.unwrap();
        let attachments = serde_json::json!([{ "name":"recording.wav","type":"audio/wav","base64":STANDARD.encode(b"RIFF\0\0\0\0WAVElegacy bytes")},{"name":"metadata only","type":"text/plain","path":"C:\\foreign\\private-file.txt"}]);
        sqlx::query("INSERT INTO messages VALUES('message-1','../unsafe original ID','user','Old question',1000,?)").bind(attachments.to_string()).execute(&legacy).await.unwrap();
        sqlx::query("INSERT INTO messages VALUES('message-2','../unsafe original ID','assistant','Old reply',2000,NULL)").execute(&legacy).await.unwrap();
        legacy.close().await;
        let original = std::fs::read(&path).unwrap();
        let store = Store::open(&root).await.unwrap();
        let list = store.list("").await.unwrap();
        assert_eq!(list.len(), 1);
        let id = &list[0].id;
        assert!(identifier(id).is_ok());
        let session = store.get(id).await.unwrap();
        assert_eq!(session.title, "Old saved chat");
        assert_eq!(session.events.len(), 3);
        assert_eq!(session.events[0].kind, "audio");
        assert_eq!(session.events[1].text, "Old question");
        assert_eq!(session.events[2].text, "Old reply");
        assert_eq!(
            session.events[1]
                .legacy_attachments
                .as_ref()
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            STANDARD
                .decode(
                    store
                        .read(id, session.events[0].audio_ref.as_ref().unwrap())
                        .await
                        .unwrap()
                        .base64
                )
                .unwrap(),
            b"RIFF\0\0\0\0WAVElegacy bytes"
        );
        sqlx::query("UPDATE sessions SET title='Renamed imported session' WHERE id=?")
            .bind(id)
            .execute(&store.pool)
            .await
            .unwrap();
        store.pool.close().await;
        drop(store);
        let reopened = Store::open(&root).await.unwrap();
        assert_eq!(
            reopened.list("").await.unwrap()[0].title,
            "Renamed imported session"
        );
        assert_eq!(reopened.list("").await.unwrap()[0].event_count, 3);
        assert_eq!(std::fs::read(path).unwrap(), original);
        reopened.pool.close().await;
        std::fs::remove_dir_all(root).unwrap();
    }
}
