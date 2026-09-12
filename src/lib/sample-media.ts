import type { MediaType } from "./db/schema";

export type SampleMediaInput = {
  type: MediaType;
  filename: string;
  url: string;
  nasRelativePath: string;
  sortOrder: number;
};

const mapleFolder = "Whitfield/2026-09-04 - 1847 Maple Avenue, Austin, TX";
const westFolder = "Whitfield/2026-03-18 - 412 West 12th Street, Unit 6B, Austin, TX";

export const mapleMedia: SampleMediaInput[] = [
  { type: "photo", filename: "01-exterior.jpg", url: "/samples/maple-exterior.jpg", nasRelativePath: `${mapleFolder}/01-exterior.jpg`, sortOrder: 1 },
  { type: "photo", filename: "02-living.jpg", url: "/samples/maple-living.jpg", nasRelativePath: `${mapleFolder}/02-living.jpg`, sortOrder: 2 },
  { type: "photo", filename: "03-kitchen.jpg", url: "/samples/maple-kitchen.jpg", nasRelativePath: `${mapleFolder}/03-kitchen.jpg`, sortOrder: 3 },
  { type: "photo", filename: "04-bedroom.jpg", url: "/samples/maple-bedroom.jpg", nasRelativePath: `${mapleFolder}/04-bedroom.jpg`, sortOrder: 4 },
  { type: "video", filename: "walkthrough.mp4", url: "/samples/maple-walkthrough.mp4", nasRelativePath: `${mapleFolder}/walkthrough.mp4`, sortOrder: 5 },
  { type: "floor_plan", filename: "level-1.svg", url: "/samples/maple-floor-plan.svg", nasRelativePath: `${mapleFolder}/level-1.svg`, sortOrder: 6 },
];

export const west12Media: SampleMediaInput[] = [
  { type: "photo", filename: "01-exterior.jpg", url: "/samples/west12-exterior.jpg", nasRelativePath: `${westFolder}/01-exterior.jpg`, sortOrder: 1 },
  { type: "photo", filename: "02-living.jpg", url: "/samples/west12-living.jpg", nasRelativePath: `${westFolder}/02-living.jpg`, sortOrder: 2 },
  { type: "photo", filename: "03-kitchen.jpg", url: "/samples/west12-kitchen.jpg", nasRelativePath: `${westFolder}/03-kitchen.jpg`, sortOrder: 3 },
  { type: "video", filename: "walkthrough.mp4", url: "/samples/west12-walkthrough.mp4", nasRelativePath: `${westFolder}/walkthrough.mp4`, sortOrder: 4 },
  { type: "floor_plan", filename: "unit-6b.svg", url: "/samples/west12-floor-plan.svg", nasRelativePath: `${westFolder}/unit-6b.svg`, sortOrder: 5 },
];

export const placeholderSets = [mapleMedia, west12Media];
