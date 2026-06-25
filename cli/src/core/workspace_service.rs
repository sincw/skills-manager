use std::path::{Path, PathBuf};

use serde::Serialize;

use super::{
    error::AppError,
    project_scanner::{self, ProjectSkillInfo},
    skill_store::{SkillRecord, SkillStore, SkillTargetRecord},
    tool_adapters,
};

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSkillDocument {
    pub skill_name: String,
    pub filename: String,
    pub content: String,
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

#[cfg(test)]
mod tests {
    use super::{list_global_workspace_skills, read_global_workspace_skill_document};
    use crate::core::skill_store::{SkillRecord, SkillStore};
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
}
