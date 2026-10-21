import PieceUtil from '../../../utils/PieceUtil.ts';
import RoadmapConstant from '../constant/RoadmapConstant.ts';

export default class RoadmapDTO {
  static toWeekDTOs(roadmap: Backend.RoadmapRecord): Backend.RoadmapWeekDTO[] {
    return roadmap.weeks.map((week) => ({
      weekNumber: week.weekNumber,
      title: week.title,
      content: week.content,
      exercises: week.exercises.map(({ piece }) => ({ pieceId: piece.id, title: piece.title, isAvailable: PieceUtil.isAvailable(piece) }))
    }));
  }

  static toVersionDTO(roadmap: Backend.RoadmapRecord): Backend.RoadmapVersionDTO {
    return {
      id: roadmap.id,
      instrument: roadmap.instrument,
      version: roadmap.version,
      isTemplate: false,
      createdAt: roadmap.createdAt.toISOString(),
      weeks: RoadmapDTO.toWeekDTOs(roadmap)
    };
  }

  static toTemplateDTO(instrument: { id: string; name: string }): Backend.RoadmapVersionDTO {
    return {
      id: null,
      instrument,
      version: null,
      isTemplate: true,
      createdAt: null,
      weeks: RoadmapConstant.standardFrameworkTitles.map((title, index) => ({ weekNumber: index + 1, title, content: '', exercises: [] }))
    };
  }

  static toListItemDTO(instrument: { id: string; name: string; roadmaps: Array<{ version: number; createdAt: Date }> }): Backend.AdminRoadmapListItemDTO {
    const latest = instrument.roadmaps[0];
    return {
      instrument: { id: instrument.id, name: instrument.name },
      latestVersion: latest ? { version: latest.version, createdAt: latest.createdAt.toISOString() } : null
    };
  }
}
