import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import GradingSettingsService from '../../src/modules/platform/service/GradingSettingsService.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

// ITC001-ITC005: các ca hệ thống cấu hình và grading settings.
describe('SystemConfig integration', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('ITC001 - GET /system-configs trả danh sách cấu hình', async () => {
    const response = await request(app)
      .get('/api/v1/system-configs?group=SCORING&sortBy=label&sortDir=desc')
      .set('Authorization', adminToken);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);

    const fields = ['id', 'key', 'value', 'valueType', 'group', 'label', 'description'];
    for (const item of response.body.data) {
      expect(Object.keys(item).sort()).toEqual([...fields].sort());
      expect(item.group).toBe('SCORING');
    }

    const labels = response.body.data.map((item: { label: string }) => item.label);
    for (let index = 0; index < labels.length - 1; index += 1) {
      expect(labels[index] >= labels[index + 1]).toBe(true);
    }
  });

  it('ITC002 - Cập nhật giá trị cấu hình hợp lệ', async () => {
    const config = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'min_accuracy_default' } });
    const response = await request(app)
      .patch(`/api/v1/system-configs/${config.id}`)
      .set('Authorization', adminToken)
      .send({ value: '65' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Cập nhật tham số thành công.');
    expect(response.body.data.value).toBe('65');

    const persisted = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'min_accuracy_default' } });
    expect(persisted.value).toBe('65');
  });

  it('ITC003 - Chặn at_risk_margin không nhỏ hơn min_accuracy_default', async () => {
    const margin = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'at_risk_margin' } });
    const response = await request(app)
      .patch(`/api/v1/system-configs/${margin.id}`)
      .set('Authorization', adminToken)
      .send({ value: '75' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Biên "Có nguy cơ" phải nhỏ hơn accuracy tối thiểu');

    const persisted = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'at_risk_margin' } });
    expect(persisted.value).toBe('40');
  });

  it('ITC004 - Endpoint chấm điểm riêng đã bị xóa', async () => {
    const getResponse = await request(app)
      .get('/api/v1/admin/settings/grading')
      .set('Authorization', adminToken);
    expect(getResponse.status).toBe(404);

    const putResponse = await request(app)
      .put('/api/v1/admin/settings/grading')
      .set('Authorization', adminToken)
      .send({ minAccuracy: 60, atRiskMargin: 30 });
    expect(putResponse.status).toBe(404);
  });

  it('ITC005 - Thiếu config chấm điểm thì service ném lỗi', async () => {
    await TestDatabase.prisma.systemConfig.delete({ where: { key: 'at_risk_margin' } });
    await expect(GradingSettingsService.getGradingSettings()).rejects.toMatchObject({
      statusCode: 500,
      message: 'Thiếu cấu hình chấm điểm.'
    });
  });
});
