import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

// Explicit opt-in, never run against the shared development database.
test('Phase B: FAQ, lecturer review, consent, automatic library and protected audio', { skip: !process.env.PHASE_B_TEST_DATABASE_URL }, async () => {
  const target = new URL(process.env.PHASE_B_TEST_DATABASE_URL!);
  assert.equal(target.pathname, '/bachvietcam_phaseb_verify');
  process.env.DATABASE_URL = target.toString();
  process.env.JWT_SECRET ||= 'phase-b-test-only-secret';
  const { default: DB } = await import('../../../config/PrismaClient.ts');
  const { default: Env } = await import('../../../config/EnvConfig.ts');
  const { createApp } = await import('../../../app.ts');
  const { default: Repo } = await import('../../practice/repository/PracticeSubmissionRepository.ts');
  const db = DB.instance;
  const suffix = randomUUID();
  const admin = await db.user.create({ data: { username: 'Admin test', email: `admin-${suffix}@phaseb.test`, role: 3 } });
  const teacher = await db.user.create({ data: { username: 'Thái test', email: `teacher-${suffix}@phaseb.test`, role: 2 } });
  const other = await db.user.create({ data: { username: 'GV khác', email: `other-${suffix}@phaseb.test`, role: 2 } });
  const student = await db.user.create({ data: { username: 'An test', email: `student-${suffix}@phaseb.test`, role: 1 } });
  const later = await db.user.create({ data: { username: 'SV khóa sau', email: `later-${suffix}@phaseb.test`, role: 1 } });
  const instrument = await db.instrument.create({ data: { code: `TEST_${suffix}`, name: 'Đàn nguyệt test' } });
  const genre = await db.category.create({ data: { type: 'GENRE', name: `Genre ${suffix}` } });
  const level = await db.category.create({ data: { type: 'LEVEL', name: `Level ${suffix}` } });
  const piece = await db.piece.create({ data: { title: 'Lý ngựa ô test', ownerId: teacher.id, genreId: genre.id, visibility: 'PUBLIC' } });
  const pdf = await db.mediaFile.create({ data: { kind: 'SHEET', status: 'READY', storageKey: `test/${suffix}.pdf`, originalName: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1, uploadedById: teacher.id } });
  const sheet = await db.sheetMusic.create({ data: { pieceId: piece.id, instrumentId: instrument.id, kind: 'MAIN', mainInstrumentId: instrument.id, name: 'Bản chính', levelId: level.id, sheetFileId: pdf.id, uploaderId: teacher.id } });
  const cls = await db.class.create({ data: { name: `Lớp ${suffix}`, cohort: 'K18', ownerId: teacher.id, instrumentId: instrument.id, startDate: new Date() } });
  const assignment = await db.assignment.create({ data: { classId: cls.id, sheetMusicId: sheet.id, title: 'Bonus test', type: 'BONUS', deadline: new Date(Date.now() + 86400000), isPublished: true } });
  const key = `audio/${randomUUID()}.wav`;
  const location = path.join(Env.fileStorageLocalRoot, key);
  await mkdir(path.dirname(location), { recursive: true });
  await writeFile(location, Buffer.from('RIFFphase-b-audio-test'));
  const upload = await db.audioUpload.create({ data: { ownerId: student.id, provider: 'local', key, url: `${Env.fileStoragePublicBaseUrl}/uploads/${key}`, originalName: 'test.wav', contentType: 'audio/wav', sizeBytes: 21 } });
  const submission = await db.submission.create({ data: { studentId: student.id, pieceId: piece.id, sheetMusicId: sheet.id, assignmentId: assignment.id, status: 'COMPLETED', accuracy: 95, studentUploadId: upload.id, fileUrl: upload.url } });
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const tokens = Object.fromEntries([admin, teacher, other, student, later].map((user) => [user.id, jwt.sign({userId: user.id}, Env.jwtSecret, {expiresIn: '10m'})]));
  let checks = 0;
  async function call(url: string, userId: string | null, expected: number, method = 'GET', body?: unknown): Promise<unknown> {
    const result = await fetch(`${base}/api/v1${url}`, { method, headers: { ...(userId ? {Authorization: `Bearer ${tokens[userId]}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
    const data = await result.json();
    assert.equal(result.status, expected, `${method} ${url}: ${JSON.stringify(data)}`);
    checks++;
    return data.data;
  }
  try {
    const body = { question: '  Cách   nộp bài? ', answer: 'Mở bài tập và chọn thu âm.', topic: 'ASSIGNMENTS', instrumentId: null, displayOrder: 1, isActive: true };
    await call('/faqs', null, 401);
    await call('/admin/faqs', student.id, 403);
    const faq = await call('/admin/faqs', admin.id, 201, 'POST', body) as {id: string};
    await call('/admin/faqs', admin.id, 409, 'POST', {...body, question: 'CÁCH NỘP BÀI?'});
    await call(`/admin/faqs/${faq.id}`, admin.id, 200, 'PATCH', {isActive: false});
    assert.equal((await call('/faqs?q=Cách', student.id, 200) as {total: number}).total, 0);
    await call(`/admin/faqs/${faq.id}`, admin.id, 200, 'PATCH', {isActive: true});
    assert.equal((await call('/faqs?q=Cách', student.id, 200) as {total: number}).total, 1);
    await call(`/submissions/${submission.id}/review`, other.id, 403, 'POST', {decision: 'APPROVE'});
    await call(`/submissions/${submission.id}/sharing-consent`, other.id, 403, 'PUT', {isGranted: true});
    const approve = await call(`/submissions/${submission.id}/review`, teacher.id, 200, 'POST', {decision: 'APPROVE'}) as {verifiedContentId: string};
    const verifiedId = approve.verifiedContentId;
    await Promise.all([call(`/submissions/${submission.id}/review`, teacher.id, 200, 'POST', {decision: 'APPROVE'}), call(`/submissions/${submission.id}/review`, teacher.id, 200, 'POST', {decision: 'APPROVE'})]);
    assert.equal(await db.verifiedContent.count({where: {submissionId: submission.id}}), 1);
    assert.equal(await db.userNotification.count({where: {userId: student.id}}), 1);
    const library = `/library/pieces/${piece.id}/verified-recordings?instrumentId=${instrument.id}`;
    assert.equal((await call(library, later.id, 200) as {total: number}).total, 0);
    await call(`/library/verified-recordings/${verifiedId}/audio`, later.id, 404);
    await call(`/submissions/${submission.id}/sharing-consent`, student.id, 200, 'PUT', {isGranted: true});
    assert.equal((await call(library, later.id, 200) as {total: number}).total, 0, 'Grant does not auto-publish hidden content');
    await call(`/verified-contents/${verifiedId}/visibility`, other.id, 403, 'PATCH', {status: 'VISIBLE', version: 1});
    await call(`/verified-contents/${verifiedId}/visibility`, teacher.id, 200, 'PATCH', {status: 'VISIBLE', version: 1});
    assert.equal((await call(library, later.id, 200) as {total: number}).total, 1);
    const audio = await fetch(`${base}/api/v1/library/verified-recordings/${verifiedId}/audio`, {headers: {Authorization: `Bearer ${tokens[later.id]}`, Range: 'bytes=0-3'}});
    assert.equal(audio.status, 206); assert.equal(await audio.text(), 'RIFF'); checks++;
    for (const raw of [`/uploads/${key}`, `/uploads/${key.toUpperCase()}`, `/uploads/${key}::%24DATA`, `/uploads/${key}%3A%3A%24DATA`, `/uploads/${key}.`, `/uploads/${key}%20`, `/uploads/audio/%${key.split('/')[1].charCodeAt(0).toString(16)}${key.split('/')[1].slice(1)}`]) {
      assert.equal((await fetch(`${base}${raw}`)).status, 404, `Raw URL protected: ${raw}`); checks++;
    }
    await call(`/submissions/${submission.id}/review`, teacher.id, 409, 'POST', {decision: 'REJECT', reason: 'Không duyệt'});
    await call(`/submissions/${submission.id}/sharing-consent`, student.id, 200, 'PUT', {isGranted: false});
    await call(`/library/verified-recordings/${verifiedId}/audio`, later.id, 404);
    assert.equal((await call(library, later.id, 200) as {total: number}).total, 0);
    const hidden = await db.verifiedContent.findUniqueOrThrow({where: {id: verifiedId}});
    await call(`/verified-contents/${verifiedId}/visibility`, admin.id, 409, 'PATCH', {status: 'VISIBLE', version: hidden.version});
    await call(`/submissions/${submission.id}/sharing-consent`, student.id, 200, 'PUT', {isGranted: true});
    const visibleAgain = await call(`/verified-contents/${verifiedId}/visibility`, teacher.id, 200, 'PATCH', {status: 'VISIBLE', version: hidden.version}) as {version: number};
    await db.piece.update({where: {id: piece.id}, data: {moderation: 'ADMIN_HIDDEN'}});
    assert.equal((await call(library, later.id, 200) as {total: number}).total, 0);
    await call(`/library/verified-recordings/${verifiedId}/audio`, later.id, 404);
    await db.piece.update({where: {id: piece.id}, data: {moderation: 'NORMAL'}});
    await call(`/verified-contents/${verifiedId}/revoke`, teacher.id, 400, 'POST', {version: visibleAgain.version});
    const revoked = await call(`/verified-contents/${verifiedId}/revoke`, teacher.id, 200, 'POST', {version: visibleAgain.version, reason: 'Thu hồi kiểm tra'}) as {version: number};
    await call(`/verified-contents/${verifiedId}/visibility`, admin.id, 409, 'PATCH', {version: revoked.version, status: 'VISIBLE'});
    await call(`/library/verified-recordings/${verifiedId}/audio`, later.id, 404);
    const ownedAudio = await fetch(`${base}/api/v1/submissions/${submission.id}/audio`, {headers: {Authorization: `Bearer ${tokens[student.id]}`}});
    assert.equal(ownedAudio.status, 200); checks++;
    await new Repo(db).deleteFileIfUnverified(submission.id, new Date(), async () => {throw new Error('Must not delete certified file');});
    assert.equal((await db.submission.findUniqueOrThrow({where: {id: submission.id}})).fileDeletedAt, null);
    assert.equal((await db.submission.findUniqueOrThrow({where: {id: submission.id}})).status, 'COMPLETED');
    assert.equal((await db.sheetMusic.findUniqueOrThrow({where: {id: sheet.id}})).referenceAudioId, null);
    const legacy = await db.submission.create({data: {studentId: student.id, pieceId: piece.id, assignmentId: assignment.id, sheetMusicId: sheet.id, status: 'COMPLETED', fileUrl: upload.url}});
    const legacyAudio = await fetch(`${base}/api/v1/submissions/${legacy.id}/audio`, {headers: {Authorization: `Bearer ${tokens[student.id]}`}});
    assert.equal(legacyAudio.status, 200); checks++;
    const manual = await db.submission.create({data: {studentId: student.id, pieceId: piece.id, assignmentId: assignment.id, sheetMusicId: sheet.id, studentUploadId: upload.id, status: 'FAILED', shareConsent: true}});
    await call(`/submissions/${manual.id}/review`, teacher.id, 409, 'POST', {decision: 'APPROVE'});
    await Promise.all([
      call(`/submissions/${manual.id}/review`, teacher.id, 200, 'POST', {decision: 'APPROVE', manual: true}),
      call(`/submissions/${manual.id}/sharing-consent`, student.id, 200, 'PUT', {isGranted: false})
    ]);
    assert.equal((await db.verifiedContent.findUniqueOrThrow({where:{submissionId:manual.id}})).status, 'HIDDEN');
    assert.equal((await call(library, later.id, 200) as {total: number}).total, 0);
    const rejected = await db.submission.create({data: {studentId: student.id, pieceId: piece.id, assignmentId: assignment.id, sheetMusicId: sheet.id, status: 'COMPLETED'}});
    await call(`/submissions/${rejected.id}/review`, teacher.id, 400, 'POST', {decision: 'REJECT'});
    await call(`/submissions/${rejected.id}/review`, teacher.id, 200, 'POST', {decision: 'REJECT', reason: 'Cần tập lại đoạn cuối'});
    assert.equal((await db.submission.findUniqueOrThrow({where:{id:rejected.id}})).status, 'COMPLETED');
    assert.equal(await db.verifiedContent.count({where:{submissionId:rejected.id}}), 0);
    await call(`/admin/faqs/${faq.id}`, admin.id, 200, 'DELETE');
    console.log(`Phase B integration passed: ${checks} HTTP assertions plus DB invariants.`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Retain the isolated fixture for browser QA; never delete shared dev data.
    await unlink(location).catch(() => undefined);
    await db.$disconnect();
  }
});
