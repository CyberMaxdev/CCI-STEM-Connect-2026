import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  assessmentResults,
  assessments,
  certificates,
  certificateTemplates,
  participants,
  programmes,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { computeProgrammePerformanceReport } from '../services/performance-service.ts';

const router = Router();
const uuidSchema = z.string().uuid();

const createTemplateSchema = z.object({
  programmeId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  minAttendancePct: z.number().min(0).max(100).default(75),
  minOverallScore: z.number().min(0).max(100).default(55),
  requireAllAssessments: z.boolean().default(true),
  requireProgrammeCompletion: z.boolean().default(true),
  signatoryName: z.string().trim().max(120).optional(),
  signatoryTitle: z.string().trim().max(120).optional(),
});

const issueCertificatesSchema = z.object({
  templateId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()).min(1).max(200),
});

interface EligibilityEvaluation {
  participantId: string;
  participantCode: string;
  fullName: string;
  cohortName: string;
  trackName: string | null;
  participantStatus: string;
  attendanceRate: number | null;
  overallScore: number | null;
  classification: string;
  dataStatus: string;
  gradedAssessments: number;
  requiredAssessments: number;
  eligible: boolean;
  reasons: string[];
  issuedCertificate: {
    id: string;
    certificateCode: string;
    issuedAt: Date;
  } | null;
}

async function evaluateEligibilityForTemplate(
  template: typeof certificateTemplates.$inferSelect,
  filterParticipantId?: string
): Promise<{
  programmeTitle: string;
  programmeCode: string;
  rows: EligibilityEvaluation[];
}> {
  const perfReport = await computeProgrammePerformanceReport({
    programmeId: template.programmeId,
    participantId: filterParticipantId,
  });

  if (!perfReport) {
    return { programmeTitle: '', programmeCode: '', rows: [] };
  }

  const pIds = perfReport.participants.map((p) => p.participantId);
  const [progAssessments, results, issuedRows] = await Promise.all([
    db.select().from(assessments).where(eq(assessments.programmeId, template.programmeId)),
    pIds.length > 0
      ? db.select().from(assessmentResults).where(inArray(assessmentResults.participantId, pIds))
      : Promise.resolve([]),
    db
      .select()
      .from(certificates)
      .where(eq(certificates.templateId, template.id)),
  ]);

  const issuedMap = new Map(issuedRows.map((c) => [c.participantId, c]));
  const minAttendance = Number(template.minAttendancePct);
  const minScore = Number(template.minOverallScore);

  const rows: EligibilityEvaluation[] = perfReport.participants.map((p) => {
    const eligibleAss = progAssessments.filter(
      (a) =>
        (!a.cohortId || a.cohortId === p.cohortId) && (!a.trackId || a.trackId === p.trackId)
    );
    const eligibleAssIds = new Set(eligibleAss.map((a) => a.id));
    const gradedCount = results.filter(
      (r) => r.participantId === p.participantId && eligibleAssIds.has(r.assessmentId)
    ).length;

    const reasons: string[] = [];
    if (p.attendance.rawAttendanceRate === null || p.attendance.rawAttendanceRate < minAttendance) {
      reasons.push(
        `Attendance ${p.attendance.rawAttendanceRate !== null ? `${p.attendance.rawAttendanceRate}%` : 'not recorded'} is below ${minAttendance}% minimum.`
      );
    }
    if (p.dataStatus === 'insufficient_data' || p.overallScore === null) {
      reasons.push('Insufficient performance evidence (below 50% weighted category coverage).');
    } else if (p.overallScore < minScore) {
      reasons.push(`Weighted score ${p.overallScore}% is below ${minScore}% minimum.`);
    }
    if (template.requireAllAssessments && eligibleAss.length > 0 && gradedCount < eligibleAss.length) {
      reasons.push(`Completed ${gradedCount} of ${eligibleAss.length} required assessments.`);
    }
    if (template.requireProgrammeCompletion && p.participantStatus !== 'completed') {
      reasons.push(`Programme status is "${p.participantStatus}" (must be "completed").`);
    }

    const issued = issuedMap.get(p.participantId);
    return {
      participantId: p.participantId,
      participantCode: p.participantCode,
      fullName: p.fullName,
      cohortName: p.cohortName,
      trackName: p.trackName,
      participantStatus: p.participantStatus,
      attendanceRate: p.attendance.rawAttendanceRate,
      overallScore: p.overallScore,
      classification: p.classificationDisplay,
      dataStatus: p.dataStatus,
      gradedAssessments: gradedCount,
      requiredAssessments: eligibleAss.length,
      eligible: reasons.length === 0,
      reasons,
      issuedCertificate: issued
        ? {
            id: issued.id,
            certificateCode: issued.certificateCode,
            issuedAt: issued.issuedAt,
          }
        : null,
    };
  });

  return {
    programmeTitle: perfReport.programme.title,
    programmeCode: perfReport.programme.code,
    rows,
  };
}

/**
 * GET /api/certificates
 * Staff see templates & eligibility matrix for a programme; participants see only their own certificates & eligibility.
 */
router.get('/certificates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.dbUser!;

    if (currentUser.role === 'participant') {
      const myRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, currentUser.id))
        .limit(1);
      const me = myRows[0];
      if (!me) {
        res.json({
          scope: 'participant',
          templates: [],
          myCertificates: [],
          filterOptions: { programmes: [] },
        });
        return;
      }

      const templates = await db
        .select()
        .from(certificateTemplates)
        .where(eq(certificateTemplates.programmeId, me.programmeId))
        .orderBy(desc(certificateTemplates.createdAt));

      const evaluations = await Promise.all(
        templates.map(async (tpl) => {
          const result = await evaluateEligibilityForTemplate(tpl, me.id);
          return {
            template: {
              id: tpl.id,
              title: tpl.title,
              minAttendancePct: Number(tpl.minAttendancePct),
              minOverallScore: Number(tpl.minOverallScore),
              requireAllAssessments: tpl.requireAllAssessments,
              requireProgrammeCompletion: tpl.requireProgrammeCompletion,
              templateConfig: tpl.templateConfig ?? {},
            },
            programmeTitle: result.programmeTitle,
            programmeCode: result.programmeCode,
            evaluation: result.rows[0] ?? null,
          };
        })
      );

      res.json({
        scope: 'participant',
        myCertificates: evaluations,
        templates: [],
        eligibilityRows: [],
        filterOptions: { programmes: [] },
      });
      return;
    }

    // Staff view (super_admin, programme_manager)
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'programme_manager') {
      res.status(403).json({ error: 'Only Programme Managers and Super Administrators manage certificates.' });
      return;
    }

    const allProgrammes = await db
      .select()
      .from(programmes)
      .orderBy(desc(programmes.createdAt));

    const programmeId =
      typeof req.query.programmeId === 'string' && req.query.programmeId.length > 0
        ? req.query.programmeId
        : allProgrammes[0]?.id;

    const templateIdParam =
      typeof req.query.templateId === 'string' && req.query.templateId.length > 0
        ? req.query.templateId
        : undefined;

    if (!programmeId) {
      res.json({
        scope: currentUser.role,
        templates: [],
        activeTemplate: null,
        eligibilityRows: [],
        filterOptions: { programmes: [] },
      });
      return;
    }

    if (
      !uuidSchema.safeParse(programmeId).success ||
      (templateIdParam && !uuidSchema.safeParse(templateIdParam).success)
    ) {
      res.status(400).json({ error: 'Invalid programme or template identifier.' });
      return;
    }

    const templates = await db
      .select()
      .from(certificateTemplates)
      .where(eq(certificateTemplates.programmeId, programmeId))
      .orderBy(desc(certificateTemplates.createdAt));

    const activeTemplate = templateIdParam
      ? (templates.find((t) => t.id === templateIdParam) ?? templates[0] ?? null)
      : (templates[0] ?? null);

    let eligibilityRows: EligibilityEvaluation[] = [];
    let programmeTitle = allProgrammes.find((p) => p.id === programmeId)?.title ?? '';
    let programmeCode = allProgrammes.find((p) => p.id === programmeId)?.code ?? '';

    if (activeTemplate) {
      const evaluated = await evaluateEligibilityForTemplate(activeTemplate);
      eligibilityRows = evaluated.rows;
      programmeTitle = evaluated.programmeTitle || programmeTitle;
      programmeCode = evaluated.programmeCode || programmeCode;
    }

    res.json({
      scope: currentUser.role,
      programme: { id: programmeId, code: programmeCode, title: programmeTitle },
      templates: templates.map((t) => ({
        id: t.id,
        programmeId: t.programmeId,
        title: t.title,
        minAttendancePct: Number(t.minAttendancePct),
        minOverallScore: Number(t.minOverallScore),
        requireAllAssessments: t.requireAllAssessments,
        requireProgrammeCompletion: t.requireProgrammeCompletion,
        templateConfig: t.templateConfig ?? {},
        createdAt: t.createdAt,
      })),
      activeTemplateId: activeTemplate?.id ?? null,
      eligibilityRows,
      filterOptions: {
        programmes: allProgrammes.map((p) => ({ id: p.id, code: p.code, title: p.title })),
      },
    });
  } catch (error) {
    console.error('Error loading certificates:', error);
    res.status(500).json({ error: 'Unable to load certificate eligibility and records.' });
  }
});

/**
 * POST /api/certificates/templates
 * Creates a certificate template with configurable eligibility criteria.
 */
router.post(
  '/certificates/templates',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid certificate template parameters.',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const d = parsed.data;
      const progRows = await db
        .select({ id: programmes.id })
        .from(programmes)
        .where(eq(programmes.id, d.programmeId))
        .limit(1);
      if (progRows.length === 0) {
        res.status(404).json({ error: 'Selected programme not found.' });
        return;
      }

      const inserted = await db
        .insert(certificateTemplates)
        .values({
          programmeId: d.programmeId,
          title: d.title,
          minAttendancePct: d.minAttendancePct.toFixed(2),
          minOverallScore: d.minOverallScore.toFixed(2),
          requireAllAssessments: d.requireAllAssessments,
          requireProgrammeCompletion: d.requireProgrammeCompletion,
          templateConfig: {
            signatoryName: d.signatoryName || 'CCI STEM Connect Programme Director',
            signatoryTitle: d.signatoryTitle || 'Celebration Church International',
          },
        })
        .returning();

      res.status(201).json({ template: inserted[0] });
    } catch (error) {
      console.error('Error creating certificate template:', error);
      res.status(500).json({ error: 'Unable to create certificate template.' });
    }
  }
);

/**
 * POST /api/certificates/issue
 * Verifies eligibility on the backend and issues unique verifiable certificates.
 */
router.post(
  '/certificates/issue',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const parsed = issueCertificatesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Select a valid template and at least one participant.' });
        return;
      }

      const tplRows = await db
        .select()
        .from(certificateTemplates)
        .where(eq(certificateTemplates.id, parsed.data.templateId))
        .limit(1);
      const template = tplRows[0];
      if (!template) {
        res.status(404).json({ error: 'Certificate template not found.' });
        return;
      }

      const evaluated = await evaluateEligibilityForTemplate(template);
      const evalMap = new Map(evaluated.rows.map((r) => [r.participantId, r]));

      const year = new Date().getFullYear();
      let issuedCount = 0;
      const skipped: Array<{ participantId: string; fullName: string; reason: string }> = [];

      await db.transaction(async (tx) => {
        for (const pid of parsed.data.participantIds) {
          const ev = evalMap.get(pid);
          if (!ev) {
            skipped.push({
              participantId: pid,
              fullName: 'Unknown',
              reason: 'Participant not enrolled in this programme.',
            });
            continue;
          }
          if (ev.issuedCertificate) {
            skipped.push({
              participantId: pid,
              fullName: ev.fullName,
              reason: `Already issued (${ev.issuedCertificate.certificateCode}).`,
            });
            continue;
          }
          if (!ev.eligible) {
            skipped.push({
              participantId: pid,
              fullName: ev.fullName,
              reason: ev.reasons[0] ?? 'Does not meet eligibility rules.',
            });
            continue;
          }

          const code = `CCI-CERT-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          await tx.insert(certificates).values({
            certificateCode: code,
            templateId: template.id,
            participantId: pid,
            programmeId: template.programmeId,
          });
          issuedCount += 1;
        }
      });

      if (issuedCount === 0 && skipped.length > 0) {
        res.status(400).json({
          error: skipped[0].reason,
          issuedCount: 0,
          skipped,
        });
        return;
      }

      res.status(201).json({ issuedCount, skipped });
    } catch (error) {
      console.error('Error issuing certificates:', error);
      res.status(500).json({ error: 'Unable to issue certificates.' });
    }
  }
);

export default router;
