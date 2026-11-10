import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ImportFileParser from './ImportFileParser.ts';
import XlsxCompatParser from './XlsxCompatParser.ts';

const mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const buildPlainWorkbook = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');
  sheet.addRow(['TermName', 'SubjectCode', 'ClassName', 'RollNumber', 'FullName', 'Email']);
  sheet.addRow(['Fall2026', 'DNH103', 'DNH103.E1.H2', 'HE220687', 'Nguyễn Văn A', 'a@example.com']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const prefixElements = (xml: string): string =>
  xml.replace(/<(\/?)([A-Za-z])/g, '<$1x:$2').replace('xmlns=', 'xmlns:x=');

describe('XlsxCompatParser.normalizePart', () => {
  it('normalizePart strips x: prefixes from workbook xml', () => {
    const input = `<x:workbook xmlns:x="${mainNs}"><x:sheets><x:sheet name="Students" sheetId="1" r:id="rId2" /></x:sheets></x:workbook>`;
    const output = XlsxCompatParser.normalizePart('xl/workbook.xml', input);
    assert.ok(output.includes(`<workbook xmlns="${mainNs}">`));
    assert.ok(output.includes('<sheet name="Students"'));
    assert.ok(!output.includes('x:'));
  });

  it('normalizePart strips ap: prefixes from docProps/app.xml', () => {
    const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';
    const input = `<ap:Properties xmlns:ap="${ns}"><ap:Application>Microsoft Excel</ap:Application></ap:Properties>`;
    assert.equal(
      XlsxCompatParser.normalizePart('docProps/app.xml', input),
      `<Properties xmlns="${ns}"><Application>Microsoft Excel</Application></Properties>`
    );
  });

  it('normalizePart makes workbook rels targets relative', () => {
    const output = XlsxCompatParser.normalizePart('xl/_rels/workbook.xml.rels', '<Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml" />');
    assert.ok(output.includes('Target="worksheets/sheet1.xml"'));
  });

  it('normalizePart makes root rels targets relative', () => {
    const output = XlsxCompatParser.normalizePart('_rels/.rels', '<Relationship Id="rId1" Target="/xl/workbook.xml" />');
    assert.ok(output.includes('Target="xl/workbook.xml"'));
  });

  it('normalizePart removes a leading BOM', () => {
    const output = XlsxCompatParser.normalizePart('xl/workbook.xml', '\uFEFF<?xml version="1.0"?><workbook />');
    assert.ok(output.startsWith('<?xml'));
  });
});

describe('XlsxCompatParser.normalizePackage', () => {
  it('normalizePackage makes a prefixed workbook readable by exceljs', async () => {
    const zip = await JSZip.loadAsync(await buildPlainWorkbook());
    for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml']) {
      zip.file(part, prefixElements(await zip.file(part)!.async('string')));
    }
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/Target="(?!\/)/g, 'Target="/xl/'));
    const buffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));

    const matrix = await ImportFileParser.readXlsxSheet(buffer, 'Students');
    assert.ok(matrix);
    assert.ok(matrix[1].includes('DNH103.E1.H2'));
    assert.ok(matrix[1].includes('Nguyễn Văn A'));
  });
});

describe('ImportFileParser.readXlsxSheet', () => {
  it('readXlsxSheet reads a plain exceljs workbook directly', async () => {
    const buffer = await buildPlainWorkbook();
    const matrix = await ImportFileParser.readXlsxSheet(buffer, 'Students');
    assert.ok(matrix);
    assert.equal(matrix.length, 2);
    assert.equal(matrix[1][3], 'HE220687');
    assert.equal(await ImportFileParser.readXlsxSheet(buffer, 'Other'), null);
  });

  it('loadWorkbook throws FILE_UNREADABLE for garbage bytes', async () => {
    await assert.rejects(
      () => ImportFileParser.loadWorkbook(Buffer.from('not a zip')),
      (error: unknown) => error instanceof AppError && error.message === ClassConstant.messages.FILE_UNREADABLE
    );
  });
});
