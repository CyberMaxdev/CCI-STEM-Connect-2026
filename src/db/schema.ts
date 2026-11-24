import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ==========================================
// ENUMS
// ==========================================

export const appRoleEnum = pgEnum('app_role', [
  'super_admin',
  'programme_manager',
  'facilitator',
  'participant',
]);

export const programmeStatusEnum = pgEnum('programme_status', [
  'draft',
  'active',
  'completed',
  'archived',
]);

export const cohortStatusEnum = pgEnum('cohort_status', [
  'upcoming',
  'active',
  'completed',
]);

export const participantStatusEnum = pgEnum('participant_status', [
  'active',
  'completed',
  'withdrawn',
  'deferred',
]);

export const ageGroupEnum = pgEnum('age_group', [
  'under_14',
  '14_17',
  '18_24',
  '25_plus',
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'scheduled',
  'completed',
  'cancelled',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'late',
  'approved_absence',
  'absent',
]);

export const assessmentCategoryEnum = pgEnum('assessment_category', [
  'pre_programme',
  'post_programme',
  'quiz',
  'practical_stem',
  'project_assessment',
  'skill_evaluation',
]);

export const indicatorDomainEnum = pgEnum('indicator_domain', [
  'attendance_engagement',
  'knowledge_acquisition',
  'practical_stem_skills',
  'project_task_completion',
  'collaboration_problem_solving',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'pending',
  'in_progress',
  'submitted',
  'evaluated',
  'revision_requested',
]);

// ==========================================
// 1. USERS & ROLES (RBAC)
// ==========================================

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: appRoleEnum('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').notNull().unique(), // Firebase Auth UID
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    avatarUrl: text('avatar_url'),
    role: appRoleEnum('role').notNull().default('participant'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_users_role').on(table.role)]
);

// ==========================================
// 2. PROGRAMMES, COHORTS, TRACKS & OUTCOMES
// ==========================================

export const programmes = pgTable('programmes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: programmeStatusEnum('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cohorts = pgTable(
  'cohorts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    capacity: integer('capacity'),
    status: cohortStatusEnum('status').notNull().default('upcoming'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_cohorts_programme').on(table.programmeId)]
);

export const stemTracks = pgTable(
  'stem_tracks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_stem_tracks_programme').on(table.programmeId)]
);

export const programmeObjectives = pgTable(
  'programme_objectives',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    targetMetric: text('target_metric'),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_objectives_programme').on(table.programmeId)]
);

export const learningOutcomes = pgTable(
  'learning_outcomes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    objectiveId: uuid('objective_id').references(() => programmeObjectives.id, {
      onDelete: 'set null',
    }),
    code: text('code').notNull(),
    statement: text('statement').notNull(),
    targetProficiencyPct: numeric('target_proficiency_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('70.00'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_outcomes_programme').on(table.programmeId)]
);

// ==========================================
// 3. PARTICIPANTS & SESSIONS
// ==========================================

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'set null' }),
    participantCode: text('participant_code').notNull().unique(),
    fullName: text('full_name').notNull(),
    contactEmail: text('contact_email'),
    ageGroup: ageGroupEnum('age_group'),
    educationLevel: text('education_level'),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'restrict' }),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'restrict' }),
    trackId: uuid('track_id').references(() => stemTracks.id, { onDelete: 'set null' }),
    assignedFacilitatorId: uuid('assigned_facilitator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: participantStatusEnum('status').notNull().default('active'),
    registrationDate: date('registration_date').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_participants_programme').on(table.programmeId),
    index('idx_participants_cohort').on(table.cohortId),
    index('idx_participants_track').on(table.trackId),
    index('idx_participants_facilitator').on(table.assignedFacilitatorId),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').references(() => stemTracks.id, { onDelete: 'set null' }),
    facilitatorId: uuid('facilitator_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    sessionDate: date('session_date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    deliverables: text('deliverables'),
    status: sessionStatusEnum('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sessions_programme').on(table.programmeId),
    index('idx_sessions_cohort').on(table.cohortId),
    index('idx_sessions_facilitator').on(table.facilitatorId),
  ]
);

// ==========================================
// 4. ATTENDANCE & ENGAGEMENT
// ==========================================

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull(),
    engagementScore: numeric('engagement_score', { precision: 4, scale: 2 }),
    observations: text('observations'),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_attendance_session_participant').on(table.sessionId, table.participantId),
    index('idx_attendance_participant').on(table.participantId),
    index('idx_attendance_session').on(table.sessionId),
  ]
);

// ==========================================
// 5. ASSESSMENTS & RUBRICS
// ==========================================

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    cohortId: uuid('cohort_id').references(() => cohorts.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').references(() => stemTracks.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: assessmentCategoryEnum('category').notNull(),
    indicatorDomain: indicatorDomainEnum('indicator_domain').notNull(),
    maxScore: numeric('max_score', { precision: 7, scale: 2 }).notNull(),
    pairedPreAssessmentId: uuid('paired_pre_assessment_id').references(
      (): AnyPgColumn => assessments.id,
      { onDelete: 'set null' }
    ),
    dueDate: date('due_date'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_assessments_programme').on(table.programmeId)]
);

export const assessmentCriteria = pgTable('assessment_criteria', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id')
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  criterionName: text('criterion_name').notNull(),
  description: text('description'),
  maxPoints: numeric('max_points', { precision: 7, scale: 2 }).notNull(),
});

export const assessmentResults = pgTable(
  'assessment_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    rawScore: numeric('raw_score', { precision: 7, scale: 2 }).notNull(),
    percentageScore: numeric('percentage_score', { precision: 5, scale: 2 }).notNull(),
    feedback: text('feedback'),
    gradedBy: uuid('graded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    gradedAt: timestamp('graded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assessment_result_participant').on(table.assessmentId, table.participantId),
    index('idx_assessment_results_participant').on(table.participantId),
  ]
);

// ==========================================
// 6. PROJECTS, TEAMS & CONTRIBUTIONS
// ==========================================

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').references(() => stemTracks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    objectives: text('objectives').notNull(),
    expectedDeliverables: text('expected_deliverables').notNull(),
    milestones: jsonb('milestones').$type<Array<{ title: string; dueDate?: string; completed: boolean }>>().default([]),
    isTeamProject: boolean('is_team_project').notNull().default(false),
    maxScore: numeric('max_score', { precision: 7, scale: 2 }).notNull().default('100.00'),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_projects_cohort').on(table.cohortId)]
);

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.participantId] })]
);

export const projectSubmissions = pgTable('project_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').references(() => participants.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  submissionUrl: text('submission_url'),
  status: submissionStatusEnum('status').notNull().default('pending'),
  qualityScore: numeric('quality_score', { precision: 7, scale: 2 }),
  feedback: text('feedback'),
  evaluatedBy: uuid('evaluated_by').references(() => users.id, { onDelete: 'set null' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
});

export const teamContributions = pgTable(
  'team_contributions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => projectSubmissions.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    individualScore: numeric('individual_score', { precision: 5, scale: 2 }).notNull(),
    collaborationScore: numeric('collaboration_score', { precision: 5, scale: 2 }),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('uq_team_contribution_participant').on(table.submissionId, table.participantId),
  ]
);

// ==========================================
// 7. PERFORMANCE ENGINE & OUTCOME EVIDENCE
// ==========================================

export const scoringConfigurations = pgTable('scoring_configurations', {
  id: uuid('id').defaultRandom().primaryKey(),
  programmeId: uuid('programme_id')
    .notNull()
    .references(() => programmes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  isDefaultProposal: boolean('is_default_proposal').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const performanceIndicators = pgTable(
  'performance_indicators',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scoringConfigId: uuid('scoring_config_id')
      .notNull()
      .references(() => scoringConfigurations.id, { onDelete: 'cascade' }),
    domain: indicatorDomainEnum('domain').notNull(),
    label: text('label').notNull(),
    weightPct: numeric('weight_pct', { precision: 5, scale: 2 }).notNull(),
    isRequired: boolean('is_required').notNull().default(true),
  },
  (table) => [
    uniqueIndex('uq_indicator_config_domain').on(table.scoringConfigId, table.domain),
  ]
);

export const scoringThresholds = pgTable('scoring_thresholds', {
  id: uuid('id').defaultRandom().primaryKey(),
  scoringConfigId: uuid('scoring_config_id')
    .notNull()
    .references(() => scoringConfigurations.id, { onDelete: 'cascade' }),
  categoryName: text('category_name').notNull(),
  minScore: numeric('min_score', { precision: 5, scale: 2 }).notNull(),
  maxScore: numeric('max_score', { precision: 5, scale: 2 }).notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const outcomeEvidenceMappings = pgTable('outcome_evidence_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  learningOutcomeId: uuid('learning_outcome_id')
    .notNull()
    .references(() => learningOutcomes.id, { onDelete: 'cascade' }),
  assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  evidenceWeight: numeric('evidence_weight', { precision: 5, scale: 2 })
    .notNull()
    .default('100.00'),
});

// ==========================================
// 8. CERTIFICATES & REPORTS
// ==========================================

export const certificateTemplates = pgTable('certificate_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  programmeId: uuid('programme_id')
    .notNull()
    .references(() => programmes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  minAttendancePct: numeric('min_attendance_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('75.00'),
  minOverallScore: numeric('min_overall_score', { precision: 5, scale: 2 })
    .notNull()
    .default('55.00'),
  requireAllAssessments: boolean('require_all_assessments').notNull().default(true),
  requireProgrammeCompletion: boolean('require_programme_completion').notNull().default(true),
  templateConfig: jsonb('template_config').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    certificateCode: text('certificate_code').notNull().unique(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => certificateTemplates.id, { onDelete: 'restrict' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => programmes.id, { onDelete: 'cascade' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    pdfStoragePath: text('pdf_storage_path'),
  },
  (table) => [
    uniqueIndex('uq_certificate_template_participant').on(table.templateId, table.participantId),
  ]
);

export const generatedReports = pgTable('generated_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportType: text('report_type').notNull(),
  programmeId: uuid('programme_id').references(() => programmes.id, { onDelete: 'set null' }),
  filtersApplied: jsonb('filters_applied').$type<Record<string, unknown>>().notNull().default({}),
  reportingPeriodStart: date('reporting_period_start'),
  reportingPeriodEnd: date('reporting_period_end'),
  methodologySnapshot: jsonb('methodology_snapshot').$type<Record<string, unknown>>().default({}),
  generatedBy: uuid('generated_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  fileUrl: text('file_url'),
});

// ==========================================
// DRIZZLE RELATIONS
// ==========================================

export const usersRelations = relations(users, ({ many }) => ({
  createdProgrammes: many(programmes),
  assignedParticipants: many(participants),
  facilitatedSessions: many(sessions),
}));

export const programmesRelations = relations(programmes, ({ one, many }) => ({
  creator: one(users, { fields: [programmes.createdBy], references: [users.id] }),
  cohorts: many(cohorts),
  tracks: many(stemTracks),
  objectives: many(programmeObjectives),
  learningOutcomes: many(learningOutcomes),
  participants: many(participants),
  sessions: many(sessions),
}));

export const cohortsRelations = relations(cohorts, ({ one, many }) => ({
  programme: one(programmes, { fields: [cohorts.programmeId], references: [programmes.id] }),
  participants: many(participants),
  sessions: many(sessions),
}));

export const stemTracksRelations = relations(stemTracks, ({ one, many }) => ({
  programme: one(programmes, { fields: [stemTracks.programmeId], references: [programmes.id] }),
  participants: many(participants),
  sessions: many(sessions),
}));

export const programmeObjectivesRelations = relations(programmeObjectives, ({ one, many }) => ({
  programme: one(programmes, {
    fields: [programmeObjectives.programmeId],
    references: [programmes.id],
  }),
  learningOutcomes: many(learningOutcomes),
}));

export const learningOutcomesRelations = relations(learningOutcomes, ({ one }) => ({
  programme: one(programmes, {
    fields: [learningOutcomes.programmeId],
    references: [programmes.id],
  }),
  objective: one(programmeObjectives, {
    fields: [learningOutcomes.objectiveId],
    references: [programmeObjectives.id],
  }),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  user: one(users, { fields: [participants.userId], references: [users.id] }),
  programme: one(programmes, { fields: [participants.programmeId], references: [programmes.id] }),
  cohort: one(cohorts, { fields: [participants.cohortId], references: [cohorts.id] }),
  track: one(stemTracks, { fields: [participants.trackId], references: [stemTracks.id] }),
  facilitator: one(users, {
    fields: [participants.assignedFacilitatorId],
    references: [users.id],
  }),
  attendanceRecords: many(attendanceRecords),
  assessmentResults: many(assessmentResults),
  projectSubmissions: many(projectSubmissions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  programme: one(programmes, { fields: [sessions.programmeId], references: [programmes.id] }),
  cohort: one(cohorts, { fields: [sessions.cohortId], references: [cohorts.id] }),
  track: one(stemTracks, { fields: [sessions.trackId], references: [stemTracks.id] }),
  facilitator: one(users, { fields: [sessions.facilitatorId], references: [users.id] }),
  attendanceRecords: many(attendanceRecords),
}));
