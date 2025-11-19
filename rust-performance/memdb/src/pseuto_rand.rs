pub struct PseudoRand {
    state: u64,
}

impl PseudoRand {
    pub fn new() -> Self {
        Self { state: 0 }
    }

    #[inline(always)]
    fn internal_next(&mut self) -> u32 {
        const A: u64 = 1664525;
        const C: u64 = 1013904223;
        const M: u64 = 1 << 32;

        self.state = (A.wrapping_mul(self.state).wrapping_add(C)) % M;
        (self.state & 0xFFFFFFFF) as u32
    }

    #[inline(always)]
    pub fn next_u8(&mut self) -> u8 {
        (self.internal_next() & 0xFF) as u8
    }

    #[inline(always)]
    pub fn next_int(&mut self, min: u32, max: u32) -> u32 {
        min + self.internal_next() as u32 % (max - min + 1)
    }

}


