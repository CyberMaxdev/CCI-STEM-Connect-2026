import { Layers } from 'lucide-react';
import type { NavSection } from '../types';

const MODULE_META: Record<
  Exclude<
    NavSection,
    'dashboard' | 'programmes' | 'participants' | 'attendance' | 'assessments' | 'users'
  >,
  {
    title: string;
    summary: string;
    tables: string[];
    nextMilestone: string;
  }
> = {
  projects: {
    title: 'STEM Projects, Teams & Milestone Tracking',
    summary:
      'Create individual or team STEM projects, define deliverables and milestones, record submissions, evaluate project quality, and score individual team contributions.',
    tables: ['projects', 'teams', 'team_members', 'project_submissions', 'team_contributions'],
    nextMilestone: 'Scheduled for the next build phase once attendance and assessment grading are verified.',
  },
  performance: {
    title: 'Participant Performance Measurement Engine',
    summary:
      'Configurable weighted scoring model (Attendance 15%, Knowledge 25%, Practical STEM 30%, Projects 20%, Collaboration 10%) with strict 100% weight validation and incomplete-score transparency.',
    tables: ['scoring_configurations', 'performance_indicators', 'scoring_thresholds'],
    nextMilestone: 'Schema tables are provisioned and ready for engine configuration and threshold management.',
  },
  impact: {
    title: 'Programme Impact & Learning Outcome Evaluation',
    summary:
      'Map assessments and STEM projects to confirmed learning outcomes, track cohort retention, pre/post learning growth, and facilitator session effectiveness without causal overclaiming.',
    tables: ['learning_outcomes', 'outcome_evidence_mappings', 'programme_objectives'],
    nextMilestone: 'Schema tables are provisioned and linked to assessments and learning outcomes.',
  },
  reports: {
    title: 'Evidence-Based Reports & Exports',
    summary:
      'Generate participant, cohort, STEM track, session, facilitator, and programme impact reports in CSV/PDF formats with embedded reporting period, applied filters, and scoring methodology.',
    tables: ['generated_reports'],
    nextMilestone: 'Report metadata table is provisioned and ready for automated PDF/CSV generation.',
  },
  certificates: {
    title: 'Eligibility-Gated Certificates & Recognition',
    summary:
      'Configure programme completion, attendance, assessment completion, and overall score thresholds to issue unique verifiable certificates strictly for eligible participants.',
    tables: ['certificate_templates', 'certificates'],
    nextMilestone: 'Certificate template and issuance tables are provisioned with unique verification codes.',
  },
};

export function ModulePlaceholderPage({
  section,
}: {
  section: Exclude<
    NavSection,
    'dashboard' | 'programmes' | 'participants' | 'attendance' | 'assessments' | 'users'
  >;
}) {
  const info = MODULE_META[section];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-3xl">
      <div className="flex items-center gap-2 text-xs font-medium text-[#B5121B]">
        <Layers className="w-4 h-4" />
        <span>Database Foundation Ready</span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">{info.title}</h2>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{info.summary}</p>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-500">Provisioned Relational Tables</p>
        <p className="mt-2 text-xs font-mono text-slate-700">{info.tables.join(' · ')}</p>
      </div>

      <p className="mt-6 text-xs text-slate-500">{info.nextMilestone}</p>
    </div>
  );
}
