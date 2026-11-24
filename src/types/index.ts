export type AppRole = 'super_admin' | 'programme_manager' | 'facilitator' | 'participant';

export type NavSection =
  | 'dashboard'
  | 'programmes'
  | 'participants'
  | 'attendance'
  | 'assessments'
  | 'projects'
  | 'performance'
  | 'impact'
  | 'reports'
  | 'certificates'
  | 'users';

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: AppRole;
  authProvider?: string;
  requestedRole?: AppRole | null;
  approvalStatus?: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserInvitationItem {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  codePrefix: string;
  invitedBy: string;
  invitedByName: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface RoleMetadata {
  id: string;
  name: AppRole;
  displayName: string;
  description: string;
  permissions: string[];
}

export interface ProgrammeSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: string;
  stats: {
    cohortsCount: number;
    tracksCount: number;
    objectivesCount: number;
    confirmedObjectivesCount: number;
    outcomesCount: number;
    participantsCount: number;
    sessionsCount: number;
    completedSessionsCount: number;
  };
}

export interface CohortItem {
  id: string;
  programmeId: string;
  name: string;
  startDate: string;
  endDate: string;
  capacity: number | null;
  status: 'upcoming' | 'active' | 'completed';
  participantCount?: number;
}

export interface StemTrackItem {
  id: string;
  programmeId: string;
  name: string;
  code: string | null;
  description: string | null;
  participantCount?: number;
}

export interface ObjectiveItem {
  id: string;
  programmeId: string;
  title: string;
  description: string | null;
  targetMetric: string | null;
  isConfirmed: boolean;
}

export interface LearningOutcomeItem {
  id: string;
  programmeId: string;
  objectiveId: string | null;
  code: string;
  statement: string;
  targetProficiencyPct: string;
}

export interface SessionItem {
  id: string;
  programmeId: string;
  cohortId: string;
  trackId: string | null;
  facilitatorId: string | null;
  title: string;
  description: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  deliverables: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  cohortName?: string;
  trackName?: string | null;
  facilitatorName?: string | null;
}

export interface ParticipantItem {
  id: string;
  userId: string | null;
  participantCode: string;
  fullName: string;
  contactEmail: string | null;
  ageGroup: 'under_14' | '14_17' | '18_24' | '25_plus' | null;
  educationLevel: string | null;
  programmeId: string;
  cohortId: string;
  trackId: string | null;
  assignedFacilitatorId: string | null;
  status: 'active' | 'completed' | 'withdrawn' | 'deferred';
  registrationDate: string;
  notes: string | null;
  programmeTitle: string;
  programmeCode: string;
  cohortName: string;
  trackName: string | null;
  facilitatorName: string | null;
  attendanceRate: number | null;
  assessmentsGraded?: number;
  avgAssessmentPct?: number | null;
}

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
}

export type AttendanceStatus = 'present' | 'late' | 'approved_absence' | 'absent';

export type AssessmentCategory =
  | 'pre_programme'
  | 'post_programme'
  | 'quiz'
  | 'practical_stem'
  | 'project_assessment'
  | 'skill_evaluation';

export type IndicatorDomain =
  | 'attendance_engagement'
  | 'knowledge_acquisition'
  | 'practical_stem_skills'
  | 'project_task_completion'
  | 'collaboration_problem_solving';

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Administrator',
  programme_manager: 'Programme Manager',
  facilitator: 'Facilitator / Mentor',
  participant: 'Participant',
};

export const AGE_GROUP_LABELS: Record<string, string> = {
  under_14: 'Under 14',
  '14_17': '14–17 years',
  '18_24': '18–24 years',
  '25_plus': '25+ years',
};

export const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  pre_programme: 'Pre-Programme Assessment',
  post_programme: 'Post-Programme Assessment',
  quiz: 'Quiz',
  practical_stem: 'Practical STEM Assessment',
  project_assessment: 'Project Assessment',
  skill_evaluation: 'Skill-Based Evaluation',
};

export const DOMAIN_LABELS: Record<IndicatorDomain, string> = {
  attendance_engagement: 'Attendance & Engagement',
  knowledge_acquisition: 'Knowledge Acquisition',
  practical_stem_skills: 'Practical STEM Skills',
  project_task_completion: 'Project & Task Completion',
  collaboration_problem_solving: 'Collaboration & Problem-Solving',
};
