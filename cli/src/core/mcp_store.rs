use anyhow::Result;
use rusqlite::params;
use serde::Serialize;

use super::skill_store::SkillStore;

#[derive(Debug, Clone, Serialize)]
pub struct McpServerRecord {
    pub id: String,
    pub name: String,
    pub content: String,
    pub central_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl SkillStore {
    // ── MCP servers CRUD ──

    pub fn insert_mcp_server(&self, server: &McpServerRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO mcp_servers (id, name, content, central_path, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                server.id,
                server.name,
                server.content,
                server.central_path,
                server.description,
                server.created_at,
                server.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_mcp_server_content(
        &self,
        id: &str,
        content: &str,
        updated_at: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE mcp_servers SET content = ?1, updated_at = ?2 WHERE id = ?3",
            params![content, updated_at, id],
        )?;
        if changed == 0 {
            anyhow::bail!("mcp server not found: {id}");
        }
        Ok(())
    }

    pub fn update_mcp_server_description(
        &self,
        id: &str,
        description: Option<&str>,
        updated_at: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE mcp_servers SET description = ?1, updated_at = ?2 WHERE id = ?3",
            params![description, updated_at, id],
        )?;
        if changed == 0 {
            anyhow::bail!("mcp server not found: {id}");
        }
        Ok(())
    }

    pub fn get_all_mcp_servers(&self) -> Result<Vec<McpServerRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, central_path, description, created_at, updated_at
             FROM mcp_servers
             ORDER BY name",
        )?;
        let rows = stmt.query_map([], map_mcp_row)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_mcp_server_by_id(&self, id: &str) -> Result<Option<McpServerRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, central_path, description, created_at, updated_at
             FROM mcp_servers WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], map_mcp_row)?;
        Ok(rows.next().transpose()?)
    }

    pub fn get_mcp_server_by_name(&self, name: &str) -> Result<Option<McpServerRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, central_path, description, created_at, updated_at
             FROM mcp_servers WHERE name = ?1",
        )?;
        let mut rows = stmt.query_map(params![name], map_mcp_row)?;
        Ok(rows.next().transpose()?)
    }

    pub fn delete_mcp_server(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM mcp_servers WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Scenario ↔ MCP membership ──

    pub fn add_mcp_to_scenario(&self, scenario_id: &str, mcp_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT OR IGNORE INTO scenario_mcp_servers (scenario_id, mcp_id, added_at)
             VALUES (?1, ?2, ?3)",
            params![scenario_id, mcp_id, now],
        )?;
        Ok(())
    }

    pub fn remove_mcp_from_scenario(&self, scenario_id: &str, mcp_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM scenario_mcp_servers WHERE scenario_id = ?1 AND mcp_id = ?2",
            params![scenario_id, mcp_id],
        )?;
        Ok(())
    }

    pub fn get_mcp_ids_for_scenario(&self, scenario_id: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT mcp_id FROM scenario_mcp_servers
             WHERE scenario_id = ?1
             ORDER BY added_at",
        )?;
        let rows = stmt.query_map(params![scenario_id], |row| row.get::<_, String>(0))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_mcp_servers_for_scenario(
        &self,
        scenario_id: &str,
    ) -> Result<Vec<McpServerRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT m.id, m.name, m.content, m.central_path, m.description, m.created_at, m.updated_at
             FROM mcp_servers m
             INNER JOIN scenario_mcp_servers sm ON m.id = sm.mcp_id
             WHERE sm.scenario_id = ?1
             ORDER BY m.name",
        )?;
        let rows = stmt.query_map(params![scenario_id], map_mcp_row)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_scenarios_for_mcp(&self, mcp_id: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT scenario_id FROM scenario_mcp_servers WHERE mcp_id = ?1",
        )?;
        let rows = stmt.query_map(params![mcp_id], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn is_mcp_in_scenario(&self, scenario_id: &str, mcp_id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM scenario_mcp_servers
             WHERE scenario_id = ?1 AND mcp_id = ?2",
            params![scenario_id, mcp_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

fn map_mcp_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<McpServerRecord> {
    Ok(McpServerRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        content: row.get(2)?,
        central_path: row.get(3)?,
        description: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::skill_store::ScenarioRecord;
    use tempfile::tempdir;

    fn test_store() -> (tempfile::TempDir, SkillStore) {
        let tmp = tempdir().unwrap();
        let db = tmp.path().join("test.db");
        let store = SkillStore::new(&db).unwrap();
        (tmp, store)
    }

    fn insert_scenario(store: &SkillStore, id: &str, name: &str) {
        let now = 1_i64;
        store
            .insert_scenario(&ScenarioRecord {
                id: id.to_string(),
                name: name.to_string(),
                description: None,
                icon: None,
                sort_order: 0,
                created_at: now,
                updated_at: now,
            })
            .unwrap();
    }

    #[test]
    fn insert_and_get_mcp_server() {
        let (_tmp, store) = test_store();
        let rec = McpServerRecord {
            id: "m1".into(),
            name: "weather".into(),
            content: "[mcp_servers.weather]\ncommand = \"python\"\n".into(),
            central_path: "/tmp/weather.toml".into(),
            description: Some("Weather demo".into()),
            created_at: 1,
            updated_at: 1,
        };
        store.insert_mcp_server(&rec).unwrap();
        let got = store.get_mcp_server_by_name("weather").unwrap().unwrap();
        assert_eq!(got.id, "m1");
        assert_eq!(got.content, rec.content);
    }

    #[test]
    fn membership_cascade_on_delete() {
        let (_tmp, store) = test_store();
        insert_scenario(&store, "s1", "Default");
        store
            .insert_mcp_server(&McpServerRecord {
                id: "m1".into(),
                name: "weather".into(),
                content: "x".into(),
                central_path: "/tmp/x".into(),
                description: None,
                created_at: 1,
                updated_at: 1,
            })
            .unwrap();
        store.add_mcp_to_scenario("s1", "m1").unwrap();
        assert!(store.is_mcp_in_scenario("s1", "m1").unwrap());
        store.delete_mcp_server("m1").unwrap();
        assert!(!store.is_mcp_in_scenario("s1", "m1").unwrap());
        assert!(store.get_mcp_servers_for_scenario("s1").unwrap().is_empty());
    }

    #[test]
    fn list_servers_for_scenario_ordered_by_name() {
        let (_tmp, store) = test_store();
        insert_scenario(&store, "s1", "Default");
        for (id, name) in [("m2", "zeta"), ("m1", "alpha")] {
            store
                .insert_mcp_server(&McpServerRecord {
                    id: id.into(),
                    name: name.into(),
                    content: "x".into(),
                    central_path: format!("/tmp/{name}"),
                    description: None,
                    created_at: 1,
                    updated_at: 1,
                })
                .unwrap();
            store.add_mcp_to_scenario("s1", id).unwrap();
        }
        let names: Vec<_> = store
            .get_mcp_servers_for_scenario("s1")
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect();
        assert_eq!(names, vec!["alpha", "zeta"]);
    }
}
