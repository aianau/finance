use super::utils::{CacheDB, DB};
use crate::{Handle, Scenario, Storage};
use std::sync::{OnceLock, RwLock};

static GLOBAL_DB: OnceLock<RwLock<DB>> = OnceLock::new();
pub struct RwLockVector {
    cache: CacheDB,
}

impl Scenario for RwLockVector {
    fn create_global(args: &crate::Args) {
        let _ = GLOBAL_DB.set(RwLock::new(DB::new(args.capacity)));
    }

    fn new(args: &crate::Args) -> Self {
        Self {
            cache: CacheDB::new(args.cache_capacity),
        }
    }

    fn write(&mut self, storage: &Storage) -> Handle<Storage> {
        let mut db = GLOBAL_DB.get().unwrap().write().unwrap();
        db.write(storage)
    }

    fn read(&mut self, handle: Handle<Storage>) -> Option<&Storage> {
        let mut index = self.cache.index(handle.clone());
        if index.is_none() {
            let db = GLOBAL_DB.get().unwrap().read().unwrap();
            if let Some(storage) = db.get(handle.clone()) {
                index = Some(self.cache.write(handle.clone(), storage));
            }
        }
        if let Some(index) = index {
            self.cache.get(index)
        } else {
            None
        }
    }
    fn memory_usage(&self) -> usize {
        self.cache.memory_usage()
    }
    fn global_memory_usage() -> usize {
        let db = GLOBAL_DB.get().unwrap().read().unwrap();
        db.memory_usage()
    }
}
