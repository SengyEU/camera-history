export interface PlanOption {
  months: number;
  label: string;
}

export const PLAN_OPTIONS: PlanOption[] = [
  { months: 0.5, label: "14 days" },
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
  { months: 24, label: "24 months" },
  { months: 36, label: "36 months" },
];

export function planLabel(months: number | null | undefined): string {
  if (months === null || months === undefined) return "Inherit from account";
  return PLAN_OPTIONS.find((option) => option.months === months)?.label ?? `${months} months`;
}
