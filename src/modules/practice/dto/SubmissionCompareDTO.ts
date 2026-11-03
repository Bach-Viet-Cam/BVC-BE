export default class SubmissionCompareDTO {
  // Both charts sit on the teacher's timeline. Normally they have the same points (same reference audio); if the
  // reference was replaced between the two submissions the older line is matched by time and cut at the shorter chart.
  static mergeCharts(older: Practice.PitchChartDTO, newer: Practice.PitchChartDTO): Practice.CompareChartDTO {
    const durationSec = Math.min(older.durationSec, newer.durationSec);
    const minHz = Math.min(older.minHz, newer.minHz);
    const maxHz = Math.max(older.maxHz, newer.maxHz);
    if (older.points.length === newer.points.length) {
      const points = newer.points.map(([timeSec, teacherHz, newerHz], index): Practice.ComparePitchPoint => [timeSec, teacherHz, older.points[index][2], newerHz]);
      return { durationSec, minHz, maxHz, points };
    }
    const points: Practice.ComparePitchPoint[] = [];
    let cursor = 0;
    for (const [timeSec, teacherHz, newerHz] of newer.points) {
      if (timeSec > durationSec) break;
      // Both arrays ascend in time, so the nearest older point never lies behind the cursor
      while (cursor + 1 < older.points.length && Math.abs(older.points[cursor + 1][0] - timeSec) < Math.abs(older.points[cursor][0] - timeSec)) cursor++;
      points.push([timeSec, teacherHz, older.points[cursor]?.[2] ?? null, newerHz]);
    }
    return { durationSec, minHz, maxHz, points };
  }

  toSide(record: Practice.ResultRecord, attemptNo: number): Practice.CompareSideDTO {
    return {
      submissionId: record.id, submittedAt: record.createdAt.toISOString(), attemptNo,
      accuracy: Math.min(100, Math.max(0, Math.round(record.accuracy ?? 0)))
    };
  }
}
