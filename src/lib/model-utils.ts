import { FilterQuery } from "mongoose";

export function activeFilter<T>(): FilterQuery<T> {
  return {
    isDeleted: false,
  } as FilterQuery<T>;
}

export function activeRecordFilter<T>(): FilterQuery<T> {
  return {
    isDeleted: false,
    isActive: true,
  } as FilterQuery<T>;
}
