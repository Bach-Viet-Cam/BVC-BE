import type { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import FaqPolicyService from '../../src/modules/platform/service/FaqPolicyService.ts';

export default class FaqSeeder {
  static readonly entries = [
    {
      topic: 'PLATFORM',
      question: 'Dự án Bách Việt Cầm là gì?',
      answer: 'Bách Việt Cầm là dự án đồ án hỗ trợ học và luyện tập nhạc cụ truyền thống Việt Nam. Sinh viên có thể tìm bản nhạc, nghe bản mẫu, luyện độc tấu hoặc hòa tấu và nộp bản thu để nhận phân tích. Giảng viên quản lý lớp, giao bài tập và nhận xét bài nộp.'
    },
    {
      topic: 'ASSIGNMENTS',
      question: 'Luyện tập độc tấu như thế nào?',
      answer: '1. Mở Thư viện, chọn bài nhạc và bản nhạc đúng nhạc cụ; hoặc mở bài tập độc tấu đã được giao.\n2. Xem bản nhạc và nghe bản mẫu. Dùng Lên dây và Nhịp để chuẩn bị.\n3. Thu âm bằng micro hoặc chọn file bản thu. Nghe lại trước khi gửi.\n4. Gửi bản thu để phân tích, chờ xử lý rồi xem kết quả và nhận xét. Muốn tính vào bài tập, hãy bắt đầu từ bài tập đang mở và còn lượt nộp.'
    },
    {
      topic: 'ASSIGNMENTS',
      question: 'Luyện tập hòa tấu như thế nào?',
      answer: '1. Mở bài hòa tấu trong Bài tập hoặc từ bài nhạc có các bè mẫu.\n2. Nghe các bè trong Tổng phổ, chọn vị trí phát và điều chỉnh tiếng từng bè. Bè mẫu của nhạc cụ bạn vẫn có thể nghe trước khi thu.\n3. Chuẩn bị lên dây và nhịp, đeo tai nghe để hạn chế thu lẫn tiếng mẫu. Chọn Bắt đầu thu hoặc chọn file bản thu có sẵn. Khi thu trực tiếp, hệ thống tự tắt bè mẫu cùng nhạc cụ của bạn.\n4. Dừng thu, nghe lại rồi gửi bản thu. Chỉ bài tập hòa tấu đang mở, đúng điều kiện và còn lượt mới được tính là bài nộp của lớp.'
    },
    {
      topic: 'PLATFORM',
      question: 'Giảng viên tạo lớp học như thế nào?',
      answer: '1. Đăng nhập bằng tài khoản giảng viên, mở Lớp học và chọn Tạo lớp.\n2. Nhập thông tin lớp, khóa học và nhạc cụ theo biểu mẫu rồi lưu.\n3. Mở lớp vừa tạo để thêm sinh viên hoặc nhập danh sách theo mẫu Excel của hệ thống. Kiểm tra danh sách trước khi xác nhận nhập.'
    },
    {
      topic: 'ASSIGNMENTS',
      question: 'Giảng viên tạo và giao bài tập như thế nào?',
      answer: '1. Mở lớp cần giao bài và vào Bài tập.\n2. Chọn Tạo bài tập, nhập tiêu đề và hướng dẫn; chọn loại bài, bản nhạc phù hợp cùng các yêu cầu trong biểu mẫu.\n3. Thiết lập hạn nộp và số lượt nộp, kiểm tra nội dung trước khi xuất bản. Bản nháp chưa hiển thị cho sinh viên.\n4. Sau khi xuất bản, theo dõi bài nộp trong lớp và mở từng bản thu để nghe, nhận xét.'
    }
  ] as const;

  static async run(client: PrismaClient = PrismaClientProvider.instance): Promise<number> {
    const actor = await client.user.findFirst({ where: { role: 3, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!actor) throw new Error('Cần có tài khoản quản trị đang hoạt động trước khi seed FAQ.');
    await client.$transaction(FaqSeeder.entries.map((entry, index) => {
      const questionKey = FaqPolicyService.questionKey(entry.question);
      return client.faq.upsert({
        where: { topic_questionKey: { topic: entry.topic, questionKey } },
        update: {},
        create: { ...entry, questionKey, displayOrder: index + 1, isActive: true, instrumentId: null, createdById: actor.id, updatedById: actor.id }
      });
    }));
    return FaqSeeder.entries.length;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  FaqSeeder.run()
    .then((count) => console.log(`Đã kiểm tra và bổ sung ${count} FAQ mặc định; giữ nguyên các câu hỏi đã có.`))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
    .finally(() => PrismaClientProvider.instance.$disconnect());
}
