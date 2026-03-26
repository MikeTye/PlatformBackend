import { z } from "zod";

export const OnboardingStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "skipped",
]);

export const OnboardingRoleSchema = z.enum([
  "develop",
  "services",
  "buy",
  "invest",
  "research",
  "exploring",
]);

export const OnboardingDraftSchema = z.record(z.string(), z.unknown());

export const UpdateMyOnboardingSchema = z
  .object({
    onboardingSelectedRoles: z.array(OnboardingRoleSchema).max(20).optional(),
    onboardingStep: z.number().int().min(0).max(10).optional(),
    onboardingStatus: OnboardingStatusSchema.optional(),
    onboardingCompanyCreated: z.boolean().optional(),
    onboardingProjectCreated: z.boolean().optional(),
    onboardingDraft: OnboardingDraftSchema.optional(),
  })
  .strict();

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;
export type UpdateMyOnboardingInput = z.infer<typeof UpdateMyOnboardingSchema>;

export const ONBOARDING_ROLES = [
  "develop",
  "services",
  "buy",
  "invest",
  "research",
  "exploring",
] as const;

export type OnboardingRole = (typeof ONBOARDING_ROLES)[number];

export type MyOnboardingDto = {
  onboardingSelectedRoles: OnboardingRole[];
  onboardingStep: number;
  onboardingStatus: OnboardingStatus;
  onboardingCompanyCreated: boolean;
  onboardingProjectCreated: boolean;
  onboardingDraft: Record<string, unknown>;
  onboardingStartedAt?: string | null;
  onboardingLastSeenAt?: string | null;
  onboardingCompletedAt?: string | null;
};