import type { ServicePriceOption } from "./types";

export function defaultServicePriceOption(options: readonly ServicePriceOption[]): ServicePriceOption | undefined {
  return options.find((option) => option.durationMinutes === 60) ?? options[0];
}
