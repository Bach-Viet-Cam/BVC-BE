# Sao chép lớp khi tạo lớp mới — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trong modal "Tạo lớp học", giảng viên chọn một lớp mình dạy làm nguồn, form được điền sẵn, chọn/sửa bài tập, rồi lưu lớp mới cùng các bài trong một transaction.

**Architecture:** BE mở rộng `POST /classes` nhận `assignments[]` + `sourceClassId`, kiểm tra bằng service thuần `ClassCopyPolicyService`, tạo bài trong transaction của `createClass`. Thêm `GET /classes/:id/copy-source` và cho `GET /assignments/sheet-music` nhận `instrumentId`. FE thêm hook `useClassCopy`, các component `CopySourcePickerDialog`, `CopyAssignmentList`, `CopyAssignmentEditDialog`, tách `AssignmentContentFields` khỏi `AssignmentForm`, và nối vào `ClassForm`/`ClassCreateDialog`.

**Tech Stack:** BE: Express + Prisma + zod, unit test `tsx --test` (`node:test` + `node:assert/strict`). FE: React 19 + react-hook-form + zod + Vitest/Testing Library.

**Spec:** `BVC-BE/docs/superpowers/specs/2026-11-10-class-copy-design.md` — đọc trước khi làm bất kỳ task nào.

## Global Constraints

- Repo: `/home/anhnlh/WorkSpace/BVC/BVC-BE` và `/home/anhnlh/WorkSpace/BVC/BVC-FE`, cả hai trên nhánh `feature/m03-classes-members`. Không đổi nhánh.
- **KHÔNG commit, KHÔNG push.** Để thay đổi trong working tree; người dùng tự commit.
- **KHÔNG chạy `npm run test:integration` / `vitest` ở BE** và không chạy bất kỳ lệnh nào chạm DB (`prisma migrate`, `db push`, seed): `localhost:5432` là tunnel tới DB dev remote dùng chung, test integration sẽ xoá dữ liệu. Không sửa `schema.prisma` (tính năng không cần migration).
- Không sửa CI/CD (`.github/`, workflows).
- BE: đọc và theo `BVC-BE/.agents/rules/coding-convention.md`. Mỗi file mới export đúng một class; tên file PascalCase có hậu tố layer.
- FE: đọc và theo `BVC-FE/docs/RULES.md`. Dùng component/token có sẵn (`FormDialog`, `FormField`, `ActionButton`, `INPUT_CLASSES`, màu `bvc-*`), không thêm màu mới.
- Mọi message hiển thị cho người dùng bằng tiếng Việt có dấu đầy đủ.
- Lỗi theo từng bài: field `assignments.<index>.<field>`, index theo thứ tự trong mảng `assignments` gửi lên.
- Message trùng loại (BE và FE giống hệt): `Không thể lưu bài tập vì danh sách sao chép có nhiều hơn một bài {Độc tấu|Hòa tấu}.`
- Message bản nhạc không dùng được: `AssignmentConstant.messages.SHEET_MUSIC_UNAVAILABLE` (`Bản nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.`).
- Tối đa 50 bài trong `assignments`.
- Lệnh kiểm tra BE: `cd BVC-BE && npm test && npm run typecheck && npm run lint`.
- Lệnh kiểm tra FE: `cd BVC-FE && npm test -- --run && npm run typecheck && npm run lint`.

## Review Focus

1. Người dùng đổi mã lớp sang môn khác sau khi chọn nguồn → bản nhạc của bài nguồn không hợp lệ: BE phải trả lỗi `assignments.<i>.sheetMusicId`, không tạo lớp (Task 2 test policy; Task 8 test hiện lỗi đúng dòng).
2. Bỏ tick một bài ở giữa danh sách rồi BE trả lỗi `assignments.1.*` → lỗi phải gắn vào dòng **được tick** thứ hai, không phải dòng thứ hai hiển thị (Task 5 test `mapCopyErrors`).
3. Lớp nguồn có bài CLOSED → payload gửi `PUBLISHED`; BE từ chối `CLOSED` (Task 1 test schema, Task 5 test `buildCopyAssignments`).
4. Người gọi là giảng viên cùng dạy của lớp nguồn → danh sách giảng viên điền sẵn gồm giảng viên chính cũ, không gồm chính người gọi (Task 4 test `toCopySourceDTO`).
5. "Bỏ sao chép" sau khi đã sửa → form về trống, không còn `assignments` / `sourceClassId` trong payload (Task 8 test).

---

## File map

**BE (`BVC-BE/src`)**
- Modify `modules/assignments/validation/AssignmentValidation.ts` — export `contentShape`; `sheetMusicSchema` nhận `classId` hoặc `instrumentId`.
- Modify `modules/classes/validation/ClassValidation.ts` — `createClassSchema` thêm `sourceClassId`, `assignments`.
- Modify `types/ClassTypes.d.ts` — `CreateClassInput`, `CopyAssignmentInput`, `ClassCopySourceDTO`.
- Create `modules/classes/service/ClassCopyPolicyService.ts` (+ `.test.ts`) — kiểm tra thuần danh sách bài.
- Modify `modules/classes/constant/ClassConstant.ts` — message `COPY_KIND_DUPLICATED`.
- Modify `modules/assignments/service/AssignmentService.ts` — `createManyInTransaction`.
- Modify `modules/classes/service/ClassService.ts` — `createClass` nhận bài; `getCopySource`.
- Modify `modules/classes/dto/ClassDTO.ts` — `toCopySourceDTO`.
- Modify `modules/classes/repository/ClassRepository.ts` hoặc `modules/assignments/repository/AssignmentRepository.ts` — `findCopyableAssignments(classId)`.
- Modify `modules/classes/controller/ClassController.ts`, `route/ClassRoute.ts` — route copy-source.
- Modify `modules/assignments/service/AssignmentQueryService.ts`, `controller/AssignmentController.ts` — sheet music theo `instrumentId`.

**FE (`BVC-FE/src/features/classes`)**
- Modify `types/classTypes.ts`, `api/classesApi.ts`, `api/assignmentsApi.ts`, `hooks/useClassSheetMusic.ts`.
- Create `utils/classCopy.ts` (+ `__tests__/classCopy.test.ts`).
- Create `hooks/useClassCopy.ts`.
- Create `components/AssignmentContentFields.tsx`; modify `components/AssignmentForm.tsx`.
- Create `components/CopyAssignmentEditDialog.tsx`, `components/CopyAssignmentList.tsx` (+ `__tests__/CopyAssignmentList.test.tsx`).
- Create `components/CopySourcePickerDialog.tsx`.
- Modify `components/ClassForm.tsx`, `components/ClassCreateDialog.tsx`, `__tests__/ClassForm.test.tsx`.

Track BE (Task 1–4) và track FE (Task 5–8) độc lập về file; FE chỉ phụ thuộc vào hợp đồng API mô tả trong Interfaces.

---

### Task 1: BE — Validation và types

**Files:**
- Modify: `BVC-BE/src/modules/assignments/validation/AssignmentValidation.ts`
- Modify: `BVC-BE/src/modules/classes/validation/ClassValidation.ts`
- Modify: `BVC-BE/src/types/ClassTypes.d.ts`
- Test: `BVC-BE/src/modules/assignments/validation/AssignmentValidation.test.ts`, create `BVC-BE/src/modules/classes/validation/ClassValidation.test.ts`

**Interfaces:**
- Produces:
  - `AssignmentValidation.contentShape` — `static readonly` object `{ title, description, kind, sheetMusicId, requiredBpm }` (chính là `content` hiện có).
  - `ClassValidation.createClassSchema.body` thêm `sourceClassId: string (trim, 1..64) | undefined` và `assignments: Array<{ ...contentShape, status: 'DRAFT' | 'PUBLISHED' }>` mặc định `[]`, `.max(50)`.
  - `AssignmentValidation.sheetMusicSchema.query` = `{ classId?: string; instrumentId?: uuid }`, `.refine` đúng một trong hai có mặt.
  - Trong `Backend` namespace (`types/ClassTypes.d.ts`):
    ```ts
    interface CopyAssignmentInput extends AssignmentContentInput { status: 'DRAFT' | 'PUBLISHED' }
    interface CreateClassInput { name; cohort; instrumentId; description?; coLecturerIds: string[]; sourceClassId?: string; assignments: CopyAssignmentInput[] }
    interface ClassCopySourceDTO {
      id: string; name: string; cohort: string; description: string | null;
      instrument: { id: string; name: string };
      coLecturers: LecturerDTO[];
      assignments: Array<{ id: string; title: string; kind: AssignmentKind; description: string | null;
        sheetMusic: AssignmentSheetMusicDTO | null; requiredBpm: number | null; status: AssignmentStatus }>;
    }
    ```
    `UpdateClassInput` giữ nguyên ý nghĩa: `Partial<Omit<CreateClassInput, 'coLecturerIds' | 'sourceClassId' | 'assignments'>>`.

- [ ] **Step 1: Viết test lỗi** trong `ClassValidation.test.ts` (dùng `node:test`, cùng kiểu `AssignmentValidation.test.ts`), với `parse = (body) => ClassValidation.createClassSchema.safeParse({ body, params: {}, query: {} })` và `base = { name: 'DNH103.M2.H1', cohort: 'SP27-H1', instrumentId: <uuid hợp lệ> }`:
  - `parse(base)` thành công và `data.body.assignments` deep-equal `[]`.
  - `parse({ ...base, assignments: [{ title: 'Bài 1', kind: 'SOLO', status: 'CLOSED' }] }).success === false`.
  - `parse({ ...base, assignments: [{ title: '  ', kind: 'OTHER', status: 'DRAFT' }] }).success === false`.
  - 51 bài hợp lệ → `false`; 50 bài → `true`.
  - `parse({ ...base, sourceClassId: 'seed-class-trd301', assignments: [{ title: 'Bài 1', kind: 'OTHER', status: 'PUBLISHED', requiredBpm: 90 }] })` thành công, `assignments[0]` có `description: null`, `sheetMusicId: null`, `requiredBpm: 90`.
- [ ] **Step 2: Thêm test** vào `AssignmentValidation.test.ts`: `sheetMusicSchema` với query `{}` → `false`; `{ classId: 'c1', instrumentId: <uuid> }` → `false`; `{ classId: 'c1' }` → `true`; `{ instrumentId: <uuid> }` → `true`; `{ instrumentId: 'abc' }` → `false`.
- [ ] **Step 3: Chạy** `cd BVC-BE && npm test` — Expected: các test mới FAIL.
- [ ] **Step 4: Cài đặt** schema và types như Interfaces. `AssignmentController.listClassSheetMusic` tạm thời vẫn đọc `query.classId` (Task 4 xử lý `instrumentId`); typecheck phải qua — nếu kiểu `classId` thành optional gây lỗi, ép `query.classId as string` kèm comment `// Task 4`. `ClassService.createClass` phải vẫn compile (chưa dùng trường mới).
- [ ] **Step 5: Chạy** `npm test && npm run typecheck && npm run lint` — Expected: PASS.

### Task 2: BE — `ClassCopyPolicyService`

**Files:**
- Create: `BVC-BE/src/modules/classes/service/ClassCopyPolicyService.ts`
- Create: `BVC-BE/src/modules/classes/service/ClassCopyPolicyService.test.ts`
- Modify: `BVC-BE/src/modules/classes/constant/ClassConstant.ts`

**Interfaces:**
- Consumes: `Backend.CopyAssignmentInput` (Task 1), `AssignmentConstant.singleKinds`, `AssignmentConstant.kindLabels`, `AssignmentConstant.messages.SHEET_MUSIC_UNAVAILABLE`.
- Produces:
  - `ClassConstant.messages.COPY_KIND_DUPLICATED(kindLabel: string): string` = `format('MSG-08', { action: 'lưu bài tập', reason: \`danh sách sao chép có nhiều hơn một bài ${kindLabel}\` })`.
  - `ClassCopyPolicyService.findAssignmentErrors(assignments: Backend.CopyAssignmentInput[], selectableSheetIds: ReadonlySet<string>): Backend.FieldError[]` — thuần, không I/O. `selectableSheetIds` là tập `sheetMusicId` đã xác nhận dùng được cho nhạc cụ lớp mới. Mỗi lỗi `{ field: \`assignments.${i}.kind\` | \`assignments.${i}.sheetMusicId\`, code: 'MSG-08' | 'MSG-48', message }`. Thứ tự lỗi theo index tăng dần.

- [ ] **Step 1: Viết test lỗi**:
  - `[]` → `[]`.
  - `[SOLO, ENSEMBLE, OTHER, OTHER, BONUS, BONUS]` không bản nhạc → `[]`.
  - `[SOLO 'A', OTHER 'B', SOLO 'C']` → đúng 2 lỗi, field `assignments.0.kind` và `assignments.2.kind`, message `Không thể lưu bài tập vì danh sách sao chép có nhiều hơn một bài Độc tấu.`
  - 2 ENSEMBLE → message chứa `Hòa tấu`.
  - `[{ kind: 'OTHER', sheetMusicId: 's1' }, { kind: 'OTHER', sheetMusicId: 's2' }]` với tập `{'s1'}` → đúng 1 lỗi `assignments.1.sheetMusicId`, code `MSG-48`.
  - Bài có `sheetMusicId: null` không bao giờ bị lỗi bản nhạc.
- [ ] **Step 2: Chạy** `npm test` — Expected: FAIL (module không tồn tại).
- [ ] **Step 3: Cài đặt** `findAssignmentErrors` và message.
- [ ] **Step 4: Chạy** `npm test && npm run typecheck && npm run lint` — Expected: PASS.

### Task 3: BE — `POST /classes` tạo kèm bài tập

**Files:**
- Modify: `BVC-BE/src/modules/assignments/service/AssignmentService.ts`
- Modify: `BVC-BE/src/modules/classes/service/ClassService.ts`
- Modify (nếu cần cho message thành công): `BVC-BE/src/modules/classes/controller/ClassController.ts`

**Interfaces:**
- Consumes: `ClassCopyPolicyService.findAssignmentErrors` (Task 2), `Backend.CreateClassInput` (Task 1), `AssignmentRepository.createAssignment`, `AssignmentRepository.createVersionAndMakeCurrent`, `AssignmentRepository.isSheetMusicSelectable`, `ClassAccessService.assertOwnedClass`.
- Produces:
  - `AssignmentService.createManyInTransaction(classId: string, lecturerId: string, items: Backend.CopyAssignmentInput[], deadline: Date, sourceClassId: string | null, transaction: Prisma.TransactionClient, now?: Date): Promise<string[]>` — với mỗi bài theo thứ tự: `AssignmentRepository.createAssignment({ classId, createdById: lecturerId, status, publishedAt: status === 'PUBLISHED' ? now : null, deadline }, item, transaction)` → `createVersionAndMakeCurrent(id, 1, item, lecturerId, transaction)` → `AssignmentService.audit(lecturerId, auditActions.CREATE, id, transaction, { status, copiedFromClassId: sourceClassId })`. Không gọi `notifyMembers`. Trả về danh sách id.
  - `ClassService.createClass(lecturerId, input, now)` (chữ ký giữ nguyên):
    1. Các kiểm tra hiện có giữ nguyên thứ tự.
    2. Nếu `input.sourceClassId`: `await ClassAccessService.assertOwnedClass(input.sourceClassId, lecturerId)` (không `requireActive`).
    3. Tập `selectableSheetIds`: với mỗi `sheetMusicId` khác nhau trong `input.assignments`, giữ lại nếu `AssignmentRepository.isSheetMusicSelectable(id, input.instrumentId)`.
    4. `errors = ClassCopyPolicyService.findAssignmentErrors(input.assignments, selectableSheetIds)`; nếu `errors.length > 0` → `throw new AppError(errors[0].message, 400, { code: errors[0].code, field: errors[0].field, fieldErrors: errors })`.
    5. Trong transaction hiện có, sau `ClassLecturerRepository.createMany`: `AssignmentService.createManyInTransaction(newClass.id, lecturerId, input.assignments, classData.endDate, input.sourceClassId ?? null, transaction, now)`.
    6. Payload audit `CLASS_CREATE` thêm `sourceClassId: input.sourceClassId ?? null, assignmentCount: input.assignments.length`.
  - Message phản hồi: giữ `Tạo lớp thành công.` khi không có bài; khi có N > 0 bài, controller trả `Đã tạo lớp và sao chép N bài tập.` (FE hiển thị message của server).

- [ ] **Step 1: Kiểm tra vòng phụ thuộc** — `ClassService` đã import `AssignmentService` và `AssignmentRepository`; `AssignmentService` import `ClassAccessService` (không import `ClassService`) → không vòng. Xác nhận bằng `grep -n "^import" BVC-BE/src/modules/assignments/service/AssignmentService.ts`.
- [ ] **Step 2: Cài đặt** `createManyInTransaction`, rồi refactor `createAssignment` để không lặp phần tạo record + version (có thể gọi chung một helper private `insertAssignment`). Hành vi `createAssignment` không đổi.
- [ ] **Step 3: Cài đặt** các thay đổi `ClassService.createClass` và message controller như Interfaces.
- [ ] **Step 4: Chạy** `cd BVC-BE && npm test && npm run typecheck && npm run lint` — Expected: PASS. (Không có integration test; hành vi transaction được reviewer đọc code xác nhận.)

### Task 4: BE — `GET /classes/:id/copy-source` và sheet music theo nhạc cụ

**Files:**
- Modify: `BVC-BE/src/modules/assignments/repository/AssignmentRepository.ts`
- Modify: `BVC-BE/src/modules/classes/dto/ClassDTO.ts` (+ create `BVC-BE/src/modules/classes/dto/ClassDTO.test.ts` nếu chưa có)
- Modify: `BVC-BE/src/modules/classes/service/ClassService.ts`, `controller/ClassController.ts`, `route/ClassRoute.ts`
- Modify: `BVC-BE/src/modules/assignments/service/AssignmentQueryService.ts`, `controller/AssignmentController.ts`

**Interfaces:**
- Consumes: `Backend.ClassCopySourceDTO` (Task 1), `ClassValidation.classIdSchema`, `AssignmentValidation.sheetMusicSchema` (Task 1), `AssignmentModel` include hiện có (cho `currentVersion.sheetMusic.piece`).
- Produces:
  - `AssignmentRepository.findCopyableAssignments(classId: string): Promise<Backend.AssignmentRecord[]>` — `deletedAt: null`, `currentVersionId: { not: null }`, cùng include với `findById`, `orderBy: { createdAt: 'asc' }`.
  - `ClassDTO.toCopySourceDTO(classRecord: Backend.ClassRecord, assignments: Backend.AssignmentRecord[], viewerId: string): Backend.ClassCopySourceDTO` — `coLecturers` = `[owner, ...coLecturers.lecturer]` bỏ `viewerId`, map qua `ClassDTO.toLecturerDTO`; `assignments` sắp SOLO → ENSEMBLE → còn lại (giữ thứ tự `createdAt` trong từng nhóm); `sheetMusic` map giống `AssignmentDTO.toBaseDTO` (tách phần map sheet music thành `AssignmentDTO.toSheetMusicDTO(sheet)` static để dùng chung).
  - `ClassService.getCopySource(classId: string, lecturerId: string): Promise<Backend.ClassCopySourceDTO>` — `assertOwnedClass(classId, lecturerId)` (không `requireActive`) rồi DTO.
  - Route `GET /classes/:id/copy-source` đăng ký **trước** `classRouter.get('/:id', …)`, validate `classIdSchema`, `lecturerOnly`, controller `ClassController.getCopySource`.
  - `AssignmentQueryService.listClassSheetMusic(target: { classId?: string; instrumentId?: string }, lecturerId: string)` — `classId` → như cũ; `instrumentId` → `SubmissionRepository.findClassSheetMusic(instrumentId)` (không cần kiểm tra quyền lớp). Controller truyền `{ classId, instrumentId }` từ query.

- [ ] **Step 1: Viết test lỗi** `ClassDTO.test.ts` (`node:test`) cho `toCopySourceDTO` với record giả lập dựng tay:
  - Viewer là owner `u1`, coLecturers `u2`, `u3` → `coLecturers.map(id)` = `['u2','u3']`.
  - Viewer là co-lecturer `u2` → `['u1','u3']`.
  - Bài theo `createdAt`: OTHER(1), ENSEMBLE(2), SOLO(3), BONUS(4) → kind theo thứ tự `['SOLO','ENSEMBLE','OTHER','BONUS']`.
  - Bài CLOSED giữ `status: 'CLOSED'` trong DTO.
- [ ] **Step 2: Chạy** `npm test` — Expected: FAIL.
- [ ] **Step 3: Cài đặt** repository, DTO, service, controller, route, sheet-music theo Interfaces; bỏ ép kiểu tạm của Task 1.
- [ ] **Step 4: Chạy** `npm test && npm run typecheck && npm run lint` — Expected: PASS.

### Task 5: FE — types, API và logic thuần `classCopy`

**Files:**
- Modify: `BVC-FE/src/features/classes/types/classTypes.ts`
- Modify: `BVC-FE/src/features/classes/api/classesApi.ts`, `api/assignmentsApi.ts`, `hooks/useClassSheetMusic.ts` (+ chỗ gọi hiện có trong `AssignmentForm.tsx`)
- Create: `BVC-FE/src/features/classes/utils/classCopy.ts`
- Test: `BVC-FE/src/features/classes/__tests__/classCopy.test.ts`

**Interfaces:**
- Produces (trong `classTypes.ts`):
  ```ts
  export type CopyAssignmentStatus = "DRAFT" | "PUBLISHED";
  export interface CopyAssignmentPayload extends AssignmentContentPayload { status: CopyAssignmentStatus }
  export interface ClassPayload { /* field cũ */ sourceClassId?: string; assignments?: CopyAssignmentPayload[] }
  export interface ClassCopySource {
    id: string; name: string; cohort: string; description: string | null;
    instrument: { id: string; name: string }; coLecturers: Lecturer[];
    assignments: Array<{ id: string; title: string; kind: AssignmentKind; description: string | null;
      sheetMusic: AssignmentSheetMusic | null; requiredBpm: number | null; status: "DRAFT" | "PUBLISHED" | "CLOSED" }>;
  }
  // Một dòng trong danh sách sao chép
  export interface CopyAssignmentRow { key: string; checked: boolean; content: AssignmentContentPayload;
    sheetMusic: AssignmentSheetMusic | null; status: CopyAssignmentStatus; error: string | null }
  ```
- `classesApi.getCopySource(classId: string)` → `GET /classes/${classId}/copy-source`.
- `assignmentsApi.listClassSheetMusic(target: { classId: string } | { instrumentId: string })`; `useClassSheetMusic(target: { classId: string } | { instrumentId: string })` — key cache `class-sheet-music:${classId}` / `instrument-sheet-music:${instrumentId}`, id rỗng → không gọi. `AssignmentForm` đổi sang `useClassSheetMusic({ classId })`.
- `utils/classCopy.ts`:
  - `COPY_KIND_DUPLICATED(kind: "SOLO" | "ENSEMBLE"): string` → `Không thể lưu bài tập vì danh sách sao chép có nhiều hơn một bài Độc tấu.` / `… Hòa tấu.`
  - `toCopyRows(source: ClassCopySource): CopyAssignmentRow[]` — `key = id`, `checked: true`, `status: CLOSED → PUBLISHED`, `error: null`.
  - `findKindConflicts(rows: CopyAssignmentRow[]): Map<string, string>` — key dòng → message, chỉ xét dòng `checked`, mọi dòng trong nhóm SOLO (hoặc ENSEMBLE) có > 1 bài.
  - `buildCopyAssignments(rows): CopyAssignmentPayload[]` — các dòng `checked` theo thứ tự, `{ ...content, status }`.
  - `mapCopyErrors(rows, fieldErrors: ApiFieldError[]): { rowErrors: Map<string, string>; rest: ApiFieldError[] }` — `assignments.<i>.<field>` → dòng `checked` thứ i; lỗi không khớp đi vào `rest`.

- [ ] **Step 1: Viết test lỗi** `classCopy.test.ts`:
  - `toCopyRows` với bài `CLOSED` → `status: 'PUBLISHED'`, mọi dòng `checked: true`.
  - `findKindConflicts`: 2 SOLO checked → map có 2 key, message SOLO đúng chữ; bỏ tick một trong hai → map rỗng.
  - `buildCopyAssignments`: dòng bỏ tick không có trong kết quả; thứ tự giữ nguyên; nội dung đã sửa được dùng.
  - `mapCopyErrors`: rows `[A✓, B✗, C✓]`, lỗi `assignments.1.sheetMusicId` → gắn vào `C`; lỗi `name` → nằm trong `rest`.
- [ ] **Step 2: Chạy** `cd BVC-FE && npm test -- --run src/features/classes/__tests__/classCopy.test.ts` — Expected: FAIL.
- [ ] **Step 3: Cài đặt** types, API, hook, `classCopy.ts`.
- [ ] **Step 4: Chạy** `npm test -- --run && npm run typecheck && npm run lint` — Expected: PASS (gồm `AssignmentForm.test.tsx` cũ — cập nhật mock `assignmentsApi.listClassSheetMusic` nếu test cũ kiểm tra tham số).

### Task 6: FE — `AssignmentContentFields` và `CopyAssignmentEditDialog`

**Files:**
- Create: `BVC-FE/src/features/classes/components/AssignmentContentFields.tsx`
- Modify: `BVC-FE/src/features/classes/components/AssignmentForm.tsx`
- Create: `BVC-FE/src/features/classes/components/CopyAssignmentEditDialog.tsx`
- Test: `BVC-FE/src/features/classes/__tests__/CopyAssignmentEditDialog.test.tsx`

**Interfaces:**
- Consumes: `useClassSheetMusic` (Task 5), `assignmentFormSchema`, `toAssignmentContent`, `toAssignmentFormValues`-style mapping, `CopyAssignmentRow` (Task 5).
- Produces:
  - `AssignmentContentFields` props: `{ register: UseFormRegister<V>; errors: FieldErrors<V>; title: string; description: string; sheetMusicId: string; sheets: ClassSheetMusic[]; currentSheetMusic: AssignmentSheetMusic | null; idPrefix: string }` với `V` chứa các field `title, kind, description, sheetMusicId, requiredBpm`. Render đúng 5 field hiện có trong `AssignmentForm` (Tiêu đề, Loại bài, Mô tả, Bài nhạc, BPM yêu cầu), giữ nguyên label, hint, lựa chọn "(Không còn khả dụng)". `AssignmentForm` dùng nó với `idPrefix="assignment"` — id DOM giữ nguyên (`assignment-title`, …) để test cũ pass.
  - `CopyAssignmentEditDialog` props: `{ row: CopyAssignmentRow | null; instrumentId: string; onClose(): void; onApply(content: AssignmentContentPayload, sheetMusic: AssignmentSheetMusic | null): void }`. `row === null` → đóng. Dùng `FormDialog` title `Sửa bài tập`, description `Thay đổi chỉ áp dụng cho bài sao chép vào lớp mới.`, schema `assignmentFormSchema.omit({ classId: true })`, nút `Hủy` / `Áp dụng`, `idPrefix="copy-assignment"`. Danh sách bản nhạc: `useClassSheetMusic({ instrumentId })`. `onApply` nhận `sheetMusic` lấy từ `sheets` (map `ClassSheetMusic` → `AssignmentSheetMusic` với `isAvailable: true`) hoặc giữ `row.sheetMusic` nếu id không đổi.

- [ ] **Step 1: Viết test lỗi** `CopyAssignmentEditDialog.test.tsx` (mock `assignmentsApi.listClassSheetMusic` trả 1 bản nhạc): mở với row có tiêu đề `Bài cũ` → input `Tiêu đề` có giá trị đó; sửa thành `Bài mới`, bấm `Áp dụng` → `onApply` được gọi với `title: 'Bài mới'`; xoá trống tiêu đề rồi `Áp dụng` → thấy `Tiêu đề không được để trống.` và `onApply` không được gọi; bấm `Hủy` → `onClose` được gọi, `onApply` không.
- [ ] **Step 2: Chạy** test — Expected: FAIL.
- [ ] **Step 3: Cài đặt** `AssignmentContentFields`, refactor `AssignmentForm`, cài đặt dialog.
- [ ] **Step 4: Chạy** `npm test -- --run && npm run typecheck && npm run lint` — Expected: PASS, gồm `AssignmentForm.test.tsx` không sửa assertion.

### Task 7: FE — `useClassCopy` và `CopyAssignmentList`

**Files:**
- Create: `BVC-FE/src/features/classes/hooks/useClassCopy.ts`
- Create: `BVC-FE/src/features/classes/components/CopyAssignmentList.tsx`
- Test: `BVC-FE/src/features/classes/__tests__/CopyAssignmentList.test.tsx`

**Interfaces:**
- Consumes: `classesApi.getCopySource`, `toCopyRows`, `findKindConflicts`, `buildCopyAssignments`, `mapCopyErrors` (Task 5); `CopyAssignmentEditDialog` (Task 6); `AssignmentKindTag`.
- Produces:
  - `useClassCopy()` trả `{ source: ClassCopySource | null; rows: CopyAssignmentRow[]; isLoading: boolean; selectSource(classId: string): Promise<boolean>; clear(): void; toggle(key: string): void; toggleAll(checked: boolean): void; updateRow(key, content, sheetMusic): void; validate(): boolean; applyServerErrors(fieldErrors: ApiFieldError[]): ApiFieldError[]; payload(): { sourceClassId: string; assignments: CopyAssignmentPayload[] } | null }`.
    - `selectSource` gọi API, lỗi → `toast.error(parseApiError(...).message)` và trả `false`.
    - `validate` ghi lỗi `findKindConflicts` vào `rows[].error`, trả `true` nếu không có lỗi.
    - `toggle` / `updateRow` xoá `error` của dòng đó.
    - `applyServerErrors` gắn lỗi dòng qua `mapCopyErrors`, trả phần `rest`.
    - `payload()` = `null` khi `source === null`.
  - `CopyAssignmentList` props: `{ rows: CopyAssignmentRow[]; instrumentMismatch: boolean; instrumentId: string; disabled: boolean; onToggle(key): void; onToggleAll(checked: boolean): void; onEdit(key, content, sheetMusic): void }`. Tự quản lý dòng đang sửa và render `CopyAssignmentEditDialog`.
    - Tiêu đề `Bài tập sẽ sao chép ({checked}/{total})`; nút `Chọn tất cả` khi chưa tick hết, ngược lại `Bỏ chọn tất cả`.
    - `rows.length === 0` → `Lớp nguồn chưa có bài tập`.
    - Mỗi dòng: nút checkbox `aria-pressed`, `aria-label="Sao chép {title}"`; tên; `AssignmentKindTag`; nhãn `Nháp` / `Đã đăng`; tên bản nhạc (`sheetMusicLabel`) nếu có; `BPM {n}` nếu có; nút `Sửa` (`aria-label="Sửa {title}"`). Style dòng giống `AssignSelectRow` (bo 16px, viền `bvc-border`, tick `bvc-ink`); dòng có `error` viền `border-bvc-error` và hiện `<p role="alert" className="text-[12.5px] font-medium text-bvc-error">{error}</p>` (giống `FormField`).
    - `instrumentMismatch` → hộp cảnh báo `Nhạc cụ khác lớp nguồn — một số bản nhạc có thể không dùng được.`

- [ ] **Step 1: Viết test lỗi** `CopyAssignmentList.test.tsx` (render component với state kiểm soát bằng một wrapper dùng `useState` hoặc dùng trực tiếp hook qua component test nhỏ):
  - 3 dòng đều tick → thấy `Bài tập sẽ sao chép (3/3)` và nút `Bỏ chọn tất cả`.
  - Bấm checkbox `Sao chép Bài B` → `(2/3)`.
  - Dòng có `error` → `getByRole('alert')` chứa message.
  - `instrumentMismatch` → thấy câu cảnh báo.
  - Bấm `Sửa Bài A` → dialog `Sửa bài tập` mở.
  - `rows=[]` → thấy `Lớp nguồn chưa có bài tập`.
- [ ] **Step 2: Chạy** test — Expected: FAIL.
- [ ] **Step 3: Cài đặt** hook và component.
- [ ] **Step 4: Chạy** `npm test -- --run && npm run typecheck && npm run lint` — Expected: PASS.

### Task 8: FE — chọn lớp nguồn, điền sẵn `ClassForm`, nối `ClassCreateDialog`

**Files:**
- Create: `BVC-FE/src/features/classes/components/CopySourcePickerDialog.tsx`
- Modify: `BVC-FE/src/features/classes/components/ClassForm.tsx`
- Modify: `BVC-FE/src/features/classes/components/ClassCreateDialog.tsx`
- Test: `BVC-FE/src/features/classes/__tests__/ClassForm.test.tsx`, create `BVC-FE/src/features/classes/__tests__/ClassCreateCopy.test.tsx`

**Interfaces:**
- Consumes: `useClassCopy`, `CopyAssignmentList` (Task 7); `classesApi.listClasses`; `findInstrumentBySubject`, `parseClassCode`.
- Produces:
  - `CopySourcePickerDialog` props `{ open: boolean; onClose(): void; onSelect(classId: string): void }`. Dùng `FormDialog` title `Sao chép từ lớp khác`. Hộp info đúng câu: `Sẽ sao chép: mã lớp, mô tả, giảng viên cùng dạy và toàn bộ bài tập (nội dung, loại, bản nhạc, BPM, trạng thái). Không sao chép: sinh viên, bài nộp, lộ trình — lớp mới tự lấy lộ trình mới nhất của nhạc cụ.` `SearchInput` + danh sách từ `classesApi.listClasses({ status: 'ALL', q, limit: 20 })`, mỗi dòng nút hiện `{name}`, `{cohort} · {instrument.name}`. Trạng thái rỗng `Không tìm thấy lớp nào`.
  - `ClassForm` thêm props (chỉ dùng khi tạo mới):
    - `prefill?: { key: string; name: string; description: string | null; coLecturers: Lecturer[] } | null` — khi `prefill.key` đổi: `reset({ name, instrumentId: '', cohort: '', description: description ?? '' }, { keepDefaultValues: true })`, `setCoLecturers(coLecturers)`, đặt `lastAutoDescription.current = description ?? ''` trước khi effect mô tả tự sinh chạy, và đặt `lastAppliedTarget.current = null` để học kỳ được chọn lại theo half của mã. `prefill` về `null` → reset về giá trị trống ban đầu, `coLecturers` rỗng.
    - `copySection?: ReactNode` — render ngay trước khối Ngày bắt đầu/kết thúc.
    - `onInstrumentChange?: (instrumentId: string) => void` — báo nhạc cụ suy ra từ mã lớp (cho `CopyAssignmentList` lấy bản nhạc và tính `instrumentMismatch`).
    - `beforeSubmit?: () => boolean` — gọi trước `onSubmit`; `false` → dừng.
    - `onSubmit` không đổi chữ ký; `ClassCreateDialog` tự thêm `sourceClassId` + `assignments` vào payload và gọi `applyServerErrors` trên lỗi trả về trước khi trả phần còn lại cho form.
  - `ClassCreateDialog`:
    - Thanh phía trên form: chưa có nguồn → `ActionButton` variant secondary `Sao chép từ lớp khác`; có nguồn → `Đang sao chép từ {name} ({cohort})` + nút `Đổi lớp` + nút `Bỏ sao chép`.
    - Đang tải nguồn → nút disabled, chữ `Đang tải lớp nguồn…`.
    - Dirty khi `source !== null`.
    - Thành công → `toast.success(result.message)` rồi navigate như cũ.

- [ ] **Step 1: Viết test lỗi** trong `ClassForm.test.tsx`:
  - Render với `prefill = { key: 'c1', name: 'DNH103.M2.H1', description: 'Mô tả cũ', coLecturers: [{ id: 'l2', fullName: 'GV Hai', email: 'l2@x.vn' }] }` và danh sách học kỳ test hiện có → input `Mã lớp` = `DNH103.M2.H1`, textarea `Mô tả` = `Mô tả cũ` (không bị thay bằng mô tả tự sinh), `GV Hai` hiển thị trong picker, select `Học kỳ` = học kỳ mà half H1 dẫn tới (dùng cùng fixture/kỳ vọng như test half hiện có).
  - Đổi `prefill` sang `null` → `Mã lớp` rỗng, không còn `GV Hai`.
  - `beforeSubmit` trả `false` → `onSubmit` không được gọi.
- [ ] **Step 2: Viết test lỗi** `ClassCreateCopy.test.tsx` (mock `classesApi.listClasses`, `getCopySource`, `createClass`, `listInstruments`, `listSemesters`, `assignmentsApi.listClassSheetMusic`; bọc `MemoryRouter`):
  - Mở dialog → bấm `Sao chép từ lớp khác` → thấy câu info → bấm lớp nguồn → thấy `Đang sao chép từ …` và `Bài tập sẽ sao chép (2/2)`.
  - Bỏ tick 1 bài, bấm `Tạo lớp` → `createClass` được gọi với `sourceClassId` và `assignments` dài 1, bài `CLOSED` gốc gửi `status: 'PUBLISHED'`.
  - `createClass` reject với `errors: [{ field: 'assignments.0.sheetMusicId', message: 'Bản nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.' }]` → message hiện dưới đúng dòng được tick.
  - Bấm `Bỏ sao chép` → không còn danh sách bài; submit lại → payload không có `assignments`/`sourceClassId`.
- [ ] **Step 3: Chạy** các test — Expected: FAIL.
- [ ] **Step 4: Cài đặt** picker, props `ClassForm`, nối `ClassCreateDialog`.
- [ ] **Step 5: Chạy** `npm test -- --run && npm run typecheck && npm run lint` — Expected: PASS, gồm mọi test `ClassForm` cũ.
