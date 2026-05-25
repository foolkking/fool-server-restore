import React, { useEffect, useState } from "react";
import {
  Search,
  Shield,
  UserCheck,
  Lock,
  Unlock,
  RefreshCw,
  Layers,
  Users,
  AlertTriangle
} from "lucide-react";
import {
  fetchAdminUsers,
  updateAdminUserRole,
  toggleAdminUserLock,
  fetchAdminQueues,
  type AdminUser,
  type AdminQueueItem,
  type ConnectionProfile
} from "../api";
import type { Locale } from "../lib/types";

interface Props {
  locale: Locale;
  authToken: string;
  connections: ConnectionProfile[];
}

export function AdminPanel({ locale, authToken, connections }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [queues, setQueues] = useState<AdminQueueItem[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  async function loadUsers() {
    setUserLoading(true);
    setUserError("");
    try {
      const res = await fetchAdminUsers(authToken);
      setUsers(res.users);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setUserLoading(false);
    }
  }

  async function loadQueues() {
    setQueueLoading(true);
    setQueueError("");
    try {
      const res = await fetchAdminQueues(authToken);
      setQueues(res.queues);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Failed to fetch queues");
    } finally {
      setQueueLoading(false);
    }
  }

  useEffect(() => {
    if (authToken) {
      void loadUsers();
      void loadQueues();
    }
  }, [authToken]);

  async function handleToggleRole(targetUser: AdminUser) {
    const newRole = targetUser.role === "admin" ? "user" : "admin";
    const confirmMsg = locale === "zh"
      ? `确定要将用户 ${targetUser.name} 的角色更改为 ${newRole === "admin" ? "管理员" : "普通用户"} 吗？`
      : `Are you sure you want to change the role of ${targetUser.name} to ${newRole}?`;
    if (!confirm(confirmMsg)) return;

    setActionInProgress(targetUser.id);
    try {
      const res = await updateAdminUserRole(authToken, targetUser.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? res.user : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleLock(targetUser: AdminUser) {
    const actionText = targetUser.deletedAt ? (locale === "zh" ? "启用" : "Unlock") : (locale === "zh" ? "锁定/封禁" : "Lock");
    const confirmMsg = locale === "zh"
      ? `确定要${actionText}用户 ${targetUser.name} 吗？`
      : `Are you sure you want to ${actionText.toLowerCase()} user ${targetUser.name}?`;
    if (!confirm(confirmMsg)) return;

    setActionInProgress(targetUser.id);
    try {
      const res = await toggleAdminUserLock(authToken, targetUser.id);
      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? res.user : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle user lock status");
    } finally {
      setActionInProgress(null);
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 队列管理板块 */}
      <section className="settings-section">
        <div className="settings-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Layers size={18} style={{ color: "#3b82f6" }} />
            <h3>{locale === "zh" ? "全局任务队列监控" : "Global Task Queue Monitor"}</h3>
          </div>
          <button
            type="button"
            className="ghost-action icon-action"
            onClick={() => void loadQueues()}
            disabled={queueLoading}
            style={{ display: "flex", alignItems: "center", gap: "4px" }}
          >
            <RefreshCw size={14} className={queueLoading ? "spinning" : ""} />
            <span style={{ fontSize: "13px" }}>{locale === "zh" ? "刷新" : "Refresh"}</span>
          </button>
        </div>
        <p className="settings-help">
          {locale === "zh"
            ? "监控系统中当前所有目标虚拟机的并发 SSH 任务和排队状态。"
            : "Monitor active SSH tasks and queue status for all VMs in the system."}
        </p>

        {queueError && <p className="settings-error">{queueError}</p>}

        {queueLoading && queues.length === 0 ? (
          <p className="empty-hint"><span className="spinning">↻</span> {locale === "zh" ? "加载队列中…" : "Loading queues…"}</p>
        ) : queues.length === 0 ? (
          <p className="empty-hint">
            {locale === "zh"
              ? "当前没有任何运行中或排队的任务。"
              : "No active or queued tasks at the moment."}
          </p>
        ) : (
          <div className="admin-queue-list" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            {queues.map((q) => {
              const conn = connections.find((c) => c.id === q.connectionId);
              return (
                <div
                  key={q.connectionId}
                  className="settings-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <strong style={{ fontSize: "15px", color: "#f8fafc" }}>
                      {conn ? conn.label : `VM (${q.connectionId.slice(0, 8)})`}
                    </strong>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      ID: <code>{q.connectionId}</code>
                      {conn?.fields?.host ? ` · Host: ${conn.fields.host}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: q.running ? "#10b981" : "#64748b"
                        }}
                      />
                      <span style={{ fontSize: "13px", color: q.running ? "#34d399" : "#94a3b8" }}>
                        {q.running
                          ? (locale === "zh" ? "正在运行中" : "Running")
                          : (locale === "zh" ? "空闲" : "Idle")}
                      </span>
                    </div>
                    {q.queued > 0 && (
                      <div
                        style={{
                          background: "rgba(245, 158, 11, 0.15)",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          color: "#fbbf24",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "bold"
                        }}
                      >
                        {q.queued} {locale === "zh" ? "个任务排队中" : "queued"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 用户管理板块 */}
      <section className="settings-section">
        <div className="settings-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} style={{ color: "#3b82f6" }} />
            <h3>{locale === "zh" ? "用户管理" : "User Management"}</h3>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div className="search-input-wrapper" style={{ position: "relative" }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b"
                }}
              />
              <input
                type="text"
                placeholder={locale === "zh" ? "搜索用户名/邮箱/ID…" : "Search by name/email/ID…"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: "32px",
                  fontSize: "13px",
                  minHeight: "32px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  color: "#f8fafc"
                }}
              />
            </div>
            <button
              type="button"
              className="ghost-action icon-action"
              onClick={() => void loadUsers()}
              disabled={userLoading}
            >
              <RefreshCw size={14} className={userLoading ? "spinning" : ""} />
            </button>
          </div>
        </div>

        {userError && <p className="settings-error">{userError}</p>}

        {userLoading && users.length === 0 ? (
          <p className="empty-hint"><span className="spinning">↻</span> {locale === "zh" ? "加载用户中…" : "Loading users…"}</p>
        ) : filteredUsers.length === 0 ? (
          <p className="empty-hint">
            {searchQuery
              ? (locale === "zh" ? "未找到匹配的用户。" : "No matching users found.")
              : (locale === "zh" ? "系统中暂无用户。" : "No users in the system.")}
          </p>
        ) : (
          <div className="admin-user-table-wrapper" style={{ overflowX: "auto", marginTop: "12px" }}>
            <table className="admin-user-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", textAlign: "left" }}>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: "600" }}>{locale === "zh" ? "用户" : "User"}</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: "600" }}>{locale === "zh" ? "角色" : "Role"}</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: "600" }}>{locale === "zh" ? "状态" : "Status"}</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: "600" }}>{locale === "zh" ? "注册时间" : "Joined"}</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: "600", textAlign: "right" }}>{locale === "zh" ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isLocked = !!u.deletedAt;
                  const isPending = actionInProgress === u.id;
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        opacity: isLocked ? 0.6 : 1,
                        transition: "opacity 0.2s"
                      }}
                    >
                      <td style={{ padding: "12px 8px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: "500", color: "#f8fafc" }}>{u.name}</span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>{u.email}</span>
                          <code style={{ fontSize: "10px", color: "#475569", width: "fit-content" }}>{u.id}</code>
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "500",
                            background: u.role === "admin" ? "rgba(59, 130, 246, 0.15)" : "rgba(100, 116, 139, 0.15)",
                            color: u.role === "admin" ? "#60a5fa" : "#94a3b8",
                            border: u.role === "admin" ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid rgba(100, 116, 139, 0.3)"
                          }}
                        >
                          {u.role === "admin" ? <Shield size={10} /> : null}
                          {u.role === "admin" ? (locale === "zh" ? "管理员" : "Admin") : (locale === "zh" ? "普通用户" : "User")}
                        </span>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {isLocked ? (
                          <span style={{ color: "#ef4444", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <AlertTriangle size={12} />
                            {locale === "zh" ? "已封禁/锁定" : "Suspended"}
                          </span>
                        ) : (
                          <span style={{ color: "#10b981", fontSize: "12px" }}>
                            ✓ {locale === "zh" ? "正常" : "Active"}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 8px", fontSize: "13px", color: "#64748b" }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="secondary-action"
                            disabled={isPending}
                            onClick={() => void handleToggleRole(u)}
                            style={{ padding: "4px 8px", fontSize: "12px", minHeight: "28px" }}
                            title={locale === "zh" ? "切换用户角色" : "Toggle User Role"}
                          >
                            <UserCheck size={13} style={{ marginRight: "4px", display: "inline" }} />
                            {u.role === "admin"
                              ? (locale === "zh" ? "降级" : "Demote")
                              : (locale === "zh" ? "提拔" : "Promote")}
                          </button>
                          <button
                            type="button"
                            className={`conn-btn ${isLocked ? "conn-btn-success" : "conn-btn-danger"}`}
                            disabled={isPending}
                            onClick={() => void handleToggleLock(u)}
                            style={{
                              padding: "4px 8px",
                              fontSize: "12px",
                              minHeight: "28px",
                              background: isLocked ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              border: isLocked ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                              color: isLocked ? "#34d399" : "#f87171"
                            }}
                          >
                            {isLocked ? (
                              <>
                                <Unlock size={13} style={{ marginRight: "4px", display: "inline" }} />
                                {locale === "zh" ? "启用" : "Unlock"}
                              </>
                            ) : (
                              <>
                                <Lock size={13} style={{ marginRight: "4px", display: "inline" }} />
                                {locale === "zh" ? "锁定" : "Suspend"}
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
