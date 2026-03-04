import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ClassValue } from "clsx";

import type { FilePath } from "@/types/files";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pathSegments(path: FilePath): string[] {
  return path.split("/").filter(Boolean);
}
