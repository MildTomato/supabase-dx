/**
 * Shared chalk-based table component for CLI output
 */

import chalk from "chalk";

export interface Column<T> {
  /** Column header label */
  label: string;
  /** Fixed width (characters) */
  width: number;
  /** Extract the display value from a row */
  value: (row: T) => string;
}

/**
 * Print a formatted table with dim headers and separator
 */
export function printTable<T>(columns: Column<T>[], rows: T[]): void {
  // Header
  console.log(
    columns.map((col) => chalk.dim(col.label.toUpperCase().padEnd(col.width))).join("")
  );
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  console.log(chalk.dim("─".repeat(totalWidth)));

  // Rows
  for (const row of rows) {
    const cells = columns.map((col) => {
      const raw = col.value(row);
      // Measure visible length (strip ANSI) to pad correctly
      const visible = raw.replace(/\x1b\[[0-9;]*m/g, "");
      const pad = Math.max(0, col.width - visible.length);
      const truncated =
        visible.length > col.width - 1
          ? raw.slice(0, col.width - 1 + (raw.length - visible.length))
          : raw;
      return truncated + " ".repeat(pad);
    });
    console.log(cells.join(""));
  }
}
