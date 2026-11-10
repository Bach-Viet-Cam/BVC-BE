import JSZip from 'jszip';

// Some source systems export .xlsx with prefixed OOXML elements (<x:workbook>), absolute relationship
// targets and a BOM, which exceljs cannot load. This rewrites those parts into the plain form exceljs expects.
export default class XlsxCompatParser {
  static normalizePart(partName: string, xml: string): string {
    let result = xml.replace(/^\uFEFF/, '');
    if (partName === '_rels/.rels') {
      result = result.replace(/Target="\//g, 'Target="');
    } else if (partName === 'xl/_rels/workbook.xml.rels') {
      result = result.replace(/Target="\/xl\//g, 'Target="');
    }
    return result
      .replace(/<(\/?)(?:x|ap):/g, '<$1')
      .replace(/xmlns:(?:x|ap)=/g, 'xmlns=');
  }

  static async normalizePackage(buffer: Buffer): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buffer);
    const partNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir && /\.(xml|rels)$/i.test(name));
    for (const partName of partNames) {
      const xml = await zip.files[partName].async('string');
      zip.file(partName, XlsxCompatParser.normalizePart(partName, xml));
    }
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }
}
