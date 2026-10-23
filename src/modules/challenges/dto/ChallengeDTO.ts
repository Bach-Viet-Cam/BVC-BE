import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import ChallengeRules from '../service/ChallengeRules.ts';

export default class ChallengeDTO {
  static toDTO(record: Backend.ChallengeRecord, now: Date = new Date()): Backend.ChallengeDTO {
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      status: record.status,
      displayStatus: ChallengeRules.displayStatus(record, now),
      instrument: record.instrument,
      piece: record.piece,
      classes: record.classes.map((item) => item.class),
      weekStart: record.startsAt ? ChallengeDTO.weekStartOf(record.startsAt) : null,
      startsAt: record.startsAt?.toISOString() ?? null,
      endsAt: record.endsAt?.toISOString() ?? null,
      minAccuracy: record.minAccuracy,
      requiredBpm: record.requiredBpm,
      maxSubmissions: record.maxSubmissions,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  // The stored start may be "now" for the current week, so normalise to that week's Monday.
  static weekStartOf(startsAt: Date): string {
    return DateTimeUtil.startOfWeekInVietnam(DateTimeUtil.dayKeyInVietnam(startsAt));
  }
}
