declare namespace Backend {
  type RoadmapWeekStatus = 'PAST' | 'CURRENT' | 'UPCOMING';
  type PieceKind = 'FINGER_EXERCISE' | 'SONG';

  interface RoadmapWeekInput {
    weekNumber: number;
    title: string;
    content: string;
    exerciseIds: string[];
  }

  interface PieceSnapshot {
    id: string;
    title: string;
    instrumentId: string;
    kind: PieceKind;
    isVisible: boolean;
  }
}

declare namespace Backend {
  interface RoadmapExerciseDTO {
    pieceId: string;
    title: string;
    isAvailable: boolean;
  }

  interface RoadmapWeekDTO {
    weekNumber: number;
    title: string;
    content: string;
    exercises: RoadmapExerciseDTO[];
  }

  interface RoadmapVersionDTO {
    id: string | null;
    instrument: { id: string; name: string };
    version: number | null;
    isTemplate: boolean;
    createdAt: string | null;
    weeks: RoadmapWeekDTO[];
  }

  interface AdminRoadmapListItemDTO {
    instrument: { id: string; name: string };
    latestVersion: { version: number; createdAt: string } | null;
  }

  interface FingerExerciseDTO {
    id: string;
    title: string;
    defaultBpm: number | null;
  }

  interface ClassRoadmapWeekDTO extends RoadmapWeekDTO {
    startDate: string;
    endDate: string;
    status: RoadmapWeekStatus;
    assignments: [];
  }

  interface ClassRoadmapDTO {
    roadmap: { id: string; version: number; weeks: ClassRoadmapWeekDTO[] } | null;
  }

  interface RoadmapRecord {
    id: string;
    version: number;
    createdAt: Date;
    instrument: { id: string; name: string };
    weeks: Array<{
      weekNumber: number;
      title: string;
      content: string;
      exercises: Array<{ piece: { id: string; title: string; isVisible: boolean } }>;
    }>;
  }
}
