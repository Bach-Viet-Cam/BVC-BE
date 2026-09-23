import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import EnvConfig from './EnvConfig.ts';

const prismaAdapter = new PrismaPg({ connectionString: EnvConfig.databaseUrl });

export default class PrismaClientProvider {
  static readonly instance: PrismaClient = new PrismaClient({ adapter: prismaAdapter });
}
