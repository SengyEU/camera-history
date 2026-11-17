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
  getTenantById(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  createUser(input: NewUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  createCamera(tenantId: string, input: NewCamera): Promise<Camera>;
  getCameraById(id: string): Promise<Camera | null>;
  listCameras(tenantId: string): Promise<Camera[]>;
  updateCamera(id: string, patch: CameraPatch): Promise<Camera | null>;
  deleteCamera(id: string): Promise<void>;
  listEnabledCameras(): Promise<Camera[]>;
  getPublicCamera(cameraId: string): Promise<PublicCamera | null>;
  insertImage(input: NewImage): Promise<ImageRecord>;
  imagesForCameraDay(cameraId: string, from: Date, to: Date): Promise<ImageRecord[]>;
  getImageById(id: string): Promise<ImageRecord | null>;
  latestImageForCamera(cameraId: string): Promise<ImageRecord | null>;
  countCameras(tenantId: string): Promise<number>;
  cameraPlanCounts(tenantId: string): Promise<Map<number, number>>;
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
  countTrialClaims(): Promise<number>;
  listTenantsByBillingStatus(status: BillingStatus): Promise<Tenant[]>;
  createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup>;
  listGroups(tenantId: string): Promise<AdminCameraGroup[]>;
  getGroup(id: string): Promise<CameraGroup | null>;
  updateGroup(id: string, patch: { name?: string; slug?: string }): Promise<CameraGroup | null>;
  deleteGroup(id: string): Promise<void>;
  setGroupCameras(groupId: string, cameraIds: string[]): Promise<void>;
  getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null>;
}