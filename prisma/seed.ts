import { PrismaClient, UserRole, Jurisdiction } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!email || !initialPassword) {
    throw new Error(
      "ADMIN_EMAIL 和 ADMIN_INITIAL_PASSWORD 必须在 .env 中配置"
    );
  }

  const passwordHash = await bcrypt.hash(initialPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "超级管理员",
      employeeId: "ADMIN-0001",
      email,
      passwordHash,
      mustChangePassword: true,
      role: UserRole.SUPER_ADMIN,
      legalIdentity: Jurisdiction.MAINLAND,
      taxResidence: Jurisdiction.MAINLAND,
    },
  });

  console.log(`✅ 超级管理员已就绪: ${admin.email} (id=${admin.id})`);
  console.log(`   首次登录需强制改密码。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
