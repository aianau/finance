mod handle;
mod pseuto_rand;
mod scenario;
mod scenarious;
mod storage;

use clap::{Parser, ValueEnum};
use handle::Handle;
use pseuto_rand::PseudoRand;
use scenario::Scenario;
use std::hint::black_box;
use std::{
    thread,
    time::{Duration, Instant},
};
use storage::Storage;

#[derive(Debug, Default, Copy, Clone, ValueEnum)]
pub enum ScenarioType {
    #[default]
    MutexVector,
    RwLockVector,
    MutexArcVector,
    RwLockArcVector,
    DoubleMoka,
    DashMapMoka,
    PapayaMoka,
    FlurryMoka,
}

#[derive(clap::Parser)]
#[command(name = "memdb_test", disable_help_subcommand = true)]
pub struct Args {
    #[arg(long, default_value_t = 192, global = true)]
    pub min: u32,
    #[arg(long, default_value_t = 2048, global = true)]
    pub max: u32,
    #[arg(long, default_value_t = 2, global = true)]
    pub threads: u32,
    #[arg(long, default_value_t = 100000, global = true)]
    pub events: u32,
    #[arg(long, value_enum, default_value_t = ScenarioType::default(), global = true)]
    pub scenario: ScenarioType,
    #[arg(long, default_value_t = 1024, global = true)]
    pub capacity: usize,
    #[arg(long, default_value_t = 128, global = true)]
    pub cache_capacity: usize,
    #[arg(long, default_value_t = 2, global = true)]
    pub read_write_ratio: u32,
}

fn size_to_string(n: u64) -> String {
    let mut s = n.to_string();
    let mut out = String::new();
    let chars: Vec<char> = s.chars().rev().collect();
    for (i, c) in chars.iter().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(*c);
    }
    s = out.chars().rev().collect();
    s
}

fn run<T>(scenario: &mut T, events: u32, min: u32, max: u32, nr_reads: u32) -> (Duration, Duration)
where
    T: Scenario + Send + Sync + 'static,
{
    // generez evenimente random
    let mut rng = PseudoRand::new();
    let mut temp_vec = Vec::with_capacity(events as usize);
    let mut r = PseudoRand::new();
    let mut exec_time = Duration::ZERO;
    let mut write_time = Duration::ZERO;
    for _ in 0..events {
        let event_size = rng.next_int(min, max) as usize;
        let storage = Storage::new(event_size);
        // 1. scriu evenimntul si primesc un handle
        let start = Instant::now();
        let handle = black_box(scenario.write(&storage));
        write_time += start.elapsed();
        // 2. citesc evenimntul si verific daca este corect
        black_box(scenario.read(handle.clone()));
        temp_vec.push(handle);
        // citesc ceva cu o anumita probabilitate
        for _ in 0..nr_reads {
            let p = (r.next_int(0, 10000) as f64) / 10000.0;
            let p = p.powf(0.2);
            let idx = ((p * temp_vec.len() as f64) as usize).clamp(0, temp_vec.len() - 1);
            // handle to read
            let hread = temp_vec[idx].clone();
            black_box(scenario.read(hread));
        }
        exec_time += start.elapsed();
    }
    (exec_time, write_time)
}

fn run_scenario<T>(args: &Args)
where
    T: Scenario + Send + Sync + 'static,
{
    //println!("Running scenario: {}", T::name());
    T::create_global(args);
    let mut th = Vec::with_capacity(args.threads as usize);
    let events = args.events / args.threads;
    let min = args.min;
    let max = args.max;
    let read_write_ratio = args.read_write_ratio;
    let start = Instant::now();
    for _ in 0..args.threads {
        let mut scenario = T::new(args);
        th.push(thread::spawn(move || {
            let (duration, write_time) = black_box(run(&mut scenario, events, min, max, read_write_ratio));
            (duration, write_time, scenario.memory_usage())
        }));
    }
    let mut total_usage = 0;
    let mut exec_duration = Duration::ZERO;
    let mut write_duration = Duration::ZERO;
    for th in th {
        let (duration, write_time, usage) = th.join().unwrap();
        exec_duration += duration;
        write_duration += write_time;
        total_usage += usage;
    }
    exec_duration = exec_duration / args.threads as u32;
    write_duration = write_duration / args.threads as u32;
    let duration = start.elapsed();
    println!("Scenario            : {:?}", args.scenario);
    println!("=============================================================");
    println!("Total test time     : {} ms", duration.as_millis());
    println!("Execution time      : {} ms", exec_duration.as_millis());
    println!(" ├──Write evnt time : {} ms", write_duration.as_millis());
    println!(" ├──Read evnt time  : {} ms", (exec_duration - write_duration).as_millis());
    println!(" └──Read/Write ratio: {}", read_write_ratio);
    println!("Cache memory usage  : {} bytes",size_to_string(total_usage as u64));
    println!(" └──Cache capacity  : {} items",size_to_string(args.cache_capacity as u64));
    println!("Global memory usage : {} bytes",size_to_string(T::global_memory_usage() as u64));
    println!(" └──Capacity        : {} items",size_to_string(args.capacity as u64));
    println!("Events              : {} events",size_to_string(args.events as u64));
    println!(" └──Size between    : {} and {} bytes", size_to_string(min as u64), size_to_string(max as u64));
    println!("Threads             : {} threads", args.threads);
}

fn main() {
    let args = Args::parse();
    match args.scenario {
        ScenarioType::MutexVector => run_scenario::<scenarious::MutexVector>(&args),
        ScenarioType::RwLockVector => run_scenario::<scenarious::RwLockVector>(&args),
        ScenarioType::MutexArcVector => run_scenario::<scenarious::MutexArcVector>(&args),
        ScenarioType::DoubleMoka => run_scenario::<scenarious::DoubleMoka>(&args),
        ScenarioType::DashMapMoka => run_scenario::<scenarious::DashMapMoka>(&args),
        ScenarioType::PapayaMoka => run_scenario::<scenarious::PapayaMoka>(&args),
        ScenarioType::FlurryMoka => run_scenario::<scenarious::FlurryMoka>(&args),
        ScenarioType::RwLockArcVector => run_scenario::<scenarious::RwLockArcVector>(&args),
        //_ => panic!("Unknown scenario: {:?}", args.scenario),
    }
}
