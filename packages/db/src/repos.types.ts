import type {
  AdminCameraGroup,
  BillingPatch,
  BillingStatus,
  Camera,
  CameraGroup,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewCameraGroup,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  PublicGroupWithCameras,
  Tenant,
  User,
} from "@ch/core";

export interface Repos {
  createTenant(input: NewTenant): Promise<Tenant>;
  createTenantWithUser(input: {
    tenant: NewTenant;
    user: Omit<NewUser, "tenantId">;
  }): Promise<{ tenant: Tenant; user: User }>;
  getTenantById(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  createUser(input: NewUser): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUserPassword(id: string, passwordHash: string): Promise<void>;
  markEmailVerified(id: string, at: Date): Promise<User | null>;
  markWelcomeSent(id: string, at: Date): Promise<void>;
  deleteEmailVerificationTokensForUser(userId: string): Promise<void>;
  createEmailVerificationToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  consumeEmailVerificationToken(
    tokenHash: string,
    now: Date,
  ): Promise<{ userId: string } | null>;
  createCamera(tenantId: string, input: NewCamera): Promise<Camera>;
  createCameraWithLimit(
    tenantId: string,
    input: NewCamera,
    limit: number,
  ): Promise<{ camera: Camera } | { camera: null; cameraCount: number }>;
  getCameraById(id: string): Promise<Camera | null>;
  listCameras(tenantId: string): Promise<Camera[]>;
  updateCamera(id: string, patch: CameraPatch): Promise<Camera | null>;
  deleteCamera(id: string): Promise<void>;
  listEnabledCameras(now: Date): Promise<Camera[]>;
  getPublicCamera(cameraId: string): Promise<PublicCamera | null>;
  getPublicCameraBySlug(tenantSlug: string, cameraSlug: string): Promise<PublicCamera | null>;
  listPublicCamerasByTenantSlug(
    tenantSlug: string,
  ): Promise<Array<{ id: string; name: string; slug: string }> | null>;
  listPublicGroupsByTenantSlug(
    tenantSlug: string,
  ): Promise<Array<{ id: string; name: string; slug: string; cameraCount: number }> | null>;
  insertImage(input: NewImage): Promise<ImageRecord>;
  imagesForCameraDay(cameraId: string, from: Date, to: Date): Promise<ImageRecord[]>;
  getImageById(id: string): Promise<ImageRecord | null>;
  latestImageForCamera(cameraId: string): Promise<ImageRecord | null>;
  listImagesBefore(cutoff: Date, limit: number): Promise<Array<{ id: string; storageKey: string }>>;
  deleteImages(ids: string[]): Promise<void>;
  listImagesForCamera(cameraId: string): Promise<Array<{ id: string; storageKey: string }>>;
  countCameras(tenantId: string): Promise<number>;
  usageStats(tenantId: string): Promise<{ usageBytes: number; spanDays: number }>;
  cameraStats(tenantId: string): Promise<
    Map<
      string,
      {
        imageCount: number;
        totalBytes: number;
        firstCaptureAt: string | null;
        lastCaptureAt: string | null;
      }
    >
  >;
  setTenantCamerasEnabled(tenantId: string, enabled: boolean): Promise<void>;
  setBillingState(tenantId: string, patch: BillingPatch): Promise<Tenant | null>;
  listTenantsByBillingStatus(status: BillingStatus): Promise<Tenant[]>;
  createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup>;
  listGroups(tenantId: string): Promise<AdminCameraGroup[]>;
  getGroup(id: string): Promise<CameraGroup | null>;
  updateGroup(id: string, patch: { name?: string; slug?: string }): Promise<CameraGroup | null>;
  deleteGroup(id: string): Promise<void>;
  setGroupCameras(groupId: string, cameraIds: string[]): Promise<void>;
  getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null>;
}