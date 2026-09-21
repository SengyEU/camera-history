import type {
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
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
}