// lib/utils.ts
// Standard project utility functions including tailwind CSS class merging and formatting utilities

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a numeric amount to Kenyan Shillings (e.g. KES 1,234)
 */
export function formatCurrency(amount: number): string {
  const formatter = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(amount);
}

/**
 * Formats a Date or date string to a standard format (e.g., 12 Jan 2025)
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  // Handle invalid dates gracefully
  if (isNaN(dateObj.getTime())) return "Invalid Date";
  return format(dateObj, "d MMM yyyy");
}

/**
 * Truncates a string to a specified length and appends "..." if it exceeds the limit
 */
export function truncate(str: string, length: number): string {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.substring(0, length).trim() + "...";
}
