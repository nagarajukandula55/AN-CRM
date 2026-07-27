import { FilterQuery } from "mongoose";

/**
 * Only active + non-deleted records
 */
export function activeQuery<T>(): FilterQuery<T> {
  return {
    isDeleted: false,
  } as FilterQuery<T>;
}

/**
 * Strict active records (use for ERP modules)
 */
export function activeOnlyQuery<T>(): FilterQuery<T> {
  return {
    isDeleted: false,
    isActive: true,
  } as FilterQuery<T>;
}
