import assert from "node:assert/strict";
import { describe, it } from "node:test";
import AdminStatsPolicyService from "./AdminStatsPolicyService.ts";

const OFFSET = 420;

describe("AdminStatsPolicyService.buildDailySeries", () => {
  const now = new Date("2026-10-16T05:00:00Z");

  it("luôn trả đủ số ngày, ngày trống = 0, ngày cuối là hôm nay", () => {
    const series = AdminStatsPolicyService.buildDailySeries([], 3, now, OFFSET);
    assert.deepEqual(series, [
      { date: "2026-10-14", count: 0 },
      { date: "2026-10-15", count: 0 },
      { date: "2026-10-16", count: 0 },
    ]);
  });

  it("gom theo ngày UTC+7: 20:00Z hôm trước rơi vào ngày hôm sau", () => {
    const dates = [
      new Date("2026-10-16T01:00:00Z"),
      new Date("2026-10-15T20:00:00Z"),
      new Date("2026-10-14T10:00:00Z"),
    ];
    const series = AdminStatsPolicyService.buildDailySeries(
      dates,
      3,
      now,
      OFFSET,
    );
    assert.deepEqual(
      series.map((entry) => entry.count),
      [1, 0, 2],
    );
  });

  it("bỏ qua bản ghi nằm ngoài cửa sổ ngày", () => {
    const series = AdminStatsPolicyService.buildDailySeries(
      [new Date("2026-10-01T00:00:00Z")],
      3,
      now,
      OFFSET,
    );
    assert.equal(
      series.reduce((sum, entry) => sum + entry.count, 0),
      0,
    );
  });
});

describe("AdminStatsPolicyService.toPercent", () => {
  it("làm tròn 1 chữ số thập phân", () => {
    assert.equal(AdminStatsPolicyService.toPercent(1, 3), 33.3);
  });
  it("mẫu số 0 trả 0, không NaN/Infinity (Review Focus 1)", () => {
    assert.equal(AdminStatsPolicyService.toPercent(0, 0), 0);
    assert.equal(AdminStatsPolicyService.toPercent(5, 0), 0);
  });
});

describe("AdminStatsPolicyService.buildAlerts", () => {
  it("không cảnh báo khi mọi thứ bình thường", () => {
    assert.deepEqual(
      AdminStatsPolicyService.buildAlerts({
        storagePercent: 79.9,
        queueCount: 4,
        failed24h: 0,
      }),
      [],
    );
  });
  it("cảnh báo dung lượng từ 80%", () => {
    const alerts = AdminStatsPolicyService.buildAlerts({
      storagePercent: 80,
      queueCount: 0,
      failed24h: 0,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].code, "storage_high");
    assert.equal(alerts[0].level, "WARN");
  });
  it("cảnh báo hàng đợi từ 5 bản thu", () => {
    const alerts = AdminStatsPolicyService.buildAlerts({
      storagePercent: 0,
      queueCount: 5,
      failed24h: 0,
    });
    assert.equal(alerts[0].code, "queue_deep");
  });
  it("lỗi 24h là mức ERROR và nêu số lượng", () => {
    const alerts = AdminStatsPolicyService.buildAlerts({
      storagePercent: 0,
      queueCount: 0,
      failed24h: 2,
    });
    assert.equal(alerts[0].level, "ERROR");
    assert.ok(alerts[0].message.includes("2"));
  });
});
