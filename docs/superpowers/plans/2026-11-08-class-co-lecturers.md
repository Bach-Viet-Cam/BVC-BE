# Giảng viên cùng dạy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một lớp có nhiều giảng viên (n-n). Giảng viên cùng dạy có toàn quyền như giảng viên chính, trừ quyền thêm/gỡ giảng viên cùng dạy.

**Architecture:** Thêm bảng nối `class_lecturers` (chỉ chứa giảng viên cùng dạy; giảng viên chính vẫn là `classes.owner_id`). Mọi phép so `class.ownerId === userId` trong BE đổi sang hai helper dùng chung trong `ClassAccessService`: `isClassLecturer` (bản ghi đã load) và `lecturerClassFilter` (Prisma where). Thêm API lookup/thêm/gỡ giảng viên; FE thêm combobox email vào form tạo lớp và mục "Giảng viên" ở `ClassInfoPanel`.

**Tech Stack:** BE: Express + Prisma (PostgreSQL) + zod, test Vitest + supertest (`npm run test:integration`). FE: React + react-hook-form + zod + Base UI combobox, test Vitest + Testing Library (`npm test`).

**Spec:** `D:\BVC\BVC-BE\docs\superpowers\specs\2026-11-08-class-co-lecturers-design.md`

## Global Constraints

- **Không commit** (quy tắc `BVC-BE/CLAUDE.md`): mọi bước "commit" trong plan này thay bằng *để thay đổi trong working tree*. Chỉ commit khi người dùng yêu cầu.
- Không tự viết file migration; sửa `schema.prisma` rồi chạy `npx prisma migrate dev --name add-class-lecturers`. Không chạy `npx prisma db push`.
- Mọi message trả về/hiển thị: tiếng Việt có dấu đầy đủ.
- BE theo `BVC-BE/.agents/rules/coding-convention.md`: mỗi file export đúng một class, PascalCase + hậu tố tầng, kiểu tường minh cho tham số và return. FE theo `BVC-FE/docs/RULES.md` (api → hook → component, `types/*Types.ts`).
- Lớp mà user không phải giảng viên (chính hoặc cùng dạy) → 404 như hiện tại. Giảng viên cùng dạy gọi API quản lý giảng viên → 403.
- Tài khoản giảng viên hợp lệ để gắn/tìm: `role = 2` và `status !== 'LOCKED'` (PENDING được phép).
- Thêm/gỡ giảng viên chỉ khi lớp `ACTIVE` (lớp ENDED → 409 `CLASS_FINISHED`, như các thao tác ghi khác).
- Gỡ giảng viên cùng dạy chỉ xóa dòng `class_lecturers` + audit; không động tới thử thách, bài tập, nhận xét, bài duyệt.
- Thử thách trùng thời gian bị chặn **theo lớp** (bất kể ai tạo).

## Review Focus

1. Giảng viên bị gỡ khỏi lớp gọi lại API của lớp đó (detail, bài tập, nhận xét, tiến độ) → phải nhận 404 ngay, không còn quyền "dính". — test trong Task 4 (`revokes access right after removal`).
2. Tạo lớp với `coLecturerIds` lặp lại cùng một id → lưu một dòng, không lỗi P2002 (không bị báo nhầm "Mã lớp đã tồn tại" do `runUniqueGuarded`). — test trong Task 2.
3. Lookup với email có chữ hoa / khoảng trắng đầu cuối → vẫn khớp (trim + insensitive). — test trong Task 2.
4. Hai giảng viên cùng publish thử thách trùng tuần trên cùng lớp đồng thời → chỉ một cái thành công (lock theo lớp, thứ tự cố định). — test tuần tự trong Task 5; lock theo `classId` đã sort được review bằng mắt.
5. Giảng viên chính bị admin đổi role trong khi là giảng viên cùng dạy ở lớp ACTIVE khác → bị chặn như với lớp của chính họ. — test trong Task 4.

---

### Task 1: Bảng nối + helper quyền + các endpoint lớp hiện có

**Files:**
- Modify: `BVC-BE/prisma/schema.prisma` (model `Class` ~419, model `User`, thêm model `ClassLecturer`)
- Modify: `BVC-BE/src/modules/classes/service/ClassAccessService.ts`
- Modify: `BVC-BE/src/modules/classes/model/ClassModel.ts`
- Modify: `BVC-BE/src/modules/classes/repository/ClassRepository.ts` (`buildListWhere`, `countActiveClasses`, `findCohorts`)
- Modify: `BVC-BE/src/types/ClassTypes.d.ts`
- Modify: `BVC-BE/tests/integration/TestDatabase.ts`
- Create: `BVC-BE/tests/integration/classLecturers.test.ts`

**Interfaces:**
- Produces:
  - Prisma model `ClassLecturer { id, classId, lecturerId, addedById, createdAt }`, `@@unique([classId, lecturerId])`, `@@index([lecturerId])`, `@@map("class_lecturers")`; relation `Class.coLecturers`, `User` relations `"ClassLecturerLecturer"` và `"ClassLecturerAddedBy"` (đúng như spec).
  - `ClassAccessService.lecturerClassFilter(userId: string): Prisma.ClassWhereInput` → `{ OR: [{ ownerId: userId }, { coLecturers: { some: { lecturerId: userId } } }] }`
  - `ClassAccessService.isClassLecturer(classRecord: { ownerId: string; coLecturers: Array<{ lecturerId: string }> }, userId: string): boolean`
  - `ClassAccessService.assertOwnedClass(classId, lecturerId, options)` — giữ chữ ký, giờ chấp nhận giảng viên cùng dạy.
  - `ClassModel.coLecturerSelect = { lecturerId: true }` (dùng lại ở các module khác).
  - `Backend.ClassRecord` có thêm `coLecturers: Array<{ lecturerId: string }>`.
  - `TestDatabase.addCoLecturer(classId: string, lecturerId: string, addedById: string)`.

- [ ] **Step 1: Sửa `schema.prisma`, chạy `npx prisma migrate dev --name add-class-lecturers`.** Expected: migration mới trong `prisma/migrations/`, client sinh lại không lỗi.
- [ ] **Step 2: Thêm `TestDatabase.addCoLecturer`** (create `classLecturer`).
- [ ] **Step 3: Viết test thất bại** trong `classLecturers.test.ts`, `describe('Class co-lecturers')`, setup: `owner`, `coLecturer`, `outsider` (đều `createLecturer`), một lớp FA26 của `owner`, `addCoLecturer(class, coLecturer, owner)`.

```ts
it('lets a co-lecturer list, read, update and end the class', async () => {
  const list = await request(app).get('/api/v1/classes').set('Authorization', coToken);
  expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual([classRecord.id]);
  expect(list.body.data.activeCount).toBe(1);
  expect(list.body.data.cohorts).toEqual([classRecord.cohort]);
  expect((await request(app).get(`/api/v1/classes/${classRecord.id}`).set('Authorization', coToken)).status).toBe(200);
  expect((await request(app).patch(`/api/v1/classes/${classRecord.id}`).set('Authorization', coToken).send({ description: 'Mới' })).status).toBe(200);
  expect((await request(app).post(`/api/v1/classes/${classRecord.id}/end`).set('Authorization', coToken)).status).toBe(200);
});

it('still hides the class from an unrelated lecturer', async () => {
  expect((await request(app).get(`/api/v1/classes/${classRecord.id}`).set('Authorization', outsiderToken)).status).toBe(404);
  const list = await request(app).get('/api/v1/classes').set('Authorization', outsiderToken);
  expect(list.body.data.items).toEqual([]);
});

it('lets a co-lecturer add a student to the class', async () => {
  const response = await request(app).post(`/api/v1/classes/${classRecord.id}/members`).set('Authorization', coToken)
    .send({ email: 'sv.moi@fpt.edu.vn', fullName: 'Sinh Viên Mới', studentCode: 'SE999999' });
  expect(response.status).toBe(201);
});
```

- [ ] **Step 4: Chạy** `npx vitest run tests/integration/classLecturers.test.ts`. Expected: FAIL (co-lecturer nhận 404 / list rỗng).
- [ ] **Step 5: Implement.** Thêm `coLecturers: { select: ClassModel.coLecturerSelect }` vào `ClassModel.classSelect`; `assertOwnedClass` dùng `isClassLecturer`; ba hàm của `ClassRepository` dùng `lecturerClassFilter` thay cho `ownerId`. Lỗi kiểu ở nơi khác dựng `ClassRecord` thì bổ sung `coLecturers`.
- [ ] **Step 6: Chạy** test file mới + `npx vitest run tests/integration/classes.test.ts tests/integration/members.test.ts` + `npm run typecheck`. Expected: PASS, không lỗi kiểu.

---

### Task 2: Tạo lớp có giảng viên cùng dạy + lookup + detail DTO

**Files:**
- Create: `BVC-BE/src/modules/classes/repository/ClassLecturerRepository.ts`
- Create: `BVC-BE/src/modules/classes/service/ClassLecturerService.ts`
- Modify: `BVC-BE/src/modules/classes/service/ClassService.ts` (`createClass`, mọi chỗ gọi `ClassDTO.*`)
- Modify: `BVC-BE/src/modules/classes/dto/ClassDTO.ts`
- Modify: `BVC-BE/src/modules/classes/model/ClassModel.ts`
- Modify: `BVC-BE/src/modules/classes/validation/ClassValidation.ts` (`createClassSchema`, thêm `lookupLecturersSchema`)
- Modify: `BVC-BE/src/modules/classes/controller/ClassController.ts`, `route/ClassRoute.ts`
- Modify: `BVC-BE/src/modules/classes/constant/ClassConstant.ts`
- Modify: `BVC-BE/src/types/ClassTypes.d.ts`
- Test: `BVC-BE/tests/integration/classLecturers.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ClassLecturer` model, `isClassLecturer`).
- Produces:
  - `Backend.LecturerDTO { id: string; fullName: string; email: string }` (`fullName` = `user.username`).
  - `ClassModel.classSelect` thêm `owner: { select: { id, username, email } }` và `coLecturers: { select: { lecturerId: true, lecturer: { select: { id, username, email } } }, orderBy: { createdAt: 'asc' } }` (thay `coLecturerSelect` trong select lớp; `coLecturerSelect` vẫn giữ cho module khác). `Backend.ClassRecord` cập nhật tương ứng.
  - `ClassDTO.toClassSummaryDTO(classRecord, viewerId: string)` thêm `isPrimaryLecturer: boolean`.
  - `ClassDTO.toClassDetailDTO(classRecord, viewerId: string, now: Date = new Date())` thêm `owner: LecturerDTO`, `coLecturers: LecturerDTO[]`, `isPrimaryLecturer`.
  - `Backend.CreateClassInput.coLecturerIds: string[]` (zod: `z.array(z.uuid()).default([]).transform(dedupe)`); `UpdateClassInput` **không** có field này.
  - `ClassLecturerRepository.findAssignableLecturers(ids: string[]): Promise<Array<{ id: string }>>` — `role: 2`, `status: { not: 'LOCKED' }`.
  - `ClassLecturerRepository.searchLecturersByEmail(email: string, excludedId: string): Promise<LecturerRecord[]>` — `email contains insensitive`, cùng điều kiện role/status, `take: ClassConstant.limits.LECTURER_LOOKUP_MAX` (= 10), `orderBy: { email: 'asc' }`.
  - `ClassLecturerRepository.createMany(classId, lecturerIds, addedById, client)`.
  - `ClassLecturerService.assertAssignableLecturers(lecturerIds: string[], ownerId: string): Promise<void>` — chứa `ownerId` → fieldError 400 `coLecturerIds` `LECTURER_IS_OWNER`; có id không hợp lệ → fieldError 400 `coLecturerIds` `LECTURER_UNAVAILABLE`.
  - `ClassLecturerService.lookupLecturers(viewerId: string, email: string): Promise<Backend.LecturerDTO[]>`.
  - Route `GET /classes/lecturers/lookup?email=` (đăng ký **trước** `/:id`), `lecturerOnly`, query `email: z.string().trim().min(1).max(255)`.
  - Messages mới: `LECTURER_IS_OWNER: 'Giảng viên chính không cần thêm làm giảng viên cùng dạy.'`, `LECTURER_UNAVAILABLE: 'Giảng viên đã chọn không tồn tại hoặc đã bị khóa.'`. Field label `coLecturerIds: 'Giảng viên cùng dạy'`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('creates a class with co-lecturers, deduplicated, and returns them in detail', async () => {
  const response = await request(app).post('/api/v1/classes').set('Authorization', ownerToken)
    .send({ name: 'Lớp B', cohort: 'FA26', instrumentId: instrument.id, coLecturerIds: [coLecturer.id, coLecturer.id] });
  expect(response.status).toBe(201);
  expect(response.body.data).toMatchObject({
    owner: { id: owner.id, email: owner.email },
    coLecturers: [{ id: coLecturer.id, email: coLecturer.email }],
    isPrimaryLecturer: true
  });
  const asCo = await request(app).get(`/api/v1/classes/${response.body.data.id}`).set('Authorization', coToken);
  expect(asCo.body.data.isPrimaryLecturer).toBe(false);
});

it('rejects the owner, a student, a locked lecturer and an unknown id as co-lecturers', async () => {
  const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
  const locked = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'LOCKED' });
  const send = (ids: string[]) => request(app).post('/api/v1/classes').set('Authorization', ownerToken)
    .send({ name: `Lớp ${TestDatabase.nextId()}`, cohort: 'FA26', instrumentId: instrument.id, coLecturerIds: ids });
  expect((await send([owner.id])).body.errors[0]).toMatchObject({ field: 'coLecturerIds', message: 'Giảng viên chính không cần thêm làm giảng viên cùng dạy.' });
  for (const id of [student.id, locked.id, crypto.randomUUID()]) {
    const response = await send([id]);
    expect(response.status).toBe(400);
    expect(response.body.errors[0]).toMatchObject({ field: 'coLecturerIds', message: 'Giảng viên đã chọn không tồn tại hoặc đã bị khóa.' });
  }
});

it('accepts a PENDING lecturer as co-lecturer', async () => { /* createUser TEACHER status PENDING → 201 */ });

it('looks up lecturers by email, case-insensitive and trimmed, excluding self, students and locked', async () => {
  const response = await request(app).get('/api/v1/classes/lecturers/lookup')
    .query({ email: `  ${coLecturer.email.slice(0, 6).toUpperCase()} ` }).set('Authorization', ownerToken);
  expect(response.status).toBe(200);
  expect(response.body.data.map((item: Backend.LecturerDTO) => item.id)).toContain(coLecturer.id);
  expect(response.body.data.map((item: Backend.LecturerDTO) => item.id)).not.toContain(owner.id);
});
```
(Đảm bảo email factory của owner/coLecturer có tiền tố chung đủ để case này phân biệt; thêm một student và một lecturer LOCKED có cùng tiền tố và assert họ không xuất hiện.)

- [ ] **Step 2: Chạy** `npx vitest run tests/integration/classLecturers.test.ts`. Expected: các test mới FAIL.
- [ ] **Step 3: Implement** theo Interfaces. Trong `createClass`: gọi `assertAssignableLecturers` trước transaction; trong transaction, sau `createClass` gọi `ClassLecturerRepository.createMany`, rồi đọc lại lớp (`findClassById` qua transaction hoặc select lại) để DTO có `coLecturers`; audit payload `CLASS_CREATE` thêm `coLecturerIds`. Cập nhật mọi chỗ gọi `toClassDetailDTO`/`toClassSummaryDTO` truyền `lecturerId` (grep `ClassDTO.toClass`).
- [ ] **Step 4: Chạy** test file + `tests/integration/classes.test.ts` + `npm run typecheck`. Expected: PASS.

---

### Task 3: Thêm / gỡ giảng viên cùng dạy (chỉ giảng viên chính)

**Files:**
- Modify: `ClassAccessService.ts`, `ClassLecturerRepository.ts`, `ClassLecturerService.ts`, `ClassValidation.ts`, `ClassController.ts`, `ClassRoute.ts`, `ClassConstant.ts` (cùng thư mục `BVC-BE/src/modules/classes/`)
- Test: `BVC-BE/tests/integration/classLecturers.test.ts`

**Interfaces:**
- Consumes: Task 2 (`assertAssignableLecturers`, `LecturerDTO`).
- Produces:
  - `ClassAccessService.assertPrimaryLecturer(classId: string, userId: string, options: { requireActive?: boolean } = {}): Promise<Backend.ClassRecord>` — không phải giảng viên của lớp → 404 `CLASS_NOT_FOUND`; là giảng viên cùng dạy → 403 `LECTURER_MANAGE_FORBIDDEN`; `requireActive` + ENDED → 409 `CLASS_FINISHED`.
  - `ClassLecturerService.addLecturer(classId, ownerId, lecturerId): Promise<Backend.LecturerDTO>`; `removeLecturer(classId, ownerId, lecturerId): Promise<void>`.
  - Routes: `POST /classes/:id/lecturers` body `{ lecturerId: uuid }` → 201, message `LECTURER_ADDED`; `DELETE /classes/:id/lecturers/:lecturerId` → 200 `data: null`, message `LECTURER_REMOVED` (theo mẫu `removeMember`, thay cho 204 trong spec để FE đọc được message).
  - Messages: `LECTURER_MANAGE_FORBIDDEN: 'Chỉ giảng viên chính được quản lý giảng viên cùng dạy.'`, `LECTURER_ALREADY_ADDED: 'Giảng viên đã có trong lớp.'`, `LECTURER_NOT_IN_CLASS: 'Không tìm thấy giảng viên trong lớp.'`, `LECTURER_ADDED: format('MSG-01', { action: 'Thêm', object: 'giảng viên' })`, `LECTURER_REMOVED: format('MSG-01', { action: 'Gỡ', object: 'giảng viên' })`.
  - Audit: `auditActions.LECTURER_ADD = 'CLASS_LECTURER_ADD'`, `LECTURER_REMOVE = 'CLASS_LECTURER_REMOVE'`, `auditEntityTypes.CLASS_LECTURER = 'class_lecturer'`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('lets the owner add and remove a co-lecturer, with audit', async () => {
  const added = await request(app).post(`/api/v1/classes/${classRecord.id}/lecturers`).set('Authorization', ownerToken).send({ lecturerId: outsider.id });
  expect(added.status).toBe(201);
  expect(added.body.data).toMatchObject({ id: outsider.id, email: outsider.email });
  expect((await request(app).post(`/api/v1/classes/${classRecord.id}/lecturers`).set('Authorization', ownerToken).send({ lecturerId: outsider.id })).status).toBe(409);
  const removed = await request(app).delete(`/api/v1/classes/${classRecord.id}/lecturers/${outsider.id}`).set('Authorization', ownerToken);
  expect(removed.status).toBe(200);
  expect(await TestDatabase.prisma.auditLog.count({ where: { action: { in: ['CLASS_LECTURER_ADD', 'CLASS_LECTURER_REMOVE'] } } })).toBe(2);
  expect((await request(app).delete(`/api/v1/classes/${classRecord.id}/lecturers/${outsider.id}`).set('Authorization', ownerToken)).status).toBe(404);
});

it('forbids a co-lecturer from managing lecturers and hides the class from outsiders', async () => {
  const asCo = await request(app).post(`/api/v1/classes/${classRecord.id}/lecturers`).set('Authorization', coToken).send({ lecturerId: outsider.id });
  expect(asCo.status).toBe(403);
  expect(asCo.body.message).toBe('Chỉ giảng viên chính được quản lý giảng viên cùng dạy.');
  expect((await request(app).delete(`/api/v1/classes/${classRecord.id}/lecturers/${coLecturer.id}`).set('Authorization', coToken)).status).toBe(403);
  expect((await request(app).post(`/api/v1/classes/${classRecord.id}/lecturers`).set('Authorization', outsiderToken).send({ lecturerId: outsider.id })).status).toBe(404);
});

it('blocks lecturer changes on an ended class and rejects the owner / locked accounts', async () => { /* ENDED → 409; lecturerId = owner → 400 LECTURER_IS_OWNER; LOCKED → 400 LECTURER_UNAVAILABLE */ });
```

- [ ] **Step 2: Chạy** test file. Expected: FAIL (route chưa có → 404).
- [ ] **Step 3: Implement.** Thêm dùng `assertPrimaryLecturer(..., { requireActive: true })` → `assertAssignableLecturers([lecturerId], ownerId)` → create trong transaction + audit; P2002 → 409 `LECTURER_ALREADY_ADDED`. Gỡ: `assertPrimaryLecturer(..., { requireActive: true })` → `deleteMany({ classId, lecturerId })`, count 0 → 404 `LECTURER_NOT_IN_CLASS`; audit trong cùng transaction.
- [ ] **Step 4: Chạy** test file + `npm run typecheck`. Expected: PASS.

---

### Task 4: Mở quyền cho giảng viên cùng dạy ở các module khác

**Files:**
- Modify: `BVC-BE/src/modules/assignments/model/AssignmentModel.ts:10`, `repository/AssignmentRepository.ts:20`, `service/AssignmentAccessService.ts:10`
- Modify: `BVC-BE/src/modules/assignments/repository/SubmissionRepository.ts:79,92`, `service/SubmissionCommentService.ts:15`
- Modify: `BVC-BE/src/modules/classes/repository/ProgressRepository.ts:20-29`, `service/ProgressService.ts:16-24`
- Modify: `BVC-BE/src/modules/challenges/repository/ChallengeRepository.ts:74`, `service/ChallengeReferenceService.ts:36`
- Modify: `BVC-BE/src/modules/community/model/VerifiedModel.ts` (`sourceInclude.assignment.class`, `include.sourceClass`), `service/VerifiedPolicyService.ts`, `service/SubmissionReviewService.ts`, `dto/VerifiedDTO.ts:14`
- Modify: `BVC-BE/src/modules/platform/repository/UserRepository.ts:65`
- Modify: `BVC-BE/src/types/AssignmentTypes.d.ts:39`, `src/types/ClassTypes.d.ts`
- Test: `BVC-BE/tests/integration/classLecturers.test.ts`

**Interfaces:**
- Consumes: `ClassAccessService.isClassLecturer`, `lecturerClassFilter`, `ClassModel.coLecturerSelect` (Task 1); `TestDatabase.createAssignment/createSubmission/addMember` (có sẵn).
- Produces:
  - Mọi `class` select trong các file trên thêm `coLecturers: { select: ClassModel.coLecturerSelect }`; với `include` (community) dùng `class: { include: { coLecturers: { select: { lecturerId: true } } } }` và `sourceClass: { include: { coLecturers: ... } }`.
  - `VerifiedPolicyService.canManage(actor: Backend.UserDTO, sourceClass: { ownerId: string; coLecturers: Array<{ lecturerId: string }> }): boolean` (đổi chữ ký; cập nhật `VerifiedDTO` và `assertManage`).
  - `SubmissionReviewService` dùng `isClassLecturer` cho cả `assertRead`, `canReview`, `decide`.
  - `ProgressRepository.findClassesByOwner(ownerId)` lọc bằng `lecturerClassFilter`; `ProgressService.getOwnedClassOrThrow` giữ 403 hiện có cho người ngoài.
  - `UserRepository.countActiveClassesOwnedBy(userId)` → `where: { ...ClassAccessService.lecturerClassFilter(userId), status: 'ACTIVE' }`.

- [ ] **Step 1: Viết test thất bại** — trong `classLecturers.test.ts`, `describe('co-lecturer access across modules')`, dựng lớp của owner + co-lecturer + một sinh viên + một assignment published + một submission:

```ts
it('lets a co-lecturer manage assignments, comment, see progress and review', async () => {
  expect((await request(app).get('/api/v1/assignments').set('Authorization', coToken)).body.data.items).toHaveLength(1);
  expect((await request(app).get(`/api/v1/assignments/${assignment.id}`).set('Authorization', coToken)).status).toBe(200);
  expect((await request(app).put(`/api/v1/submissions/${submission.id}/comment`).set('Authorization', coToken).send({ content: 'Tốt' })).status).toBeLessThan(300);
  expect((await request(app).get('/api/v1/classes/owned').set('Authorization', coToken)).body.data.map((item: { id: string }) => item.id)).toContain(classRecord.id);
  expect((await request(app).get(`/api/v1/classes/${classRecord.id}/progress`).set('Authorization', coToken)).status).toBe(200);
  expect((await request(app).get(`/api/v1/submissions/${submission.id}/review`).set('Authorization', coToken)).status).toBe(200);
});

it('revokes access right after removal', async () => {
  await request(app).delete(`/api/v1/classes/${classRecord.id}/lecturers/${coLecturer.id}`).set('Authorization', ownerToken);
  expect((await request(app).get(`/api/v1/classes/${classRecord.id}`).set('Authorization', coToken)).status).toBe(404);
  expect((await request(app).get(`/api/v1/assignments/${assignment.id}`).set('Authorization', coToken)).status).toBe(404);
});

it('blocks an admin role change while the lecturer co-teaches an active class', async () => {
  // admin (role 3) PATCH /api/v1/users/:coLecturerId { role: 1 } → bị từ chối với cùng status/message mà
  // UserPolicyService.canChangeRole trả khi targetOwnsActiveClasses = true
});
```
Các route đã kiểm: `/api/v1/assignments`, `/api/v1/assignments/:id`, `/api/v1/submissions/:id/comment`, `/api/v1/classes/owned`, `/api/v1/classes/:classId/progress`, `/api/v1/submissions/:id/review`, `/api/v1/users/:id`. Body tối thiểu của comment xem `submissionComments.test.ts`.
Thêm test thử thách: co-lecturer tạo draft thử thách (`POST /api/v1/lecturer/challenges`) với `classIds: [classRecord.id]` → 201; outsider → 404.

- [ ] **Step 2: Chạy** test file. Expected: FAIL ở các assertion của co-lecturer.
- [ ] **Step 3: Implement** theo Interfaces; sau cùng `grep -rn "ownerId" src` và xác nhận các chỗ còn lại chỉ thuộc Piece/SheetMusic/Audio hoặc là ghi `ownerId` khi tạo lớp / select trong `ClassModel`.
- [ ] **Step 4: Chạy** `npm run test:integration` (toàn bộ) + `npm test` + `npm run typecheck`. Expected: PASS.

---

### Task 5: Chặn thử thách trùng thời gian theo lớp

**Files:**
- Modify: `BVC-BE/src/modules/challenges/repository/ChallengeRepository.ts:77-98`
- Modify: `BVC-BE/src/modules/challenges/service/ChallengeService.ts:139,160`
- Modify: `BVC-BE/src/modules/challenges/constant/ChallengeConstant.ts:42` (chỉ nếu cần)
- Test: `BVC-BE/tests/integration/challenges.test.ts` (cạnh test `'blocks an overlapping challenge for the same instrument, week and class only'` ~245)

**Interfaces:**
- Produces:
  - `ChallengeRepository.lockClasses(classIds: string[], client: Prisma.TransactionClient): Promise<void>` — thay `lockLecturer`; với từng `classId` theo **thứ tự đã sort**, `pg_advisory_xact_lock(hashtext('challenge-class:' || classId))`.
  - `ChallengeRepository.findOverlappingClassIds(data: { instrumentId; classIds; startsAt; endsAt; excludeChallengeId? }, client)` — bỏ `lecturerId`/`createdById`.
  - `CLASS_OVERLAP` hiện là "lớp đã có thử thách khác trong tuần này" — đã trung tính, **giữ nguyên**.

- [ ] **Step 1: Viết test thất bại** — trong `challenges.test.ts`:

```ts
it('blocks a co-lecturer from publishing over the owner\'s challenge on the same class and week', async () => {
  const coLecturer = await TestDatabase.createLecturer();
  await TestDatabase.addCoLecturer(classA.id, coLecturer.id, lecturer.id);
  // lecturer publish thử thách tuần monday(1) cho classA → 201 (dùng helper/payload sẵn có của file)
  // coLecturer publish thử thách cùng nhạc cụ, cùng tuần, classIds [classA.id] → 409, message 'CLASS_OVERLAP' hiện có
  // coLecturer publish tuần monday(2) → 201
});
```

- [ ] **Step 2: Chạy** `npx vitest run tests/integration/challenges.test.ts`. Expected: test mới FAIL (lần publish thứ hai trả 201).
- [ ] **Step 3: Implement**: trong `ChallengeService` gọi `lockClasses(plan.classIds, transaction)` ở vị trí `lockLecturer` cũ; bỏ `lecturerId` khỏi lời gọi `findOverlappingClassIds`. Nếu lúc khóa chưa biết `classIds` (draft không lớp) thì bỏ qua khóa.
- [ ] **Step 4: Chạy** `npx vitest run tests/integration/challenges.test.ts` + `npm run typecheck`. Expected: PASS, kể cả test overlap cũ.

---

### Task 6: FE — combobox giảng viên trong form tạo lớp

**Files:**
- Modify: `BVC-FE/src/features/classes/types/classTypes.ts` (`ClassPayload`, `ClassDetail`, `ClassSummary`, thêm `Lecturer`)
- Modify: `BVC-FE/src/features/classes/api/classesApi.ts`
- Create: `BVC-FE/src/features/classes/hooks/useLecturerLookup.ts`
- Create: `BVC-FE/src/features/classes/components/LecturerPicker.tsx`
- Modify: `BVC-FE/src/features/classes/components/ClassForm.tsx`, `ClassCreateDialog.tsx`
- Modify: `BVC-FE/src/features/classes/utils/validateClassForm.ts`
- Test: `BVC-FE/src/features/classes/__tests__/LecturerPicker.test.tsx`, `ClassForm` test mới hoặc mở rộng test hiện có

**Interfaces:**
- Consumes: API Task 2.
- Produces:
  - `interface Lecturer { id: string; fullName: string; email: string }`; `ClassDetail` thêm `owner: Lecturer; coLecturers: Lecturer[]; isPrimaryLecturer: boolean`; `ClassSummary` thêm `isPrimaryLecturer: boolean`; `ClassPayload` thêm `coLecturerIds?: string[]`.
  - `classesApi.lookupLecturers(email: string)` → `GET /classes/lecturers/lookup`; `addLecturer(classId, lecturerId)`; `removeLecturer(classId, lecturerId)`.
  - `useLecturerLookup(): { results: Lecturer[]; isSearching: boolean; search: (email: string) => void }` — debounce 300ms, bỏ qua chuỗi rỗng sau trim.
  - `LecturerPicker({ value: Lecturer[]; onChange: (lecturers: Lecturer[]) => void; excludedIds?: string[]; label: string; id: string; disabled?: boolean })` — Base UI `Combobox` (`@/shared/components/ui/combobox`) chế độ chọn nhiều; chip hiển thị `fullName` + `email`, nút ✕ `aria-label="Bỏ {fullName}"`; gợi ý loại `value` và `excludedIds`; trống kết quả: "Không tìm thấy giảng viên".
  - `ClassForm`: chỉ khi `isCreate`, `FormField` "Giảng viên cùng dạy" ngay sau "Mô tả" (trước khối ngày); giá trị lưu ở state form `coLecturers: Lecturer[]` (không validate zod ngoài kiểu); submit gửi `coLecturerIds: coLecturers.map(id)`; `FORM_FIELDS` thêm `coLecturerIds` để `applyFieldErrors` gắn lỗi BE vào trường.
  - Mô tả đầu dialog trong `ClassCreateDialog`: "Sau khi tạo lớp, bạn thêm sinh viên hoặc nhập danh sách từ file và quản lý giảng viên cùng dạy trong trang chi tiết lớp."

- [ ] **Step 1: Viết test thất bại** `LecturerPicker.test.tsx` (mock `classesApi.lookupLecturers`):

```tsx
it('searches by email, adds a chip, hides it from suggestions and removes it', async () => {
  // gõ "gv" → thấy option "Nguyễn Văn A · gv.a@fpt.edu.vn" → click → onChange([lecturerA])
  // rerender value=[lecturerA] → gõ "gv" lại → không còn option lecturerA
  // click nút "Bỏ Nguyễn Văn A" → onChange([])
});
```
và trong test `ClassForm` (tạo mới): chọn một giảng viên rồi submit → `onSubmit` nhận payload có `coLecturerIds: [lecturerA.id]`; form sửa (`classDetail` khác null) không render label "Giảng viên cùng dạy".

- [ ] **Step 2: Chạy** `npx vitest run src/features/classes/__tests__/LecturerPicker.test.tsx`. Expected: FAIL (component chưa có).
- [ ] **Step 3: Implement** theo Interfaces.
- [ ] **Step 4: Chạy** `npm test` + `npm run typecheck` + `npm run lint` (trong `BVC-FE`). Expected: PASS.
- [ ] **Step 5: Kiểm tra trên trình duyệt** `http://localhost:5173/teacher/classes?create=class`: trường nằm dưới "Mô tả", chọn/bỏ chip được, tạo lớp thành công.

---

### Task 7: FE — mục "Giảng viên" ở trang chi tiết lớp

**Files:**
- Create: `BVC-FE/src/features/classes/hooks/useClassLecturers.ts`
- Create: `BVC-FE/src/features/classes/components/ClassLecturersSection.tsx`
- Modify: `BVC-FE/src/features/classes/components/ClassInfoPanel.tsx`, `pages/ClassDetailPage.tsx`
- Test: `BVC-FE/src/features/classes/__tests__/ClassLecturersSection.test.tsx`

**Interfaces:**
- Consumes: `LecturerPicker`, `classesApi.addLecturer/removeLecturer`, `ClassDetail.owner/coLecturers/isPrimaryLecturer` (Task 6); `ConfirmDialog` (`@/shared/components/bvc/ConfirmDialog`), `toast`.
- Produces:
  - `useClassLecturers(classId: string, onChanged: (coLecturers: Lecturer[]) => void): { addLecturer: (lecturer: Lecturer) => Promise<void>; removeLecturer: (lecturerId: string) => Promise<void>; isSaving: boolean }` — toast message từ BE khi thành công, `parseApiError` khi lỗi.
  - `ClassLecturersSection({ classDetail: ClassDetail; onChanged: (coLecturers: Lecturer[]) => void })` — `aria-label="Giảng viên"`; dòng giảng viên chính có nhãn "Chính"; sau đó các giảng viên cùng dạy (tên + email). Chỉ khi `isPrimaryLecturer && !isReadOnly`: `LecturerPicker` (với `excludedIds` = owner + coLecturers, chọn một người → gọi add ngay) và nút "Gỡ" mỗi dòng mở `ConfirmDialog` "Gỡ {fullName} khỏi lớp?".
  - `ClassDetailPage` truyền `onChanged` cập nhật `setClassDetail({ ...classDetail, coLecturers })`; `ClassInfoPanel` render section bên dưới hàng thông tin hiện tại.

- [ ] **Step 1: Viết test thất bại**

```tsx
it('shows owner with "Chính" and co-lecturers read-only for a co-lecturer', () => {
  // isPrimaryLecturer=false → thấy "Chính", thấy email co-lecturer, không có nút "Gỡ", không có ô tìm giảng viên
});
it('lets the primary lecturer remove a co-lecturer after confirming', async () => {
  // isPrimaryLecturer=true → click "Gỡ" → dialog "Gỡ Nguyễn Văn A khỏi lớp?" → xác nhận → classesApi.removeLecturer(classId, lecturerA.id), onChanged([])
});
it('hides management on an ended class', () => { /* isReadOnly=true, isPrimaryLecturer=true → không có nút "Gỡ" */ });
```

- [ ] **Step 2: Chạy** `npx vitest run src/features/classes/__tests__/ClassLecturersSection.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** theo Interfaces.
- [ ] **Step 4: Chạy** `npm test` + `npm run typecheck` + `npm run lint`. Expected: PASS.
- [ ] **Step 5: Kiểm tra trên trình duyệt**: đăng nhập giảng viên chính → thêm/gỡ được; đăng nhập giảng viên cùng dạy → thấy lớp trong danh sách, mục "Giảng viên" chỉ xem.
