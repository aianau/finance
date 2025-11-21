use std::{collections::HashMap, sync::Arc};

use crate::{Handle, Storage};

#[derive(Copy, Clone)]

pub struct DBLItem {
    next: u32,
    prec: u32,
}

pub struct DBL {
    first: u32,
    last: u32,
    items: Vec<DBLItem>,
}

impl DBL {
    const INVALID_INDEX: u32 = u32::MAX;
    const INVALID_ITEM: DBLItem = DBLItem {
        next: Self::INVALID_INDEX,
        prec: Self::INVALID_INDEX,
    };
    pub fn new(capacity: usize) -> Self {
        let mut items = Vec::with_capacity(capacity);
        items.resize(capacity, Self::INVALID_ITEM);
        Self {
            first: Self::INVALID_INDEX,
            last: Self::INVALID_INDEX,
            items,
        }
    }
    pub fn push(&mut self, index: u32) {
        let idx = index as usize;
        if idx >= self.items.len() {
            return;
        }
        if self.first == Self::INVALID_INDEX {
            self.first = index;
            self.last = index;
            self.items[idx] = Self::INVALID_ITEM; // no next or prec
        } else {
            self.items[idx].next = self.first;
            self.items[idx].prec = Self::INVALID_INDEX;
            self.items[self.first as usize].prec = index;
            self.first = index;
        }
    }
    pub fn pop(&mut self) -> Option<u32> {
        if self.last == Self::INVALID_INDEX {
            return None;
        }
        let index = self.last;
        self.last = self.items[index as usize].prec;
        if self.last == Self::INVALID_INDEX {
            self.first = Self::INVALID_INDEX;
        } else {
            self.items[self.last as usize].next = Self::INVALID_INDEX;
        }
        self.items[index as usize] = Self::INVALID_ITEM; // no next or prec
        Some(index)
    }
}

struct Item {
    handle: Handle<Storage>,
    data: Storage,
}

pub struct DB {
    data: Vec<Item>,
    lru: DBL,
}

impl DB {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
            lru: DBL::new(capacity),
        }
    }
    pub fn get(&self, handle: Handle<Storage>) -> Option<&Storage> {
        let index = handle.index();
        if index >= self.data.len() {
            return None;
        }
        let ref_item = &self.data[index];
        if ref_item.handle.unique_id() != handle.unique_id() {
            return None;
        }
        Some(&ref_item.data)
    }
    pub fn write(&mut self, data: &Storage) -> Handle<Storage> {
        let index = if self.data.len() >= self.data.capacity() {
            // remove last item from LRU
            self.lru.pop().unwrap()
        } else {
            // use the last free item
            let index = self.data.len() as u32;
            self.data.push(Item {
                handle: Handle::INVALID,
                data: Storage::new(0),
            });
            index
        };
        let h: Handle<Storage> = Handle::new(index);
        let item = &mut self.data[index as usize];
        item.handle = h.clone();
        item.data.set(&data);
        self.lru.push(index);
        h
    }
    pub fn memory_usage(&self) -> usize {
        let mut sz = 0;
        for item in &self.data {
            sz += item.data.len();
        }
        sz += self.lru.items.len() * std::mem::size_of::<DBLItem>();
        sz += self.data.len() * std::mem::size_of::<Item>();
        sz
    }
}

pub struct CacheDB {
    data: Vec<Item>,
    lru: DBL,    
    map: HashMap<u64, u32>,
}
impl CacheDB {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
            lru: DBL::new(capacity),
            map: HashMap::with_capacity(capacity),
        }
    }
    #[inline(always)]
    pub fn index(&self, handle: Handle<Storage>) -> Option<usize> {
        let hash = handle.unique_hash();
        self.map.get(&hash).map(|index| *index as usize)
    }
    #[inline(always)]
    pub fn get(&self, index: usize) -> Option<&Storage> {
        self.data.get(index).map(|item| &item.data)
    }
    pub fn write(&mut self, handle:Handle<Storage>,data: &Storage) -> usize {
        let index = if self.data.len() >= self.data.capacity() {
            // remove last item from LRU
            let idx = self.lru.pop().unwrap();
            // remove from map
            let h = self.data[idx as usize].handle.unique_hash();
            self.map.remove(&h);
            idx
        } else {
            let index = self.data.len() as u32;
            self.data.push(Item {
                handle: Handle::INVALID,
                data: Storage::new(0),
            });
            index
        };
        self.map.insert(handle.unique_hash(), index as u32);
        let item = &mut self.data[index as usize];
        item.handle = handle;
        item.data.set(&data);
        self.lru.push(index);
        index as usize
    }
    pub fn memory_usage(&self) -> usize {
        let mut sz = 0;
        for item in &self.data {
            sz += item.data.len();
        }
        sz += self.lru.items.len() * std::mem::size_of::<DBLItem>();
        sz += self.data.len() * std::mem::size_of::<Item>();
        sz += self.map.len() * (std::mem::size_of::<u64>() + std::mem::size_of::<u32>());
        sz
    }
}


struct ArcItem {
    handle: Handle<Storage>,
    data: Arc<Storage>,
}
pub struct ArcDB {
    data: Vec<ArcItem>,
    lru: DBL,
}

impl ArcDB {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
            lru: DBL::new(capacity),
        }
    }
    pub fn get(&self, handle: Handle<Storage>) -> Option<Arc<Storage>> {
        let index = handle.index();
        if index >= self.data.len() {
            return None;
        }
        let ref_item = &self.data[index];
        if ref_item.handle.unique_id() != handle.unique_id() {
            return None;
        }
        Some(ref_item.data.clone())
    }
    pub fn write(&mut self, data: &Storage) -> Handle<Storage> {
        let index = if self.data.len() >= self.data.capacity() {
            // remove last item from LRU
            self.lru.pop().unwrap()
        } else {
            // use the last free item
            let index = self.data.len() as u32;
            self.data.push(ArcItem {
                handle: Handle::INVALID,
                data: Arc::new(Storage::new(0)),
            });
            index
        };
        let h: Handle<Storage> = Handle::new(index);
        let item = &mut self.data[index as usize];
        item.handle = h.clone();
        item.data = Arc::new(data.clone());
        self.lru.push(index);
        h
    }
    pub fn memory_usage(&self) -> usize {
        let mut sz = 0;
        for item in &self.data {
            sz += item.data.len();
        }
        sz += self.lru.items.len() * std::mem::size_of::<DBLItem>();
        sz += self.data.len() * std::mem::size_of::<ArcItem>();
        sz
    }
}



#[test]
fn check_lru() {
    let mut lru = DBL::new(10);
    lru.push(0);
    lru.push(1);
    lru.push(2);
    lru.push(3);
    lru.push(4);
    lru.push(5);
    lru.push(6);
    lru.push(7);
    lru.push(8);
    lru.push(9);
    assert_eq!(lru.pop(), Some(0));
    assert_eq!(lru.pop(), Some(1));
    assert_eq!(lru.pop(), Some(2));
    assert_eq!(lru.pop(), Some(3));
    assert_eq!(lru.pop(), Some(4));
    assert_eq!(lru.pop(), Some(5));
    assert_eq!(lru.pop(), Some(6));
    assert_eq!(lru.pop(), Some(7));
    assert_eq!(lru.pop(), Some(8));
    assert_eq!(lru.pop(), Some(9));
    assert_eq!(lru.pop(), None);
    lru.push(0);
    lru.push(1);
    lru.push(2);
    assert_eq!(lru.pop(), Some(0));
    lru.push(0);
    assert_eq!(lru.pop(), Some(1));
    assert_eq!(lru.pop(), Some(2));
    assert_eq!(lru.pop(), Some(0));
    assert_eq!(lru.pop(), None);
}


