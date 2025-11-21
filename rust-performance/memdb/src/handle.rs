use std::{marker::PhantomData, sync::atomic::{AtomicU32, Ordering}};

static GLOBAL_ID: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Handle<T: Sized> {
    index: u32,
    unique_id: u32,
    _marker: PhantomData<T>,
}

impl<T: Sized> Handle<T> {
    pub const INVALID: Self = Self {
        index: u32::MAX,
        unique_id: u32::MAX,
        _marker: PhantomData,
    };
    #[inline(always)]
    pub fn new(index: u32) -> Self {
        let unique_id = GLOBAL_ID.fetch_add(1, Ordering::SeqCst);
        Self {
            index,
            unique_id,
            _marker: PhantomData,
        }
    }
    #[inline(always)]
    pub fn index(&self) -> usize {
        self.index as usize
    }
    #[inline(always)]
    pub fn unique_id(&self) -> u32 {
        self.unique_id
    }
    #[inline(always)]
    pub fn unique_hash(&self) -> u64 {
        (self.unique_id as u64) << 32 | self.index as u64
    }
}
