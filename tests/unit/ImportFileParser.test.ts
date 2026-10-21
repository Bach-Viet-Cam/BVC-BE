import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import ImportFileParser from '../../src/modules/classes/service/ImportFileParser.ts';
import ImportService from '../../src/modules/classes/service/ImportService.ts';

async function buildXlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');
  rows.forEach((cells) => worksheet.addRow(cells));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function file(originalname: string, buffer: Buffer): Backend.UploadedImportFile {
  return { originalname, buffer, size: buffer.length };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ statusCode, code });
}

describe('ImportFileParser', () => {
  it('reads an .xlsx file with English headers and keeps spreadsheet row numbers', async () => {
    const buffer = await buildXlsx([
      ['Student Code', 'Full Name', 'Email'],
      ['SE171234', 'Trần Minh Anh', 'anhtm@fpt.edu.vn'],
      [],
      ['SE172091', 'Phạm Gia Hân', { text: 'hanpg@fpt.edu.vn', hyperlink: 'mailto:hanpg@fpt.edu.vn' }]
    ]);
    const parsed = await ImportFileParser.parse(file('ds.xlsx', buffer));
    expect(parsed.fileType).toBe('xlsx');
    expect(parsed.rows).toEqual([
      { rowNumber: 2, studentCode: 'SE171234', fullName: 'Trần Minh Anh', email: 'anhtm@fpt.edu.vn' },
      { rowNumber: 4, studentCode: 'SE172091', fullName: 'Phạm Gia Hân', email: 'hanpg@fpt.edu.vn' }
    ]);
  });

  it('reads the generated template headers (Vietnamese, any column order)', async () => {
    const template = await ImportService.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    expect(workbook.worksheets[0].getRow(1).values).toEqual([undefined, 'Mã sinh viên', 'Họ tên', 'Email']);

    const buffer = await buildXlsx([['Email', 'Họ và tên', 'MSSV'], ['a@fpt.edu.vn', 'Lê A', 'SE1']]);
    const parsed = await ImportFileParser.parse(file('x.XLSX', buffer));
    expect(parsed.rows[0]).toMatchObject({ studentCode: 'SE1', fullName: 'Lê A', email: 'a@fpt.edu.vn' });
  });

  it('reads a UTF-8 .csv with BOM, and semicolon-separated csv', async () => {
    const commaCsv = Buffer.from('﻿Mã sinh viên,Họ tên,Email\r\nSE173355,Ngô Thảo My,mynt@fpt.edu.vn\r\n,,\r\n', 'utf8');
    const parsed = await ImportFileParser.parse(file('ds.csv', commaCsv));
    expect(parsed.fileType).toBe('csv');
    expect(parsed.rows).toEqual([{ rowNumber: 2, studentCode: 'SE173355', fullName: 'Ngô Thảo My', email: 'mynt@fpt.edu.vn' }]);

    const semicolonCsv = Buffer.from('Mã SV;Họ tên;Email\nSE1;Vũ Hải Đăng;dangvh@fpt.edu.vn\n', 'utf8');
    expect((await ImportFileParser.parse(file('ds.csv', semicolonCsv))).rows[0].fullName).toBe('Vũ Hải Đăng');
  });

  it('rejects unsupported formats with MSG-13', async () => {
    await expectAppError(ImportFileParser.parse(file('ds.xls', Buffer.from('x'))), 400, 'MSG-13');
    await expectAppError(ImportFileParser.parse(file('ds', Buffer.from('x'))), 400, 'MSG-13');
  });

  it('rejects files over 2 MB with MSG-14', async () => {
    await expectAppError(ImportFileParser.parse({ originalname: 'ds.csv', buffer: Buffer.from(''), size: 2 * 1024 * 1024 + 1 }), 400, 'MSG-14');
  });

  it('rejects missing columns with MSG-08 naming them', async () => {
    const csv = Buffer.from('Mã sinh viên,Tên\nSE1,A\n');
    await expect(ImportFileParser.parse(file('ds.csv', csv))).rejects.toMatchObject({
      code: 'MSG-08',
      message: 'Không thể nhập danh sách vì file thiếu cột bắt buộc: Họ tên, Email.'
    });
  });

  it('rejects more than 200 data rows but accepts exactly 200', async () => {
    const lines = (count: number) => ['Mã sinh viên,Họ tên,Email', ...Array.from({ length: count }, (_, index) => `SE${index},SV ${index},sv${index}@fpt.edu.vn`)].join('\n');
    expect((await ImportFileParser.parse(file('ok.csv', Buffer.from(lines(200))))).rows).toHaveLength(200);
    await expectAppError(ImportFileParser.parse(file('big.csv', Buffer.from(lines(201)))), 400, 'MSG-08');
  });

  it('rejects files without data rows and corrupt xlsx files', async () => {
    await expectAppError(ImportFileParser.parse(file('empty.csv', Buffer.from('Mã sinh viên,Họ tên,Email\n'))), 400, 'MSG-08');
    await expectAppError(ImportFileParser.parse(file('blank.csv', Buffer.from(''))), 400, 'MSG-08');
    await expectAppError(ImportFileParser.parse(file('broken.xlsx', Buffer.from('not a zip'))), 400, 'MSG-08');
  });
});
