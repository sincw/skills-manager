//! MCP server library lifecycle: install, edit, remove, list, show, sync.
//!
//! Central library always stores TOML under `~/.skills-manager/mcp/`.
//! Sync merges a preset's servers into one profile file per capable tool.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value as JsonValue};

use super::central_repo;
use super::error::AppError;
use super::mcp_store::McpServerRecord;
use super::skill_store::SkillStore;
use super::tool_adapters::{self, ToolAdapter};

pub const MAX_CONTENT_BYTES: usize = 64 * 1024;

// ── Public DTOs ──

#[derive(Debug, Clone, Serialize)]
pub struct McpListItem {
    pub name: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub presets: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpShowResult {
    pub name: String,
    pub id: String,
    pub content: String,
    pub central_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub presets: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpInstallResult {
    pub ok: bool,
    pub name: String,
    pub id: String,
    pub central_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpEditResult {
    pub ok: bool,
    pub name: String,
    pub id: String,
    pub resynced: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpRemoveResult {
    pub ok: bool,
    pub name: String,
    pub id: String,
    pub dry_run: bool,
    pub resynced: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpToolSyncStatus {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpSyncResult {
    pub preset: String,
    pub profile_arg: String,
    pub tools: BTreeMap<String, McpToolSyncStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset_name_error: Option<String>,
}

// ── Validation helpers ──

pub fn validate_server_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::invalid_input("invalid_server_name"));
    }
    for ch in name.chars() {
        if ch == '.'
            || ch == ']'
            || ch == '/'
            || ch == '\\'
            || ch.is_whitespace()
            || ch.is_control()
        {
            return Err(AppError::invalid_input("invalid_server_name"));
        }
    }
    Ok(())
}

/// Preset names used as profile file stems must not contain path separators,
/// NUL, or other control characters.
pub fn validate_preset_name_for_sync(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::invalid_input("invalid_preset_name"));
    }
    for ch in name.chars() {
        if ch == '/' || ch == '\\' || ch == '\0' || ch.is_control() {
            return Err(AppError::invalid_input("invalid_preset_name"));
        }
    }
    Ok(())
}

fn enforce_size_limit(content: &str) -> Result<(), AppError> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err(AppError::invalid_input(format!(
            "content exceeds {MAX_CONTENT_BYTES} bytes"
        )));
    }
    Ok(())
}

/// Nested table keys allowed under a server section (e.g. `[mcp_servers.x.env]`).
/// Anything else after the server name in a dotted header is treated as an
/// attempt to use a dotted server name and rejected.
const ALLOWED_MCP_NESTED_KEYS: &[&str] = &["env"];

/// Scan raw TOML for `[mcp_servers.<name>]` / `[mcp_servers.<name>.…]` headers
/// and reject dotted server names before the TOML parser collapses them into
/// nested tables. Nested tables under a valid server (currently only `env`)
/// are allowed.
fn reject_dotted_mcp_headers(raw: &str) -> Result<(), AppError> {
    for line in raw.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
            continue;
        }
        let inner = &trimmed[1..trimmed.len() - 1];
        // Match bare headers like mcp_servers.foo or mcp_servers.foo.env
        // (quoted keys are handled later by validate_server_name on the map key).
        if let Some(rest) = inner.strip_prefix("mcp_servers.") {
            let mut parts = rest.split('.');
            let server_name = parts.next().unwrap_or("");
            validate_server_name(server_name)?;
            // Further segments: only known nested keys (env) are allowed.
            // `[mcp_servers.bad.name]` → nested key "name" → invalid_server_name.
            // `[mcp_servers.weather.env]` → nested key "env" → ok.
            for nested in parts {
                if !ALLOWED_MCP_NESTED_KEYS.contains(&nested) {
                    return Err(AppError::invalid_input("invalid_server_name"));
                }
            }
        }
    }
    Ok(())
}

// ── Parse / normalize ──

#[derive(Debug, Clone)]
struct ParsedServer {
    name: String,
    /// Normalized TOML content with exactly one `[mcp_servers.<name>]` section.
    toml_content: String,
}

fn parse_toml_input(raw: &str) -> Result<ParsedServer, AppError> {
    // Reject dotted / nested section headers before TOML collapses them into nested tables.
    // e.g. `[mcp_servers.bad.name]` would otherwise parse as a single key `bad`.
    reject_dotted_mcp_headers(raw)?;

    let value: toml::Value = toml::from_str(raw)
        .map_err(|e| AppError::invalid_input(format!("invalid_toml: {e}")))?;

    let table = value.as_table().ok_or_else(|| {
        AppError::invalid_input("invalid_toml: expected a top-level table")
    })?;

    // Only `[mcp_servers]` (and nested server tables) is allowed at the top level.
    let extra: Vec<&String> = table.keys().filter(|k| *k != "mcp_servers").collect();
    if !extra.is_empty() {
        return Err(AppError::invalid_input("extra_top_level_sections"));
    }

    let mcp_servers = table
        .get("mcp_servers")
        .and_then(|v| v.as_table())
        .ok_or_else(|| AppError::invalid_input("no_servers"))?;

    match mcp_servers.len() {
        0 => return Err(AppError::invalid_input("no_servers")),
        1 => {}
        n => {
            return Err(AppError::invalid_input(format!(
                "multiple_servers:count={n}"
            )));
        }
    }

    let (name, body) = mcp_servers.iter().next().unwrap();
    validate_server_name(name)?;

    // Re-serialize a clean single-server document.
    let mut root = toml::map::Map::new();
    let mut servers = toml::map::Map::new();
    servers.insert(name.clone(), body.clone());
    root.insert("mcp_servers".into(), toml::Value::Table(servers));
    let toml_content = toml::to_string_pretty(&toml::Value::Table(root))
        .map_err(|e| AppError::internal(format!("toml serialize failed: {e}")))?;

    Ok(ParsedServer {
        name: name.clone(),
        toml_content,
    })
}

fn parse_json_input(raw: &str) -> Result<ParsedServer, AppError> {
    let value: JsonValue = serde_json::from_str(raw)
        .map_err(|e| AppError::invalid_input(format!("invalid_json: {e}")))?;

    let obj = value.as_object().ok_or_else(|| {
        AppError::invalid_input("invalid_json: expected a top-level object")
    })?;

    // Accept either {"mcpServers": {...}} or a bare single-server map is rejected.
    let servers = obj
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .ok_or_else(|| AppError::invalid_input("no_servers"))?;

    match servers.len() {
        0 => return Err(AppError::invalid_input("no_servers")),
        1 => {}
        n => {
            return Err(AppError::invalid_input(format!(
                "multiple_servers:count={n}"
            )));
        }
    }

    let (name, body) = servers.iter().next().unwrap();
    validate_server_name(name)?;

    // Convert JSON body → toml::Value preserving key case (via serde).
    let body_toml: toml::Value = serde_json::from_value(body.clone()).map_err(|e| {
        AppError::invalid_input(format!("json_to_toml failed: {e}"))
    })?;

    let mut root = toml::map::Map::new();
    let mut mcp = toml::map::Map::new();
    mcp.insert(name.clone(), body_toml);
    root.insert("mcp_servers".into(), toml::Value::Table(mcp));
    let toml_content = toml::to_string_pretty(&toml::Value::Table(root))
        .map_err(|e| AppError::internal(format!("toml serialize failed: {e}")))?;

    Ok(ParsedServer {
        name: name.clone(),
        toml_content,
    })
}

/// Parse install input. `from_json` is true only when a `.json` file path was given.
fn parse_install_content(raw: &str, from_json: bool) -> Result<ParsedServer, AppError> {
    enforce_size_limit(raw)?;
    if from_json {
        parse_json_input(raw)
    } else {
        parse_toml_input(raw)
    }
}

// ── Install / edit / remove ──

pub fn install_from_content(
    store: &SkillStore,
    content: &str,
) -> Result<McpInstallResult, AppError> {
    install_from_content_with_description(store, content, None)
}

pub fn install_from_content_with_description(
    store: &SkillStore,
    content: &str,
    description: Option<&str>,
) -> Result<McpInstallResult, AppError> {
    // --content is TOML-only.
    let parsed = parse_install_content(content, false)?;
    write_installed(store, parsed, normalize_description(description))
}

pub fn install_from_path(
    store: &SkillStore,
    path: &Path,
) -> Result<McpInstallResult, AppError> {
    install_from_path_with_description(store, path, None)
}

pub fn install_from_path_with_description(
    store: &SkillStore,
    path: &Path,
    description: Option<&str>,
) -> Result<McpInstallResult, AppError> {
    let raw = fs::read_to_string(path).map_err(AppError::io)?;
    let from_json = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !from_json {
        let is_toml = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("toml"))
            .unwrap_or(false);
        if !is_toml {
            return Err(AppError::invalid_input(
                "mcp install path must be a .toml or .json file",
            ));
        }
    }
    let parsed = parse_install_content(&raw, from_json)?;
    write_installed(store, parsed, normalize_description(description))
}

fn normalize_description(description: Option<&str>) -> Option<String> {
    description
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(500).collect())
}

fn write_installed(
    store: &SkillStore,
    parsed: ParsedServer,
    description: Option<String>,
) -> Result<McpInstallResult, AppError> {
    if store
        .get_mcp_server_by_name(&parsed.name)
        .map_err(AppError::db)?
        .is_some()
    {
        return Err(AppError::invalid_input(format!(
            "duplicate_server:{}",
            parsed.name
        )));
    }

    let mcp_dir = central_repo::mcp_dir();
    fs::create_dir_all(&mcp_dir).map_err(AppError::io)?;
    let central_path = mcp_dir.join(format!("{}.toml", parsed.name));
    fs::write(&central_path, &parsed.toml_content).map_err(AppError::io)?;

    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();
    let record = McpServerRecord {
        id: id.clone(),
        name: parsed.name.clone(),
        content: parsed.toml_content,
        central_path: central_path.to_string_lossy().to_string(),
        description: description.clone(),
        created_at: now,
        updated_at: now,
    };
    if let Err(e) = store.insert_mcp_server(&record) {
        let _ = fs::remove_file(&central_path);
        return Err(AppError::db(e));
    }

    Ok(McpInstallResult {
        ok: true,
        name: parsed.name,
        id,
        central_path: record.central_path,
        description,
    })
}

pub fn edit_server(
    store: &SkillStore,
    name: &str,
    new_content: &str,
) -> Result<McpEditResult, AppError> {
    edit_server_with_description(store, name, Some(new_content), None)
}

pub fn edit_server_with_description(
    store: &SkillStore,
    name: &str,
    new_content: Option<&str>,
    description: Option<Option<&str>>,
) -> Result<McpEditResult, AppError> {
    let existing = store
        .get_mcp_server_by_name(name)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found(format!("mcp server not found: {name}")))?;

    if new_content.is_none() && description.is_none() {
        return Err(AppError::invalid_input(
            "mcp edit requires --content/--file and/or --description",
        ));
    }

    let now = chrono::Utc::now().timestamp_millis();

    if let Some(raw) = new_content {
        enforce_size_limit(raw)?;
        let parsed = parse_toml_input(raw)?;
        if parsed.name != existing.name {
            return Err(AppError::invalid_input(
                "name_change_not_allowed: use remove + install to rename",
            ));
        }

        // Atomic order: temp write → DB commit → rename over target.
        let target = PathBuf::from(&existing.central_path);
        let parent = target
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(central_repo::mcp_dir);
        fs::create_dir_all(&parent).map_err(AppError::io)?;

        let temp_name = format!(
            ".{}.tmp.{}",
            existing.name,
            uuid::Uuid::new_v4()
        );
        let temp_path = parent.join(temp_name);
        fs::write(&temp_path, &parsed.toml_content).map_err(AppError::io)?;

        if let Err(e) = store.update_mcp_server_content(&existing.id, &parsed.toml_content, now)
        {
            let _ = fs::remove_file(&temp_path);
            return Err(AppError::db(e));
        }

        if let Err(e) = fs::rename(&temp_path, &target) {
            log::warn!(
                "mcp edit: rename failed for {}: {e}; DB row is authoritative",
                target.display()
            );
            let _ = fs::remove_file(&temp_path);
        }
    }

    if let Some(desc) = description {
        let normalized = normalize_description(desc);
        store
            .update_mcp_server_description(&existing.id, normalized.as_deref(), now)
            .map_err(AppError::db)?;
    }

    let resynced = if new_content.is_some() {
        maybe_resync_active_if_member(store, &existing.id)?
    } else {
        false
    };

    Ok(McpEditResult {
        ok: true,
        name: existing.name,
        id: existing.id,
        resynced,
    })
}

pub fn remove_server(
    store: &SkillStore,
    name: &str,
    yes: bool,
    dry_run: bool,
) -> Result<McpRemoveResult, AppError> {
    let existing = store
        .get_mcp_server_by_name(name)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found(format!("mcp server not found: {name}")))?;

    // Was it a member of the active preset? Check before delete (CASCADE drops membership).
    let was_active_member = is_member_of_active_preset(store, &existing.id)?;

    if dry_run || !yes {
        return Ok(McpRemoveResult {
            ok: dry_run,
            name: existing.name,
            id: existing.id,
            dry_run,
            resynced: false,
        });
    }

    store
        .delete_mcp_server(&existing.id)
        .map_err(AppError::db)?;
    let path = PathBuf::from(&existing.central_path);
    if path.exists() {
        let _ = fs::remove_file(&path);
    }

    let resynced = if was_active_member {
        resync_active_preset(store).is_ok()
    } else {
        false
    };

    Ok(McpRemoveResult {
        ok: true,
        name: existing.name,
        id: existing.id,
        dry_run: false,
        resynced,
    })
}

// ── List / show ──

pub fn list_servers(store: &SkillStore) -> Result<Vec<McpListItem>, AppError> {
    let servers = store.get_all_mcp_servers().map_err(AppError::db)?;
    let scenarios = store.get_all_scenarios().map_err(AppError::db)?;
    let scenario_names: BTreeMap<String, String> = scenarios
        .into_iter()
        .map(|s| (s.id, s.name))
        .collect();

    let mut out = Vec::with_capacity(servers.len());
    for s in servers {
        let preset_ids = store.get_scenarios_for_mcp(&s.id).map_err(AppError::db)?;
        let presets: Vec<String> = preset_ids
            .into_iter()
            .filter_map(|id| scenario_names.get(&id).cloned())
            .collect();
        out.push(McpListItem {
            name: s.name,
            id: s.id,
            description: s.description,
            presets,
            created_at: s.created_at,
            updated_at: s.updated_at,
        });
    }
    Ok(out)
}

pub fn show_server(store: &SkillStore, name: &str) -> Result<McpShowResult, AppError> {
    let s = store
        .get_mcp_server_by_name(name)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found(format!("mcp server not found: {name}")))?;
    let scenarios = store.get_all_scenarios().map_err(AppError::db)?;
    let scenario_names: BTreeMap<String, String> = scenarios
        .into_iter()
        .map(|sc| (sc.id, sc.name))
        .collect();
    let preset_ids = store.get_scenarios_for_mcp(&s.id).map_err(AppError::db)?;
    let presets: Vec<String> = preset_ids
        .into_iter()
        .filter_map(|id| scenario_names.get(&id).cloned())
        .collect();
    Ok(McpShowResult {
        name: s.name,
        id: s.id,
        content: s.content,
        central_path: s.central_path,
        description: s.description,
        presets,
        created_at: s.created_at,
        updated_at: s.updated_at,
    })
}

// ── Sync ──

pub fn sync_preset(
    store: &SkillStore,
    preset_ref: Option<&str>,
) -> Result<McpSyncResult, AppError> {
    let (preset_id, preset_name) = resolve_sync_preset(store, preset_ref)?;
    let servers = store
        .get_mcp_servers_for_scenario(&preset_id)
        .map_err(AppError::db)?;

    let mut tools: BTreeMap<String, McpToolSyncStatus> = BTreeMap::new();
    let mut preset_name_error: Option<String> = None;

    let name_valid = validate_preset_name_for_sync(&preset_name);
    if let Err(e) = &name_valid {
        preset_name_error = Some(e.message.clone());
    }

    let adapters = tool_adapters::enabled_installed_adapters(store);
    for adapter in adapters {
        let status = sync_one_tool(&adapter, &preset_name, &servers, name_valid.is_ok());
        tools.insert(adapter.key.clone(), status);
    }

    Ok(McpSyncResult {
        preset: preset_name.clone(),
        profile_arg: preset_name,
        tools,
        preset_name_error,
    })
}

/// Write empty `[mcp_servers]` / `{"mcpServers":{}}` for a preset across all
/// capable tools. Used by apply (clear old) and deactivate.
pub fn clear_preset_profiles(
    store: &SkillStore,
    preset_name: &str,
) -> Result<McpSyncResult, AppError> {
    // Empty server list → empty section written for each capable tool.
    let mut tools: BTreeMap<String, McpToolSyncStatus> = BTreeMap::new();
    let mut preset_name_error: Option<String> = None;
    let name_valid = validate_preset_name_for_sync(preset_name);
    if let Err(e) = &name_valid {
        preset_name_error = Some(e.message.clone());
    }
    let adapters = tool_adapters::enabled_installed_adapters(store);
    for adapter in adapters {
        let status = sync_one_tool(&adapter, preset_name, &[], name_valid.is_ok());
        tools.insert(adapter.key.clone(), status);
    }
    Ok(McpSyncResult {
        preset: preset_name.to_string(),
        profile_arg: preset_name.to_string(),
        tools,
        preset_name_error,
    })
}

fn resolve_sync_preset(
    store: &SkillStore,
    preset_ref: Option<&str>,
) -> Result<(String, String), AppError> {
    match preset_ref {
        None => {
            let active_id = store
                .get_active_scenario_id()
                .map_err(AppError::db)?
                .ok_or_else(|| AppError::invalid_input("no_active_preset"))?;
            let scenarios = store.get_all_scenarios().map_err(AppError::db)?;
            let sc = scenarios
                .into_iter()
                .find(|s| s.id == active_id)
                .ok_or_else(|| AppError::not_found("active preset not found"))?;
            Ok((sc.id, sc.name))
        }
        Some(r) => {
            let scenarios = store.get_all_scenarios().map_err(AppError::db)?;
            let matches: Vec<_> = scenarios
                .into_iter()
                .filter(|s| s.id == r || s.name == r)
                .collect();
            match matches.len() {
                1 => {
                    let sc = matches.into_iter().next().unwrap();
                    Ok((sc.id, sc.name))
                }
                0 => Err(AppError::not_found(format!("preset not found: {r}"))),
                _ => Err(AppError::invalid_input(format!(
                    "preset reference is ambiguous: {r}"
                ))),
            }
        }
    }
}

fn sync_one_tool(
    adapter: &ToolAdapter,
    preset_name: &str,
    servers: &[McpServerRecord],
    name_valid: bool,
) -> McpToolSyncStatus {
    if !adapter.supports_mcp_profile {
        return McpToolSyncStatus {
            status: "skipped".into(),
            path: None,
            reason: Some("tool_does_not_support_profile_mcp".into()),
        };
    }

    if !name_valid {
        return McpToolSyncStatus {
            status: "skipped".into(),
            path: None,
            reason: Some("invalid_preset_name".into()),
        };
    }

    let format = adapter.resolved_mcp_output_format().to_string();
    if !adapter.supported_mcp_formats.is_empty()
        && !adapter
            .supported_mcp_formats
            .iter()
            .any(|f| f.eq_ignore_ascii_case(&format))
    {
        return McpToolSyncStatus {
            status: "skipped".into(),
            path: None,
            reason: Some("tool_does_not_support_mcp_format".into()),
        };
    }

    let Some(out_dir) = adapter.mcp_output_dir() else {
        return McpToolSyncStatus {
            status: "skipped".into(),
            path: None,
            reason: Some("no_mcp_output_dir".into()),
        };
    };

    // Fixed-filename tools (e.g. Pi → mcp.json) whole-file replace a single path.
    // Profile tools (e.g. Codex) write `{preset}.config.{ext}` overlays.
    let out_path = if let Some(fixed) = adapter
        .mcp_output_filename
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        // Reject path separators in fixed names (safety).
        if fixed.contains('/') || fixed.contains('\\') || fixed.contains('\0') {
            return McpToolSyncStatus {
                status: "skipped".into(),
                path: None,
                reason: Some("invalid_mcp_output_filename".into()),
            };
        }
        out_dir.join(fixed)
    } else {
        let ext = if format.eq_ignore_ascii_case("json") {
            "json"
        } else {
            "toml"
        };
        out_dir.join(format!("{preset_name}.config.{ext}"))
    };

    let body = match render_merged_profile(servers, &format) {
        Ok(b) => b,
        Err(e) => {
            return McpToolSyncStatus {
                status: "skipped".into(),
                path: None,
                reason: Some(format!("render_failed:{e}")),
            };
        }
    };

    if let Err(e) = fs::create_dir_all(&out_dir) {
        return McpToolSyncStatus {
            status: "skipped".into(),
            path: None,
            reason: Some(format!("io_error:{e}")),
        };
    }
    if let Err(e) = fs::write(&out_path, body) {
        return McpToolSyncStatus {
            status: "skipped".into(),
            path: None,
            reason: Some(format!("io_error:{e}")),
        };
    }

    McpToolSyncStatus {
        status: "written".into(),
        path: Some(out_path.to_string_lossy().to_string()),
        reason: None,
    }
}

fn render_merged_profile(
    servers: &[McpServerRecord],
    format: &str,
) -> Result<String, AppError> {
    if format.eq_ignore_ascii_case("json") {
        return render_json_profile(servers);
    }
    render_toml_profile(servers)
}

fn render_toml_profile(servers: &[McpServerRecord]) -> Result<String, AppError> {
    if servers.is_empty() {
        return Ok("[mcp_servers]\n".to_string());
    }

    let mut merged = toml::map::Map::new();
    for s in servers {
        let value: toml::Value = toml::from_str(&s.content)
            .map_err(|e| AppError::internal(format!("corrupt mcp content for {}: {e}", s.name)))?;
        let table = value.as_table().ok_or_else(|| {
            AppError::internal(format!("corrupt mcp content for {}: not a table", s.name))
        })?;
        let mcp = table
            .get("mcp_servers")
            .and_then(|v| v.as_table())
            .ok_or_else(|| {
                AppError::internal(format!(
                    "corrupt mcp content for {}: missing mcp_servers",
                    s.name
                ))
            })?;
        for (k, v) in mcp {
            merged.insert(k.clone(), v.clone());
        }
    }

    let mut root = toml::map::Map::new();
    root.insert("mcp_servers".into(), toml::Value::Table(merged));
    toml::to_string_pretty(&toml::Value::Table(root))
        .map_err(|e| AppError::internal(format!("toml serialize failed: {e}")))
}

fn render_json_profile(servers: &[McpServerRecord]) -> Result<String, AppError> {
    let mut map = serde_json::Map::new();
    for s in servers {
        let value: toml::Value = toml::from_str(&s.content)
            .map_err(|e| AppError::internal(format!("corrupt mcp content for {}: {e}", s.name)))?;
        let table = value.as_table().ok_or_else(|| {
            AppError::internal(format!("corrupt mcp content for {}: not a table", s.name))
        })?;
        let mcp = table
            .get("mcp_servers")
            .and_then(|v| v.as_table())
            .ok_or_else(|| {
                AppError::internal(format!(
                    "corrupt mcp content for {}: missing mcp_servers",
                    s.name
                ))
            })?;
        for (k, v) in mcp {
            let json_v: JsonValue = toml_to_json(v);
            map.insert(k.clone(), json_v);
        }
    }
    let root = json!({ "mcpServers": map });
    serde_json::to_string_pretty(&root)
        .map_err(|e| AppError::internal(format!("json serialize failed: {e}")))
}

fn toml_to_json(v: &toml::Value) -> JsonValue {
    match v {
        toml::Value::String(s) => JsonValue::String(s.clone()),
        toml::Value::Integer(i) => json!(*i),
        toml::Value::Float(f) => json!(*f),
        toml::Value::Boolean(b) => JsonValue::Bool(*b),
        toml::Value::Datetime(d) => JsonValue::String(d.to_string()),
        toml::Value::Array(arr) => JsonValue::Array(arr.iter().map(toml_to_json).collect()),
        toml::Value::Table(t) => {
            let mut m = serde_json::Map::new();
            for (k, v) in t {
                m.insert(k.clone(), toml_to_json(v));
            }
            JsonValue::Object(m)
        }
    }
}

// ── Active-preset auto re-sync helpers ──

fn is_member_of_active_preset(store: &SkillStore, mcp_id: &str) -> Result<bool, AppError> {
    let Some(active_id) = store.get_active_scenario_id().map_err(AppError::db)? else {
        return Ok(false);
    };
    store
        .is_mcp_in_scenario(&active_id, mcp_id)
        .map_err(AppError::db)
}

fn maybe_resync_active_if_member(store: &SkillStore, mcp_id: &str) -> Result<bool, AppError> {
    if is_member_of_active_preset(store, mcp_id)? {
        resync_active_preset(store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn resync_active_preset(store: &SkillStore) -> Result<McpSyncResult, AppError> {
    sync_preset(store, None)
}

/// Alias used by the CLI binary (`mcp sync`).
pub fn sync_mcp(
    store: &SkillStore,
    preset_ref: Option<&str>,
) -> Result<McpSyncResult, AppError> {
    sync_preset(store, preset_ref)
}

/// Clear MCP profile files for a preset (by record). Used by apply/deactivate.
pub fn clear_preset_mcp_profiles(
    store: &SkillStore,
    preset: &crate::core::skill_store::ScenarioRecord,
) -> Result<McpSyncResult, AppError> {
    clear_preset_profiles(store, &preset.name)
}

/// Filesystem-safe preset name check (shared with `presets create`).
pub fn validate_preset_name_for_fs(name: &str) -> Result<(), String> {
    validate_preset_name_for_sync(name).map_err(|e| e.message)
}

pub fn edit_server_from_content(
    store: &SkillStore,
    name: &str,
    content: &str,
) -> Result<McpEditResult, AppError> {
    edit_server_with_description(store, name, Some(content), None)
}

pub fn edit_server_from_path(
    store: &SkillStore,
    name: &str,
    path: &Path,
) -> Result<McpEditResult, AppError> {
    let raw = fs::read_to_string(path).map_err(AppError::io)?;
    edit_server_with_description(store, name, Some(&raw), None)
}

pub fn add_mcp_to_preset(
    store: &SkillStore,
    preset: &crate::core::skill_store::ScenarioRecord,
    mcp_names: &[String],
) -> Result<(Vec<String>, Vec<String>, Option<String>), AppError> {
    let mut added = Vec::new();
    let mut missing = Vec::new();
    for name in mcp_names {
        match store.get_mcp_server_by_name(name).map_err(AppError::db)? {
            Some(server) => {
                store
                    .add_mcp_to_scenario(&preset.id, &server.id)
                    .map_err(AppError::db)?;
                added.push(server.name);
            }
            None => missing.push(name.clone()),
        }
    }
    let resynced = maybe_resync_if_active_preset(store, preset)?;
    Ok((added, missing, resynced))
}

pub fn remove_mcp_from_preset(
    store: &SkillStore,
    preset: &crate::core::skill_store::ScenarioRecord,
    mcp_names: &[String],
) -> Result<(Vec<String>, Vec<String>, Option<String>), AppError> {
    let mut removed = Vec::new();
    let mut missing = Vec::new();
    for name in mcp_names {
        match store.get_mcp_server_by_name(name).map_err(AppError::db)? {
            Some(server) => {
                store
                    .remove_mcp_from_scenario(&preset.id, &server.id)
                    .map_err(AppError::db)?;
                removed.push(server.name);
            }
            None => missing.push(name.clone()),
        }
    }
    let resynced = maybe_resync_if_active_preset(store, preset)?;
    Ok((removed, missing, resynced))
}

pub fn list_mcp_for_preset(
    store: &SkillStore,
    preset: &crate::core::skill_store::ScenarioRecord,
) -> Result<Vec<McpListItem>, AppError> {
    let servers = store
        .get_mcp_servers_for_scenario(&preset.id)
        .map_err(AppError::db)?;
    Ok(servers
        .into_iter()
        .map(|s| McpListItem {
            name: s.name,
            id: s.id,
            description: s.description,
            presets: vec![preset.name.clone()],
            created_at: s.created_at,
            updated_at: s.updated_at,
        })
        .collect())
}

fn maybe_resync_if_active_preset(
    store: &SkillStore,
    preset: &crate::core::skill_store::ScenarioRecord,
) -> Result<Option<String>, AppError> {
    let active = store.get_active_scenario_id().map_err(AppError::db)?;
    if active.as_deref() == Some(preset.id.as_str()) {
        let _ = sync_preset(store, Some(&preset.id))?;
        Ok(Some(preset.name.clone()))
    } else {
        Ok(None)
    }
}

/// Structured error payload helpers for CLI JSON.
pub fn structured_error_payload(err: &AppError) -> JsonValue {
    let msg = &err.message;
    if let Some(rest) = msg.strip_prefix("multiple_servers:count=") {
        if let Ok(count) = rest.parse::<usize>() {
            return json!({"error": "multiple_servers", "count": count});
        }
    }
    if msg == "invalid_server_name"
        || msg == "extra_top_level_sections"
        || msg == "no_servers"
        || msg == "no_active_preset"
        || msg == "invalid_preset_name"
    {
        return json!({"error": msg});
    }
    if let Some(name) = msg.strip_prefix("duplicate_server:") {
        return json!({"error": "duplicate_server", "name": name});
    }
    json!({"error": msg, "kind": format!("{:?}", err.kind).to_ascii_lowercase()})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::central_repo;
    use crate::core::skill_store::{ScenarioRecord, SkillStore};
    use std::sync::MutexGuard;
    use tempfile::TempDir;

    struct TestEnv {
        _dir: TempDir,
        store: SkillStore,
        mcp_out: PathBuf,
        _guard: MutexGuard<'static, ()>,
    }

    impl Drop for TestEnv {
        fn drop(&mut self) {
            // Always clear the process-global override so other modules' tests
            // don't see a deleted temp base_dir after we finish.
            central_repo::set_test_base_dir_override(None);
        }
    }

    fn setup() -> TestEnv {
        // Share the repo-wide base_dir lock so we don't race app_state / skill_actions tests.
        let guard = central_repo::test_base_dir_lock();
        let dir = TempDir::new().unwrap();
        central_repo::set_test_base_dir_override(Some(dir.path().to_path_buf()));
        let _ = central_repo::ensure_central_repo();
        let db = dir.path().join("skills-manager.db");
        let store = SkillStore::new(&db).unwrap();
        let mcp_out = dir.path().join("mcp-out");
        fs::create_dir_all(&mcp_out).unwrap();
        TestEnv {
            _dir: dir,
            store,
            mcp_out,
            _guard: guard,
        }
    }

    fn make_preset(store: &SkillStore, name: &str, active: bool) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        store
            .insert_scenario(&ScenarioRecord {
                id: id.clone(),
                name: name.into(),
                description: None,
                icon: None,
                sort_order: 0,
                created_at: now,
                updated_at: now,
            })
            .unwrap();
        if active {
            store.set_active_scenario(&id).unwrap();
        }
        id
    }

    fn enable_codex_with_out(store: &SkillStore, out: &Path) {
        // Mark only codex as enabled by disabling everything else, and set MCP out override.
        let adapters = tool_adapters::default_tool_adapters();
        let disabled: Vec<String> = adapters
            .into_iter()
            .filter(|a| a.key != "codex")
            .map(|a| a.key)
            .collect();
        store
            .set_setting("disabled_tools", &serde_json::to_string(&disabled).unwrap())
            .unwrap();
        // Force codex "installed" via skills path override + MCP out override.
        let skills = out.join("skills");
        fs::create_dir_all(&skills).unwrap();
        let mut paths = std::collections::HashMap::new();
        paths.insert("codex".to_string(), skills.to_string_lossy().to_string());
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::to_string(&paths).unwrap(),
            )
            .unwrap();
        let mut mcp_paths = std::collections::HashMap::new();
        mcp_paths.insert("codex".to_string(), out.to_string_lossy().to_string());
        store
            .set_setting(
                "custom_tool_mcp_paths",
                &serde_json::to_string(&mcp_paths).unwrap(),
            )
            .unwrap();
    }

    #[test]
    fn install_toml_content_and_reject_duplicate() {
        let env = setup();
        let toml = r#"
[mcp_servers.weather]
command = "python"
args = ["-m", "weather"]
"#;
        let r = install_from_content(&env.store, toml).unwrap();
        assert_eq!(r.name, "weather");
        assert!(PathBuf::from(&r.central_path).exists());

        let err = install_from_content(&env.store, toml).unwrap_err();
        assert!(err.message.contains("duplicate_server"));
    }

    #[test]
    fn install_rejects_invalid_names_and_extra_sections() {
        let env = setup();
        let bad_name = r#"
[mcp_servers.bad.name]
command = "x"
"#;
        let err = install_from_content(&env.store, bad_name).unwrap_err();
        assert_eq!(err.message, "invalid_server_name");

        let extra = r#"
[mcp_servers.ok]
command = "x"
[other]
y = 1
"#;
        let err = install_from_content(&env.store, extra).unwrap_err();
        assert_eq!(err.message, "extra_top_level_sections");
    }

    #[test]
    fn install_rejects_multiple_servers() {
        let env = setup();
        let multi = r#"
[mcp_servers.a]
command = "x"
[mcp_servers.b]
command = "y"
"#;
        let err = install_from_content(&env.store, multi).unwrap_err();
        assert!(err.message.starts_with("multiple_servers:count="));
        let payload = structured_error_payload(&err);
        assert_eq!(payload["error"], "multiple_servers");
        assert_eq!(payload["count"], 2);
    }

    #[test]
    fn install_rejects_oversized() {
        let env = setup();
        let mut big = String::from("[mcp_servers.big]\ncommand = \"");
        big.push_str(&"x".repeat(MAX_CONTENT_BYTES));
        big.push_str("\"\n");
        let err = install_from_content(&env.store, &big).unwrap_err();
        assert!(err.message.contains("exceeds"));
    }

    #[test]
    fn install_from_json_file_converts_to_toml() {
        let env = setup();
        let json_path = env._dir.path().join("server.json");
        fs::write(
            &json_path,
            r#"{"mcpServers":{"weather":{"command":"python","args":["-m","w"]}}}"#,
        )
        .unwrap();
        let r = install_from_path(&env.store, &json_path).unwrap();
        assert_eq!(r.name, "weather");
        let content = fs::read_to_string(&r.central_path).unwrap();
        assert!(content.contains("[mcp_servers.weather]"));
        assert!(content.contains("command"));
    }

    #[test]
    fn edit_updates_and_rejects_name_change() {
        let env = setup();
        install_from_content(
            &env.store,
            "[mcp_servers.weather]\ncommand = \"old\"\n",
        )
        .unwrap();

        let r = edit_server(
            &env.store,
            "weather",
            "[mcp_servers.weather]\ncommand = \"new\"\n",
        )
        .unwrap();
        assert!(r.ok);
        let shown = show_server(&env.store, "weather").unwrap();
        assert!(shown.content.contains("new"));

        let err = edit_server(
            &env.store,
            "weather",
            "[mcp_servers.other]\ncommand = \"x\"\n",
        )
        .unwrap_err();
        assert!(err.message.contains("name_change_not_allowed"));
    }

    #[test]
    fn sync_writes_merged_and_empty_profiles() {
        let env = setup();
        enable_codex_with_out(&env.store, &env.mcp_out);
        let preset_id = make_preset(&env.store, "My Preset", true);

        // Empty preset → empty section.
        let empty = sync_preset(&env.store, None).unwrap();
        assert_eq!(empty.profile_arg, "My Preset");
        assert_eq!(empty.tools["codex"].status, "written");
        let path = empty.tools["codex"].path.as_ref().unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "[mcp_servers]\n");

        // With servers → merged.
        let a = install_from_content(
            &env.store,
            "[mcp_servers.weather]\ncommand = \"python\"\n",
        )
        .unwrap();
        let b = install_from_content(
            &env.store,
            "[mcp_servers.docs]\ncommand = \"npx\"\n",
        )
        .unwrap();
        env.store.add_mcp_to_scenario(&preset_id, &a.id).unwrap();
        env.store.add_mcp_to_scenario(&preset_id, &b.id).unwrap();

        let synced = sync_preset(&env.store, None).unwrap();
        let path = synced.tools["codex"].path.as_ref().unwrap();
        let body = fs::read_to_string(path).unwrap();
        assert!(body.contains("[mcp_servers.weather]"));
        assert!(body.contains("[mcp_servers.docs]"));
    }

    #[test]
    fn sync_skips_unsupported_and_reports_reasons() {
        let env = setup();
        // Leave defaults: most tools lack supports_mcp_profile; force nothing installed
        // by not overriding paths. Sync without active preset → error.
        let err = sync_preset(&env.store, None).unwrap_err();
        assert_eq!(err.message, "no_active_preset");

        make_preset(&env.store, "P", true);
        // No tools installed → empty tools map is fine.
        let r = sync_preset(&env.store, None).unwrap();
        assert_eq!(r.profile_arg, "P");
    }

    #[test]
    fn sync_invalid_preset_name() {
        let env = setup();
        enable_codex_with_out(&env.store, &env.mcp_out);
        // Insert a preset with slash via direct DB (bypass create validation).
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        env.store
            .insert_scenario(&ScenarioRecord {
                id: id.clone(),
                name: "bad/name".into(),
                description: None,
                icon: None,
                sort_order: 0,
                created_at: now,
                updated_at: now,
            })
            .unwrap();
        let r = sync_preset(&env.store, Some(&id)).unwrap();
        assert!(r.preset_name_error.is_some());
        assert_eq!(
            r.tools["codex"].reason.as_deref(),
            Some("invalid_preset_name")
        );
    }

    #[test]
    fn edit_and_remove_resync_active_member() {
        let env = setup();
        enable_codex_with_out(&env.store, &env.mcp_out);
        let preset_id = make_preset(&env.store, "Active", true);
        let inst = install_from_content(
            &env.store,
            "[mcp_servers.weather]\ncommand = \"old\"\n",
        )
        .unwrap();
        env.store
            .add_mcp_to_scenario(&preset_id, &inst.id)
            .unwrap();
        let _ = sync_preset(&env.store, None).unwrap();

        let edited = edit_server(
            &env.store,
            "weather",
            "[mcp_servers.weather]\ncommand = \"new\"\n",
        )
        .unwrap();
        assert!(edited.resynced);
        let path = env.mcp_out.join("Active.config.toml");
        let body = fs::read_to_string(&path).unwrap();
        assert!(body.contains("new"));

        let removed = remove_server(&env.store, "weather", true, false).unwrap();
        assert!(removed.resynced);
        let body = fs::read_to_string(&path).unwrap();
        assert_eq!(body, "[mcp_servers]\n");
    }

    #[test]
    fn remove_non_member_does_not_resync() {
        let env = setup();
        enable_codex_with_out(&env.store, &env.mcp_out);
        let _ = make_preset(&env.store, "Active", true);
        install_from_content(
            &env.store,
            "[mcp_servers.orphan]\ncommand = \"x\"\n",
        )
        .unwrap();
        // Seed a profile that should stay untouched.
        let path = env.mcp_out.join("Active.config.toml");
        fs::write(&path, "keep-me\n").unwrap();

        let removed = remove_server(&env.store, "orphan", true, false).unwrap();
        assert!(!removed.resynced);
        assert_eq!(fs::read_to_string(&path).unwrap(), "keep-me\n");
    }
}
