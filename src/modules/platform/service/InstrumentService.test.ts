import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import InstrumentService from './InstrumentService.ts';
import InstrumentRepository from '../repository/InstrumentRepository.ts';
import InstrumentDTO from '../dto/InstrumentDTO.ts';

describe('InstrumentDTO.toTuneItem', () => {
  it('maps InstrumentTuneRecord to InstrumentTuneItem correctly', () => {
    const record: Backend.InstrumentTuneRecord = {
      id: 'tune-1',
      instrumentId: 'inst-1',
      tuneName: 'Re 4',
      pitch: 293.66,
      displayOrder: 1,
      createdAt: new Date('2026-10-24T00:00:00Z'),
      updatedAt: new Date('2026-10-24T00:00:00Z')
    };

    const item = InstrumentDTO.toTuneItem(record);
    assert.deepEqual(item, {
      id: 'tune-1',
      instrumentId: 'inst-1',
      tuneName: 'Re 4',
      pitch: 293.66,
      displayOrder: 1
    });
  });

  it('maps InstrumentRecord with tunes and tunesCount in toItem', () => {
    const instRecord: Backend.InstrumentRecord = {
      id: 'inst-1',
      code: 'DNH',
      name: 'Đàn nhị',
      description: 'Nhạc cụ 2 dây',
      isActive: true,
      createdAt: new Date('2026-10-24T00:00:00Z'),
      tunesCount: 2,
      tunes: [
        {
          id: 'tune-1',
          instrumentId: 'inst-1',
          tuneName: 'Re 5',
          pitch: 587.33,
          displayOrder: 1,
          createdAt: new Date('2026-10-24T00:00:00Z'),
          updatedAt: new Date('2026-10-24T00:00:00Z')
        },
        {
          id: 'tune-2',
          instrumentId: 'inst-1',
          tuneName: 'Sol 4',
          pitch: 392.0,
          displayOrder: 2,
          createdAt: new Date('2026-10-24T00:00:00Z'),
          updatedAt: new Date('2026-10-24T00:00:00Z')
        }
      ]
    };

    const item = InstrumentDTO.toItem(instRecord);
    assert.equal(item.id, 'inst-1');
    assert.equal(item.tunesCount, 2);
    assert.equal(item.tunes?.length, 2);
    assert.equal(item.tunes?.[0].tuneName, 'Re 5');
    assert.equal(item.tunes?.[1].pitch, 392.0);
  });
});

describe('InstrumentService tunes management', () => {
  it('throws not found if instrument does not exist on getTunes', async () => {
    mock.method(InstrumentRepository, 'findById', async () => null);

    await assert.rejects(
      async () => InstrumentService.getTunes('non-existent-id'),
      { statusCode: 404, message: 'Không tìm thấy nhạc cụ.' }
    );
  });

  it('returns tunes mapped by toTuneItem', async () => {
    mock.method(InstrumentRepository, 'findById', async () => ({
      id: 'inst-1',
      code: 'DNH',
      name: 'Đàn nhị',
      description: null,
      isActive: true,
      createdAt: new Date()
    }));

    mock.method(InstrumentRepository, 'listTunes', async () => [
      {
        id: 't-1',
        instrumentId: 'inst-1',
        tuneName: 'Dây 1',
        pitch: 440,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const result = await InstrumentService.getTunes('inst-1');
    assert.equal(result.length, 1);
    assert.equal(result[0].tuneName, 'Dây 1');
    assert.equal(result[0].pitch, 440);
  });
});
