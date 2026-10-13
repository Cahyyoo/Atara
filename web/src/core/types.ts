/** The shapes every API answer shares. Each module keeps its own DTOs in its types.ts. */
import type { Role } from "@/core/lib/auth/permissions";

/** The roles; what each may do, in which department, is in permissions.ts. */
export type UserRole = Role;

/** A banner above every page, as the shell shows it. The system module's announcements are these and more. */
export interface BannerDTO {
  id: string;
  message: string;
  tone: "INFO" | "WARNING";
}

export interface PaginationDTO {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
  details?: unknown;
  /** Machine-readable tag, when the route gives one (see ApiError). */
  code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
