const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// Simple linear regression
function linearRegression(xValues, yValues) {
  const n = xValues.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumX2 += xValues[i] * xValues[i];
    sumY2 += yValues[i] * yValues[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const yMean = sumY / n;
  let ssTotal = 0, ssResidual = 0;
  for (let i = 0; i < n; i++) {
    const yPred = slope * xValues[i] + intercept;
    ssTotal += (yValues[i] - yMean) ** 2;
    ssResidual += (yValues[i] - yPred) ** 2;
  }
  const r2 = 1 - (ssResidual / ssTotal);

  return { slope, intercept, r2 };
}

// Calculate Maximum Likelihood Estimate for power law exponent
function estimatePowerLawAlpha(degrees, kMin = 1) {
  const filteredDegrees = degrees.filter(k => k >= kMin);
  const n = filteredDegrees.length;

  if (n === 0) return null;

  const sumLogRatio = filteredDegrees.reduce((sum, k) => sum + Math.log(k / (kMin - 0.5)), 0);
  const alpha = 1 + n / sumLogRatio;

  return alpha;
}

(async () => {
  console.log('\n🔬 POWER LAW DISTRIBUTION ANALYSIS');
  console.log('====================================\n');

  // Get degree distribution
  const degreeData = await sql`
    SELECT
      COUNT(DISTINCT c.id) as degree
    FROM "Entity" e
    LEFT JOIN "Connection" c ON (c."sourceEntityId" = e.id OR c."targetEntityId" = e.id)
    GROUP BY e.id
    ORDER BY degree DESC
  `;

  // Count frequency of each degree
  const degreeFrequency = new Map();
  const allDegrees = [];

  for (const row of degreeData) {
    const degree = Number(row.degree);
    allDegrees.push(degree);
    degreeFrequency.set(degree, (degreeFrequency.get(degree) || 0) + 1);
  }

  // Convert to arrays and sort
  const degrees = Array.from(degreeFrequency.keys()).sort((a, b) => a - b);
  const frequencies = degrees.map(d => degreeFrequency.get(d));

  console.log('📊 DEGREE DISTRIBUTION:');
  console.log('=======================\n');
  console.log('Degree | Frequency | log(k) | log(P(k))');
  console.log('-------|-----------|--------|----------');

  // Filter out degree 0 for log analysis
  const nonZeroDegrees = degrees.filter(d => d > 0);
  const nonZeroFreqs = nonZeroDegrees.map(d => degreeFrequency.get(d));

  // Calculate logs for regression
  const logDegrees = [];
  const logFrequencies = [];

  for (let i = 0; i < nonZeroDegrees.length; i++) {
    const degree = nonZeroDegrees[i];
    const freq = nonZeroFreqs[i];
    const logK = Math.log10(degree);
    const logP = Math.log10(freq);

    logDegrees.push(logK);
    logFrequencies.push(logP);

    // Print first 15 and last 5 for readability
    if (i < 15 || i >= nonZeroDegrees.length - 5) {
      console.log(`${String(degree).padStart(6)} | ${String(freq).padStart(9)} | ${logK.toFixed(3).padStart(6)} | ${logP.toFixed(3).padStart(9)}`);
    } else if (i === 15) {
      console.log('  ...  |    ...    |  ...   |    ...   ');
    }
  }

  console.log('\n📈 LOG-LOG LINEAR REGRESSION:');
  console.log('==============================\n');

  const regression = linearRegression(logDegrees, logFrequencies);

  console.log(`Regression equation: log(P(k)) = ${regression.slope.toFixed(3)} * log(k) + ${regression.intercept.toFixed(3)}`);
  console.log(`R² (goodness of fit): ${regression.r2.toFixed(4)}`);
  console.log(`Power law exponent γ: ${Math.abs(regression.slope).toFixed(3)}`);

  console.log('\n🎯 INTERPRETATION:');
  console.log('==================\n');

  if (regression.r2 > 0.8) {
    console.log(`✅ Strong linear fit (R² = ${regression.r2.toFixed(4)}) in log-log space!`);
    console.log('   This suggests a TRUE POWER LAW distribution.\n');
  } else if (regression.r2 > 0.6) {
    console.log(`⚠️  Moderate linear fit (R² = ${regression.r2.toFixed(4)}) in log-log space.`);
    console.log('   This suggests power law characteristics with some deviation.\n');
  } else {
    console.log(`❌ Poor linear fit (R² = ${regression.r2.toFixed(4)}) in log-log space.`);
    console.log('   This is NOT a pure power law distribution.\n');
  }

  // Power law exponent interpretation
  const gamma = Math.abs(regression.slope);
  console.log(`Power law exponent γ ≈ ${gamma.toFixed(3)}`);
  console.log('\nComparison to known networks:');
  console.log('  • WWW: γ ≈ 2.1-2.4 (in-degree)');
  console.log('  • Internet: γ ≈ 2.2');
  console.log('  • Citation networks: γ ≈ 3.0');
  console.log('  • Social networks: γ ≈ 2.0-2.5');
  console.log(`  • Your network: γ ≈ ${gamma.toFixed(3)}`);

  if (gamma >= 2 && gamma <= 3) {
    console.log('\n✅ Your exponent falls within typical scale-free network range (2-3).');
  } else if (gamma > 3) {
    console.log('\n⚠️  Higher exponent suggests more evenly distributed network (less hub dominance).');
  } else {
    console.log('\n⚠️  Lower exponent suggests extreme hub dominance.');
  }

  // Maximum Likelihood Estimation
  console.log('\n📐 MAXIMUM LIKELIHOOD ESTIMATION:');
  console.log('==================================\n');

  const alphaMLE = estimatePowerLawAlpha(allDegrees.filter(d => d > 0), 1);
  console.log(`MLE power law exponent α: ${alphaMLE.toFixed(3)}`);
  console.log(`(Note: γ = α - 1 in cumulative distribution)`);

  // Check for exponential cutoff (typical in finite networks)
  console.log('\n🔍 ADDITIONAL CHECKS:');
  console.log('=====================\n');

  const maxDegree = Math.max(...allDegrees);
  const avgDegree = allDegrees.reduce((a, b) => a + b, 0) / allDegrees.length;
  const medianDegree = allDegrees.sort((a, b) => a - b)[Math.floor(allDegrees.length / 2)];

  console.log(`Max degree: ${maxDegree}`);
  console.log(`Average degree: ${avgDegree.toFixed(2)}`);
  console.log(`Median degree: ${medianDegree}`);
  console.log(`Max/Avg ratio: ${(maxDegree / avgDegree).toFixed(2)} (scale-free typically > 10)`);

  // Calculate degree distribution moments
  const secondMoment = allDegrees.reduce((sum, k) => sum + k * k, 0) / allDegrees.length;
  console.log(`Second moment <k²>: ${secondMoment.toFixed(2)}`);

  console.log('\n📝 FINAL VERDICT:');
  console.log('=================\n');

  if (regression.r2 > 0.7 && gamma >= 2 && gamma <= 3) {
    console.log('✅ SCALE-FREE NETWORK (Power Law Distribution)');
    console.log('   • Strong log-log linearity');
    console.log('   • Exponent in typical range');
    console.log('   • Hub-dominated with preferential attachment');
    console.log('\n   This is a TRUE scale-free network, not just "a hub".');
  } else if (regression.r2 > 0.5) {
    console.log('⚠️  HEAVY-TAILED DISTRIBUTION (Power Law-like)');
    console.log('   • Some log-log linearity');
    console.log('   • May have exponential cutoff');
    console.log('   • Hybrid between power law and other distributions');
  } else {
    console.log('❌ NOT A PURE POWER LAW');
    console.log('   • Poor log-log fit');
    console.log('   • Likely dominated by a few super-hubs');
    console.log('   • More similar to "rich get richer" than true scale-free');
  }

  process.exit(0);
})();
