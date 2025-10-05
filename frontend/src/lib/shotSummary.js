export function computeShotSummary(shots) {
  if (!Array.isArray(shots) || shots.length === 0) return null;

  const attemptCount = shots.length;
  let makeCount = 0;
  let threeAtt = 0;
  let threeMakes = 0;
  let distanceAccumulator = 0;

  const zoneTally = new Map();
  const periodTally = new Map();

  shots.forEach((shot) => {
    const made = shot.made === 1;
    const shotType = shot.shot_type || shot.SHOT_TYPE || "";
    const isThree = shotType.toLowerCase().includes("3pt");

    if (made) makeCount += 1;
    if (isThree) {
      threeAtt += 1;
      if (made) threeMakes += 1;
    }

    const distRaw = Number(shot.shot_distance ?? shot.SHOT_DISTANCE);
    if (!Number.isNaN(distRaw)) {
      distanceAccumulator += distRaw;
    }

    const zoneKey = shot.zone_basic || shot.ZONE_BASIC || "Unknown";
    const zoneEntry = zoneTally.get(zoneKey) ?? { zone: zoneKey, attempts: 0, makes: 0 };
    zoneEntry.attempts += 1;
    if (made) zoneEntry.makes += 1;
    zoneTally.set(zoneKey, zoneEntry);

    const periodRaw = shot.period ?? shot.PERIOD;
    const periodKey = typeof periodRaw === "number" && periodRaw > 0 ? periodRaw : "?";
    const periodEntry = periodTally.get(periodKey) ?? { period: periodKey, attempts: 0, makes: 0 };
    periodEntry.attempts += 1;
    if (made) periodEntry.makes += 1;
    periodTally.set(periodKey, periodEntry);
  });

  const twoAtt = attemptCount - threeAtt;
  const twoMakes = makeCount - threeMakes;
  const toPct = (makes, attempts) => (attempts ? makes / attempts : null);

  return {
    attempts: attemptCount,
    makes: makeCount,
    misses: attemptCount - makeCount,
    fgPct: toPct(makeCount, attemptCount),
    threeAtt,
    threeMakes,
    threePct: toPct(threeMakes, threeAtt),
    twoAtt,
    twoMakes,
    twoPct: toPct(twoMakes, twoAtt),
    avgDistance: attemptCount ? distanceAccumulator / attemptCount : null,
    zones: Array.from(zoneTally.values()).sort((a, b) => b.attempts - a.attempts),
    periods: Array.from(periodTally.values()).sort((a, b) => {
      if (a.period === "?" && b.period === "?") return 0;
      if (a.period === "?") return 1;
      if (b.period === "?") return -1;
      return a.period - b.period;
    }),
  };
}

export function formatPct(value) {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}
