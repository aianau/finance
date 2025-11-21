use super::PseudoRand;

#[derive(Clone)]
pub struct Storage {
    data: Vec<u8>,
}

impl Storage {
    pub fn new(capacity: usize) -> Self {
        let mut s = Self { data: Vec::with_capacity(capacity) };
        let mut rng = PseudoRand::new();
        for _ in 0..capacity {
            s.data.push(rng.next_u8());
        }
        s
    }
    pub fn set(&mut self, storage: &Storage) {
        self.data.clear();
        self.data.extend_from_slice(storage.data.as_slice());
    }
    #[inline(always)]
    pub fn len(&self) -> usize {
        self.data.len()
    }
}