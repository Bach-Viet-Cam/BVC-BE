declare namespace Backend {
  interface GradingSettings {
    minAccuracy: number;
    atRiskMargin: number;
    updatedAt: string | null;
  }

  interface NotificationInput {
    title: string;
    body: string;
    link: string;
  }
}
