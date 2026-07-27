"use client";

import { useMemo } from "react";
import { IAuthSession } from "./session";

/**
 * Permission checking utilities for React components
 */
export function usePermission(session: IAuthSession | null) {
  /**
   * Check single permission
   */
  const can = useMemo(() => {
    return (permission: string): boolean => {
      if (!session) return false;
      return session.permissions.includes(permission);
    };
  }, [session]);

  /**
   * Check multiple permissions (ANY match)
   */
  const canAny = useMemo(() => {
    return (permissions: string[]): boolean => {
      if (!session) return false;
      return permissions.some((p) =>
        session.permissions.includes(p)
      );
    };
  }, [session]);

  /**
   * Check multiple permissions (ALL required)
   */
  const canAll = useMemo(() => {
    return (permissions: string[]): boolean => {
      if (!session) return false;
      return permissions.every((p) =>
        session.permissions.includes(p)
      );
    };
  }, [session]);

  /**
   * Role check
   */
  const hasRole = useMemo(() => {
    return (role: string): boolean => {
      if (!session) return false;
      return session.roles.includes(role);
    };
  }, [session]);

  /**
   * High-level shortcut for UI visibility
   */
  const visible = useMemo(() => {
    return (permission: string | string[]): boolean => {
      if (!session) return false;

      if (Array.isArray(permission)) {
        return permission.some((p) =>
          session.permissions.includes(p)
        );
      }

      return session.permissions.includes(permission);
    };
  }, [session]);

  return {
    can,
    canAny,
    canAll,
    hasRole,
    visible,
  };
}
