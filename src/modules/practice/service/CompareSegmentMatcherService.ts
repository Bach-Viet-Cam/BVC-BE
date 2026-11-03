import PracticeConstant from '../constant/PracticeConstant.ts';

const { MIN_OVERLAP_RATIO, MIN_SEGMENT_SEC, MERGE_GAP_SEC } = PracticeConstant.compare;
const EPSILON = 1e-9;
const STATUS_ORDER: Record<Practice.CompareSegmentStatus, number> = { REPEATED: 0, IMPROVED: 1, NEW: 2 };

// A segment while matching and merging; the weights say how bad each side's error is and never leave this class
interface WorkingSegment {
  kind: Practice.IssueKind;
  status: Practice.CompareSegmentStatus;
  startSec: number;
  endSec: number;
  olderLabel: string | null;
  newerLabel: string | null;
  olderWeight: number;
  newerWeight: number;
}

interface Span { start: number; end: number; }

// Labels the error segments of two submissions of the same sheet (GBR-18). Times are on the teacher's timeline.
export default class CompareSegmentMatcherService {
  static match(older: Practice.ResultIssueDTO[], newer: Practice.ResultIssueDTO[]): { segments: Practice.CompareSegmentDTO[]; noSegmentsToCompare: boolean } {
    const matchedNewer = new Set<Practice.ResultIssueDTO>();
    const working: WorkingSegment[] = [];
    for (const issue of older) {
      const best = CompareSegmentMatcherService.findBestMatch(issue, newer);
      for (const other of newer) {
        if (CompareSegmentMatcherService.matches(issue, other)) matchedNewer.add(other);
      }
      working.push({
        kind: issue.kind, status: best ? 'REPEATED' : 'IMPROVED', startSec: issue.startSec, endSec: issue.endSec,
        olderLabel: issue.label, newerLabel: best?.label ?? null,
        olderWeight: CompareSegmentMatcherService.weight(issue), newerWeight: best ? CompareSegmentMatcherService.weight(best) : 0
      });
    }
    for (const issue of newer) {
      if (matchedNewer.has(issue)) continue;
      working.push({
        kind: issue.kind, status: 'NEW', startSec: issue.startSec, endSec: issue.endSec, olderLabel: null, newerLabel: issue.label,
        olderWeight: 0, newerWeight: CompareSegmentMatcherService.weight(issue)
      });
    }
    const segments = CompareSegmentMatcherService.merge(working)
      .sort((first, second) => STATUS_ORDER[first.status] - STATUS_ORDER[second.status] || first.startSec - second.startSec)
      .map((segment): Practice.CompareSegmentDTO => ({
        id: `${segment.kind}-${segment.startSec}-${segment.status}`, kind: segment.kind, status: segment.status,
        startSec: segment.startSec, endSec: segment.endSec, olderLabel: segment.olderLabel, newerLabel: segment.newerLabel
      }));
    return { segments, noSegmentsToCompare: older.length === 0 };
  }

  // Zero-length segments are widened around their centre so they can still overlap something
  private static toSpan(issue: Practice.ResultIssueDTO): Span {
    const length = issue.endSec - issue.startSec;
    if (length >= MIN_SEGMENT_SEC) return { start: issue.startSec, end: issue.endSec };
    const centre = (issue.startSec + issue.endSec) / 2;
    return { start: centre - MIN_SEGMENT_SEC / 2, end: centre + MIN_SEGMENT_SEC / 2 };
  }

  private static overlap(first: Practice.ResultIssueDTO, second: Practice.ResultIssueDTO): number {
    const a = CompareSegmentMatcherService.toSpan(first);
    const b = CompareSegmentMatcherService.toSpan(second);
    return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  }

  private static matches(first: Practice.ResultIssueDTO, second: Practice.ResultIssueDTO): boolean {
    if (first.kind !== second.kind) return false;
    const a = CompareSegmentMatcherService.toSpan(first);
    const b = CompareSegmentMatcherService.toSpan(second);
    const shorter = Math.min(a.end - a.start, b.end - b.start);
    return CompareSegmentMatcherService.overlap(first, second) + EPSILON >= MIN_OVERLAP_RATIO * shorter;
  }

  private static findBestMatch(issue: Practice.ResultIssueDTO, candidates: Practice.ResultIssueDTO[]): Practice.ResultIssueDTO | null {
    let best: Practice.ResultIssueDTO | null = null;
    let bestOverlap = -1;
    for (const candidate of candidates) {
      if (!CompareSegmentMatcherService.matches(issue, candidate)) continue;
      const overlap = CompareSegmentMatcherService.overlap(issue, candidate);
      if (overlap > bestOverlap) { best = candidate; bestOverlap = overlap; }
    }
    return best;
  }

  // Pitch: how far off; rhythm: how long
  private static weight(issue: Practice.ResultIssueDTO): number {
    return issue.kind === 'pitch' ? Math.abs(issue.centsDifference ?? 0) : issue.endSec - issue.startSec;
  }

  private static merge(segments: WorkingSegment[]): WorkingSegment[] {
    const sorted = [...segments].sort((first, second) => (
      first.kind.localeCompare(second.kind) || first.status.localeCompare(second.status) || first.startSec - second.startSec
    ));
    const merged: WorkingSegment[] = [];
    for (const segment of sorted) {
      const current = merged[merged.length - 1];
      const adjacent = current && current.kind === segment.kind && current.status === segment.status
        && segment.startSec - current.endSec <= MERGE_GAP_SEC + EPSILON;
      if (!adjacent) { merged.push({ ...segment }); continue; }
      current.endSec = Math.max(current.endSec, segment.endSec);
      if (segment.olderLabel !== null && (current.olderLabel === null || segment.olderWeight > current.olderWeight)) {
        current.olderLabel = segment.olderLabel;
        current.olderWeight = segment.olderWeight;
      }
      if (segment.newerLabel !== null && (current.newerLabel === null || segment.newerWeight > current.newerWeight)) {
        current.newerLabel = segment.newerLabel;
        current.newerWeight = segment.newerWeight;
      }
    }
    return merged;
  }
}
