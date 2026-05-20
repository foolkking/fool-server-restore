/**
 * rbac.ts — 基于角色的权限控制工具
 */

import type { StoredUser } from "./runtime-store.js";

export type UserRole = "user" | "admin";

/** 检查用户是否有指定角色或更高权限 */
export function hasRole(user: StoredUser, required: UserRole): boolean {
  if (required === "user") return true; // 所有登录用户都有 user 权限
  if (required === "admin") return (user.role ?? "user") === "admin";
  return false;
}

/** 检查用户是否可以上传指定 kind 的配置 */
export function canUploadKind(user: StoredUser, kind: string): boolean {
  if (kind === "vm-snapshot") return true;       // 所有登录用户可上传私有快照
  if (kind === "combo") return true;             // 所有登录用户可发布热门组合
  if (kind === "software") return hasRole(user, "admin"); // 仅管理员可发布软件配置
  return false;
}

/** 检查用户是否可以查看指定 profile */
export function canViewProfile(user: StoredUser | null, profile: { userId: string; visibility: string }): boolean {
  if (profile.visibility === "public") return true;
  if (!user) return false;
  return profile.userId === user.id || hasRole(user, "admin");
}
