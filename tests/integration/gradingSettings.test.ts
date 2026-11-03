import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import GradingSettingsService from '../../src/modules/platform/service/GradingSettingsService.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Grading settings (admin)', () => {
  let adminToken: string;
  let admin: Awaited<ReturnType<typeof TestDatabase.createUser>>;

  beforeEach(async () => {
    await TestDatabase.reset();
    admin = await TestDatabase.createUser({ role: 3 });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('GET /admin/settings/grading returns 404 because dedicated grading endpoints are removed (S-3)', async () => {
    const response = await request(app).get('/api/v1/admin/settings/grading').set('Authorization', adminToken);
    expect(response.status).toBe(404);
  });

  it('PUT /admin/settings/grading returns 404', async () => {
    const response = await request(app).put('/api/v1/admin/settings/grading').set('Authorization', adminToken).send({ minAccuracy: 60, atRiskMargin: 30 });
    expect(response.status).toBe(404);
  });

  it('GradingSettingsService.getGradingSettings returns seeded 70/40 from system_configs', async () => {
    const settings = await GradingSettingsService.getGradingSettings();
    expect(settings).toMatchObject({ minAccuracy: 70, atRiskMargin: 40 });
  });

  it('rejects at_risk_margin >= min_accuracy_default via system-configs PATCH', async () => {
    const marginConfig = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'at_risk_margin' } });
    const response = await request(app)
      .patch(`/api/v1/system-configs/${marginConfig.id}`)
      .set('Authorization', adminToken)
      .send({ value: '75' }); // seeded min_accuracy_default is 70
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Biên "Có nguy cơ" phải nhỏ hơn accuracy tối thiểu');
  });

  it('missing key makes getGradingSettings throw 500', async () => {
    await TestDatabase.prisma.systemConfig.delete({ where: { key: 'at_risk_margin' } });
    await expect(GradingSettingsService.getGradingSettings()).rejects.toMatchObject({ statusCode: 500 });
  });
});

