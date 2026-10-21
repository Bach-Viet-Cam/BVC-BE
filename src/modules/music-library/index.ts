import AnalysisService from './service/AnalysisService.ts';

export default class MusicLibraryModule {
  // Starts the analysis queue worker so jobs left in Redis from a previous run are processed
  static initialize(): void {
    void AnalysisService.queue;
  }
}
