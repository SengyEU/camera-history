export interface PublicCamera {
  id: string;
  name: string;
  theme: string;
  retentionMonths: number;
}

export interface ImageDto {
  id: string;
  timestamp: string;
  url: string;
}

export async function getCamera(cameraId: string): Promise<PublicCamera> {
  const res = await fetch(`/api/v1/cameras/${cameraId}`);
  if (!res.ok) throw new Error(`camera fetch failed: ${res.status}`);
  const body: { camera: PublicCamera } = await res.json();
  return body.camera;
}

export async function getImages(cameraId: string, date: string): Promise<ImageDto[]> {
  const res = await fetch(`/api/v1/cameras/${cameraId}/images?date=${date}`);
  if (!res.ok) throw new Error(`images fetch failed: ${res.status}`);
  const body: { images: ImageDto[] } = await res.json();
  return body.images;
}