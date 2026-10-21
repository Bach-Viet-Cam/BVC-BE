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

  const put = (body: object, token: string = adminToken) => request(app).put('/api/v1/admin/settings/grading').set('Authorization', token).send(body);

  it('returns seeded 70/40', async () => {
    const response = await request(app).get('/api/v1/admin/settings/grading').set('Authorization', adminToken);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ minAccuracy: 70, atRiskMargin: 40 });
  });

  it('updates both values', async () => {
    const response = await put({ minAccuracy: 60, atRiskMargin: 30 });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Lưu cấu hình chấm điểm thành công.');
    expect(response.body.data).toMatchObject({ minAccuracy: 60, atRiskMargin: 30 });
    expect(await GradingSettingsService.getGradingSettings()).toMatchObject({ minAccuracy: 60, atRiskMargin: 30 });
    const row = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'min_accuracy_default' } });
    expect(row.updatedById).toBe(admin.id);
  });

  it('rejects margin greater than minimum', async () => {
    const response = await put({ minAccuracy: 50, atRiskMargin: 51 });
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([{ field: 'atRiskMargin', message: 'Biên có nguy cơ không được lớn hơn độ chính xác tối thiểu.' }]);
    expect(await GradingSettingsService.getGradingSettings()).toMatchObject({ minAccuracy: 70, atRiskMargin: 40 });
  });

  it('rejects values outside 0–100 and non-integers', async () => {
    const tooHigh = await put({ minAccuracy: 101, atRiskMargin: 10 });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.errors[0]).toMatchObject({ field: 'minAccuracy', code: 'MSG-03', message: 'Độ chính xác tối thiểu phải nằm trong khoảng từ 0 đến 100.' });
    expect((await put({ minAccuracy: 70.5, atRiskMargin: 10 })).status).toBe(400);
    expect((await put({ minAccuracy: 70, atRiskMargin: -1 })).body.errors[0]).toMatchObject({ field: 'atRiskMargin', message: 'Biên có nguy cơ phải nằm trong khoảng từ 0 đến 100.' });
  });

  it('lecturer gets 403', async () => {
    const lecturerToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    expect((await request(app).get('/api/v1/admin/settings/grading').set('Authorization', lecturerToken)).status).toBe(403);
    expect((await put({ minAccuracy: 60, atRiskMargin: 30 }, lecturerToken)).status).toBe(403);
  });

  it('missing key makes getGradingSettings throw 500', async () => {
    await TestDatabase.prisma.systemConfig.delete({ where: { key: 'at_risk_margin' } });
    await expect(GradingSettingsService.getGradingSettings()).rejects.toMatchObject({ statusCode: 500 });
  });
});
