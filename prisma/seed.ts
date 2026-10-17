import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const permissions = [
  {
    code: "branch.dashboard.read",
    name: "مشاهده داشبورد شعبه",
  },
  {
    code: "branch.menu.read",
    name: "مشاهده منوی شعبه",
  },
  {
    code: "branch.menu.items.create",
    name: "افزودن غذا به منوی شعبه",
  },
  {
    code: "branch.menu.items.update",
    name: "ویرایش غذای منوی شعبه",
  },
  {
    code: "branch.menu.items.delete",
    name: "حذف غذا از منوی شعبه",
  },
  {
    code: "branch.menu.prices.update",
    name: "تغییر قیمت غذاها",
  },
  {
    code: "branch.menu.availability.update",
    name: "تغییر موجودی غذاها",
  },
  {
    code: "branch.staff.read",
    name: "مشاهده کارکنان شعبه",
  },
  {
    code: "branch.staff.manage",
    name: "مدیریت کارکنان شعبه",
  },
  {
    code: "orders.read",
    name: "مشاهده سفارش‌ها",
  },
  {
    code: "orders.accept",
    name: "تأیید سفارش",
  },
  {
    code: "orders.reject",
    name: "رد سفارش",
  },
  {
    code: "orders.status.update",
    name: "به‌روزرسانی وضعیت سفارش",
  },
  {
    code: "reports.sales.read",
    name: "مشاهده گزارش فروش",
  },
  {
    code: "reports.export",
    name: "خروجی گرفتن از گزارش‌ها",
  },
  {
    code: "branches.manage",
    name: "مدیریت شعبه‌ها",
  },
  {
    code: "access.roles.manage",
    name: "مدیریت نقش‌ها",
  },
  {
    code: "access.permissions.assign",
    name: "تخصیص مجوزها به کاربران",
  },
  {
    code: "catalog.food.manage",
    name: "مدیریت کاتالوگ غذاها",
  },
  {
    code: "promotions.manage",
    name: "مدیریت تخفیف‌ها",
  },
  {
    code: "reviews.moderate",
    name: "مدیریت نظرات مشتریان",
  },
] as const;

async function main() {
  const savedPermissions = [];

  for (const permission of permissions) {
    const saved = await prisma.permission.upsert({
      where: { code: permission.code },
      update: { name: permission.name },
      create: permission,
    });

    savedPermissions.push(saved);
  }

  const centralAdmin = await prisma.role.upsert({
    where: { code: "CENTRAL_ADMIN" },
    update: {
      name: "مدیر مرکزی",
      description: "مدیریت سراسری سامانه ترخینه",
      isSystem: true,
    },
    create: {
      code: "CENTRAL_ADMIN",
      name: "مدیر مرکزی",
      description: "مدیریت سراسری سامانه ترخینه",
      isSystem: true,
    },
  });

  const branchManager = await prisma.role.upsert({
    where: { code: "BRANCH_MANAGER" },
    update: {
      name: "مدیر شعبه",
      description: "مدیریت عملیات شعبه با مجوزهای تخصیص‌یافته",
      isSystem: true,
    },
    create: {
      code: "BRANCH_MANAGER",
      name: "مدیر شعبه",
      description: "مدیریت عملیات شعبه با مجوزهای تخصیص‌یافته",
      isSystem: true,
    },
  });

  for (const permission of savedPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: centralAdmin.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: centralAdmin.id,
        permissionId: permission.id,
      },
    });
  }

  const dashboardPermission = savedPermissions.find(
    (permission) => permission.code === "branch.dashboard.read",
  );

  if (!dashboardPermission) {
    throw new Error("Base branch dashboard permission is missing.");
  }

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: branchManager.id,
        permissionId: dashboardPermission.id,
      },
    },
    update: {},
    create: {
      roleId: branchManager.id,
      permissionId: dashboardPermission.id,
    },
  });

  console.log(`Seeded ${savedPermissions.length} permissions.`);
  console.log("Seeded roles: CENTRAL_ADMIN, BRANCH_MANAGER.");
}

main()
  .catch((error: unknown) => {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
