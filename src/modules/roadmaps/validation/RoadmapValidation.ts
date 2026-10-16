import { z } from 'zod';
import RoadmapConstant from '../constant/RoadmapConstant.ts';

const instrumentParams = z.object({ instrumentId: z.uuid() });
const emptyQuery = z.object({});

// Shapes only: lengths and the 6-week rule are checked by RoadmapValidator so errors land per week.
export default class RoadmapValidation {
  static readonly listSchema = z.object({ body: z.unknown(), params: z.object({}), query: emptyQuery });

  static readonly instrumentSchema = z.object({ body: z.unknown(), params: instrumentParams, query: emptyQuery });

  static readonly exercisesSchema = z.object({
    body: z.unknown(),
    params: instrumentParams,
    query: z.object({
      q: z.string().trim().max(RoadmapConstant.limits.SEARCH_MAX).optional().transform((value) => value || undefined)
    })
  });

  static readonly classRoadmapSchema = z.object({ body: z.unknown(), params: z.object({ id: z.uuid() }), query: emptyQuery });

  static readonly saveVersionSchema = z.object({
    body: z.object({
      weeks: z.array(
        z.object({
          weekNumber: z.number().int(),
          title: z.string(),
          content: z.string(),
          exerciseIds: z.array(z.uuid())
        })
      ),
      // Version the admin edited (null = the standard framework); a newer version makes the save stale.
      baseVersion: z.number().int().positive().nullable()
    }),
    params: instrumentParams,
    query: emptyQuery
  });
}
