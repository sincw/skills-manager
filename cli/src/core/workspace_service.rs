use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    error::AppError,
    project_scanner::{self, AgentSkillConfig, ProjectSkillInfo},
    skill_store::{ProjectRecord, SkillRecord, SkillStore, SkillTargetRecord},
    sync_engine, tool_adapters, tool_service,
};

#[derive(Debug, Clone, Default, Serialize)]
pub struct WorkspaceSyncHealth {
    pub in_sync: usize,
    pub project_newer: usize,
    pub center_newer: usize,
    pub diverged: usize,
    pub project_only: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegisteredWorkspaceInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub workspace_type: String,
    pub linked_agent_name: Option<String>,
    pub supports_skill_toggle: bool,
    pub sort_order: i32,
    pub skill_count: usize,
    pub sync_health: WorkspaceSyncHealth,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSkillDocument {
    pub skill_name: String,
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSkillExportReport {
    pub ok: bool,
    pub skill_id: String,
    pub project_id: String,
    pub targets: Vec<WorkspaceSkillExportTarget>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSkillExportTarget {
    pub agent: String,
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSkillDeleteReport {
    pub ok: bool,
    pub project_id: String,
    pub agent: String,
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GlobalWorkspaceSkillSyncReport {
    pub ok: bool,
    pub skill_id: String,
    pub tool: String,
    pub target_path: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GlobalWorkspaceSkillDeleteReport {
    pub ok: bool,
    pub agent: String,
    pub target_path: String,
}

#[derive(Debug, Deserialize)]
struct LegacyWorkspaceRegistry {
    projects: Vec<LegacyWorkspaceRecord>,
}

#[derive(Debug, Deserialize)]
struct LegacyWorkspaceRecord {
    id: String,
    name: String,
    path: String,
    workspace_type: String,
    linked_agent_name: Option<String>,
    sort_order: i32,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceRegistryImportReport {
    pub imported: Vec<RegisteredWorkspaceInfo>,
    pub skipped: Vec<RegisteredWorkspaceInfo>,
    pub backup_path: String,
}

pub fn add_registered_project_workspace(
    store: &SkillStore,
    path: &Path,
) -> Result<RegisteredWorkspaceInfo, AppError> {
    let path = normalize_workspace_path(path)?;
    let name = default_workspace_name(&path);
    add_registered_workspace(store, "project", &name, &path, None, None, None, None)
}

pub fn add_registered_linked_workspace(
    store: &SkillStore,
    name: &str,
    path: &Path,
) -> Result<RegisteredWorkspaceInfo, AppError> {
    let path = normalize_workspace_path(path)?;
    let name = validate_workspace_name(name)?;
    add_registered_workspace(
        store,
        "linked",
        &name,
        &path,
        Some("linked".to_string()),
        Some(name.clone()),
        None,
        None,
    )
}

pub fn reorder_registered_workspaces(
    store: &SkillStore,
    ids: &[String],
) -> Result<Vec<RegisteredWorkspaceInfo>, AppError> {
    let projects = store.get_all_projects().map_err(AppError::db)?;
    let mut ordered_ids = Vec::with_capacity(projects.len());
    for id in ids {
        if projects.iter().any(|project| project.id == *id) && !ordered_ids.contains(id) {
            ordered_ids.push(id.clone());
        }
    }
    for project in projects {
        if !ordered_ids.contains(&project.id) {
            ordered_ids.push(project.id);
        }
    }
    store.reorder_projects(&ordered_ids).map_err(AppError::db)?;
    list_registered_workspaces(store)
}

pub fn remove_registered_workspace(store: &SkillStore, id: &str) -> Result<bool, AppError> {
    if store.get_project_by_id(id).map_err(AppError::db)?.is_none() {
        return Err(AppError::not_found("workspace not found"));
    }
    store.delete_project(id).map_err(AppError::db)?;
    Ok(true)
}

pub fn import_legacy_workspace_registry(
    store: &SkillStore,
    registry_path: &Path,
) -> Result<WorkspaceRegistryImportReport, AppError> {
    if !registry_path.exists() {
        return Err(AppError::not_found("legacy workspace registry not found"));
    }
    let raw = std::fs::read_to_string(registry_path).map_err(AppError::io)?;
    let registry: LegacyWorkspaceRegistry = serde_json::from_str(&raw).map_err(|error| {
        AppError::invalid_input(format!("invalid legacy workspace registry: {error}"))
    })?;
    let mut imported = Vec::new();
    let mut skipped = Vec::new();

    for legacy in registry.projects {
        if legacy.workspace_type != "project" && legacy.workspace_type != "linked" {
            continue;
        }
        let path = normalize_workspace_path(Path::new(&legacy.path))?;
        let name = validate_workspace_name(&legacy.name)?;
        let existing_by_id = store.get_project_by_id(&legacy.id).map_err(AppError::db)?;
        let existed = existing_by_id.is_some() || find_workspace_by_path(store, &path)?.is_some();
        let workspace = add_registered_workspace(
            store,
            &legacy.workspace_type,
            &name,
            &path,
            if legacy.workspace_type == "linked" {
                Some("linked".to_string())
            } else {
                None
            },
            legacy.linked_agent_name.clone(),
            Some(legacy.id),
            Some((legacy.sort_order, legacy.created_at, legacy.updated_at)),
        )?;
        if existed {
            skipped.push(workspace);
        } else {
            imported.push(workspace);
        }
    }

    let backup_path = migrated_backup_path(registry_path);
    std::fs::rename(registry_path, &backup_path).map_err(AppError::io)?;
    Ok(WorkspaceRegistryImportReport {
        imported,
        skipped,
        backup_path: backup_path.to_string_lossy().to_string(),
    })
}

fn add_registered_workspace(
    store: &SkillStore,
    workspace_type: &str,
    name: &str,
    path: &str,
    linked_agent_key: Option<String>,
    linked_agent_name: Option<String>,
    id: Option<String>,
    imported_order: Option<(i32, i64, i64)>,
) -> Result<RegisteredWorkspaceInfo, AppError> {
    if let Some(existing) = find_workspace_by_path(store, path)? {
        return registered_workspace_info(store, &existing);
    }
    if let Some(existing_id) = id.as_deref() {
        if let Some(existing) = store.get_project_by_id(existing_id).map_err(AppError::db)? {
            return registered_workspace_info(store, &existing);
        }
    }
    let projects = store.get_all_projects().map_err(AppError::db)?;
    let now = chrono::Utc::now().timestamp_millis();
    let (sort_order, created_at, updated_at) =
        imported_order.unwrap_or((projects.len() as i32, now, now));
    let project = ProjectRecord {
        id: id.unwrap_or_else(|| stable_workspace_id(workspace_type, path, name)),
        name: name.to_string(),
        path: path.to_string(),
        workspace_type: workspace_type.to_string(),
        linked_agent_key,
        linked_agent_name,
        disabled_path: None,
        sort_order,
        created_at,
        updated_at,
    };
    store.insert_project(&project).map_err(AppError::db)?;
    registered_workspace_info(store, &project)
}

fn registered_workspace_info(
    store: &SkillStore,
    project: &ProjectRecord,
) -> Result<RegisteredWorkspaceInfo, AppError> {
    let skills = read_registered_workspace_skills(store, project)?;
    let skills = enrich_registered_workspace_skills(store, skills)?;
    Ok(workspace_info(project, skills))
}

fn find_workspace_by_path(
    store: &SkillStore,
    path: &str,
) -> Result<Option<ProjectRecord>, AppError> {
    Ok(store
        .get_all_projects()
        .map_err(AppError::db)?
        .into_iter()
        .find(|project| project.path == path))
}

fn normalize_workspace_path(path: &Path) -> Result<String, AppError> {
    let value = path.to_string_lossy().trim().to_string();
    if value.is_empty() {
        return Err(AppError::invalid_input("path is required"));
    }
    let expanded = if value == "~" {
        dirs::home_dir().ok_or_else(|| AppError::invalid_input("home directory not found"))?
    } else if value.starts_with("~/") || value.starts_with("~\\") {
        dirs::home_dir()
            .ok_or_else(|| AppError::invalid_input("home directory not found"))?
            .join(&value[2..])
    } else {
        PathBuf::from(value)
    };
    let absolute = if expanded.is_absolute() {
        expanded
    } else {
        std::env::current_dir()
            .map_err(AppError::io)?
            .join(expanded)
    };
    let normalized = absolute
        .canonicalize()
        .unwrap_or_else(|_| lexically_normalize(&absolute));
    Ok(normalized.to_string_lossy().to_string())
}

fn lexically_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn default_workspace_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or(path)
        .to_string()
}

fn validate_workspace_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_input("name is required"));
    }
    Ok(name.to_string())
}

fn stable_workspace_id(workspace_type: &str, path: &str, name: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(workspace_type.as_bytes());
    hasher.update(b"\0");
    hasher.update(path.as_bytes());
    hasher.update(b"\0");
    hasher.update(name.as_bytes());
    let hash = hex::encode(hasher.finalize());
    format!("workspace-{}", &hash[..16])
}

fn migrated_backup_path(registry_path: &Path) -> PathBuf {
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S%3f");
    registry_path.with_file_name(format!("projects.migrated-{timestamp}.json"))
}

pub fn list_registered_workspaces(
    store: &SkillStore,
) -> Result<Vec<RegisteredWorkspaceInfo>, AppError> {
    let projects = store.get_all_projects().map_err(AppError::db)?;
    let mut workspaces = Vec::with_capacity(projects.len());
    for project in projects {
        let skills = read_registered_workspace_skills(store, &project)?;
        let skills = enrich_registered_workspace_skills(store, skills)?;
        workspaces.push(workspace_info(&project, skills));
    }
    Ok(workspaces)
}

pub fn list_registered_workspace_skills(
    store: &SkillStore,
    workspace_id: &str,
) -> Result<Vec<ProjectSkillInfo>, AppError> {
    let project = store
        .get_project_by_id(workspace_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("workspace not found"))?;
    let skills = read_registered_workspace_skills(store, &project)?;
    enrich_registered_workspace_skills(store, skills)
}

pub fn read_registered_workspace_skill_document(
    store: &SkillStore,
    workspace_id: &str,
    agent_key: &str,
    relative_path: &str,
) -> Result<WorkspaceSkillDocument, AppError> {
    let project = store
        .get_project_by_id(workspace_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("workspace not found"))?;
    let adapter = tool_adapters::find_adapter_with_store(store, agent_key)
        .ok_or_else(|| AppError::not_found("Tool not found"))?;
    let skill_root = registered_workspace_skill_root(&project, &adapter);
    let skill_dir = workspace_skill_target_path(&skill_root, relative_path)?;
    let content = read_skill_document(&skill_dir)?;

    Ok(WorkspaceSkillDocument {
        skill_name: skill_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        filename: "SKILL.md".to_string(),
        content,
    })
}

pub fn export_skill_to_registered_workspace(
    store: &SkillStore,
    workspace_id: &str,
    skill_ref: &str,
    tool_keys: &[String],
) -> Result<WorkspaceSkillExportReport, AppError> {
    if tool_keys.is_empty() {
        return Err(AppError::invalid_input("tools must not be empty"));
    }
    let project = store
        .get_project_by_id(workspace_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("workspace not found"))?;
    let skill = resolve_skill(store, skill_ref)?;
    let target_name = slugify_skill_dir_name(&skill.name);
    let mut targets = Vec::with_capacity(tool_keys.len());

    for tool_key in tool_keys {
        let adapter = workspace_adapter_for_export(store, &project, tool_key)?;
        let root = registered_workspace_skill_root(&project, &adapter);
        let target_path = root.join(&target_name);
        ensure_path_inside_root(&target_path, &root)?;
        if target_path.exists() {
            return Err(AppError::invalid_input(format!(
                "Skill \"{}\" already exists in this workspace for agent {}",
                skill.name, tool_key
            )));
        }
        sync_engine::sync_skill(
            Path::new(&skill.central_path),
            &target_path,
            sync_engine::SyncMode::Copy,
        )
        .map_err(AppError::io)?;
        targets.push(WorkspaceSkillExportTarget {
            agent: tool_key.clone(),
            target_path: target_path.to_string_lossy().to_string(),
        });
    }

    Ok(WorkspaceSkillExportReport {
        ok: true,
        skill_id: skill.id,
        project_id: project.id,
        targets,
    })
}

pub fn delete_registered_workspace_skill(
    store: &SkillStore,
    workspace_id: &str,
    tool_key: &str,
    relative_path: &str,
) -> Result<WorkspaceSkillDeleteReport, AppError> {
    let project = store
        .get_project_by_id(workspace_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("workspace not found"))?;
    let adapter = workspace_adapter_for_delete(store, &project, tool_key)?;
    let root = registered_workspace_skill_root(&project, &adapter);
    let target_path = workspace_skill_target_path(&root, relative_path)?;
    if !target_path.is_dir() {
        return Err(AppError::not_found("workspace skill not found"));
    }
    sync_engine::remove_target(&target_path).map_err(AppError::io)?;
    Ok(WorkspaceSkillDeleteReport {
        ok: true,
        project_id: project.id,
        agent: tool_key.to_string(),
        target_path: target_path.to_string_lossy().to_string(),
    })
}

pub fn scan_registered_workspace_candidates(
    store: &SkillStore,
    root: &Path,
    max_depth: usize,
) -> Result<Vec<String>, AppError> {
    if !root.is_dir() {
        return Err(AppError::invalid_input("root must be a directory"));
    }
    let configs = project_agent_skill_configs(store);
    Ok(project_scanner::scan_projects_in_dir(
        root, max_depth, &configs,
    ))
}

pub fn list_registered_workspace_agent_targets(
    store: &SkillStore,
    workspace_id: &str,
) -> Result<Vec<tool_service::ToolInfo>, AppError> {
    store
        .get_project_by_id(workspace_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("workspace not found"))?;
    Ok(tool_service::list_tool_info(store))
}

fn workspace_info(
    project: &ProjectRecord,
    skills: Vec<ProjectSkillInfo>,
) -> RegisteredWorkspaceInfo {
    let mut sync_health = WorkspaceSyncHealth::default();
    for skill in &skills {
        match skill.sync_status.as_str() {
            "in_sync" => sync_health.in_sync += 1,
            "project_newer" => sync_health.project_newer += 1,
            "center_newer" => sync_health.center_newer += 1,
            "diverged" => sync_health.diverged += 1,
            _ => sync_health.project_only += 1,
        }
    }
    let skill_count = skills
        .iter()
        .map(|skill| skill.relative_path.to_lowercase())
        .collect::<HashSet<_>>()
        .len();

    RegisteredWorkspaceInfo {
        id: project.id.clone(),
        name: project.name.clone(),
        path: project.path.clone(),
        workspace_type: project.workspace_type.clone(),
        linked_agent_name: project.linked_agent_name.clone(),
        supports_skill_toggle: project.workspace_type != "linked",
        sort_order: project.sort_order,
        skill_count,
        sync_health,
        created_at: project.created_at,
        updated_at: project.updated_at,
    }
}

fn read_registered_workspace_skills(
    store: &SkillStore,
    project: &ProjectRecord,
) -> Result<Vec<ProjectSkillInfo>, AppError> {
    if project.workspace_type == "linked" {
        let agent_key = project
            .linked_agent_key
            .clone()
            .unwrap_or_else(|| "linked".to_string());
        let agent_display_name = project
            .linked_agent_name
            .clone()
            .unwrap_or_else(|| project.name.clone());
        let disabled_path = project.disabled_path.as_ref().map(PathBuf::from);
        let recursive = tool_adapters::find_adapter_with_store(store, &agent_key)
            .map(|adapter| adapter.recursive_scan)
            .unwrap_or(false);
        return Ok(project_scanner::read_linked_workspace_skills(
            Path::new(&project.path),
            disabled_path.as_deref(),
            &agent_key,
            &agent_display_name,
            recursive,
        ));
    }

    let configs = project_agent_skill_configs(store);
    Ok(project_scanner::read_project_skills(
        Path::new(&project.path),
        &configs,
    ))
}

fn registered_workspace_skill_root(
    project: &ProjectRecord,
    adapter: &tool_adapters::ToolAdapter,
) -> PathBuf {
    if project.workspace_type == "linked" {
        return PathBuf::from(&project.path);
    }
    PathBuf::from(&project.path).join(adapter.project_relative_skills_dir())
}

fn project_agent_skill_configs(store: &SkillStore) -> Vec<AgentSkillConfig> {
    tool_service::list_tool_info(store)
        .into_iter()
        .filter(|tool| tool.installed && tool.enabled)
        .filter_map(|tool| {
            let relative_skills_dir = tool.project_relative_skills_dir?;
            Some(AgentSkillConfig {
                key: tool.key,
                display_name: tool.display_name,
                relative_skills_dir,
            })
        })
        .collect()
}

fn enrich_registered_workspace_skills(
    store: &SkillStore,
    skills: Vec<ProjectSkillInfo>,
) -> Result<Vec<ProjectSkillInfo>, AppError> {
    let all_skills = store.get_all_skills().map_err(AppError::db)?;
    let tags_map = store.get_tags_map().map_err(AppError::db)?;
    let mut enriched = Vec::with_capacity(skills.len());

    for skill in skills {
        let matched = match_center_skill("", &skill, &all_skills, &[]);
        enriched.push(enrich_skill(skill, matched, &tags_map));
    }

    Ok(enriched)
}

pub fn list_global_workspace_skills(
    store: &SkillStore,
    agent_key: &str,
) -> Result<Vec<ProjectSkillInfo>, AppError> {
    let adapter = tool_adapters::find_adapter_with_store(store, agent_key)
        .ok_or_else(|| AppError::not_found("Tool not found"))?;
    if !adapter.is_installed() {
        return Ok(Vec::new());
    }

    let skills = project_scanner::read_linked_workspace_skills(
        &adapter.skills_dir(),
        None,
        &adapter.key,
        &adapter.display_name,
        adapter.recursive_scan,
    );
    enrich_workspace_skills(store, &adapter.key, skills)
}

pub fn read_global_workspace_skill_document(
    store: &SkillStore,
    agent_key: &str,
    relative_path: &str,
) -> Result<WorkspaceSkillDocument, AppError> {
    let adapter = tool_adapters::find_adapter_with_store(store, agent_key)
        .ok_or_else(|| AppError::not_found("Tool not found"))?;
    let skill_dir = workspace_skill_target_path(&adapter.skills_dir(), relative_path)?;
    let content = read_skill_document(&skill_dir)?;

    Ok(WorkspaceSkillDocument {
        skill_name: skill_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        filename: "SKILL.md".to_string(),
        content,
    })
}

pub fn sync_skill_to_global_workspace(
    store: &SkillStore,
    agent_key: &str,
    skill_ref: &str,
) -> Result<GlobalWorkspaceSkillSyncReport, AppError> {
    let adapter = global_workspace_adapter_for_write(store, agent_key)?;
    let skill = resolve_skill(store, skill_ref)?;
    let source = PathBuf::from(&skill.central_path);
    let root = adapter.skills_dir();
    let target = root.join(sync_engine::target_dir_name(&source, &skill.name));
    ensure_path_inside_root(&target, &root)?;
    let configured_mode = store.get_setting("sync_mode").map_err(AppError::db)?;
    let mode = sync_engine::sync_mode_for_tool(&adapter.key, configured_mode.as_deref());
    let actual_mode = sync_engine::sync_skill(&source, &target, mode).map_err(AppError::io)?;
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_target(&SkillTargetRecord {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: skill.id.clone(),
            tool: adapter.key.clone(),
            target_path: target.to_string_lossy().to_string(),
            mode: actual_mode.as_str().to_string(),
            status: "ok".to_string(),
            synced_at: Some(now),
            last_error: None,
            source_hash: skill.content_hash.clone(),
        })
        .map_err(AppError::db)?;

    Ok(GlobalWorkspaceSkillSyncReport {
        ok: true,
        skill_id: skill.id,
        tool: adapter.key,
        target_path: target.to_string_lossy().to_string(),
        mode: actual_mode.as_str().to_string(),
    })
}

pub fn unsync_skill_from_global_workspace(
    store: &SkillStore,
    agent_key: &str,
    skill_ref: &str,
) -> Result<GlobalWorkspaceSkillSyncReport, AppError> {
    let adapter = global_workspace_adapter_for_delete(store, agent_key)?;
    let skill = resolve_skill(store, skill_ref)?;
    let target = store
        .get_targets_for_skill(&skill.id)
        .map_err(AppError::db)?
        .into_iter()
        .find(|target| target.tool == adapter.key)
        .ok_or_else(|| AppError::not_found("sync target not found"))?;
    let target_path = PathBuf::from(&target.target_path);
    ensure_path_inside_root(&target_path, &adapter.skills_dir())?;

    store
        .delete_target(&skill.id, &adapter.key)
        .map_err(AppError::db)?;
    remove_target_if_unreferenced(store, &target_path)?;

    Ok(GlobalWorkspaceSkillSyncReport {
        ok: true,
        skill_id: skill.id,
        tool: adapter.key,
        target_path: target_path.to_string_lossy().to_string(),
        mode: target.mode,
    })
}

pub fn delete_global_workspace_skill(
    store: &SkillStore,
    agent_key: &str,
    relative_path: &str,
) -> Result<GlobalWorkspaceSkillDeleteReport, AppError> {
    let adapter = global_workspace_adapter_for_delete(store, agent_key)?;
    let root = adapter.skills_dir();
    let target_path = workspace_skill_target_path(&root, relative_path)?;
    if !target_path.is_dir() {
        return Err(AppError::not_found("workspace skill not found"));
    }
    let managed = store
        .get_all_targets()
        .map_err(AppError::db)?
        .into_iter()
        .any(|target| Path::new(&target.target_path) == target_path);
    if managed {
        return Err(AppError::invalid_input(
            "managed global workspace skill must be unsynced",
        ));
    }
    sync_engine::remove_target(&target_path).map_err(AppError::io)?;
    Ok(GlobalWorkspaceSkillDeleteReport {
        ok: true,
        agent: adapter.key,
        target_path: target_path.to_string_lossy().to_string(),
    })
}

fn enrich_workspace_skills(
    store: &SkillStore,
    agent_key: &str,
    skills: Vec<ProjectSkillInfo>,
) -> Result<Vec<ProjectSkillInfo>, AppError> {
    let all_skills = store.get_all_skills().map_err(AppError::db)?;
    let all_targets = store.get_all_targets().map_err(AppError::db)?;
    let tags_map = store.get_tags_map().map_err(AppError::db)?;
    let mut enriched = Vec::with_capacity(skills.len());

    for skill in skills {
        let matched = match_center_skill(agent_key, &skill, &all_skills, &all_targets);
        enriched.push(enrich_skill(skill, matched, &tags_map));
    }

    Ok(enriched)
}

fn enrich_skill(
    mut skill: ProjectSkillInfo,
    matched: Option<&SkillRecord>,
    tags_map: &std::collections::HashMap<String, Vec<String>>,
) -> ProjectSkillInfo {
    if let Some(center) = matched {
        skill.description = center
            .description
            .clone()
            .or_else(|| skill.description.clone());
        skill.in_center = true;
        skill.center_skill_id = Some(center.id.clone());
        skill.tags = tags_map.get(&center.id).cloned().unwrap_or_default();
        skill.sync_status = sync_status(&skill, center);
    }
    skill
}

fn sync_status(skill: &ProjectSkillInfo, center: &SkillRecord) -> String {
    match (
        skill.content_hash.as_deref(),
        center.content_hash.as_deref(),
        skill.last_modified_at,
    ) {
        (Some(project_hash), Some(center_hash), _) if project_hash == center_hash => {
            "in_sync".to_string()
        }
        (_, _, Some(project_modified)) if project_modified > center.updated_at => {
            "project_newer".to_string()
        }
        (_, _, Some(project_modified)) if project_modified < center.updated_at => {
            "center_newer".to_string()
        }
        _ => "diverged".to_string(),
    }
}

fn match_center_skill<'a>(
    agent_key: &str,
    skill: &ProjectSkillInfo,
    all_skills: &'a [SkillRecord],
    all_targets: &'a [SkillTargetRecord],
) -> Option<&'a SkillRecord> {
    let path = Path::new(&skill.path);
    let target_skill_id = all_targets
        .iter()
        .find(|target| target.tool == agent_key && Path::new(&target.target_path) == path)
        .map(|target| target.skill_id.as_str());
    if let Some(skill_id) = target_skill_id {
        if let Some(center) = all_skills.iter().find(|center| center.id == skill_id) {
            return Some(center);
        }
    }

    let dir_name = skill.dir_name.to_lowercase();
    let skill_name = skill.name.to_lowercase();
    let content_hash = skill.content_hash.as_deref();
    let mut candidates: Vec<(&SkillRecord, u8)> = Vec::new();

    for center in all_skills {
        let central_name = Path::new(&center.central_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_lowercase();
        let center_name = center.name.to_lowercase();

        let score = if central_name == dir_name {
            80
        } else if center_name == skill_name {
            60
        } else if content_hash.is_some() && content_hash == center.content_hash.as_deref() {
            40
        } else {
            0
        };

        if score > 0 {
            candidates.push((center, score));
        }
    }

    candidates.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| a.0.updated_at.cmp(&b.0.updated_at))
    });
    match candidates.as_slice() {
        [] => None,
        [(center, score)] if *score > 0 => Some(*center),
        [(center, score), second, ..] if *score > 0 && score > &second.1 => Some(*center),
        _ => None,
    }
}

fn workspace_skill_target_path(root_dir: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let normalized = Path::new(relative_path);
    if relative_path.trim().is_empty()
        || normalized.is_absolute()
        || normalized
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(AppError::invalid_input(
            "relativePath must stay inside workspace",
        ));
    }
    let target = root_dir.join(normalized);
    if !target.starts_with(root_dir) {
        return Err(AppError::invalid_input(
            "relativePath must stay inside workspace",
        ));
    }
    Ok(target)
}

fn read_skill_document(skill_dir: &Path) -> Result<String, AppError> {
    for candidate in ["SKILL.md", "skill.md"] {
        if let Ok(content) = std::fs::read_to_string(skill_dir.join(candidate)) {
            return Ok(content);
        }
    }
    Err(AppError::not_found("workspace skill not found"))
}

fn resolve_skill(store: &SkillStore, reference: &str) -> Result<SkillRecord, AppError> {
    let matches: Vec<_> = store
        .get_all_skills()
        .map_err(AppError::db)?
        .into_iter()
        .filter(|skill| {
            skill.id == reference
                || skill.name == reference
                || skill.central_path == reference
                || Path::new(&skill.central_path)
                    .file_name()
                    .and_then(|value| value.to_str())
                    == Some(reference)
        })
        .collect();
    match matches.len() {
        0 => Err(AppError::not_found(format!("skill not found: {reference}"))),
        1 => Ok(matches.into_iter().next().expect("one skill match")),
        _ => Err(AppError::invalid_input(format!(
            "ambiguous skill reference: {reference}"
        ))),
    }
}

fn workspace_adapter_for_export(
    store: &SkillStore,
    project: &ProjectRecord,
    tool_key: &str,
) -> Result<tool_adapters::ToolAdapter, AppError> {
    let adapter = workspace_adapter_for_delete(store, project, tool_key)?;
    if !adapter.is_installed() {
        return Err(AppError::invalid_input(format!(
            "{} is not installed",
            adapter.display_name
        )));
    }
    if tool_service::disabled_tools_set(store).contains(&adapter.key) {
        return Err(AppError::invalid_input(format!(
            "{} is disabled",
            adapter.display_name
        )));
    }
    Ok(adapter)
}

fn workspace_adapter_for_delete(
    store: &SkillStore,
    project: &ProjectRecord,
    tool_key: &str,
) -> Result<tool_adapters::ToolAdapter, AppError> {
    let adapter = tool_adapters::find_adapter_with_store(store, tool_key)
        .ok_or_else(|| AppError::not_found(format!("agent not found: {tool_key}")))?;
    if project.workspace_type != "linked" && adapter.project_relative_skills_dir().trim().is_empty()
    {
        return Err(AppError::invalid_input(format!(
            "agent has no project skills path: {tool_key}"
        )));
    }
    Ok(adapter)
}

fn global_workspace_adapter_for_write(
    store: &SkillStore,
    tool_key: &str,
) -> Result<tool_adapters::ToolAdapter, AppError> {
    let adapter = global_workspace_adapter_for_delete(store, tool_key)?;
    if !adapter.is_installed() {
        return Err(AppError::invalid_input(format!(
            "{} is not installed",
            adapter.display_name
        )));
    }
    if tool_service::disabled_tools_set(store).contains(&adapter.key) {
        return Err(AppError::invalid_input(format!(
            "{} is disabled",
            adapter.display_name
        )));
    }
    Ok(adapter)
}

fn global_workspace_adapter_for_delete(
    store: &SkillStore,
    tool_key: &str,
) -> Result<tool_adapters::ToolAdapter, AppError> {
    tool_adapters::find_adapter_with_store(store, tool_key)
        .ok_or_else(|| AppError::not_found(format!("agent not found: {tool_key}")))
}

fn remove_target_if_unreferenced(store: &SkillStore, target_path: &Path) -> Result<(), AppError> {
    let still_referenced = store
        .get_all_targets()
        .map_err(AppError::db)?
        .into_iter()
        .any(|target| Path::new(&target.target_path) == target_path);
    if !still_referenced {
        sync_engine::remove_target(target_path).map_err(AppError::io)?;
    }
    Ok(())
}

fn ensure_path_inside_root(target: &Path, root: &Path) -> Result<(), AppError> {
    if !target.starts_with(root) {
        return Err(AppError::invalid_input(
            "target path must stay inside workspace root",
        ));
    }
    Ok(())
}

fn slugify_skill_dir_name(name: &str) -> String {
    let mut out = String::new();
    let mut previous_dash = false;
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' || ch == '-' {
            out.push(ch);
            previous_dash = false;
        } else if !previous_dash {
            out.push('-');
            previous_dash = true;
        }
    }
    let trimmed = out.trim_matches(|ch| ch == '-' || ch == '_' || ch == '.');
    if trimmed.is_empty() {
        "skill".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        add_registered_linked_workspace, add_registered_project_workspace,
        delete_global_workspace_skill, delete_registered_workspace_skill,
        export_skill_to_registered_workspace, import_legacy_workspace_registry,
        list_global_workspace_skills, list_registered_workspace_agent_targets,
        list_registered_workspace_skills, list_registered_workspaces,
        read_global_workspace_skill_document, read_registered_workspace_skill_document,
        remove_registered_workspace, reorder_registered_workspaces,
        scan_registered_workspace_candidates, sync_skill_to_global_workspace,
        unsync_skill_from_global_workspace,
    };
    use crate::core::skill_store::{ProjectRecord, SkillRecord, SkillStore, SkillTargetRecord};
    use std::fs;
    use tempfile::tempdir;

    fn make_skill(
        id: &str,
        name: &str,
        central_path: &str,
        description: Option<&str>,
        content_hash: Option<&str>,
        updated_at: i64,
    ) -> SkillRecord {
        SkillRecord {
            id: id.to_string(),
            name: name.to_string(),
            description: description.map(|value| value.to_string()),
            source_type: "import".to_string(),
            source_ref: None,
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            remote_revision: None,
            central_path: central_path.to_string(),
            content_hash: content_hash.map(|value| value.to_string()),
            enabled: true,
            created_at: updated_at,
            updated_at,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        }
    }

    fn make_project(
        id: &str,
        name: &str,
        path: &str,
        workspace_type: &str,
        linked_agent_key: Option<&str>,
        linked_agent_name: Option<&str>,
        disabled_path: Option<&str>,
        sort_order: i32,
        created_at: i64,
        updated_at: i64,
    ) -> ProjectRecord {
        ProjectRecord {
            id: id.to_string(),
            name: name.to_string(),
            path: path.to_string(),
            workspace_type: workspace_type.to_string(),
            linked_agent_key: linked_agent_key.map(|value| value.to_string()),
            linked_agent_name: linked_agent_name.map(|value| value.to_string()),
            disabled_path: disabled_path.map(|value| value.to_string()),
            sort_order,
            created_at,
            updated_at,
        }
    }

    #[test]
    fn registered_workspace_listing_reads_project_and_linked_records_from_store() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();

        store
            .insert_project(&make_project(
                "project-1",
                "Alpha",
                "/workspace/alpha",
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();
        store
            .insert_project(&make_project(
                "linked-1",
                "Bravo",
                "/workspace/bravo",
                "linked",
                Some("codex"),
                Some("Codex"),
                Some("/workspace/bravo-disabled"),
                1,
                30,
                40,
            ))
            .unwrap();

        let workspaces = list_registered_workspaces(&store).unwrap();

        assert_eq!(workspaces.len(), 2);
        assert_eq!(workspaces[0].id, "project-1");
        assert_eq!(workspaces[0].workspace_type, "project");
        assert_eq!(workspaces[0].supports_skill_toggle, true);
        assert_eq!(workspaces[1].id, "linked-1");
        assert_eq!(workspaces[1].workspace_type, "linked");
        assert_eq!(workspaces[1].linked_agent_name.as_deref(), Some("Codex"));
        assert_eq!(workspaces[1].supports_skill_toggle, false);
    }

    #[test]
    fn adding_project_workspace_persists_a_stable_registered_workspace() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let project_path = tmp.path().join("alpha-project");

        let created = add_registered_project_workspace(&store, &project_path).unwrap();
        let duplicate = add_registered_project_workspace(&store, &project_path).unwrap();
        let workspaces = list_registered_workspaces(&store).unwrap();

        assert_eq!(created.id, duplicate.id);
        assert_eq!(created.name, "alpha-project");
        assert_eq!(created.path, project_path.to_string_lossy());
        assert_eq!(created.workspace_type, "project");
        assert_eq!(created.supports_skill_toggle, true);
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].id, created.id);
    }

    #[test]
    fn adding_project_workspace_collapses_equivalent_path_variants() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let project_path = tmp.path().join("alpha-project");
        let variant = project_path.join("child").join("..").join(".");

        let created = add_registered_project_workspace(&store, &project_path).unwrap();
        let duplicate = add_registered_project_workspace(&store, &variant).unwrap();

        assert_eq!(created.id, duplicate.id);
        assert_eq!(list_registered_workspaces(&store).unwrap().len(), 1);
    }

    #[test]
    fn adding_linked_workspace_persists_linked_metadata_without_duplicates() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let linked_path = tmp.path().join("shared-skills");

        let created =
            add_registered_linked_workspace(&store, "Shared Skills", &linked_path).unwrap();
        let duplicate =
            add_registered_linked_workspace(&store, "Shared Skills", &linked_path).unwrap();
        let stored = store.get_project_by_id(&created.id).unwrap().unwrap();

        assert_eq!(created.id, duplicate.id);
        assert_eq!(created.name, "Shared Skills");
        assert_eq!(created.workspace_type, "linked");
        assert_eq!(created.linked_agent_name.as_deref(), Some("Shared Skills"));
        assert_eq!(created.supports_skill_toggle, false);
        assert_eq!(stored.linked_agent_key.as_deref(), Some("linked"));
        assert_eq!(list_registered_workspaces(&store).unwrap().len(), 1);
    }

    #[test]
    fn registered_workspaces_can_be_reordered_and_removed_by_stable_id() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let first = add_registered_project_workspace(&store, &tmp.path().join("first")).unwrap();
        let second =
            add_registered_linked_workspace(&store, "Second", &tmp.path().join("second")).unwrap();

        let reordered =
            reorder_registered_workspaces(&store, &[second.id.clone(), first.id.clone()]).unwrap();
        let removed = remove_registered_workspace(&store, &second.id).unwrap();
        let remaining = list_registered_workspaces(&store).unwrap();

        assert_eq!(reordered[0].id, second.id);
        assert_eq!(reordered[0].sort_order, 0);
        assert_eq!(reordered[1].id, first.id);
        assert_eq!(reordered[1].sort_order, 1);
        assert!(removed);
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, first.id);
        assert!(remove_registered_workspace(&store, &second.id).is_err());
    }

    #[test]
    fn importing_legacy_workspace_registry_preserves_ids_and_renames_backup() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let registry_path = tmp.path().join("projects.json");
        fs::write(
            &registry_path,
            serde_json::json!({
                "projects": [
                    {
                        "id": "web-project",
                        "name": "Legacy Project",
                        "path": "/workspace/legacy-project",
                        "workspace_type": "project",
                        "linked_agent_name": null,
                        "supports_skill_toggle": true,
                        "sort_order": 1,
                        "skill_count": 0,
                        "sync_health": {
                            "in_sync": 0,
                            "project_newer": 0,
                            "center_newer": 0,
                            "diverged": 0,
                            "project_only": 0
                        },
                        "created_at": 10,
                        "updated_at": 20
                    },
                    {
                        "id": "web-linked",
                        "name": "Legacy Linked",
                        "path": "/workspace/legacy-linked",
                        "workspace_type": "linked",
                        "linked_agent_name": "Legacy Linked",
                        "supports_skill_toggle": false,
                        "sort_order": 2,
                        "skill_count": 0,
                        "sync_health": {
                            "in_sync": 0,
                            "project_newer": 0,
                            "center_newer": 0,
                            "diverged": 0,
                            "project_only": 0
                        },
                        "created_at": 30,
                        "updated_at": 40
                    }
                ]
            })
            .to_string(),
        )
        .unwrap();

        let report = import_legacy_workspace_registry(&store, &registry_path).unwrap();
        let workspaces = list_registered_workspaces(&store).unwrap();

        assert_eq!(report.imported.len(), 2);
        assert_eq!(report.skipped.len(), 0);
        assert!(!registry_path.exists());
        assert!(std::path::Path::new(&report.backup_path).exists());
        assert_eq!(workspaces[0].id, "web-project");
        assert_eq!(workspaces[0].sort_order, 1);
        assert_eq!(workspaces[1].id, "web-linked");
        assert_eq!(
            workspaces[1].linked_agent_name.as_deref(),
            Some("Legacy Linked")
        );
    }

    #[test]
    fn importing_legacy_workspace_registry_skips_existing_store_records() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let registry_path = tmp.path().join("projects.json");
        store
            .insert_project(&make_project(
                "web-project",
                "Existing Project",
                "/workspace/existing-project",
                "project",
                None,
                None,
                None,
                0,
                100,
                200,
            ))
            .unwrap();
        fs::write(
            &registry_path,
            serde_json::json!({
                "projects": [
                    {
                        "id": "web-project",
                        "name": "Legacy Project",
                        "path": "/workspace/legacy-project",
                        "workspace_type": "project",
                        "linked_agent_name": null,
                        "supports_skill_toggle": true,
                        "sort_order": 1,
                        "skill_count": 0,
                        "sync_health": {
                            "in_sync": 0,
                            "project_newer": 0,
                            "center_newer": 0,
                            "diverged": 0,
                            "project_only": 0
                        },
                        "created_at": 10,
                        "updated_at": 20
                    }
                ]
            })
            .to_string(),
        )
        .unwrap();

        let report = import_legacy_workspace_registry(&store, &registry_path).unwrap();
        let workspaces = list_registered_workspaces(&store).unwrap();

        assert_eq!(report.imported.len(), 0);
        assert_eq!(report.skipped.len(), 1);
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].name, "Existing Project");
        assert_eq!(workspaces[0].path, "/workspace/existing-project");
        assert!(!registry_path.exists());
    }

    #[test]
    fn registered_workspace_skill_listing_enriches_matching_skills() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_root = tmp.path().join("center");
        let workspace_root = tmp.path().join("workspace");
        let skill_root = workspace_root.join(".codex").join("skills");
        fs::create_dir_all(&center_root).unwrap();
        fs::create_dir_all(&skill_root).unwrap();

        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": workspace_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();

        let in_sync = skill_root.join("in-sync");
        let project_newer = skill_root.join("project-newer");
        let center_newer = skill_root.join("center-newer");
        let diverged = skill_root.join("diverged");
        let project_only = skill_root.join("project-only");
        for dir in [
            &in_sync,
            &project_newer,
            &center_newer,
            &diverged,
            &project_only,
        ] {
            fs::create_dir_all(dir).unwrap();
        }

        fs::write(in_sync.join("SKILL.md"), "---\nname: In Sync\n---\n").unwrap();
        fs::write(
            project_newer.join("SKILL.md"),
            "---\nname: Project Newer\n---\n",
        )
        .unwrap();
        fs::write(
            center_newer.join("SKILL.md"),
            "---\nname: Center Newer\n---\n",
        )
        .unwrap();
        fs::write(diverged.join("SKILL.md"), "---\nname: Diverged\n---\n").unwrap();
        fs::write(
            project_only.join("SKILL.md"),
            "---\nname: Project Only\n---\n",
        )
        .unwrap();

        let in_sync_hash = crate::core::content_hash::hash_directory(&in_sync).unwrap();
        let in_sync_ms = fs::metadata(&in_sync)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let diverged_ms = fs::metadata(&diverged)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        store
            .upsert_skill(&make_skill(
                "skill-in-sync",
                "In Sync",
                center_root.join("in-sync").to_string_lossy().as_ref(),
                Some("center description"),
                Some(&in_sync_hash),
                in_sync_ms,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-project-newer",
                "Project Newer",
                center_root.join("project-newer").to_string_lossy().as_ref(),
                Some("center description"),
                Some("center-hash"),
                1,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-center-newer",
                "Center Newer",
                center_root.join("center-newer").to_string_lossy().as_ref(),
                Some("center description"),
                Some("center-hash"),
                i64::MAX / 4,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-diverged",
                "Diverged",
                center_root.join("diverged").to_string_lossy().as_ref(),
                Some("center description"),
                Some("center-hash"),
                diverged_ms,
            ))
            .unwrap();

        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                workspace_root.to_string_lossy().as_ref(),
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let skills = list_registered_workspace_skills(&store, "project-1").unwrap();
        let by_name = skills
            .into_iter()
            .map(|skill| (skill.name.clone(), skill))
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(by_name["In Sync"].sync_status, "in_sync");
        assert_eq!(by_name["Project Newer"].sync_status, "project_newer");
        assert_eq!(by_name["Center Newer"].sync_status, "center_newer");
        assert_eq!(by_name["Diverged"].sync_status, "diverged");
        assert_eq!(by_name["Project Only"].sync_status, "project_only");

        let workspaces = list_registered_workspaces(&store).unwrap();
        let health = &workspaces[0].sync_health;
        assert_eq!(workspaces[0].skill_count, 5);
        assert_eq!(health.in_sync, 1);
        assert_eq!(health.project_newer, 1);
        assert_eq!(health.center_newer, 1);
        assert_eq!(health.diverged, 1);
        assert_eq!(health.project_only, 1);
    }

    #[test]
    fn registered_workspace_listing_counts_unique_relative_skill_paths_across_agents() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let workspace_root = tmp.path().join("workspace");
        fs::create_dir_all(&workspace_root).unwrap();

        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({
                    "codex": tmp.path().join("global-codex").to_string_lossy().to_string(),
                    "claude_code": tmp.path().join("global-claude").to_string_lossy().to_string(),
                    "cursor": tmp.path().join("global-cursor").to_string_lossy().to_string(),
                })
                .to_string(),
            )
            .unwrap();

        for (relative, name) in [
            (".codex/skills/Shared", "Shared Codex"),
            (".claude/skills/shared", "Shared Claude"),
            (".cursor/skills/shared", "Shared Cursor"),
            (".codex/skills/codex-only", "Codex Only"),
        ] {
            let skill_dir = workspace_root.join(relative);
            fs::create_dir_all(&skill_dir).unwrap();
            fs::write(skill_dir.join("SKILL.md"), format!("---\nname: {name}\n---\n")).unwrap();
        }

        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                workspace_root.to_string_lossy().as_ref(),
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let skills = list_registered_workspace_skills(&store, "project-1").unwrap();
        let unique_relative_paths = skills
            .iter()
            .map(|skill| skill.relative_path.to_lowercase())
            .collect::<std::collections::HashSet<_>>();

        assert_eq!(skills.len(), 4);
        assert_eq!(unique_relative_paths.len(), 2);

        let workspaces = list_registered_workspaces(&store).unwrap();
        assert_eq!(workspaces[0].skill_count, 2);
    }

    #[test]
    fn registered_workspace_skill_listing_reads_linked_workspace_root() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_root = tmp.path().join("center");
        let workspace_root = tmp.path().join("linked-workspace");
        let skill_dir = workspace_root.join("alpha");
        fs::create_dir_all(&center_root).unwrap();
        fs::create_dir_all(&skill_dir).unwrap();

        fs::write(skill_dir.join("SKILL.md"), "---\nname: Alpha\n---\n").unwrap();
        let skill_hash = crate::core::content_hash::hash_directory(&skill_dir).unwrap();
        let skill_ms = fs::metadata(&skill_dir)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha",
                center_root.join("alpha").to_string_lossy().as_ref(),
                Some("center description"),
                Some(&skill_hash),
                skill_ms,
            ))
            .unwrap();
        store
            .insert_project(&make_project(
                "linked-1",
                "Linked",
                workspace_root.to_string_lossy().as_ref(),
                "linked",
                Some("codex"),
                Some("Codex"),
                Some(workspace_root.join("disabled").to_string_lossy().as_ref()),
                0,
                10,
                20,
            ))
            .unwrap();

        let skills = list_registered_workspace_skills(&store, "linked-1").unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "Alpha");
        assert_eq!(skills[0].sync_status, "in_sync");
    }

    #[test]
    fn registered_workspace_document_reads_linked_workspace_root() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let workspace_root = tmp.path().join("linked-workspace");
        let skill_dir = workspace_root.join("docs").join("alpha");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "# Alpha\n\nBody\n").unwrap();

        store
            .insert_project(&make_project(
                "linked-1",
                "Linked",
                workspace_root.to_string_lossy().as_ref(),
                "linked",
                Some("codex"),
                Some("Codex"),
                Some(workspace_root.join("disabled").to_string_lossy().as_ref()),
                0,
                10,
                20,
            ))
            .unwrap();

        let doc =
            read_registered_workspace_skill_document(&store, "linked-1", "codex", "docs/alpha")
                .unwrap();

        assert_eq!(doc.skill_name, "alpha");
        assert_eq!(doc.filename, "SKILL.md");
        assert!(doc.content.contains("# Alpha"));
    }

    #[test]
    fn exporting_skill_to_project_workspace_copies_selected_tool_without_sync_target() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let workspace_root = tmp.path().join("project");
        let codex_global = tmp.path().join("codex-global");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&codex_global).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        fs::write(center_skill.join("notes.txt"), "notes\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": codex_global.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                Some("center description"),
                Some("hash-alpha"),
                10,
            ))
            .unwrap();
        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                workspace_root.to_string_lossy().as_ref(),
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let report = export_skill_to_registered_workspace(
            &store,
            "project-1",
            "skill-alpha",
            &[String::from("codex")],
        )
        .unwrap();

        let target = workspace_root
            .join(".codex")
            .join("skills")
            .join("alpha-skill");
        assert_eq!(report.skill_id, "skill-alpha");
        assert_eq!(report.project_id, "project-1");
        assert_eq!(report.targets[0].agent, "codex");
        assert_eq!(
            report.targets[0].target_path,
            target.to_string_lossy().to_string()
        );
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "# Alpha\n"
        );
        assert_eq!(store.get_all_targets().unwrap().len(), 0);
    }

    #[test]
    fn exporting_skill_to_project_workspace_refuses_existing_target() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let workspace_root = tmp.path().join("project");
        let codex_global = tmp.path().join("codex-global");
        let existing_target = workspace_root
            .join(".codex")
            .join("skills")
            .join("alpha-skill");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&codex_global).unwrap();
        fs::create_dir_all(&existing_target).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        fs::write(existing_target.join("SKILL.md"), "# Local edits\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": codex_global.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                None,
                10,
            ))
            .unwrap();
        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                workspace_root.to_string_lossy().as_ref(),
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let err = export_skill_to_registered_workspace(
            &store,
            "project-1",
            "skill-alpha",
            &[String::from("codex")],
        )
        .unwrap_err();

        assert!(err.message.contains("already exists"));
        assert_eq!(
            fs::read_to_string(existing_target.join("SKILL.md")).unwrap(),
            "# Local edits\n"
        );
    }

    #[test]
    fn deleting_project_workspace_skill_removes_only_workspace_copy() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let workspace_root = tmp.path().join("project");
        let codex_global = tmp.path().join("codex-global");
        let workspace_copy = workspace_root
            .join(".codex")
            .join("skills")
            .join("alpha-skill");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&codex_global).unwrap();
        fs::create_dir_all(&workspace_copy).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Center Alpha\n").unwrap();
        fs::write(workspace_copy.join("SKILL.md"), "# Workspace Alpha\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": codex_global.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();
        store
            .insert_target(&SkillTargetRecord {
                id: "target-1".to_string(),
                skill_id: "skill-alpha".to_string(),
                tool: "codex".to_string(),
                target_path: codex_global
                    .join("alpha-skill")
                    .to_string_lossy()
                    .to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(20),
                last_error: None,
                source_hash: Some("hash-alpha".to_string()),
            })
            .unwrap();
        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                workspace_root.to_string_lossy().as_ref(),
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();
        store
            .set_setting("disabled_tools", &serde_json::json!(["codex"]).to_string())
            .unwrap();

        let report =
            delete_registered_workspace_skill(&store, "project-1", "codex", "alpha-skill").unwrap();

        assert_eq!(report.project_id, "project-1");
        assert_eq!(report.agent, "codex");
        assert_eq!(
            report.target_path,
            workspace_copy.to_string_lossy().to_string()
        );
        assert!(!workspace_copy.exists());
        assert!(center_skill.join("SKILL.md").exists());
        assert_eq!(store.get_all_skills().unwrap().len(), 1);
        let targets = store.get_all_targets().unwrap();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].id, "target-1");
    }

    #[test]
    fn exporting_and_deleting_linked_workspace_skill_use_linked_root() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let linked_root = tmp.path().join("linked");
        let codex_global = tmp.path().join("codex-global");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&linked_root).unwrap();
        fs::create_dir_all(&codex_global).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": codex_global.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                None,
                10,
            ))
            .unwrap();
        store
            .insert_project(&make_project(
                "linked-1",
                "Linked",
                linked_root.to_string_lossy().as_ref(),
                "linked",
                Some("codex"),
                Some("Codex"),
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let export = export_skill_to_registered_workspace(
            &store,
            "linked-1",
            "skill-alpha",
            &[String::from("codex")],
        )
        .unwrap();
        let target = linked_root.join("alpha-skill");
        assert_eq!(
            export.targets[0].target_path,
            target.to_string_lossy().to_string()
        );
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "# Alpha\n"
        );

        let delete =
            delete_registered_workspace_skill(&store, "linked-1", "codex", "alpha-skill").unwrap();

        assert_eq!(delete.target_path, target.to_string_lossy().to_string());
        assert!(!target.exists());
        assert!(center_skill.join("SKILL.md").exists());
        assert_eq!(store.get_all_targets().unwrap().len(), 0);
    }

    #[test]
    fn exporting_skill_to_project_workspace_reports_clear_error_cases() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let workspace_root = tmp.path().join("project");
        let codex_global = tmp.path().join("codex-global");
        let custom_global = tmp.path().join("custom-global");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&codex_global).unwrap();
        fs::create_dir_all(&custom_global).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": codex_global.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .set_setting(
                "custom_tools",
                &serde_json::json!([{
                    "key": "custom",
                    "display_name": "Custom",
                    "skills_dir": custom_global.to_string_lossy()
                }])
                .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                None,
                10,
            ))
            .unwrap();
        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                workspace_root.to_string_lossy().as_ref(),
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let missing_skill = export_skill_to_registered_workspace(
            &store,
            "project-1",
            "missing-skill",
            &[String::from("codex")],
        )
        .unwrap_err();
        let missing_tool = export_skill_to_registered_workspace(
            &store,
            "project-1",
            "skill-alpha",
            &[String::from("missing-tool")],
        )
        .unwrap_err();
        let unsupported_tool = export_skill_to_registered_workspace(
            &store,
            "project-1",
            "skill-alpha",
            &[String::from("custom")],
        )
        .unwrap_err();
        store
            .set_setting("disabled_tools", &serde_json::json!(["codex"]).to_string())
            .unwrap();
        let disabled_tool = export_skill_to_registered_workspace(
            &store,
            "project-1",
            "skill-alpha",
            &[String::from("codex")],
        )
        .unwrap_err();

        assert_eq!(missing_skill.message, "skill not found: missing-skill");
        assert_eq!(missing_tool.message, "agent not found: missing-tool");
        assert_eq!(
            unsupported_tool.message,
            "agent has no project skills path: custom"
        );
        assert_eq!(disabled_tool.message, "Codex is disabled");
    }

    #[test]
    fn scan_registered_workspace_candidates_uses_tool_project_paths() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let root = tmp.path().join("scan-root");
        let project = root.join("project-a");
        let ignored = root.join("project-b");
        fs::create_dir_all(project.join(".codex").join("skills")).unwrap();
        fs::create_dir_all(&ignored).unwrap();

        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": tmp.path().join("codex").to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();

        let candidates = scan_registered_workspace_candidates(&store, &root, 3).unwrap();

        assert_eq!(candidates, vec![project.to_string_lossy().to_string()]);
    }

    #[test]
    fn registered_workspace_agent_targets_require_a_workspace_id() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        store
            .insert_project(&make_project(
                "project-1",
                "Project",
                "/workspace/project",
                "project",
                None,
                None,
                None,
                0,
                10,
                20,
            ))
            .unwrap();

        let targets = list_registered_workspace_agent_targets(&store, "project-1").unwrap();
        assert!(!targets.is_empty());
        assert!(list_registered_workspace_agent_targets(&store, "missing").is_err());
    }

    #[test]
    fn global_workspace_listing_enriches_matching_skills() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_root = tmp.path().join("center");
        let workspace_root = tmp.path().join("workspace");
        fs::create_dir_all(&center_root).unwrap();
        fs::create_dir_all(&workspace_root).unwrap();

        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": workspace_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();

        let in_sync = workspace_root.join("in-sync");
        let project_newer = workspace_root.join("project-newer");
        let center_newer = workspace_root.join("center-newer");
        let diverged = workspace_root.join("diverged");
        let project_only = workspace_root.join("project-only");
        let tagged = workspace_root.join("tagged");
        for dir in [
            &in_sync,
            &project_newer,
            &center_newer,
            &diverged,
            &project_only,
            &tagged,
        ] {
            fs::create_dir_all(dir).unwrap();
        }

        fs::write(
            in_sync.join("SKILL.md"),
            "---\nname: In Sync\ndescription: workspace copy\n---\n",
        )
        .unwrap();
        fs::write(
            project_newer.join("SKILL.md"),
            "---\nname: Project Newer\ndescription: workspace copy\n---\n",
        )
        .unwrap();
        fs::write(
            center_newer.join("SKILL.md"),
            "---\nname: Center Newer\ndescription: workspace copy\n---\n",
        )
        .unwrap();
        fs::write(
            diverged.join("SKILL.md"),
            "---\nname: Diverged\ndescription: workspace copy\n---\n",
        )
        .unwrap();
        fs::write(
            project_only.join("SKILL.md"),
            "---\nname: Project Only\ndescription: workspace copy\n---\n",
        )
        .unwrap();
        fs::write(
            tagged.join("SKILL.md"),
            "---\nname: Tagged\ndescription: workspace copy\n---\n",
        )
        .unwrap();

        let in_sync_hash = crate::core::content_hash::hash_directory(&in_sync).unwrap();
        let in_sync_ts = fs::metadata(&in_sync).unwrap().modified().unwrap();
        let in_sync_ms = in_sync_ts
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let diverged_ms = fs::metadata(&diverged)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        store
            .upsert_skill(&make_skill(
                "skill-in-sync",
                "In Sync",
                center_root.join("in-sync").to_string_lossy().as_ref(),
                Some("center description"),
                Some(&in_sync_hash),
                in_sync_ms,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-project-newer",
                "Project Newer",
                center_root.join("project-newer").to_string_lossy().as_ref(),
                Some("center description"),
                Some("center-hash"),
                1,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-center-newer",
                "Center Newer",
                center_root.join("center-newer").to_string_lossy().as_ref(),
                Some("center description"),
                Some("center-hash"),
                i64::MAX / 4,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-diverged",
                "Diverged",
                center_root.join("diverged").to_string_lossy().as_ref(),
                Some("center description"),
                Some("center-hash"),
                diverged_ms,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-tagged",
                "Tagged",
                center_root.join("tagged").to_string_lossy().as_ref(),
                Some("tagged description"),
                Some("tagged-hash"),
                in_sync_ms,
            ))
            .unwrap();
        store
            .set_tags_for_skill("skill-tagged", &["rust".to_string()])
            .unwrap();

        store
            .insert_target(&crate::core::skill_store::SkillTargetRecord {
                id: "target-1".to_string(),
                skill_id: "skill-in-sync".to_string(),
                tool: "codex".to_string(),
                target_path: in_sync.to_string_lossy().to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(1),
                last_error: None,
                source_hash: Some(in_sync_hash.clone()),
            })
            .unwrap();

        let skills = list_global_workspace_skills(&store, "codex").unwrap();
        let by_name = skills
            .into_iter()
            .map(|skill| (skill.name.clone(), skill))
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(
            by_name["In Sync"].center_skill_id.as_deref(),
            Some("skill-in-sync")
        );
        assert!(by_name["In Sync"].in_center);
        assert_eq!(by_name["In Sync"].sync_status, "in_sync");
        assert_eq!(
            by_name["In Sync"].description.as_deref(),
            Some("center description")
        );

        assert_eq!(by_name["Project Newer"].sync_status, "project_newer");
        assert_eq!(by_name["Center Newer"].sync_status, "center_newer");
        assert_eq!(by_name["Diverged"].sync_status, "diverged");
        assert_eq!(by_name["Project Only"].sync_status, "project_only");
        assert_eq!(by_name["Tagged"].tags, vec!["rust".to_string()]);
    }

    #[test]
    fn global_workspace_document_reads_selected_skill_dir() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let workspace_root = tmp.path().join("workspace");
        let skill_dir = workspace_root.join("research").join("alpha");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "# Alpha\n\nBody\n").unwrap();

        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": workspace_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();

        let doc = read_global_workspace_skill_document(&store, "codex", "research/alpha").unwrap();
        assert_eq!(doc.skill_name, "alpha");
        assert_eq!(doc.filename, "SKILL.md");
        assert!(doc.content.contains("# Alpha"));
    }

    #[test]
    fn global_workspace_document_rejects_path_traversal() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": tmp.path().join("workspace").to_string_lossy().to_string()}).to_string(),
            )
            .unwrap();

        let err = read_global_workspace_skill_document(&store, "codex", "../escape").unwrap_err();
        assert!(err
            .to_string()
            .contains("relativePath must stay inside workspace"));
    }

    #[test]
    fn syncing_skill_to_global_workspace_records_sync_managed_tool_target() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let global_root = tmp.path().join("codex-global");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&global_root).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": global_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store.set_setting("sync_mode", "copy").unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();

        let report = sync_skill_to_global_workspace(&store, "codex", "skill-alpha").unwrap();

        let target = global_root.join("alpha");
        assert_eq!(report.skill_id, "skill-alpha");
        assert_eq!(report.tool, "codex");
        assert_eq!(report.target_path, target.to_string_lossy().to_string());
        assert_eq!(report.mode, "copy");
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "# Alpha\n"
        );
        let targets = store.get_all_targets().unwrap();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].skill_id, "skill-alpha");
        assert_eq!(targets[0].tool, "codex");
        assert_eq!(targets[0].target_path, target.to_string_lossy().to_string());
        assert_eq!(targets[0].source_hash.as_deref(), Some("hash-alpha"));
    }

    #[test]
    fn unsyncing_global_workspace_skill_removes_managed_target_record() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let global_root = tmp.path().join("codex-global");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&global_root).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": global_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store.set_setting("sync_mode", "copy").unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();
        let sync = sync_skill_to_global_workspace(&store, "codex", "skill-alpha").unwrap();

        let report = unsync_skill_from_global_workspace(&store, "codex", "skill-alpha").unwrap();

        assert_eq!(report.skill_id, "skill-alpha");
        assert_eq!(report.tool, "codex");
        assert_eq!(report.target_path, sync.target_path);
        assert!(!global_root.join("alpha").exists());
        assert_eq!(store.get_all_targets().unwrap().len(), 0);
        assert_eq!(store.get_all_skills().unwrap().len(), 1);
    }

    #[test]
    fn deleting_unmanaged_global_workspace_skill_removes_only_local_copy() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let global_root = tmp.path().join("codex-global");
        let local_copy = global_root.join("local-only");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&local_copy).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Center Alpha\n").unwrap();
        fs::write(local_copy.join("SKILL.md"), "# Local Only\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": global_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();

        let report = delete_global_workspace_skill(&store, "codex", "local-only").unwrap();

        assert_eq!(report.agent, "codex");
        assert_eq!(report.target_path, local_copy.to_string_lossy().to_string());
        assert!(!local_copy.exists());
        assert!(center_skill.join("SKILL.md").exists());
        assert_eq!(store.get_all_skills().unwrap().len(), 1);
        assert_eq!(store.get_all_targets().unwrap().len(), 0);
    }

    #[test]
    fn unsyncing_global_workspace_skill_keeps_shared_target_path() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_alpha = tmp.path().join("center").join("alpha");
        let center_beta = tmp.path().join("center").join("beta");
        let global_root = tmp.path().join("codex-global");
        let shared_target = global_root.join("shared");
        fs::create_dir_all(&center_alpha).unwrap();
        fs::create_dir_all(&center_beta).unwrap();
        fs::create_dir_all(&shared_target).unwrap();
        fs::write(center_alpha.join("SKILL.md"), "# Alpha\n").unwrap();
        fs::write(center_beta.join("SKILL.md"), "# Beta\n").unwrap();
        fs::write(shared_target.join("SKILL.md"), "# Shared\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": global_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_alpha.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-beta",
                "Beta Skill",
                center_beta.to_string_lossy().as_ref(),
                None,
                Some("hash-beta"),
                10,
            ))
            .unwrap();
        store
            .insert_target(&SkillTargetRecord {
                id: "target-alpha".to_string(),
                skill_id: "skill-alpha".to_string(),
                tool: "codex".to_string(),
                target_path: shared_target.to_string_lossy().to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(20),
                last_error: None,
                source_hash: Some("hash-alpha".to_string()),
            })
            .unwrap();
        store
            .insert_target(&SkillTargetRecord {
                id: "target-beta".to_string(),
                skill_id: "skill-beta".to_string(),
                tool: "custom".to_string(),
                target_path: shared_target.to_string_lossy().to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(20),
                last_error: None,
                source_hash: Some("hash-beta".to_string()),
            })
            .unwrap();

        let report = unsync_skill_from_global_workspace(&store, "codex", "skill-alpha").unwrap();

        assert_eq!(
            report.target_path,
            shared_target.to_string_lossy().to_string()
        );
        assert!(shared_target.join("SKILL.md").exists());
        let remaining = store.get_all_targets().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].skill_id, "skill-beta");
    }

    #[test]
    fn deleting_global_workspace_skill_refuses_shared_managed_target_path() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let global_root = tmp.path().join("codex-global");
        let shared_target = global_root.join("shared");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&shared_target).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        fs::write(shared_target.join("SKILL.md"), "# Shared\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": global_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();
        store
            .insert_target(&SkillTargetRecord {
                id: "target-alpha".to_string(),
                skill_id: "skill-alpha".to_string(),
                tool: "custom".to_string(),
                target_path: shared_target.to_string_lossy().to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(20),
                last_error: None,
                source_hash: Some("hash-alpha".to_string()),
            })
            .unwrap();

        let err = delete_global_workspace_skill(&store, "codex", "shared").unwrap_err();

        assert_eq!(
            err.message,
            "managed global workspace skill must be unsynced"
        );
        assert!(shared_target.join("SKILL.md").exists());
        assert_eq!(store.get_all_targets().unwrap().len(), 1);
    }

    #[test]
    fn global_workspace_writes_report_disabled_and_missing_tools() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let center_skill = tmp.path().join("center").join("alpha");
        let global_root = tmp.path().join("codex-global");
        fs::create_dir_all(&center_skill).unwrap();
        fs::create_dir_all(&global_root).unwrap();
        fs::write(center_skill.join("SKILL.md"), "# Alpha\n").unwrap();
        store
            .set_setting(
                "custom_tool_paths",
                &serde_json::json!({"codex": global_root.to_string_lossy().to_string()})
                    .to_string(),
            )
            .unwrap();
        store
            .upsert_skill(&make_skill(
                "skill-alpha",
                "Alpha Skill",
                center_skill.to_string_lossy().as_ref(),
                None,
                Some("hash-alpha"),
                10,
            ))
            .unwrap();

        let missing =
            sync_skill_to_global_workspace(&store, "missing-tool", "skill-alpha").unwrap_err();
        assert_eq!(missing.message, "agent not found: missing-tool");

        store
            .set_setting("disabled_tools", &serde_json::json!(["codex"]).to_string())
            .unwrap();
        let disabled = sync_skill_to_global_workspace(&store, "codex", "skill-alpha").unwrap_err();
        assert_eq!(disabled.message, "Codex is disabled");
    }
}
