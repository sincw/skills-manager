use serde::Serialize;
use std::collections::{HashMap, HashSet};

use super::{
    error::AppError,
    skill_store::SkillStore,
    tool_adapters::{self, CustomToolDef, ToolCategory},
};

#[derive(Debug, Clone, Serialize)]
pub struct ToolInfo {
    pub key: String,
    pub display_name: String,
    pub installed: bool,
    pub skills_dir: String,
    pub enabled: bool,
    pub is_custom: bool,
    pub has_path_override: bool,
    pub project_relative_skills_dir: Option<String>,
    pub has_project_path_override: bool,
    pub category: ToolCategory,
    pub supports_mcp_profile: bool,
    pub supported_mcp_formats: Vec<String>,
    pub mcp_output_dir: Option<String>,
    pub mcp_output_format: String,
    pub has_mcp_path_override: bool,
    /// Fixed MCP filename when the tool does not use `{preset}.config.*` overlays
    /// (e.g. Pi → `mcp.json`). `None` means profile-style naming.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_output_filename: Option<String>,
}

pub fn get_disabled_tools(store: &SkillStore) -> Vec<String> {
    store
        .get_setting("disabled_tools")
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

const DEFAULT_PRIORITY_ORDER: &[&str] = &[
    "claude_code",
    "codex",
    "grok",
    "gemini_cli",
    "cursor",
    "opencode",
    "hermes",
    "openclaw",
];

pub fn get_tool_order(store: &SkillStore) -> Vec<String> {
    store
        .get_setting("tool_order")
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

pub fn set_tool_order(store: &SkillStore, order: &[String]) -> Result<(), AppError> {
    let json = serde_json::to_string(order)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store.set_setting("tool_order", &json).map_err(AppError::db)
}

/// Merge a saved tool order with the actual list of available tool keys.
/// - Keeps saved entries in their saved order (filtering out keys that no longer exist).
/// - If saved is empty, seeds with the built-in default priority list.
/// - Slots a newly-registered priority agent into its canonical position
///   (right after the previous priority agent already present) so e.g. a new
///   built-in `grok` lands next to `codex` even for users who already have a
///   saved order, instead of being dumped at the bottom.
/// - Appends any remaining keys (non-priority new agents) at the end in their
///   natural adapter order.
fn merge_order(saved: &[String], all_keys: &[String]) -> Vec<String> {
    let all_set: HashSet<&str> = all_keys.iter().map(|s| s.as_str()).collect();
    let mut out: Vec<String> = Vec::with_capacity(all_keys.len());

    for k in saved {
        if all_set.contains(k.as_str()) && !out.iter().any(|x| x == k) {
            out.push(k.clone());
        }
    }

    if out.is_empty() {
        for k in DEFAULT_PRIORITY_ORDER {
            if all_set.contains(*k) {
                out.push((*k).to_string());
            }
        }
    }

    let mut anchor: Option<usize> = None;
    for key in DEFAULT_PRIORITY_ORDER {
        if !all_set.contains(*key) {
            continue;
        }
        match out.iter().position(|x| x == key) {
            Some(idx) => anchor = Some(idx),
            None => {
                let insert_at = anchor.map_or(0, |a| a + 1);
                out.insert(insert_at, (*key).to_string());
                anchor = Some(insert_at);
            }
        }
    }

    for k in all_keys {
        if !out.iter().any(|x| x == k) {
            out.push(k.clone());
        }
    }

    out
}

pub fn disabled_tools_set(store: &SkillStore) -> HashSet<String> {
    get_disabled_tools(store).into_iter().collect()
}

pub fn set_disabled_tools(store: &SkillStore, disabled: &[String]) -> Result<(), AppError> {
    let json = serde_json::to_string(disabled)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("disabled_tools", &json)
        .map_err(AppError::db)
}

/// Enable or disable a single tool (agent) in the global disabled_tools list.
pub fn set_tool_enabled(
    store: &SkillStore,
    key: &str,
    enabled: bool,
) -> Result<ToolInfo, AppError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::invalid_input("tool key is required"));
    }
    if tool_adapters::find_adapter_with_store(store, key).is_none() {
        return Err(AppError::invalid_input(format!("unknown tool key: {key}")));
    }

    let mut disabled = get_disabled_tools(store);
    let was_disabled = disabled.iter().any(|k| k == key);
    if enabled {
        disabled.retain(|k| k != key);
    } else if !was_disabled {
        disabled.push(key.to_string());
        disabled.sort();
        disabled.dedup();
    }
    set_disabled_tools(store, &disabled)?;

    list_tool_info(store)
        .into_iter()
        .find(|t| t.key == key)
        .ok_or_else(|| AppError::internal(format!("tool vanished after enable toggle: {key}")))
}

/// Bulk enable/disable every known tool.
pub fn set_all_tools_enabled(store: &SkillStore, enabled: bool) -> Result<Vec<ToolInfo>, AppError> {
    if enabled {
        set_disabled_tools(store, &[])?;
    } else {
        let all: Vec<String> = tool_adapters::all_tool_adapters(store)
            .into_iter()
            .map(|a| a.key)
            .collect();
        set_disabled_tools(store, &all)?;
    }
    Ok(list_tool_info(store))
}

pub fn get_custom_tool_mcp_profile_support(store: &SkillStore) -> HashMap<String, bool> {
    tool_adapters::custom_tool_mcp_profile_support(store)
}

pub fn set_custom_tool_mcp_profile_support(
    store: &SkillStore,
    map: &HashMap<String, bool>,
) -> Result<(), AppError> {
    let json = serde_json::to_string(map)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tool_mcp_profile_support", &json)
        .map_err(AppError::db)
}

pub fn get_custom_tool_mcp_filenames(store: &SkillStore) -> HashMap<String, String> {
    tool_adapters::custom_tool_mcp_filenames(store)
}

pub fn set_custom_tool_mcp_filenames(
    store: &SkillStore,
    map: &HashMap<String, String>,
) -> Result<(), AppError> {
    let json = serde_json::to_string(map)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tool_mcp_filenames", &json)
        .map_err(AppError::db)
}

pub fn set_tool_mcp_filename(
    store: &SkillStore,
    key: &str,
    filename: Option<&str>,
) -> Result<ToolInfo, AppError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::invalid_input("tool key is required"));
    }
    if tool_adapters::find_adapter_with_store(store, key).is_none() {
        return Err(AppError::invalid_input(format!("unknown tool key: {key}")));
    }

    let mut map = get_custom_tool_mcp_filenames(store);
    match filename {
        Some(f) if f.trim().is_empty() => {
            // Empty → use preset-based naming (clear override).
            map.insert(key.to_string(), String::new());
        }
        Some(f) => {
            map.insert(key.to_string(), f.trim().to_string());
        }
        None => {
            // Remove override → fall back to adapter default.
            map.remove(key);
        }
    }
    set_custom_tool_mcp_filenames(store, &map)?;

    list_tool_info(store)
        .into_iter()
        .find(|t| t.key == key)
        .ok_or_else(|| AppError::internal(format!("tool vanished after mcp filename update: {key}")))
}

/// Toggle whether a tool participates in profile-based MCP sync.
pub fn set_tool_mcp_profile_support(
    store: &SkillStore,
    key: &str,
    enabled: bool,
) -> Result<ToolInfo, AppError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::invalid_input("tool key is required"));
    }
    if tool_adapters::find_adapter_with_store(store, key).is_none() {
        return Err(AppError::invalid_input(format!("unknown tool key: {key}")));
    }

    let mut map = get_custom_tool_mcp_profile_support(store);
    map.insert(key.to_string(), enabled);
    set_custom_tool_mcp_profile_support(store, &map)?;

    // When enabling for the first time, seed a default format if none is set.
    if enabled {
        let formats = get_custom_tool_mcp_formats(store);
        if !formats.contains_key(key) {
            let adapter = tool_adapters::find_adapter_with_store(store, key).unwrap();
            if adapter.supported_mcp_formats.is_empty() {
                let mut formats = formats;
                formats.insert(key.to_string(), "toml".to_string());
                set_custom_tool_mcp_formats(store, &formats)?;
            }
        }
    }

    list_tool_info(store)
        .into_iter()
        .find(|t| t.key == key)
        .ok_or_else(|| AppError::internal(format!("tool vanished after mcp support toggle: {key}")))
}

pub fn get_custom_tool_paths(store: &SkillStore) -> HashMap<String, String> {
    tool_adapters::custom_tool_paths(store)
}

pub fn set_custom_tool_paths(
    store: &SkillStore,
    paths: &HashMap<String, String>,
) -> Result<(), AppError> {
    let json = serde_json::to_string(paths)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tool_paths", &json)
        .map_err(AppError::db)
}

pub fn get_custom_tool_mcp_paths(store: &SkillStore) -> HashMap<String, String> {
    tool_adapters::custom_tool_mcp_paths(store)
}

pub fn set_custom_tool_mcp_paths(
    store: &SkillStore,
    paths: &HashMap<String, String>,
) -> Result<(), AppError> {
    let json = serde_json::to_string(paths)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tool_mcp_paths", &json)
        .map_err(AppError::db)
}

pub fn get_custom_tool_mcp_formats(store: &SkillStore) -> HashMap<String, String> {
    tool_adapters::custom_tool_mcp_formats(store)
}

pub fn set_custom_tool_mcp_formats(
    store: &SkillStore,
    formats: &HashMap<String, String>,
) -> Result<(), AppError> {
    let json = serde_json::to_string(formats)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tool_mcp_formats", &json)
        .map_err(AppError::db)
}

/// Update a tool's MCP output dir and/or format overrides.
///
/// `format` must be `toml` or `json`, and must also be present in the tool's
/// `supported_mcp_formats` (when that list is non-empty). Returns the updated
/// [`ToolInfo`] for the target key.
pub fn set_tool_mcp_settings(
    store: &SkillStore,
    key: &str,
    output_dir: Option<&str>,
    format: Option<&str>,
) -> Result<ToolInfo, AppError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::invalid_input("tool key is required"));
    }
    if output_dir.is_none() && format.is_none() {
        return Err(AppError::invalid_input(
            "at least one of --output-dir or --format is required",
        ));
    }

    let adapter = tool_adapters::find_adapter_with_store(store, key).ok_or_else(|| {
        AppError::invalid_input(format!("unknown tool key: {key}"))
    })?;

    if let Some(fmt_raw) = format {
        let fmt = fmt_raw.trim().to_ascii_lowercase();
        if fmt != "toml" && fmt != "json" {
            return Err(AppError::invalid_input(
                "mcp_output_format must be \"toml\" or \"json\"",
            ));
        }
        // Allow any valid format; the sync phase will skip tools whose
        // adapter doesn't support the configured format at sync time.
        let mut formats = get_custom_tool_mcp_formats(store);
        formats.insert(key.to_string(), fmt);
        set_custom_tool_mcp_formats(store, &formats)?;
    }

    if let Some(dir_raw) = output_dir {
        let normalized = normalize_skills_dir_input(dir_raw)?;
        let mut paths = get_custom_tool_mcp_paths(store);
        paths.insert(key.to_string(), normalized);
        set_custom_tool_mcp_paths(store, &paths)?;
    }

    list_tool_info(store)
        .into_iter()
        .find(|info| info.key == key)
        .ok_or_else(|| AppError::internal(format!("tool disappeared after update: {key}")))
}

pub fn get_custom_tool_project_paths(store: &SkillStore) -> HashMap<String, String> {
    tool_adapters::custom_tool_project_paths(store)
}

pub fn set_custom_tool_project_paths(
    store: &SkillStore,
    paths: &HashMap<String, String>,
) -> Result<(), AppError> {
    let json = serde_json::to_string(paths)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tool_project_paths", &json)
        .map_err(AppError::db)
}

pub fn get_custom_tools(store: &SkillStore) -> Vec<CustomToolDef> {
    tool_adapters::custom_tools(store)
}

pub fn set_custom_tools(
    store: &SkillStore,
    custom_tools: &[CustomToolDef],
) -> Result<(), AppError> {
    let json = serde_json::to_string(custom_tools)
        .map_err(|e| AppError::internal(format!("Failed to serialize: {e}")))?;
    store
        .set_setting("custom_tools", &json)
        .map_err(AppError::db)
}

pub fn normalize_skills_dir_input(path: &str) -> Result<String, AppError> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err(AppError::invalid_input("Path is required"));
    }

    let expanded = if raw == "~" {
        dirs::home_dir()
            .ok_or_else(|| AppError::internal("Cannot determine home directory"))?
            .to_string_lossy()
            .to_string()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        dirs::home_dir()
            .ok_or_else(|| AppError::internal("Cannot determine home directory"))?
            .join(rest)
            .to_string_lossy()
            .to_string()
    } else if !std::path::Path::new(raw).is_absolute() {
        return Err(AppError::invalid_input(
            "Skills path must be absolute (or start with ~/)",
        ));
    } else {
        raw.to_string()
    };

    Ok(expanded)
}

pub fn normalize_project_relative_skills_dir_input(path: &str) -> Result<Option<String>, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let candidate = std::path::Path::new(trimmed);
    if candidate.is_absolute() {
        return Err(AppError::invalid_input(
            "Project skills path must be relative to the project root",
        ));
    }
    if candidate
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(AppError::invalid_input(
            "Project skills path cannot contain parent directory segments",
        ));
    }
    Ok(Some(trimmed.trim_matches('/').to_string()))
}

pub fn list_tool_info(store: &SkillStore) -> Vec<ToolInfo> {
    let disabled = disabled_tools_set(store);
    let project_overrides = get_custom_tool_project_paths(store);
    let mcp_path_overrides = get_custom_tool_mcp_paths(store);
    let infos: Vec<ToolInfo> = tool_adapters::all_tool_adapters(store)
        .into_iter()
        .map(|adapter| ToolInfo {
            key: adapter.key.clone(),
            display_name: adapter.display_name.clone(),
            installed: adapter.is_installed(),
            skills_dir: adapter.skills_dir().to_string_lossy().to_string(),
            enabled: !disabled.contains(&adapter.key),
            is_custom: adapter.is_custom,
            has_path_override: adapter.has_path_override(),
            project_relative_skills_dir: {
                let project_dir = adapter.project_relative_skills_dir();
                if project_dir.is_empty() {
                    None
                } else {
                    Some(project_dir.to_string())
                }
            },
            // Only built-in adapters have a default project path to reset back to;
            // custom tools clear their path instead of resetting.
            has_project_path_override: !adapter.is_custom
                && project_overrides.contains_key(&adapter.key),
            category: adapter.category,
            supports_mcp_profile: adapter.supports_mcp_profile,
            supported_mcp_formats: adapter.supported_mcp_formats.clone(),
            mcp_output_dir: adapter
                .mcp_output_dir()
                .map(|p| p.to_string_lossy().to_string()),
            mcp_output_format: adapter.resolved_mcp_output_format().to_string(),
            has_mcp_path_override: mcp_path_overrides.contains_key(&adapter.key),
            mcp_output_filename: adapter.mcp_output_filename.clone(),
        })
        .collect();

    let saved = get_tool_order(store);
    let all_keys: Vec<String> = infos.iter().map(|i| i.key.clone()).collect();
    let ordered_keys = merge_order(&saved, &all_keys);

    let mut by_key: HashMap<String, ToolInfo> =
        infos.into_iter().map(|i| (i.key.clone(), i)).collect();
    ordered_keys
        .into_iter()
        .filter_map(|k| by_key.remove(&k))
        .collect()
}

pub fn migrate_legacy_tool_keys(store: &SkillStore) -> Result<(), AppError> {
    const OLD_KEY: &str = "clawdbot";
    const NEW_KEY: &str = "openclaw";

    let mut changed = false;

    let mut disabled = get_disabled_tools(store);
    if disabled.iter().any(|k| k == OLD_KEY) {
        for key in &mut disabled {
            if key == OLD_KEY {
                *key = NEW_KEY.to_string();
            }
        }
        disabled.sort();
        disabled.dedup();
        set_disabled_tools(store, &disabled)?;
        changed = true;
    }

    let mut custom_paths = get_custom_tool_paths(store);
    if let Some(old_path) = custom_paths.remove(OLD_KEY) {
        custom_paths.entry(NEW_KEY.to_string()).or_insert(old_path);
        set_custom_tool_paths(store, &custom_paths)?;
        changed = true;
    }

    let mut normalized_path_changed = false;
    for value in custom_paths.values_mut() {
        if let Ok(normalized) = normalize_skills_dir_input(value) {
            if *value != normalized {
                *value = normalized;
                normalized_path_changed = true;
            }
        }
    }
    if normalized_path_changed {
        set_custom_tool_paths(store, &custom_paths)?;
        changed = true;
    }

    let custom_tools = get_custom_tools(store);
    let mut custom_tools_changed = false;
    let custom_tools = if custom_tools.iter().any(|c| c.key == OLD_KEY) {
        let has_new = custom_tools.iter().any(|c| c.key == NEW_KEY);
        let mut migrated = Vec::with_capacity(custom_tools.len());
        let mut seen_keys = std::collections::HashSet::new();
        for mut custom in custom_tools {
            if custom.key == OLD_KEY {
                if has_new {
                    continue;
                }
                custom.key = NEW_KEY.to_string();
            }
            if seen_keys.insert(custom.key.clone()) {
                migrated.push(custom);
            }
        }
        custom_tools_changed = true;
        changed = true;
        migrated
    } else {
        custom_tools
    };

    let mut normalized_customs = custom_tools;
    for custom in &mut normalized_customs {
        if let Ok(normalized) = normalize_skills_dir_input(&custom.skills_dir) {
            if custom.skills_dir != normalized {
                custom.skills_dir = normalized;
                custom_tools_changed = true;
            }
        }
    }
    if custom_tools_changed {
        set_custom_tools(store, &normalized_customs)?;
    }

    if changed
        || store
            .has_tool_key_references(OLD_KEY)
            .map_err(AppError::db)?
    {
        store
            .remap_tool_key_references(OLD_KEY, NEW_KEY)
            .map_err(AppError::db)?;
    }
    if changed {
        log::info!("Migrated legacy tool key {OLD_KEY} -> {NEW_KEY}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn fresh_install_uses_default_priority_order() {
        let all = v(&[
            "cursor",
            "claude_code",
            "codex",
            "grok",
            "gemini_cli",
            "opencode",
        ]);
        let order = merge_order(&[], &all);
        // Priority list comes first, then remaining adapters in their natural order.
        assert_eq!(order[0], "claude_code");
        assert_eq!(order[1], "codex");
        assert_eq!(order[2], "grok");
    }

    #[test]
    fn new_priority_agent_slots_after_its_predecessor() {
        // Existing user whose saved order predates `grok`.
        let saved = v(&["claude_code", "codex", "gemini_cli", "cursor", "opencode"]);
        let all = v(&[
            "cursor",
            "claude_code",
            "codex",
            "grok",
            "gemini_cli",
            "opencode",
        ]);
        let order = merge_order(&saved, &all);
        let codex = order.iter().position(|k| k == "codex").unwrap();
        assert_eq!(order[codex + 1], "grok", "grok must land right after codex");
        // Existing entries keep their relative order.
        assert!(
            order.iter().position(|k| k == "gemini_cli").unwrap()
                > order.iter().position(|k| k == "grok").unwrap()
        );
    }

    #[test]
    fn non_priority_new_agent_appends_at_end() {
        let saved = v(&["claude_code", "codex"]);
        let all = v(&["claude_code", "codex", "some_new_tool"]);
        let order = merge_order(&saved, &all);
        assert_eq!(order.last().unwrap(), "some_new_tool");
    }

    #[test]
    fn set_tool_mcp_settings_updates_path_and_format() {
        use crate::core::central_repo;
        use crate::core::skill_store::SkillStore;
        use tempfile::TempDir;

        let _guard = central_repo::test_base_dir_lock();
        let dir = TempDir::new().unwrap();
        central_repo::set_test_base_dir_override(Some(dir.path().to_path_buf()));
        let _ = central_repo::ensure_central_repo();
        let store = SkillStore::new(&dir.path().join("skills-manager.db")).unwrap();

        let out = dir.path().join("mcp-out");
        std::fs::create_dir_all(&out).unwrap();
        let info = set_tool_mcp_settings(
            &store,
            "codex",
            Some(out.to_str().unwrap()),
            Some("toml"),
        )
        .unwrap();
        assert_eq!(info.mcp_output_dir.as_deref(), Some(out.to_str().unwrap()));
        assert_eq!(info.mcp_output_format, "toml");
        assert!(info.has_mcp_path_override);

        central_repo::set_test_base_dir_override(None);
    }

    #[test]
    fn set_tool_mcp_settings_allows_any_valid_format() {
        use crate::core::central_repo;
        use crate::core::skill_store::SkillStore;
        use tempfile::TempDir;

        let _guard = central_repo::test_base_dir_lock();
        let dir = TempDir::new().unwrap();
        central_repo::set_test_base_dir_override(Some(dir.path().to_path_buf()));
        let _ = central_repo::ensure_central_repo();
        let store = SkillStore::new(&dir.path().join("skills-manager.db")).unwrap();

        // JSON is accepted even for codex whose adapter defaults to ["toml"];
        // sync will skip the tool at output time if the format is not consumed.
        let info = set_tool_mcp_settings(&store, "codex", None, Some("json")).unwrap();
        assert_eq!(info.mcp_output_format, "json");

        central_repo::set_test_base_dir_override(None);
    }
}
