// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Interface with SQL databases through [sqlx](https://github.com/launchbadge/sqlx). It supports the `sqlite`, `mysql` and `postgres` drivers, enabled by a Cargo feature.

#![doc(
    html_logo_url = "https://github.com/tauri-apps/tauri/raw/dev/app-icon.png",
    html_favicon_url = "https://github.com/tauri-apps/tauri/raw/dev/app-icon.png"
)]

mod commands;
mod decode;
mod error;
mod wrapper;

pub use error::Error;
pub use wrapper::DbPool;

use futures_core::future::BoxFuture;
use serde::{Deserialize, Serialize};
use sqlx::{
    error::BoxDynError,
    migrate::{Migration as SqlxMigration, MigrationSource, MigrationType, Migrator},
};
use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    Manager, RunEvent, Runtime,
};
use tokio::sync::{Mutex, RwLock};

use std::collections::HashMap;

#[derive(Default)]
pub struct DbInstances(pub RwLock<HashMap<String, DbPool>>);

#[derive(Serialize)]
#[serde(untagged)]
pub(crate) enum LastInsertId {
    #[cfg(feature = "sqlite")]
    Sqlite(i64),
    #[cfg(feature = "mysql")]
    MySql(u64),
    #[cfg(feature = "postgres")]
    Postgres(()),
    #[cfg(not(any(feature = "sqlite", feature = "mysql", feature = "postgres")))]
    None,
}

struct Migrations(Mutex<HashMap<String, MigrationList>>);

#[derive(Default, Clone, Deserialize)]
pub struct PluginConfig {
    #[serde(default)]
    preload: Vec<String>,
}

#[derive(Debug)]
pub enum MigrationKind {
    Up,
    Down,
}

impl From<MigrationKind> for MigrationType {
    fn from(kind: MigrationKind) -> Self {
        match kind {
            MigrationKind::Up => Self::ReversibleUp,
            MigrationKind::Down => Self::ReversibleDown,
        }
    }
}

/// A migration definition.
#[derive(Debug)]
pub struct Migration {
    pub version: i64,
    pub description: &'static str,
    pub sql: &'static str,
    pub kind: MigrationKind,
}

#[derive(Debug)]
struct MigrationList(Vec<Migration>);

// Fluely's legacy profile may contain versions from an older released app.
// Never forge/delete that ledger. Known versions must still match checksums.
pub fn compatible_migrator(db_url:&str,mut migrator:Migrator)->Migrator{
    if db_url=="sqlite:pluely.db"{migrator.set_ignore_missing(true);}migrator
}

impl MigrationSource<'static> for MigrationList {
    fn resolve(self) -> BoxFuture<'static, std::result::Result<Vec<SqlxMigration>, BoxDynError>> {
        Box::pin(async move {
            let mut migrations = Vec::new();
            for migration in self.0 {
                if matches!(migration.kind, MigrationKind::Up) {
                    migrations.push(SqlxMigration::new(
                        migration.version,
                        migration.description.into(),
                        migration.kind.into(),
                        migration.sql.into(),
                        false,
                    ));
                }
            }
            Ok(migrations)
        })
    }
}

/// Allows blocking on async code without creating a nested runtime.
fn run_async_command<F: std::future::Future>(cmd: F) -> F::Output {
    if tokio::runtime::Handle::try_current().is_ok() {
        tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(cmd))
    } else {
        tauri::async_runtime::block_on(cmd)
    }
}

/// Tauri SQL plugin builder.
#[derive(Default)]
pub struct Builder {
    migrations: Option<HashMap<String, MigrationList>>,
}

impl Builder {
    pub fn new() -> Self {
        #[cfg(not(any(feature = "sqlite", feature = "mysql", feature = "postgres")))]
        eprintln!("No sql driver enabled. Please set at least one of the \"sqlite\", \"mysql\", \"postgres\" feature flags.");

        Self::default()
    }

    /// Add migrations to a database.
    #[must_use]
    pub fn add_migrations(mut self, db_url: &str, migrations: Vec<Migration>) -> Self {
        self.migrations
            .get_or_insert(Default::default())
            .insert(db_url.to_string(), MigrationList(migrations));
        self
    }

    pub fn build<R: Runtime>(mut self) -> TauriPlugin<R, Option<PluginConfig>> {
        PluginBuilder::<R, Option<PluginConfig>>::new("sql")
            .invoke_handler(tauri::generate_handler![
                commands::load,
                commands::execute,
                commands::select,
                commands::close
            ])
            .setup(|app, api| {
                let config = api.config().clone().unwrap_or_default();

                run_async_command(async move {
                    let instances = DbInstances::default();
                    let mut lock = instances.0.write().await;

                    for db in config.preload {
                        let pool = DbPool::connect(&db, app).await?;

                        if let Some(migrations) =
                            self.migrations.as_mut().and_then(|mm| mm.remove(&db))
                        {
                            let migrator = compatible_migrator(&db,Migrator::new(migrations).await?);
                            pool.migrate(&migrator).await?;
                        }

                        lock.insert(db, pool);
                    }
                    drop(lock);

                    app.manage(instances);
                    app.manage(Migrations(Mutex::new(
                        self.migrations.take().unwrap_or_default(),
                    )));

                    Ok(())
                })
            })
            .on_event(|app, event| {
                if let RunEvent::Exit = event {
                    run_async_command(async move {
                        let instances = &*app.state::<DbInstances>();
                        let instances = instances.0.read().await;
                        for value in instances.values() {
                            value.close().await;
                        }
                    });
                }
            })
            .build()
    }
}

#[cfg(all(test,feature="sqlite"))]
mod compatibility_tests {
    use super::*;
    fn migrations(extra:bool,changed:bool)->MigrationList{
        let mut versions=vec![Migration{version:1,description:"one",kind:MigrationKind::Up,sql:if changed{"CREATE TABLE known(changed TEXT);"}else{"CREATE TABLE known(value TEXT);"}},Migration{version:2,description:"two",kind:MigrationKind::Up,sql:"INSERT INTO known(value) VALUES('preserved');"}];
        if extra{versions.push(Migration{version:3,description:"released_extra",kind:MigrationKind::Up,sql:"CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES('also preserved');"});}MigrationList(versions)
    }
    #[test]
    fn missing_legacy_version_preserves_ledger_schema_and_data_but_enforces_known_checksums(){
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async{
            let pool=sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
            Migrator::new(migrations(true,false)).await.unwrap().run(&pool).await.unwrap();
            let checksum:Vec<u8>=sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version=3").fetch_one(&pool).await.unwrap();
            let result=compatible_migrator("sqlite:pluely.db",Migrator::new(migrations(false,false)).await.unwrap()).run(&pool).await;
            assert!(result.is_ok(),"Legacy migration must remain compatible: {result:?}");
            assert_eq!(sqlx::query_scalar::<_,String>("SELECT value FROM legacy").fetch_one(&pool).await.unwrap(),"also preserved");
            assert_eq!(sqlx::query_scalar::<_,String>("SELECT value FROM known").fetch_one(&pool).await.unwrap(),"preserved");
            assert_eq!(sqlx::query_scalar::<_,Vec<u8>>("SELECT checksum FROM _sqlx_migrations WHERE version=3").fetch_one(&pool).await.unwrap(),checksum);
            assert!(compatible_migrator("sqlite:pluely.db",Migrator::new(migrations(false,true)).await.unwrap()).run(&pool).await.is_err());
            assert!(compatible_migrator("sqlite:other.db",Migrator::new(migrations(false,false)).await.unwrap()).run(&pool).await.is_err());
            pool.close().await;
        });
    }
}
