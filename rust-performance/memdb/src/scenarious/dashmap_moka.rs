use crate::{Handle, Scenario, Storage, scenarious::utils::{DBL, DBLItem}};
use dashmap::DashMap;
use moka::sync::Cache;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc, Mutex, OnceLock,
};

struct GlobalDB {
    map: DashMap<u32, (Arc<Storage>, u32)>,
    lru: Mutex<DBL>,
    next_index: AtomicU32,
}

static GLOBAL_DB: OnceLock<GlobalDB> = OnceLock::new();
static GLOBAL_CAPACITY: OnceLock<usize> = OnceLock::new();

pub struct DashMapMoka {
    cache: Cache<u64, Arc<Storage>>,
    last_accessed: Option<Arc<Storage>>,
}

impl Scenario for DashMapMoka {
    fn create_global(args: &crate::Args) {
        let global_db = GlobalDB {
            map: DashMap::with_capacity(args.capacity),
            lru: Mutex::new(DBL::new(args.capacity)),
            next_index: AtomicU32::new(0),
        };
        let _ = GLOBAL_DB.set(global_db);
        let _ = GLOBAL_CAPACITY.set(args.capacity);
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
        let db = GLOBAL_DB.get().unwrap();
        let capacity = *GLOBAL_CAPACITY.get().unwrap();
        
        let mut lru = db.lru.lock().unwrap();
        
        let index = if db.map.len() >= capacity {
            let evict_index = lru.pop().unwrap();
            drop(lru);
            db.map.remove(&evict_index);
            lru = db.lru.lock().unwrap();
            evict_index
        } else {
            db.next_index.fetch_add(1, Ordering::Relaxed)
        };
        
        let handle = Handle::new(index);
        let arc_storage = Arc::new(storage.clone());
        
        lru.push(index);
        drop(lru);
        db.map.insert(index, (arc_storage, handle.unique_id()));
        handle
    }

    fn read(&mut self, handle: Handle<Storage>) -> Option<&Storage> {
        let hash = handle.unique_hash();
        let index = handle.index() as u32;
        
        if let Some(arc_storage) = self.cache.get(&hash) {
            self.last_accessed = Some(arc_storage);
            return self.last_accessed.as_ref().map(|arc| arc.as_ref());
        }
        
        let db = GLOBAL_DB.get().unwrap();
        if let Some(entry) = db.map.get(&index) {
            let (arc_storage, stored_unique_id) = entry.value();
            
            if *stored_unique_id != handle.unique_id() {
                return None;
            }
            
            let storage_clone = arc_storage.clone();
            drop(entry);
            
            self.cache.insert(hash, storage_clone.clone());
            self.last_accessed = Some(storage_clone);
            
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
        let db = GLOBAL_DB.get().unwrap();
        let mut total = 0;
        
        for entry in db.map.iter() {
            let (arc_storage, _unique_id) = entry.value();
            total += arc_storage.len();
            total += std::mem::size_of::<u32>();
            total += std::mem::size_of::<Arc<Storage>>();
            total += std::mem::size_of::<u32>();
        }
        
        let capacity = *GLOBAL_CAPACITY.get().unwrap();
        total += capacity * std::mem::size_of::<DBLItem>();
        
        total
    }
}
