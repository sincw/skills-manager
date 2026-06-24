use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};

use super::{central_repo, scenario_service, skill_store::SkillStore, sync_metadata, tool_service};

/// Per-stage timings collected during `initialize_store`. The struct is
/// returned to the caller so the caller can emit one consolidated startup
/// block after initialization.
#[derive(Debug, Clone)]
pub struct StartupTimings {
    pub ensure_central_repo_ms: u128,
    pub open_store_ms: u128,
    pub migrate_legacy_tool_keys_ms: u128,
    pub skill_count: usize,
    pub reindex_from_metadata_ms: Option<u128>,
    pub restore_sync_included_ms: u128,
    pub restore_sync_included_changed: bool,
    pub write_all_from_db_ms: Option<u128>,
    pub apply_scenario_ms: u128,
    /// "default_startup" or "cli". Defaults to
    /// `"unknown"` so a struct that escapes `initialize_store_inner`
    /// without being fully populated still produces an obvious value in
    /// the log instead of an empty string.
    pub apply_scenario_kind: &'static str,
    pub total_ms: u128,
}

impl Default for StartupTimings {
    fn default() -> Self {
        Self {
            ensure_central_repo_ms: 0,
            open_store_ms: 0,
            migrate_legacy_tool_keys_ms: 0,
            skill_count: 0,
            reindex_from_metadata_ms: None,
            restore_sync_included_ms: 0,
            restore_sync_included_changed: false,
            write_all_from_db_ms: None,
            apply_scenario_ms: 0,
            apply_scenario_kind: "unknown",
            total_ms: 0,
        }
    }
}

pub fn initialize_store() -> Result<(Arc<SkillStore>, StartupTimings)> {
    initialize_store_inner(true)
}

pub fn initialize_cli_store() -> Result<Arc<SkillStore>> {
    initialize_store_inner(false).map(|(store, _)| store)
}

fn initialize_store_inner(
    apply_startup_default: bool,
) -> Result<(Arc<SkillStore>, StartupTimings)> {
    let total_start = Instant::now();
    let mut timings = StartupTimings::default();

    let step = Instant::now();
    central_repo::ensure_central_repo().context("Failed to create central repo")?;
    timings.ensure_central_repo_ms = step.elapsed().as_millis();

    let db_path = central_repo::db_path();
    let step = Instant::now();
    let store = Arc::new(SkillStore::new(&db_path).context("Failed to initialize database")?);
    timings.open_store_ms = step.elapsed().as_millis();

    let step = Instant::now();
    tool_service::migrate_legacy_tool_keys(&store)
        .map_err(|e| anyhow::anyhow!(e.to_string()))
        .context("Failed to migrate legacy tool keys")?;
    timings.migrate_legacy_tool_keys_ms = step.elapsed().as_millis();

    timings.skill_count = store.get_all_skills().map(|s| s.len()).unwrap_or(0);

    if sync_metadata::metadata_exists() {
        let step = Instant::now();
        let reindexed = sync_metadata::reindex_from_metadata_if_changed(&store)
            .context("Failed to reindex from sync metadata")?;
        if reindexed {
            timings.reindex_from_metadata_ms = Some(step.elapsed().as_millis());
        }
    }

    let step = Instant::now();
    let changed = scenario_service::restore_all_skills_sync_included(&store)
        .map_err(|e| anyhow::anyhow!(e.to_string()))
        .context("Failed to restore skill sync inclusion")?;
    timings.restore_sync_included_ms = step.elapsed().as_millis();
    timings.restore_sync_included_changed = changed;
    if changed {
        let step = Instant::now();
        sync_metadata::write_all_from_db(&store)
            .context("Failed to persist restored skill sync inclusion")?;
        timings.write_all_from_db_ms = Some(step.elapsed().as_millis());
    }

    let step = Instant::now();
    if apply_startup_default {
        scenario_service::ensure_default_startup_scenario(&store)
            .map_err(|e| anyhow::anyhow!(e.to_string()))
            .context("Failed to initialize startup scenario")?;
        timings.apply_scenario_kind = "default_startup";
    } else {
        scenario_service::ensure_cli_scenario_state(&store)
            .map_err(|e| anyhow::anyhow!(e.to_string()))
            .context("Failed to initialize CLI scenario state")?;
        timings.apply_scenario_kind = "cli";
    }
    timings.apply_scenario_ms = step.elapsed().as_millis();

    timings.total_ms = total_start.elapsed().as_millis();
    Ok((store, timings))
}

impl StartupTimings {
    /// Emit a single human-readable log block from the captured timings.
    pub fn log(&self) {
        log::info!(
            "startup: initialize_store total {} ms (skills={})",
            self.total_ms,
            self.skill_count
        );
        log::info!(
            "startup: ensure_central_repo {} ms, open_store {} ms, migrate_legacy_tool_keys {} ms",
            self.ensure_central_repo_ms,
            self.open_store_ms,
            self.migrate_legacy_tool_keys_ms
        );
        if let Some(ms) = self.reindex_from_metadata_ms {
            log::info!(
                "startup: reindex_from_metadata {} ms (skills={})",
                ms,
                self.skill_count
            );
        }
        if self.restore_sync_included_changed {
            log::info!(
                "startup: restore_sync_included changed in {} ms, write_all_from_db {} ms",
                self.restore_sync_included_ms,
                self.write_all_from_db_ms.unwrap_or(0)
            );
        } else {
            log::info!(
                "startup: restore_sync_included no-op in {} ms",
                self.restore_sync_included_ms
            );
        }
        log::info!(
            "startup: apply_scenario ({}) {} ms (skills={})",
            self.apply_scenario_kind,
            self.apply_scenario_ms,
            self.skill_count
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{
        central_repo,
        sync_metadata::{self, SchemaFile, SkillMetaFile, SourceMeta},
    };
    use std::{fs, path::PathBuf, sync::MutexGuard};
    use tempfile::{tempdir, TempDir};

    struct TestRepo {
        _lock: MutexGuard<'static, ()>,
        _tmp: TempDir,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            central_repo::set_test_base_dir_override(None);
        }
    }

    fn test_repo() -> TestRepo {
        let lock = central_repo::test_base_dir_lock();
        let tmp = tempdir().unwrap();
        let base = tmp.path().join("repo");
        central_repo::set_test_base_dir_override(Some(base));
        fs::create_dir_all(central_repo::skills_dir()).unwrap();
        TestRepo {
            _lock: lock,
            _tmp: tmp,
        }
    }

    fn write_json<T: serde::Serialize>(path: PathBuf, value: &T) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut bytes = serde_json::to_vec_pretty(value).unwrap();
        bytes.push(b'\n');
        fs::write(path, bytes).unwrap();
    }

    fn write_skill_dir(name: &str, skill_name: &str) {
        let dir = central_repo::skills_dir().join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {skill_name}\n---\n"),
        )
        .unwrap();
    }

    fn write_metadata_skill(id: &str, path: &str, tags: &[&str]) {
        write_json(
            sync_metadata::metadata_dir().join("schema.json"),
            &SchemaFile {
                schema_version: 1,
                app_min_version: "2.0.0".to_string(),
                created_by: "test".to_string(),
            },
        );
        write_json(
            sync_metadata::metadata_dir()
                .join("skills")
                .join(format!("{id}.json")),
            &SkillMetaFile {
                schema_version: 1,
                skill_id: id.to_string(),
                path: path.to_string(),
                path_key: path.to_string(),
                enabled: true,
                tags: tags.iter().map(|tag| tag.to_string()).collect(),
                source: SourceMeta {
                    source_type: "import".to_string(),
                    ref_: None,
                    subpath: None,
                    branch: None,
                },
            },
        );
    }

    #[test]
    fn initialize_cli_store_skips_metadata_reindex_when_snapshot_unchanged() {
        let _repo = test_repo();
        write_skill_dir("alpha", "Alpha");
        write_metadata_skill("skill-1", "alpha", &[]);

        let (first_store, first_timings) = initialize_store_inner(false).unwrap();
        assert!(first_timings.reindex_from_metadata_ms.is_some());
        assert!(first_store.get_skill_by_id("skill-1").unwrap().is_some());
        drop(first_store);

        let (_second_store, second_timings) = initialize_store_inner(false).unwrap();
        assert!(
            second_timings.reindex_from_metadata_ms.is_none(),
            "unchanged sync metadata should not rebuild the DB on every CLI startup"
        );
    }

    #[test]
    fn initialize_cli_store_reindexes_when_metadata_changes() {
        let _repo = test_repo();
        write_skill_dir("alpha", "Alpha");
        write_metadata_skill("skill-1", "alpha", &[]);

        let (first_store, first_timings) = initialize_store_inner(false).unwrap();
        assert!(first_timings.reindex_from_metadata_ms.is_some());
        drop(first_store);

        write_metadata_skill("skill-1", "alpha", &["changed"]);

        let (second_store, second_timings) = initialize_store_inner(false).unwrap();
        assert!(second_timings.reindex_from_metadata_ms.is_some());
        assert_eq!(
            second_store
                .get_tags_map()
                .unwrap()
                .remove("skill-1")
                .unwrap(),
            vec!["changed".to_string()]
        );
    }

    #[test]
    fn initialize_cli_store_reindexes_when_registered_skill_content_changes() {
        let _repo = test_repo();
        write_skill_dir("alpha", "Alpha");
        write_metadata_skill("skill-1", "alpha", &[]);

        let (first_store, first_timings) = initialize_store_inner(false).unwrap();
        assert!(first_timings.reindex_from_metadata_ms.is_some());
        drop(first_store);

        write_skill_dir("alpha", "Beta Changed");

        let (second_store, second_timings) = initialize_store_inner(false).unwrap();
        assert!(second_timings.reindex_from_metadata_ms.is_some());
        let skill = second_store
            .get_skill_by_id("skill-1")
            .unwrap()
            .expect("skill should still exist");
        assert_eq!(skill.name, "Beta Changed");
    }
}
