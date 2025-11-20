use crate::{Handle, Scenario, Storage};
use moka::sync::Cache;
use std::sync::{Arc, OnceLock};

static GLOBAL_DB: OnceLock<Cache<u64, Arc<Storage>>> = OnceLock::new();

pub struct DoubleMoka {
    cache: Cache<u64, Arc<Storage>>,
    // avem nevoie de o referinta la ultimul item accesat ca sa putem returna o referinta 
    last_accessed: Option<Arc<Storage>>,
}

impl Scenario for DoubleMoka {
    fn create_global(args: &crate::Args) {
        let cache = Cache::builder()
            .max_capacity(args.capacity as u64)
            .build();
        let _ = GLOBAL_DB.set(cache);
    }

    fn new(args: &crate::Args) -> Self {
        let cache = Cache::builder()
            .max_capacity(args.cache_capacity as u64)
            .build();
        Self { 
            cache,
            last_accessed: None,
        }
    }

    fn write(&mut self, storage: &Storage) -> Handle<Storage> {
        let handle = Handle::new(0);
        let global_db = GLOBAL_DB.get().unwrap();
        let arc_storage = Arc::new(storage.clone());
        let hash = handle.unique_hash();
        
        global_db.insert(hash, arc_storage.clone());
        
        handle
    }

    fn read(&mut self, handle: Handle<Storage>) -> Option<&Storage> {
        let hash = handle.unique_hash();
        
        if let Some(arc_storage) = self.cache.get(&hash) {
            self.last_accessed = Some(arc_storage);
            return self.last_accessed.as_ref().map(|arc| arc.as_ref());
        }
        
        let global_db = GLOBAL_DB.get().unwrap();
        if let Some(arc_storage) = global_db.get(&hash) {
            self.cache.insert(hash, arc_storage.clone());
            self.last_accessed = Some(arc_storage);
            return self.last_accessed.as_ref().map(|arc| arc.as_ref());
        }
        
        None
    }

    fn memory_usage(&self) -> usize {
        self.cache.run_pending_tasks();
        let mut total = 0;
        let overhead = std::mem::size_of::<u64>() + std::mem::size_of::<Arc<Storage>>();
        
        for (_key, value) in self.cache.iter() {
            total += value.len() + overhead;
        }
        
        total
    }

    fn global_memory_usage() -> usize {
        let global_db = GLOBAL_DB.get().unwrap();
        global_db.run_pending_tasks();
        
        let mut total = 0;
        let overhead = std::mem::size_of::<u64>() + std::mem::size_of::<Arc<Storage>>();
        
        for (_key, value) in global_db.iter() {
            total += value.len() + overhead;
        }
        
        total
    }
}

