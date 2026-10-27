/** Compatibility entry point. Former hourly benchmarks are retained in git history.
 * Measures the shipped 365-opportunity engine with independent cold replay. */
import {runDailyBenchmark} from "./daily-benchmark";
void runDailyBenchmark().catch(error=>{console.error(error);process.exitCode=1;});
