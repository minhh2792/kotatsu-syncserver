import chalk from "chalk";

function ts(): string {
  return chalk.gray(new Date().toISOString());
}

function label(service: string): string {
  return chalk.bold.cyan(`[${service}]`);
}

function fmt(detail: string | undefined): string {
  return detail ? ` ${chalk.white(detail)}` : "";
}

export const logger = {
  info(service: string, operation: string, detail?: string): void {
    console.log(`${ts()} ${label(service)} ${chalk.green(operation)}${fmt(detail)}`);
  },

  warn(service: string, operation: string, detail?: string): void {
    console.warn(`${ts()} ${label(service)} ${chalk.yellow(operation)}${fmt(detail)}`);
  },

  error(service: string, operation: string, detail?: string): void {
    console.error(`${ts()} ${label(service)} ${chalk.red(operation)}${fmt(detail)}`);
  },

  success(service: string, operation: string, detail?: string): void {
    console.log(`${ts()} ${label(service)} ${chalk.bold.green("✓")} ${chalk.green(operation)}${fmt(detail)}`);
  },
};
