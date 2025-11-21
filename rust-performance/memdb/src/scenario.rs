use crate::Args;
use super::Storage;
use super::Handle;

pub trait Scenario {
    fn create_global(args: &Args);
    fn new(args: &Args) -> Self;
    fn write(&mut self, storage: &Storage) -> Handle<Storage>;
    fn read(&mut self, handle: Handle<Storage>) -> Option<&Storage>;
    fn memory_usage(&self) -> usize;
    fn global_memory_usage() -> usize;
}