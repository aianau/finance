use super::utils::ArcDB;
use crate::{Handle, Scenario, Storage};
use std::{hint::black_box, sync::{OnceLock, RwLock}};

static GLOBAL_DB: OnceLock<RwLock<ArcDB>> = OnceLock::new();
pub struct RwLockArcVector {}

impl Scenario for RwLockArcVector {
    fn create_global(args: &crate::Args) {
        let _ = GLOBAL_DB.set(RwLock::new(ArcDB::new(args.capacity)));
    }

    fn new(_: &crate::Args) -> Self {
        Self {}
    }

    fn write(&mut self, storage: &Storage) -> Handle<Storage> {
        let mut db = GLOBAL_DB.get().unwrap().write().unwrap();
        db.write(storage)
    }

    fn read(&mut self, handle: Handle<Storage>) -> Option<&Storage> {
        let db = GLOBAL_DB.get().unwrap().read().unwrap();
        let arc = black_box(db.get(handle.clone()));
        black_box(&arc);
        if arc.is_some() {
            black_box(None)
        } else {
            None
        }
    }
    fn memory_usage(&self) -> usize {
        0
    }
    fn global_memory_usage() -> usize {
        let db = GLOBAL_DB.get().unwrap().read().unwrap();
        db.memory_usage()
    }
}
