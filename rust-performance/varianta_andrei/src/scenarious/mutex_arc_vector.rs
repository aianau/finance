use super::utils::ArcDB;
use crate::{Handle, Scenario, Storage};
use std::{hint::black_box, sync::{Mutex, OnceLock}};

static GLOBAL_DB: OnceLock<Mutex<ArcDB>> = OnceLock::new();
pub struct MutexArcVector {}

impl Scenario for MutexArcVector {
    fn create_global(args: &crate::Args) {
        let _ = GLOBAL_DB.set(Mutex::new(ArcDB::new(args.capacity)));
    }

    fn new(_: &crate::Args) -> Self {
        Self {}
    }

    fn write(&mut self, storage: &Storage) -> Handle<Storage> {
        let mut db = GLOBAL_DB.get().unwrap().lock().unwrap();
        db.write(storage)
    }

    fn read(&mut self, handle: Handle<Storage>) -> Option<&Storage> {
        let db = GLOBAL_DB.get().unwrap().lock().unwrap();
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
        let db = GLOBAL_DB.get().unwrap().lock().unwrap();
        db.memory_usage()
    }
}
