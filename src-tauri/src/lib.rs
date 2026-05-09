use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate, NaiveTime, TimeZone};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration as StdDuration;
use tauri::menu::{CheckMenuItem, MenuBuilder};
use tauri::{AppHandle, Manager};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_notification::NotificationExt;

const TRAY_MENU_OPEN_ID: &str = "tray-open";
const TRAY_MENU_PAUSE_ID: &str = "tray-pause-reminders";
const TRAY_MENU_QUIT_ID: &str = "tray-quit";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct StoredEntry {
    id: String,
    r#type: String,
    title: String,
    time: Option<String>,
    body_html: Option<String>,
    done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AnniversaryRecord {
    id: String,
    title: String,
    kind: String,
    month: u8,
    day: u8,
    start_year: Option<u16>,
    notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PersistedData {
    entries_by_date: HashMap<String, Vec<StoredEntry>>,
    anniversaries: Vec<AnniversaryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ReminderState {
    day_key: String,
    sent_keys: Vec<String>,
}

fn is_valid_date_key(key: &str) -> bool {
    let bytes = key.as_bytes();
    if bytes.len() != 10 {
        return false;
    }

    for index in [0, 1, 2, 3, 5, 6, 8, 9] {
        if !bytes[index].is_ascii_digit() {
            return false;
        }
    }

    bytes[4] == b'-' && bytes[7] == b'-'
}

fn storage_file(app: &AppHandle) -> Result<PathBuf, String> {
    let mut directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    directory.push("evid-data.json");
    Ok(directory)
}

fn reminder_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let mut directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    directory.push("evid-reminder-state.json");
    Ok(directory)
}

fn load_data(app: &AppHandle) -> Result<PersistedData, String> {
    let path = storage_file(app)?;
    load_data_from_path(&path)
}

fn load_data_from_path(path: &Path) -> Result<PersistedData, String> {
    if !path.exists() {
        return Ok(PersistedData::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read storage file '{}': {error}", path.display()))?;

    if raw.trim().is_empty() {
        return Ok(PersistedData::default());
    }

    serde_json::from_str::<PersistedData>(raw.as_str())
        .map_err(|error| format!("failed to parse storage file '{}': {error}", path.display()))
}

fn load_reminder_state(app: &AppHandle) -> Result<ReminderState, String> {
    let path = reminder_state_file(app)?;

    if !path.exists() {
        return Ok(ReminderState::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read reminder state '{}': {error}", path.display()))?;

    if raw.trim().is_empty() {
        return Ok(ReminderState::default());
    }

    serde_json::from_str::<ReminderState>(raw.as_str())
        .map_err(|error| format!("failed to parse reminder state '{}': {error}", path.display()))
}

fn save_data(app: &AppHandle, data: &PersistedData) -> Result<(), String> {
    let path = storage_file(app)?;
    save_data_to_path(&path, data)
}

fn save_data_to_path(path: &Path, data: &PersistedData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create parent directory for storage file '{}': {error}",
                path.display()
            )
        })?;
    }

    let serialized = serde_json::to_string_pretty(data)
        .map_err(|error| format!("failed to serialize storage payload: {error}"))?;

    fs::write(&path, serialized)
        .map_err(|error| format!("failed to write storage file '{}': {error}", path.display()))
}

fn save_reminder_state(app: &AppHandle, state: &ReminderState) -> Result<(), String> {
    let path = reminder_state_file(app)?;
    let serialized = serde_json::to_string_pretty(state)
        .map_err(|error| format!("failed to serialize reminder state: {error}"))?;

    fs::write(&path, serialized)
        .map_err(|error| format!("failed to write reminder state '{}': {error}", path.display()))
}

fn hide_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    window
        .hide()
        .map_err(|error| format!("failed to hide window: {error}"))
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    window
        .show()
        .map_err(|error| format!("failed to show window: {error}"))?;
    window
        .unminimize()
        .map_err(|error| format!("failed to unminimize window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus window: {error}"))
}

fn setup_tray_icon(app: &AppHandle, reminders_paused: Arc<AtomicBool>) -> Result<(), String> {
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "default window icon unavailable".to_string())?;

    let pause_item = CheckMenuItem::with_id(
        app,
        TRAY_MENU_PAUSE_ID,
        "Pause reminders",
        true,
        false,
        None::<&str>,
    )
    .map_err(|error| format!("failed to create tray pause menu item: {error}"))?;

    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_MENU_OPEN_ID, "Open")
        .item(&pause_item)
        .separator()
        .text(TRAY_MENU_QUIT_ID, "Quit app")
        .build()
        .map_err(|error| format!("failed to create tray menu: {error}"))?;

    let pause_item_for_menu = pause_item.clone();
    let reminders_paused_for_menu = reminders_paused.clone();

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("evid")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            if event.id() == TRAY_MENU_OPEN_ID {
                let _ = show_main_window(app);
                return;
            }

            if event.id() == TRAY_MENU_PAUSE_ID {
                let next_paused = !reminders_paused_for_menu.load(Ordering::SeqCst);
                reminders_paused_for_menu.store(next_paused, Ordering::SeqCst);
                let _ = pause_item_for_menu.set_checked(next_paused);

                let status = if next_paused {
                    "Reminders paused"
                } else {
                    "Reminders resumed"
                };
                send_notification(app, "evid", status);
                return;
            }

            if event.id() == TRAY_MENU_QUIT_ID {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = show_main_window(&app);
            }
        })
        .build(app)
        .map(|_| ())
        .map_err(|error| format!("failed to create tray icon: {error}"))
}

fn clamp_anniversary_date(year: i32, month: u32, day: u32) -> Option<NaiveDate> {
    if !(1..=12).contains(&month) {
        return None;
    }

    let max_day = day.min(31);
    for candidate in (1..=max_day).rev() {
        if let Some(date) = NaiveDate::from_ymd_opt(year, month, candidate) {
            return Some(date);
        }
    }

    None
}

fn next_anniversary_date(record: &AnniversaryRecord, today: NaiveDate) -> Option<NaiveDate> {
    let month = u32::from(record.month);
    let day = u32::from(record.day);

    let this_year = clamp_anniversary_date(today.year(), month, day)?;
    if this_year >= today {
        return Some(this_year);
    }

    clamp_anniversary_date(today.year() + 1, month, day)
}

fn parse_task_due_datetime(date_key: &str, time: &str) -> Option<chrono::DateTime<Local>> {
    let date = NaiveDate::parse_from_str(date_key, "%Y-%m-%d").ok()?;
    let parsed_time = NaiveTime::parse_from_str(time, "%H:%M").ok()?;
    Local.from_local_datetime(&date.and_time(parsed_time)).earliest()
}

fn send_notification(app: &AppHandle, title: &str, body: &str) {
    if let Err(error) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("failed to show notification: {error}");
    }
}

fn dispatch_task_reminders(
    app: &AppHandle,
    data: &PersistedData,
    now: chrono::DateTime<Local>,
    sent: &mut HashSet<String>,
) -> bool {
    let mut changed = false;
    let today_key = now.format("%Y-%m-%d").to_string();

    let Some(entries) = data.entries_by_date.get(today_key.as_str()) else {
        return false;
    };

    for entry in entries {
        let Some(time) = entry.time.as_deref() else {
            continue;
        };

        let Some(due_at) = parse_task_due_datetime(today_key.as_str(), time) else {
            continue;
        };

        if now < due_at {
            continue;
        }

        let reminder_key = format!("task:{}:{today_key}:{time}", entry.id);
        if !sent.insert(reminder_key) {
            continue;
        }

        let title = "Task reminder";
        let body = format!("{} ({}) is due now.", entry.title, time);
        send_notification(app, title, body.as_str());
        changed = true;
    }

    changed
}

fn anniversary_lead_label(offset_days: i64) -> &'static str {
    match offset_days {
        30 => "in 1 month",
        7 => "in 1 week",
        1 => "tomorrow",
        _ => "today",
    }
}

fn dispatch_anniversary_reminders(
    app: &AppHandle,
    data: &PersistedData,
    now: chrono::DateTime<Local>,
    sent: &mut HashSet<String>,
) -> bool {
    let mut changed = false;
    let today = now.date_naive();

    for item in &data.anniversaries {
        let Some(occurrence_date) = next_anniversary_date(item, today) else {
            continue;
        };

        for offset_days in [30_i64, 7, 1, 0] {
            let reminder_date = occurrence_date - ChronoDuration::days(offset_days);
            if reminder_date != today {
                continue;
            }

            let occurrence_key = occurrence_date.format("%Y-%m-%d").to_string();
            let reminder_key = format!("ann:{}:{occurrence_key}:{offset_days}", item.id);
            if !sent.insert(reminder_key) {
                continue;
            }

            let years_text = item
                .start_year
                .filter(|year| i32::from(*year) <= occurrence_date.year())
                .map(|year| {
                    let years = occurrence_date.year() - i32::from(year);
                    if years > 0 {
                        format!(" ({years} years)")
                    } else {
                        "".to_string()
                    }
                })
                .unwrap_or_default();

            let lead_text = anniversary_lead_label(offset_days);
            let body = format!(
                "{} is {} ({}){}.",
                item.title,
                lead_text,
                occurrence_date.format("%b %d"),
                years_text
            );

            send_notification(app, "Anniversary reminder", body.as_str());
            changed = true;
        }
    }

    changed
}

fn reminder_tick(app: &AppHandle, state: &mut ReminderState) -> Result<(), String> {
    let now = Local::now();
    let today_key = now.format("%Y-%m-%d").to_string();

    let mut changed = false;
    if state.day_key != today_key {
        state.day_key = today_key;
        state.sent_keys.clear();
        changed = true;
    }

    let data = load_data(app)?;
    let mut sent: HashSet<String> = state.sent_keys.iter().cloned().collect();

    if dispatch_task_reminders(app, &data, now, &mut sent) {
        changed = true;
    }
    if dispatch_anniversary_reminders(app, &data, now, &mut sent) {
        changed = true;
    }

    if changed {
        let mut sent_keys = sent.into_iter().collect::<Vec<_>>();
        sent_keys.sort();
        state.sent_keys = sent_keys;
        save_reminder_state(app, state)?;
    }

    Ok(())
}

fn start_reminder_loop(app: AppHandle, reminders_paused: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut state = load_reminder_state(&app).unwrap_or_default();

        loop {
            if reminders_paused.load(Ordering::SeqCst) {
                std::thread::sleep(StdDuration::from_secs(30));
                continue;
            }

            if let Err(error) = reminder_tick(&app, &mut state) {
                eprintln!("reminder loop tick failed: {error}");
            }

            std::thread::sleep(StdDuration::from_secs(30));
        }
    });
}

fn sanitize_anniversaries(records: Vec<AnniversaryRecord>) -> Vec<AnniversaryRecord> {
    records
        .into_iter()
        .filter_map(|mut record| {
            record.title = record.title.trim().to_string();
            if record.title.is_empty() {
                return None;
            }

            if !(1..=12).contains(&record.month) || !(1..=31).contains(&record.day) {
                return None;
            }

            if record.kind.trim().is_empty() {
                record.kind = "custom".to_string();
            }

            Some(record)
        })
        .collect()
}

fn sanitize_entries(
    entries_by_date: HashMap<String, Vec<StoredEntry>>,
    today_key: &str,
) -> HashMap<String, Vec<StoredEntry>> {
    let mut cleaned = HashMap::new();

    for (date_key, entries) in entries_by_date {
        if !is_valid_date_key(&date_key) || date_key.as_str() < today_key {
            continue;
        }

        let valid_entries: Vec<StoredEntry> = entries
            .into_iter()
            .filter_map(|mut entry| {
                entry.title = entry.title.trim().to_string();
                if entry.done || entry.title.is_empty() {
                    return None;
                }
                Some(entry)
            })
            .collect();

        if !valid_entries.is_empty() {
            cleaned.insert(date_key, valid_entries);
        }
    }

    cleaned
}

#[tauri::command]
fn load_persisted_data(app: AppHandle) -> Result<PersistedData, String> {
    load_data(&app)
}

#[tauri::command]
fn save_one_off_entries(
    app: AppHandle,
    entries_by_date: HashMap<String, Vec<StoredEntry>>,
    today_key: String,
) -> Result<(), String> {
    let mut data = load_data(&app)?;
    data.entries_by_date = sanitize_entries(entries_by_date, today_key.as_str());
    save_data(&app, &data)
}

#[tauri::command]
fn save_anniversaries(app: AppHandle, anniversaries: Vec<AnniversaryRecord>) -> Result<(), String> {
    let mut data = load_data(&app)?;
    data.anniversaries = sanitize_anniversaries(anniversaries);
    save_data(&app, &data)
}

#[tauri::command]
fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let reminders_paused = Arc::new(AtomicBool::new(false));
            setup_tray_icon(&app.handle(), reminders_paused.clone())?;
            start_reminder_loop(app.handle().clone(), reminders_paused);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_persisted_data,
            save_one_off_entries,
            save_anniversaries,
            hide_to_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_storage_path() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);

        std::env::temp_dir().join(format!("evid-persistence-smoke-{stamp}.json"))
    }

    #[test]
    fn persistence_smoke_roundtrip_load_save_load() {
        let path = temp_storage_path();

        let mut entries_by_date = HashMap::new();
        entries_by_date.insert(
            "2099-12-31".to_string(),
            vec![StoredEntry {
                id: "entry-1".to_string(),
                r#type: "Task".to_string(),
                title: "Verify persistence".to_string(),
                time: Some("10:30".to_string()),
                body_html: Some("<p>roundtrip</p>".to_string()),
                done: false,
            }],
        );

        let expected = PersistedData {
            entries_by_date,
            anniversaries: vec![AnniversaryRecord {
                id: "ann-1".to_string(),
                title: "Test Anniversary".to_string(),
                kind: "custom".to_string(),
                month: 12,
                day: 31,
                start_year: Some(2020),
                notes: Some("smoke".to_string()),
            }],
        };

        save_data_to_path(&path, &expected).expect("save should succeed");
        let loaded = load_data_from_path(&path).expect("load should succeed");

        assert_eq!(loaded, expected);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn persistence_smoke_roundtrip_missing_file_defaults() {
        let path = temp_storage_path();
        let loaded = load_data_from_path(&path).expect("loading missing file should succeed");
        assert_eq!(loaded, PersistedData::default());
    }

    #[test]
    fn anniversary_next_occurrence_uses_next_year_when_passed() {
        let record = AnniversaryRecord {
            id: "ann-test".to_string(),
            title: "Anniversary".to_string(),
            kind: "custom".to_string(),
            month: 1,
            day: 1,
            start_year: None,
            notes: None,
        };

        let today = NaiveDate::from_ymd_opt(2026, 12, 10).expect("valid date");
        let next = next_anniversary_date(&record, today).expect("next anniversary should exist");
        assert_eq!(next, NaiveDate::from_ymd_opt(2027, 1, 1).expect("valid date"));
    }

    #[test]
    fn anniversary_next_occurrence_clamps_invalid_day() {
        let record = AnniversaryRecord {
            id: "ann-invalid".to_string(),
            title: "Edge".to_string(),
            kind: "custom".to_string(),
            month: 2,
            day: 31,
            start_year: None,
            notes: None,
        };

        let today = NaiveDate::from_ymd_opt(2026, 1, 1).expect("valid date");
        let next = next_anniversary_date(&record, today).expect("next anniversary should exist");
        assert_eq!(next, NaiveDate::from_ymd_opt(2026, 2, 28).expect("valid date"));
    }
}
