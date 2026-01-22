#!/usr/bin/env node

/**
 * Performance benchmark comparing two Intl.NumberFormat approaches:
 * 1. Current: Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(price)
 * 2. Currency style: Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
 */

const ITERATIONS = 100000;
const WARMUP_ITERATIONS = 1000;

// Sample prices to test with
const testPrices = [
  1234.56,
  999.99,
  1000.00,
  0.50,
  1234567.89,
  10.5,
  99.999,
  0.01,
  1000000,
  42.424242
];

function formatCurrent(price) {
  return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(price);
}

function formatCurrency(price) {
  return Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
}

function benchmark(fn, prices, iterations) {
  const start = process.hrtime.bigint();
  
  for (let i = 0; i < iterations; i++) {
    const price = prices[i % prices.length];
    fn(price);
  }
  
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000; // Convert to milliseconds
}

// Warmup
console.log('Warming up...');
benchmark(formatCurrent, testPrices, WARMUP_ITERATIONS);
benchmark(formatCurrency, testPrices, WARMUP_ITERATIONS);

// Run benchmarks
console.log(`\nRunning ${ITERATIONS.toLocaleString()} iterations...\n`);

const currentTimes = [];
const currencyTimes = [];

const runs = 10; // Run 10 times and average

for (let run = 0; run < runs; run++) {
  const currentTime = benchmark(formatCurrent, testPrices, ITERATIONS);
  const currencyTime = benchmark(formatCurrency, testPrices, ITERATIONS);
  
  currentTimes.push(currentTime);
  currencyTimes.push(currencyTime);
  
  process.stdout.write(`Run ${run + 1}/${runs}...\r`);
}

process.stdout.write('\n');

// Calculate averages
const avgCurrent = currentTimes.reduce((a, b) => a + b, 0) / runs;
const avgCurrency = currencyTimes.reduce((a, b) => a + b, 0) / runs;

// Calculate stats
const currentMin = Math.min(...currentTimes);
const currentMax = Math.max(...currentTimes);
const currencyMin = Math.min(...currencyTimes);
const currencyMax = Math.max(...currencyTimes);

// Calculate standard deviation
function stdDev(values, mean) {
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

const currentStdDev = stdDev(currentTimes, avgCurrent);
const currencyStdDev = stdDev(currencyTimes, avgCurrency);

// Results
console.log('='.repeat(70));
console.log('PERFORMANCE BENCHMARK RESULTS');
console.log('='.repeat(70));
console.log(`\nTest Configuration:`);
console.log(`  Iterations per run: ${ITERATIONS.toLocaleString()}`);
console.log(`  Number of runs: ${runs}`);
console.log(`  Total operations: ${(ITERATIONS * runs).toLocaleString()}`);
console.log(`  Test prices: ${testPrices.length} different values`);

console.log(`\n${'─'.repeat(70)}`);
console.log('Current Method (maximumFractionDigits: 2)');
console.log(`${'─'.repeat(70)}`);
console.log(`  Average time: ${avgCurrent.toFixed(4)} ms`);
console.log(`  Min time:     ${currentMin.toFixed(4)} ms`);
console.log(`  Max time:     ${currentMax.toFixed(4)} ms`);
console.log(`  Std Dev:      ${currentStdDev.toFixed(4)} ms`);
console.log(`  Avg per op:   ${(avgCurrent / ITERATIONS * 1000).toFixed(6)} μs`);

console.log(`\n${'─'.repeat(70)}`);
console.log('Currency Style Method (style: currency, currency: BRL)');
console.log(`${'─'.repeat(70)}`);
console.log(`  Average time: ${avgCurrency.toFixed(4)} ms`);
console.log(`  Min time:     ${currencyMin.toFixed(4)} ms`);
console.log(`  Max time:     ${currencyMax.toFixed(4)} ms`);
console.log(`  Std Dev:      ${currencyStdDev.toFixed(4)} ms`);
console.log(`  Avg per op:   ${(avgCurrency / ITERATIONS * 1000).toFixed(6)} μs`);

console.log(`\n${'─'.repeat(70)}`);
console.log('COMPARISON');
console.log(`${'─'.repeat(70)}`);
const diff = avgCurrency - avgCurrent;
const diffPercent = (diff / avgCurrent) * 100;
const faster = diff < 0 ? 'Currency Style' : 'Current Method';
const slower = diff < 0 ? 'Current Method' : 'Currency Style';

console.log(`  Difference:   ${Math.abs(diff).toFixed(4)} ms`);
console.log(`  Percentage:   ${Math.abs(diffPercent).toFixed(2)}% ${diff < 0 ? 'faster' : 'slower'}`);
console.log(`  Winner:       ${faster} is ${Math.abs(diffPercent).toFixed(2)}% faster than ${slower}`);

// Show sample outputs
console.log(`\n${'─'.repeat(70)}`);
console.log('SAMPLE OUTPUTS');
console.log(`${'─'.repeat(70)}`);
console.log('\nTest Price: 1234.56');
console.log(`  Current:   "${formatCurrent(1234.56)}"`);
console.log(`  Currency:  "${formatCurrency(1234.56)}"`);

console.log('\nTest Price: 999.99');
console.log(`  Current:   "${formatCurrent(999.99)}"`);
console.log(`  Currency:  "${formatCurrency(999.99)}"`);

console.log('\nTest Price: 0.50');
console.log(`  Current:   "${formatCurrent(0.50)}"`);
console.log(`  Currency:  "${formatCurrency(0.50)}"`);

console.log('\n' + '='.repeat(70));

