import type { ReactNode } from "react";
import type { ShootMedia } from "@/components/shoot-detail";
import { isShootGalleryType } from "@/lib/media";
import type { PlayerRendition } from "@/components/video-player";

export type TemplateClient = {
  displayName: string;
  primaryEmail: string;
  company: string | null;
};

export type TemplateShootCard = {
  id: string;
  href: string;
  address: string;
  shotDate: string;
  dateLabel: string;
  folderName: string;
  thumbUrl: string | null;
  fileCount: number;
  publicToken: string;
  /** NAS category folder, when this shoot is grouped under one. */
  categoryFolder?: string | null;
};

export type TemplateMedia = {
  id: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  type: "photo" | "video" | "floor_plan" | "audio" | "raw_video";
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  sortOrder: number;
  renditions?: PlayerRendition[];
};

export type TemplateLibraryProps = {
  client: TemplateClient | null;
  shoots: TemplateShootCard[];
  /** Category folder names this browser has closed. Omitted means every section starts open. */
  closedCategoryFolders?: readonly string[];
};

export type TemplateAdminShootsProps = {
  shoots: TemplateShootCard[];
  closedCategoryFolders?: readonly string[];
};

export type TemplateShootProps = {
  basePath: string;
  viewId?: string;
  address: string;
  dateLabel: string;
  folderName: string;
  zipUrl?: string;
  media: TemplateMedia[];
  shareToken?: string;
  closedSectionIds?: readonly string[];
  /** Section ids this browser shows as a file list. Omitted means grid. */
  listSectionIds?: readonly string[];
};

export type ContentTemplate = {
  Library: (props: TemplateLibraryProps) => ReactNode;
  AdminShoots: (props: TemplateAdminShootsProps) => ReactNode;
  Shoot: (props: TemplateShootProps) => ReactNode;
};

export function galleryMedia(media: TemplateMedia[]): ShootMedia[] {
  return media.flatMap((item) => {
    if (!isShootGalleryType(item.type)) return [];
    return [
      {
        id: item.id,
        url: item.url,
        thumbUrl: item.thumbUrl,
        filename: item.filename,
        type: item.type,
        width: item.width,
        height: item.height,
        byteSize: item.byteSize,
        renditions: item.renditions,
      },
    ];
  });
}
