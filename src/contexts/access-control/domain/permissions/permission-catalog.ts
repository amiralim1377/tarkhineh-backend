// ============================================================
// PERMISSION CODES
// ============================================================

export const PERMISSION_CODE = {
  // Organization
  ORGANIZATION_READ: 'organization.read',
  ORGANIZATION_UPDATE: 'organization.update',

  // Organization - Branches
  ORGANIZATION_BRANCHES_READ: 'organization.branches.read',
  ORGANIZATION_BRANCHES_CREATE: 'organization.branches.create',
  ORGANIZATION_BRANCHES_UPDATE: 'organization.branches.update',
  ORGANIZATION_BRANCHES_SUSPEND: 'organization.branches.suspend',

  // Organization - Members
  ORGANIZATION_MEMBERS_READ: 'organization.members.read',
  ORGANIZATION_MEMBERS_INVITE: 'organization.members.invite',
  ORGANIZATION_MEMBERS_UPDATE: 'organization.members.update',
  ORGANIZATION_MEMBERS_REMOVE: 'organization.members.remove',

  // Organization - Roles
  ORGANIZATION_ROLES_ASSIGN: 'organization.roles.assign',

  // Branch - Dashboard
  BRANCH_DASHBOARD_READ: 'branch.dashboard.read',

  // Branch - Staff
  BRANCH_STAFF_READ: 'branch.staff.read',
  BRANCH_STAFF_INVITE: 'branch.staff.invite',
  BRANCH_STAFF_UPDATE: 'branch.staff.update',
  BRANCH_STAFF_SUSPEND: 'branch.staff.suspend',
  BRANCH_STAFF_REMOVE: 'branch.staff.remove',

  // Branch - Roles
  BRANCH_ROLES_ASSIGN: 'branch.roles.assign',
} as const;

export type PermissionCode =
  (typeof PERMISSION_CODE)[keyof typeof PERMISSION_CODE];

// ============================================================
// PERMISSION SCOPES
// ============================================================

export const PERMISSION_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  BRANCH: 'BRANCH',
} as const;

export type PermissionScope =
  (typeof PERMISSION_SCOPE)[keyof typeof PERMISSION_SCOPE];

// ============================================================
// PERMISSION ACTIONS
// ============================================================

export const PERMISSION_ACTION = {
  READ: 'READ',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  INVITE: 'INVITE',
  SUSPEND: 'SUSPEND',
  REMOVE: 'REMOVE',
  ASSIGN: 'ASSIGN',
} as const;

export type PermissionAction =
  (typeof PERMISSION_ACTION)[keyof typeof PERMISSION_ACTION];

// ============================================================
// PERMISSION RESOURCES
// ============================================================

export const PERMISSION_RESOURCE = {
  ORGANIZATION: 'organization',
  ORGANIZATION_BRANCHES: 'organization.branches',
  ORGANIZATION_MEMBERS: 'organization.members',
  ORGANIZATION_ROLES: 'organization.roles',

  BRANCH_DASHBOARD: 'branch.dashboard',
  BRANCH_STAFF: 'branch.staff',
  BRANCH_ROLES: 'branch.roles',
} as const;

export type PermissionResource =
  (typeof PERMISSION_RESOURCE)[keyof typeof PERMISSION_RESOURCE];

// ============================================================
// LOCALIZED TEXT
// ============================================================

export interface LocalizedText {
  readonly en: string;
  readonly fa: string;
}

// ============================================================
// PERMISSION DEFINITION
// ============================================================

export interface PermissionDefinition {
  readonly name: LocalizedText;
  readonly description: LocalizedText;

  readonly scope: PermissionScope;
  readonly resource: PermissionResource;
  readonly action: PermissionAction;
}

// ============================================================
// PERMISSION CATALOG
// ============================================================

export const PERMISSION_CATALOG = {
  // ----------------------------------------------------------
  // ORGANIZATION
  // ----------------------------------------------------------

  [PERMISSION_CODE.ORGANIZATION_READ]: {
    name: {
      en: 'View Organization',
      fa: 'مشاهده سازمان',
    },
    description: {
      en: 'Allows viewing organization information and details.',
      fa: 'امکان مشاهده اطلاعات و جزئیات سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION,
    action: PERMISSION_ACTION.READ,
  },

  [PERMISSION_CODE.ORGANIZATION_UPDATE]: {
    name: {
      en: 'Update Organization',
      fa: 'ویرایش سازمان',
    },
    description: {
      en: 'Allows updating organization information and settings.',
      fa: 'امکان ویرایش اطلاعات و تنظیمات سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION,
    action: PERMISSION_ACTION.UPDATE,
  },

  // ----------------------------------------------------------
  // ORGANIZATION - BRANCHES
  // ----------------------------------------------------------

  [PERMISSION_CODE.ORGANIZATION_BRANCHES_READ]: {
    name: {
      en: 'View Organization Branches',
      fa: 'مشاهده شعب سازمان',
    },
    description: {
      en: 'Allows viewing branches belonging to the organization.',
      fa: 'امکان مشاهده شعب متعلق به سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_BRANCHES,
    action: PERMISSION_ACTION.READ,
  },

  [PERMISSION_CODE.ORGANIZATION_BRANCHES_CREATE]: {
    name: {
      en: 'Create Branch',
      fa: 'ایجاد شعبه',
    },
    description: {
      en: 'Allows creating new branches within the organization.',
      fa: 'امکان ایجاد شعبه جدید در سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_BRANCHES,
    action: PERMISSION_ACTION.CREATE,
  },

  [PERMISSION_CODE.ORGANIZATION_BRANCHES_UPDATE]: {
    name: {
      en: 'Update Branch',
      fa: 'ویرایش شعبه',
    },
    description: {
      en: 'Allows updating branch information and configuration.',
      fa: 'امکان ویرایش اطلاعات و تنظیمات شعبه را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_BRANCHES,
    action: PERMISSION_ACTION.UPDATE,
  },

  [PERMISSION_CODE.ORGANIZATION_BRANCHES_SUSPEND]: {
    name: {
      en: 'Suspend Branch',
      fa: 'تعلیق شعبه',
    },
    description: {
      en: 'Allows suspending or reactivating a branch.',
      fa: 'امکان تعلیق یا فعال‌سازی مجدد شعبه را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_BRANCHES,
    action: PERMISSION_ACTION.SUSPEND,
  },

  // ----------------------------------------------------------
  // ORGANIZATION - MEMBERS
  // ----------------------------------------------------------

  [PERMISSION_CODE.ORGANIZATION_MEMBERS_READ]: {
    name: {
      en: 'View Organization Members',
      fa: 'مشاهده اعضای سازمان',
    },
    description: {
      en: 'Allows viewing members and their membership information.',
      fa: 'امکان مشاهده اعضا و اطلاعات عضویت آن‌ها را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_MEMBERS,
    action: PERMISSION_ACTION.READ,
  },

  [PERMISSION_CODE.ORGANIZATION_MEMBERS_INVITE]: {
    name: {
      en: 'Invite Organization Member',
      fa: 'دعوت عضو به سازمان',
    },
    description: {
      en: 'Allows inviting users to join the organization.',
      fa: 'امکان دعوت کاربران برای عضویت در سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_MEMBERS,
    action: PERMISSION_ACTION.INVITE,
  },

  [PERMISSION_CODE.ORGANIZATION_MEMBERS_UPDATE]: {
    name: {
      en: 'Update Organization Membership',
      fa: 'ویرایش عضویت سازمان',
    },
    description: {
      en: 'Allows updating organization membership information and status.',
      fa: 'امکان ویرایش اطلاعات و وضعیت عضویت اعضای سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_MEMBERS,
    action: PERMISSION_ACTION.UPDATE,
  },

  [PERMISSION_CODE.ORGANIZATION_MEMBERS_REMOVE]: {
    name: {
      en: 'Remove Organization Member',
      fa: 'لغو عضویت در سازمان',
    },
    description: {
      en: 'Allows removing users from the organization.',
      fa: 'امکان لغو عضویت کاربران در سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_MEMBERS,
    action: PERMISSION_ACTION.REMOVE,
  },

  // ----------------------------------------------------------
  // ORGANIZATION - ROLES
  // ----------------------------------------------------------

  [PERMISSION_CODE.ORGANIZATION_ROLES_ASSIGN]: {
    name: {
      en: 'Assign Organization Roles',
      fa: 'تخصیص نقش سازمانی',
    },
    description: {
      en: 'Allows assigning authorized roles to organization members.',
      fa: 'امکان تخصیص نقش‌های مجاز به اعضای سازمان را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.ORGANIZATION,
    resource: PERMISSION_RESOURCE.ORGANIZATION_ROLES,
    action: PERMISSION_ACTION.ASSIGN,
  },

  // ----------------------------------------------------------
  // BRANCH - DASHBOARD
  // ----------------------------------------------------------

  [PERMISSION_CODE.BRANCH_DASHBOARD_READ]: {
    name: {
      en: 'View Branch Dashboard',
      fa: 'مشاهده داشبورد شعبه',
    },
    description: {
      en: 'Allows viewing the dashboard of an authorized branch.',
      fa: 'امکان مشاهده داشبورد شعبه‌های مجاز را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_DASHBOARD,
    action: PERMISSION_ACTION.READ,
  },

  // ----------------------------------------------------------
  // BRANCH - STAFF
  // ----------------------------------------------------------

  [PERMISSION_CODE.BRANCH_STAFF_READ]: {
    name: {
      en: 'View Branch Staff',
      fa: 'مشاهده کارکنان شعبه',
    },
    description: {
      en: 'Allows viewing employees and their membership information.',
      fa: 'امکان مشاهده کارکنان و اطلاعات عضویت آن‌ها را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_STAFF,
    action: PERMISSION_ACTION.READ,
  },

  [PERMISSION_CODE.BRANCH_STAFF_INVITE]: {
    name: {
      en: 'Invite Branch Staff',
      fa: 'دعوت کارمند به شعبه',
    },
    description: {
      en: 'Allows inviting users to become members of an authorized branch.',
      fa: 'امکان دعوت کاربران برای عضویت در شعبه‌های مجاز را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_STAFF,
    action: PERMISSION_ACTION.INVITE,
  },

  [PERMISSION_CODE.BRANCH_STAFF_UPDATE]: {
    name: {
      en: 'Update Branch Staff',
      fa: 'ویرایش اطلاعات کارمند',
    },
    description: {
      en: 'Allows updating employee membership information.',
      fa: 'امکان ویرایش اطلاعات عضویت کارکنان شعبه را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_STAFF,
    action: PERMISSION_ACTION.UPDATE,
  },

  [PERMISSION_CODE.BRANCH_STAFF_SUSPEND]: {
    name: {
      en: 'Suspend Branch Staff',
      fa: 'تعلیق دسترسی کارمند',
    },
    description: {
      en: 'Allows suspending or reactivating employee membership in a branch.',
      fa: 'امکان تعلیق یا فعال‌سازی مجدد عضویت کارمند در شعبه را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_STAFF,
    action: PERMISSION_ACTION.SUSPEND,
  },

  [PERMISSION_CODE.BRANCH_STAFF_REMOVE]: {
    name: {
      en: 'Remove Branch Staff',
      fa: 'لغو عضویت کارمند در شعبه',
    },
    description: {
      en: 'Allows removing an employee from a branch.',
      fa: 'امکان لغو عضویت کارمند در شعبه را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_STAFF,
    action: PERMISSION_ACTION.REMOVE,
  },

  // ----------------------------------------------------------
  // BRANCH - ROLES
  // ----------------------------------------------------------

  [PERMISSION_CODE.BRANCH_ROLES_ASSIGN]: {
    name: {
      en: 'Assign Branch Roles',
      fa: 'تخصیص نقش شعبه',
    },
    description: {
      en: 'Allows assigning authorized roles to branch members.',
      fa: 'امکان تخصیص نقش‌های مجاز به اعضای شعبه را فراهم می‌کند.',
    },
    scope: PERMISSION_SCOPE.BRANCH,
    resource: PERMISSION_RESOURCE.BRANCH_ROLES,
    action: PERMISSION_ACTION.ASSIGN,
  },
} as const satisfies Record<PermissionCode, PermissionDefinition>;

// ============================================================
// PERMISSION DEFINITIONS
// ============================================================

export type PermissionCatalogEntry = PermissionDefinition & {
  readonly code: PermissionCode;
};

export const PERMISSION_DEFINITIONS: readonly PermissionCatalogEntry[] = (
  Object.keys(PERMISSION_CATALOG) as PermissionCode[]
).map((code) => ({
  code,
  ...PERMISSION_CATALOG[code],
}));
