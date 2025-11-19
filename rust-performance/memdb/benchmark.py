import subprocess
import re
import statistics
import argparse
from dataclasses import dataclass
from typing import List
import csv
from datetime import datetime
import itertools

@dataclass
class BenchmarkResult:
    total_time: float
    exec_time: float
    write_time: float
    read_time: float
    cache_memory: int
    global_memory: int
    events: int
    threads: int
    min_size: int
    max_size: int
    cache_capacity: int
    global_capacity: int
    scenario: str

def parse_output(output: str) -> BenchmarkResult:
    
    scenario_match = re.search(r'Scenario\s+:\s+(\w+)', output)
    scenario = scenario_match.group(1) if scenario_match else "Unknown"
    
    total_time = float(re.search(r'Total test time\s+:\s+(\d+)\s+ms', output).group(1))
    exec_time = float(re.search(r'Execution time\s+:\s+(\d+)\s+ms', output).group(1))
    write_time = float(re.search(r'Write evnt time\s+:\s+(\d+)\s+ms', output).group(1))
    read_time = float(re.search(r'Read evnt time\s+:\s+(\d+)\s+ms', output).group(1))
    
    cache_memory = int(re.search(r'Cache memory usage\s+:\s+([\d,]+)\s+bytes', output).group(1).replace(',', ''))
    global_memory = int(re.search(r'Global memory usage\s+:\s+([\d,]+)\s+bytes', output).group(1).replace(',', ''))
    
    events = int(re.search(r'Events\s+:\s+([\d,]+)\s+events', output).group(1).replace(',', ''))
    threads = int(re.search(r'Threads\s+:\s+(\d+)\s+threads', output).group(1))
    
    size_match = re.search(r'Size between\s+:\s+([\d,]+)\s+and\s+([\d,]+)\s+bytes', output)
    min_size = int(size_match.group(1).replace(',', ''))
    max_size = int(size_match.group(2).replace(',', ''))
    
    cache_capacity = int(re.search(r'Cache capacity\s+:\s+([\d,]+)\s+items', output).group(1).replace(',', ''))
    global_capacity = int(re.search(r'Capacity\s+:\s+([\d,]+)\s+items', output).group(1).replace(',', ''))
    
    return BenchmarkResult(
        total_time=total_time,
        exec_time=exec_time,
        write_time=write_time,
        read_time=read_time,
        cache_memory=cache_memory,
        global_memory=global_memory,
        events=events,
        threads=threads,
        min_size=min_size,
        max_size=max_size,
        cache_capacity=cache_capacity,
        global_capacity=global_capacity,
        scenario=scenario
    )

def run_benchmark(exe_path: str, scenario: str, threads: int = 2, events: int = 100000,
                  min_size: int = 192, max_size: int = 2048, 
                  capacity: int = 1024, cache_capacity: int = 128,
                  read_write_ratio: int = 2) -> str:
    cmd = [
        exe_path,
        '--scenario', scenario,
        '--threads', str(threads),
        '--events', str(events),
        '--min', str(min_size),
        '--max', str(max_size),
        '--capacity', str(capacity),
        '--cache-capacity', str(cache_capacity),
        '--read-write-ratio', str(read_write_ratio)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return result.stdout

def format_number(num: float, decimals: int = 1) -> str:
    if num >= 1000:
        return f"{num:,.{decimals}f}"
    return f"{num:.{decimals}f}"

def main():
    parser = argparse.ArgumentParser(description='Run comprehensive benchmark grid search')
    parser.add_argument('--exe', default='./target/release/memdb_test.exe', 
                       help='Path to executable (default: ./target/release/memdb_test.exe)')
    parser.add_argument('--runs', type=int, default=10,
                       help='Number of runs per configuration (default: 10)')
    parser.add_argument('--output', default='benchmark_results.csv',
                       help='Output CSV file (default: benchmark_results.csv)')
    
    args = parser.parse_args()
    
    # define all parameter combinations
    scenarios = ['mutex-vector', 'rw-lock-vector', 'double-moka', 'mutex-arc-vector', 'rw-lock-arc-vector']
    capacities = [256, 512, 1024, 2048, 4096]
    cache_capacities = [64, 128, 256]
    events_list = [500000]
    threads_list = [6, 10, 12, 16]
    read_write_ratios = [6, 10, 16]
    min_size = 173
    max_size = 3538
    
    # generate all valid combinations (capacity > cache_capacity)
    # order: capacity -> cache_capacity -> events -> threads -> read_write_ratio -> scenarios
    all_combinations = []
    for capacity, cache_capacity, events, threads, read_write_ratio, scenario in itertools.product(
        capacities, cache_capacities, events_list, threads_list, read_write_ratios, scenarios
    ):
        if capacity > cache_capacity:
            all_combinations.append({
                'scenario': scenario,
                'capacity': capacity,
                'cache_capacity': cache_capacity,
                'events': events,
                'threads': threads,
                'read_write_ratio': read_write_ratio,
                'min_size': min_size,
                'max_size': max_size
            })
    
    total_tests = len(all_combinations)
    print(f"Grid Search Benchmark")
    print("=" * 80)
    print(f"Total configurations to test: {total_tests}")
    print(f"Runs per configuration: {args.runs}")
    print(f"Total benchmark runs: {total_tests * args.runs}")
    print(f"Output file: {args.output}")
    print(f"\nParameters:")
    print(f"  Scenarios         : {', '.join(scenarios)}")
    print(f"  Capacities        : {capacities}")
    print(f"  Cache capacities  : {cache_capacities}")
    print(f"  Events            : {events_list}")
    print(f"  Threads           : {threads_list}")
    print(f"  Read/Write ratios : {read_write_ratios}")
    print(f"  Min size          : {min_size}")
    print(f"  Max size          : {max_size}")
    print("=" * 80)
    print()
    
    csv_file = open(args.output, 'w', newline='', encoding='utf-8')
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow([
        'Global', 'Cache', 'Events', 'Threads', 'Read/Write Ratio', 'Scenario',
        'Avg Total Time (ms)', 'Median Total Time (ms)', 'Max Total Time (ms)',
        'Avg Exec Time (ms)', 'Median Exec Time (ms)', 'Max Exec Time (ms)',
        'Avg Write Time (ms)', 'Median Write Time (ms)', 'Max Write Time (ms)',
        'Avg Read Time (ms)', 'Median Read Time (ms)', 'Max Read Time (ms)'
    ])
    
    test_num = 0
    for combo in all_combinations:
        test_num += 1
        print(f"\n[{test_num}/{total_tests}] Testing configuration:")
        print(f"  Scenario         : {combo['scenario']}")
        print(f"  Capacity         : {combo['capacity']}")
        print(f"  Cache capacity   : {combo['cache_capacity']}")
        print(f"  Events           : {combo['events']:,}")
        print(f"  Threads          : {combo['threads']}")
        print(f"  Read/Write ratio : {combo['read_write_ratio']}")
        print(f"  Running {args.runs} iterations...", end=' ', flush=True)
        
        results: List[BenchmarkResult] = []
        
        for i in range(args.runs):
            try:
                output = run_benchmark(
                    args.exe, 
                    combo['scenario'], 
                    combo['threads'], 
                    combo['events'],
                    combo['min_size'], 
                    combo['max_size'], 
                    combo['capacity'], 
                    combo['cache_capacity'],
                    combo['read_write_ratio']
                )
                result = parse_output(output)
                results.append(result)
                print(f".", end='', flush=True)
            except Exception as e:
                print(f"\n  Error on run {i+1}: {e}")
                continue
        
        print()
        
        if not results:
            print("  No successful runs - skipping")
            continue
        
        total_times = [r.total_time for r in results]
        exec_times = [r.exec_time for r in results]
        write_times = [r.write_time for r in results]
        read_times = [r.read_time for r in results]
        
        def calc_stats(values):
            return {
                'median': statistics.median(values),
                'avg': statistics.mean(values),
                'max': max(values)
            }
        
        total_stats = calc_stats(total_times)
        exec_stats = calc_stats(exec_times)
        write_stats = calc_stats(write_times)
        read_stats = calc_stats(read_times)
        
        print(f"  Exec time: Avg={int(exec_stats['avg'])}ms, "
              f"Median={int(exec_stats['median'])}ms, Max={int(exec_stats['max'])}ms")
        
        csv_writer.writerow([
            combo['capacity'],
            combo['cache_capacity'],
            combo['events'],
            combo['threads'],
            combo['read_write_ratio'],
            combo['scenario'],
            int(total_stats['avg']),
            int(total_stats['median']),
            int(total_stats['max']),
            int(exec_stats['avg']),
            int(exec_stats['median']),
            int(exec_stats['max']),
            int(write_stats['avg']),
            int(write_stats['median']),
            int(write_stats['max']),
            int(read_stats['avg']),
            int(read_stats['median']),
            int(read_stats['max'])
        ])
        csv_file.flush()
    
    csv_file.close()
    
    print("\n" + "=" * 80)
    print(f"BENCHMARK COMPLETE!")
    print(f"Results saved to: {args.output}")
    print(f"Total configurations tested: {test_num}")
    print("=" * 80)
    
if __name__ == '__main__':
    main()

