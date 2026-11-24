import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregatePerformanceGroup,
  calculateAttendanceMetrics,
  calculateLearningGrowth,
  createDefaultScoringModel,
  evaluateParticipantPerformance,
  type ParticipantEvidenceInput,
  validateScoringModelConfig,
} from './performance-engine.ts';

function baseParticipant(
  overrides: Partial<ParticipantEvidenceInput> = {}
): ParticipantEvidenceInput {
  return {
    participantId: 'p-1',
    participantCode: 'CCI-2026-0001',
    fullName: 'Amara Okafor',
    programmeId: 'prog-1',
    cohortId: 'coh-1',
    cohortName: 'Cohort A',
    trackId: 'trk-1',
    trackName: 'Robotics',
    status: 'active',
    attendance: [],
    assessments: [],
    projects: [],
    ...overrides,
  };
}

test('Case 1: Complete high-performing participant across all 5 domains with pre/post growth', () => {
  const model = createDefaultScoringModel();
  // Attendance: 3 present, 1 late (0.75 credit), 1 approved_absence (excluded), engagement avg = 9.0 -> 90%
  // Raw attendance rate = 4/4 = 100%
  // Weighted attendance = (3 + 0.75)/4 * 100 = 93.75%
  // Combined Attendance & Engagement = 0.70 * 93.75 + 0.30 * 90 = 65.625 + 27 = 92.63
  const participant = baseParticipant({
    attendance: [
      { sessionId: 's1', status: 'present', engagementScore: 9 },
      { sessionId: 's2', status: 'present', engagementScore: 9 },
      { sessionId: 's3', status: 'present', engagementScore: 10 },
      { sessionId: 's4', status: 'late', engagementScore: 8 },
      { sessionId: 's5', status: 'approved_absence', engagementScore: null },
    ],
    assessments: [
      {
        assessmentId: 'a-pre',
        title: 'Baseline STEM Diagnostic',
        category: 'pre_programme',
        indicatorDomain: 'knowledge_acquisition',
        rawScore: 50,
        maxScore: 100,
      },
      {
        assessmentId: 'a-post',
        title: 'End-of-Programme STEM Evaluation',
        category: 'post_programme',
        indicatorDomain: 'knowledge_acquisition',
        rawScore: 90,
        maxScore: 100,
        pairedPreAssessmentId: 'a-pre',
      },
      {
        assessmentId: 'a-quiz',
        title: 'Midterm Quiz',
        category: 'quiz',
        indicatorDomain: 'knowledge_acquisition',
        rawScore: 42,
        maxScore: 50, // 84%
      },
      {
        assessmentId: 'a-lab',
        title: 'Sensor Calibration Lab',
        category: 'practical_stem',
        indicatorDomain: 'practical_stem_skills',
        rawScore: 44,
        maxScore: 50, // 88%
      },
    ],
    projects: [
      {
        projectId: 'proj-1',
        projectTitle: 'Autonomous Line Follower',
        maxScore: 100,
        status: 'evaluated',
        qualityScore: 92,
        individualScore: 92,
        collaborationScore: 86,
      },
    ],
  });

  const result = evaluateParticipantPerformance(participant, model);

  assert.equal(result.attendance.countableSessions, 4);
  assert.equal(result.attendance.approvedAbsenceCount, 1);
  assert.equal(result.attendance.rawAttendanceRate, 100);
  assert.equal(result.attendance.weightedAttendanceScore, 93.75);
  assert.equal(result.attendance.averageEngagementPct, 90);
  assert.equal(result.attendance.combinedDomainScore, 92.63);

  // Paired pre-test (50%) is used for growth and does NOT drag down final Knowledge Acquisition mastery!
  // Knowledge Acquisition = avg(90, 84) = 87.0
  const knowledge = result.domains.find((d) => d.domain === 'knowledge_acquisition')!;
  assert.equal(knowledge.score, 87);

  // Learning Growth: 50% -> 90% => +40 pts, Hake normalized gain = (90-50)/(100-50)*100 = 80%
  assert.equal(result.learningGrowth.pairedCount, 1);
  assert.equal(result.learningGrowth.averageAbsoluteDelta, 40);
  assert.equal(result.learningGrowth.averageNormalizedGainPct, 80);

  // Weighted score = 92.63*0.20 + 87*0.25 + 88*0.25 + 92*0.20 + 86*0.10
  // = 18.526 + 21.75 + 22.0 + 18.4 + 8.6 = 89.276 -> 89.28
  assert.equal(result.dataStatus, 'complete');
  assert.equal(result.isProvisional, false);
  assert.equal(result.dataCompletenessPct, 100);
  assert.equal(result.overallScore, 89.28);
  assert.equal(result.classification, 'Distinction');
});

test('Case 2: Approved absences are excluded and all-approved-absence yields null instead of 0%', () => {
  const metrics = calculateAttendanceMetrics([
    { sessionId: 's1', status: 'approved_absence', engagementScore: null },
    { sessionId: 's2', status: 'approved_absence', engagementScore: null },
  ]);

  assert.equal(metrics.countableSessions, 0);
  assert.equal(metrics.approvedAbsenceCount, 2);
  assert.equal(metrics.rawAttendanceRate, null);
  assert.equal(metrics.weightedAttendanceScore, null);
  assert.equal(metrics.combinedDomainScore, null);
});

test('Case 3: Missing optional domain uses proportional re-weighting without zero-filling', () => {
  const model = createDefaultScoringModel();
  // All 4 required domains available (total weight 90%); Collaboration (10%, optional) missing.
  const participant = baseParticipant({
    attendance: [
      { sessionId: 's1', status: 'present', engagementScore: null },
      { sessionId: 's2', status: 'present', engagementScore: null },
    ], // 100% (weight 20)
    assessments: [
      {
        assessmentId: 'q1',
        title: 'Quiz 1',
        category: 'quiz',
        indicatorDomain: 'knowledge_acquisition',
        rawScore: 80,
        maxScore: 100, // 80% (weight 25)
      },
      {
        assessmentId: 'p1',
        title: 'Practical 1',
        category: 'practical_stem',
        indicatorDomain: 'practical_stem_skills',
        rawScore: 76,
        maxScore: 100, // 76% (weight 25)
      },
    ],
    projects: [
      {
        projectId: 'proj-1',
        projectTitle: 'Solo Prototype',
        maxScore: 100,
        status: 'evaluated',
        qualityScore: 84, // 84% (weight 20)
      },
    ],
  });

  const result = evaluateParticipantPerformance(participant, model);

  // Proportional re-weighting: (100*20 + 80*25 + 76*25 + 84*20) / 90 = (2000 + 2000 + 1900 + 1680) / 90 = 7580 / 90 = 84.22
  assert.equal(result.availableWeightPct, 90);
  assert.equal(result.missingRequiredDomains.length, 0);
  assert.deepEqual(result.missingDomains, ['collaboration_problem_solving']);
  assert.equal(result.dataStatus, 'provisional');
  assert.equal(result.overallScore, 84.22);
  assert.equal(result.classification, 'Proficient');
  assert.equal(result.classificationDisplay, 'Proficient (Provisional)');
});

test('Case 4: Insufficient data (< 50% weight coverage) withholds overallScore to prevent misleading Distinction', () => {
  const model = createDefaultScoringModel();
  // Participant has ONLY a single 100% quiz (25% weight) — must NOT be classified as "100% Distinction"
  const participant = baseParticipant({
    participantId: 'p-sparse',
    fullName: 'New Enrollee',
    assessments: [
      {
        assessmentId: 'q1',
        title: 'Diagnostic Quiz',
        category: 'quiz',
        indicatorDomain: 'knowledge_acquisition',
        rawScore: 20,
        maxScore: 20,
      },
    ],
  });

  const result = evaluateParticipantPerformance(participant, model);

  assert.equal(result.availableWeightPct, 25);
  assert.equal(result.dataStatus, 'insufficient_data');
  assert.equal(result.overallScore, null);
  assert.equal(result.observedPartialScore, 100);
  assert.equal(result.classification, 'Insufficient Data');
  assert.equal(result.classificationDisplay, 'Insufficient Data');
  assert.ok(result.dataQualityNotice?.includes('minimum 50% required'));
});

test('Case 5: Zero evidence participant produces clean nulls and zero NaN values', () => {
  const model = createDefaultScoringModel();
  const result = evaluateParticipantPerformance(baseParticipant({ participantId: 'p-empty' }), model);

  assert.equal(result.overallScore, null);
  assert.equal(result.observedPartialScore, null);
  assert.equal(result.attendance.rawAttendanceRate, null);
  assert.equal(result.learningGrowth.averageAbsoluteDelta, null);
  assert.equal(result.dataCompletenessPct, 0);
  assert.equal(result.dataStatus, 'insufficient_data');
  assert.equal(result.classification, 'Insufficient Data');
});

test('Case 6: Learning growth handles unpaired pre-only (null) and negative regression accurately', () => {
  const unpaired = calculateLearningGrowth([
    {
      assessmentId: 'pre-only',
      title: 'Pre Test',
      category: 'pre_programme',
      indicatorDomain: 'knowledge_acquisition',
      rawScore: 60,
      maxScore: 100,
    },
  ]);
  assert.equal(unpaired.pairedCount, 0);
  assert.equal(unpaired.averageAbsoluteDelta, null);

  const regressed = calculateLearningGrowth([
    {
      assessmentId: 'pre-1',
      title: 'Pre Test',
      category: 'pre_programme',
      indicatorDomain: 'knowledge_acquisition',
      rawScore: 80,
      maxScore: 100,
    },
    {
      assessmentId: 'post-1',
      title: 'Post Test',
      category: 'post_programme',
      indicatorDomain: 'knowledge_acquisition',
      rawScore: 60,
      maxScore: 100,
      pairedPreAssessmentId: 'pre-1',
    },
  ]);
  assert.equal(regressed.pairedCount, 1);
  assert.equal(regressed.averageAbsoluteDelta, -20);
  // Normalized loss: (60 - 80) / 80 * 100 = -25%
  assert.equal(regressed.averageNormalizedGainPct, -25);
});

test('Case 7: Cohort & Programme aggregation excludes Insufficient Data from averages and preserves counts', () => {
  const model = createDefaultScoringModel();
  const completeLearner = evaluateParticipantPerformance(
    baseParticipant({
      participantId: 'p-complete',
      attendance: [{ sessionId: 's1', status: 'present', engagementScore: 8 }], // 0.7*100 + 0.3*80 = 94
      assessments: [
        {
          assessmentId: 'k1',
          title: 'Knowledge',
          category: 'quiz',
          indicatorDomain: 'knowledge_acquisition',
          rawScore: 80,
          maxScore: 100,
        },
        {
          assessmentId: 'pr1',
          title: 'Lab',
          category: 'practical_stem',
          indicatorDomain: 'practical_stem_skills',
          rawScore: 80,
          maxScore: 100,
        },
      ],
      projects: [
        {
          projectId: 'pj1',
          projectTitle: 'Capstone',
          maxScore: 100,
          status: 'evaluated',
          qualityScore: 80,
          collaborationScore: 80,
        },
      ],
    }),
    model
  );
  // completeLearner overall = 94*0.20 + 80*0.80 = 18.8 + 64 = 82.8 (Proficient)

  const provisionalLearner = evaluateParticipantPerformance(
    baseParticipant({
      participantId: 'p-prov',
      attendance: [{ sessionId: 's1', status: 'absent', engagementScore: null }], // 0 (weight 20)
      assessments: [
        {
          assessmentId: 'k1',
          title: 'Knowledge',
          category: 'quiz',
          indicatorDomain: 'knowledge_acquisition',
          rawScore: 60,
          maxScore: 100, // 60 (weight 25)
        },
        {
          assessmentId: 'pr1',
          title: 'Lab',
          category: 'practical_stem',
          indicatorDomain: 'practical_stem_skills',
          rawScore: 60,
          maxScore: 100, // 60 (weight 25)
        },
      ],
    }),
    model
  );
  // provisionalLearner available weight = 70% => (0*20 + 60*25 + 60*25)/70 = 3000/70 = 42.86 (Needs Support)

  const sparseLearner = evaluateParticipantPerformance(
    baseParticipant({
      participantId: 'p-sparse',
      assessments: [
        {
          assessmentId: 'k1',
          title: 'Knowledge',
          category: 'quiz',
          indicatorDomain: 'knowledge_acquisition',
          rawScore: 100,
          maxScore: 100,
        },
      ],
    }),
    model
  );

  const summary = aggregatePerformanceGroup(
    [completeLearner, provisionalLearner, sparseLearner],
    model
  );

  assert.equal(summary.totalParticipants, 3);
  assert.equal(summary.scoredParticipants, 2);
  assert.equal(summary.completeParticipants, 1);
  assert.equal(summary.provisionalParticipants, 1);
  assert.equal(summary.insufficientDataParticipants, 1);

  // Average overall score = (82.8 + 42.86) / 2 = 62.83 (sparseLearner's 100% single quiz does NOT inflate cohort average!)
  assert.equal(summary.averageOverallScore, 62.83);
  assert.equal(summary.finalOnlyAverageScore, 82.8);

  const insufficientBucket = summary.classificationDistribution.find(
    (b) => b.categoryName === 'Insufficient Data'
  )!;
  assert.equal(insufficientBucket.count, 1);
});

test('Case 8: Scoring configuration validation catches bad weight sums and overlapping bands', () => {
  const model = createDefaultScoringModel();
  assert.equal(validateScoringModelConfig(model.indicators, model.thresholds).valid, true);

  const badWeights = model.indicators.map((i, idx) =>
    idx === 0 ? { ...i, weightPct: i.weightPct + 5 } : i
  );
  const weightCheck = validateScoringModelConfig(badWeights, model.thresholds);
  assert.equal(weightCheck.valid, false);
  assert.ok(weightCheck.errors.some((e) => e.includes('100.00%')));

  const overlappingThresholds = [
    { categoryName: 'High', minScore: 60, maxScore: 100, sortOrder: 1 },
    { categoryName: 'Low', minScore: 0, maxScore: 65, sortOrder: 2 },
  ];
  const bandCheck = validateScoringModelConfig(model.indicators, overlappingThresholds);
  assert.equal(bandCheck.valid, false);
  assert.ok(bandCheck.errors.some((e) => e.includes('Overlapping')));
});

test('Case 9: Dashboard KPIs and distribution bucket counts reconcile 1-to-1 with underlying participant records', () => {
  const model = createDefaultScoringModel();
  const records = [
    evaluateParticipantPerformance(
      baseParticipant({
        participantId: 'r-1',
        attendance: [
          { sessionId: 's1', status: 'present', engagementScore: 9 },
          { sessionId: 's2', status: 'present', engagementScore: 9 },
        ],
        assessments: [
          {
            assessmentId: 'pre',
            title: 'Pre',
            category: 'pre_programme',
            indicatorDomain: 'knowledge_acquisition',
            rawScore: 50,
            maxScore: 100,
          },
          {
            assessmentId: 'post',
            title: 'Post',
            category: 'post_programme',
            indicatorDomain: 'knowledge_acquisition',
            rawScore: 90,
            maxScore: 100,
            pairedPreAssessmentId: 'pre',
          },
          {
            assessmentId: 'lab',
            title: 'Lab',
            category: 'practical_stem',
            indicatorDomain: 'practical_stem_skills',
            rawScore: 86,
            maxScore: 100,
          },
        ],
        projects: [
          {
            projectId: 'pj',
            projectTitle: 'Capstone',
            maxScore: 100,
            status: 'evaluated',
            qualityScore: 88,
            collaborationScore: 90,
          },
        ],
      }),
      model
    ),
    evaluateParticipantPerformance(
      baseParticipant({
        participantId: 'r-2',
        attendance: [
          { sessionId: 's1', status: 'present', engagementScore: 7 },
          { sessionId: 's2', status: 'absent', engagementScore: null },
        ],
        assessments: [
          {
            assessmentId: 'pre',
            title: 'Pre',
            category: 'pre_programme',
            indicatorDomain: 'knowledge_acquisition',
            rawScore: 40,
            maxScore: 100,
          },
          {
            assessmentId: 'post',
            title: 'Post',
            category: 'post_programme',
            indicatorDomain: 'knowledge_acquisition',
            rawScore: 70,
            maxScore: 100,
            pairedPreAssessmentId: 'pre',
          },
          {
            assessmentId: 'lab',
            title: 'Lab',
            category: 'practical_stem',
            indicatorDomain: 'practical_stem_skills',
            rawScore: 64,
            maxScore: 100,
          },
        ],
      }),
      model
    ),
    evaluateParticipantPerformance(baseParticipant({ participantId: 'r-3' }), model),
  ];

  const agg = aggregatePerformanceGroup(records, model);

  // Distribution counts sum exactly to totalParticipants
  const distTotal = agg.classificationDistribution.reduce((sum, b) => sum + b.count, 0);
  assert.equal(distTotal, records.length);

  // Attendance average reconciles exactly with manual mean of underlying participant attendance rates
  const withAtt = records.filter((r) => r.attendance.rawAttendanceRate !== null);
  const manualAttMean =
    Math.round(
      (withAtt.reduce((s, r) => s + r.attendance.rawAttendanceRate!, 0) / withAtt.length) * 100
    ) / 100;
  assert.equal(agg.averageAttendanceRate, manualAttMean);

  // Growth average reconciles exactly with manual mean of underlying participant growth deltas
  const withGrowth = records.filter((r) => r.learningGrowth.averageAbsoluteDelta !== null);
  const manualGrowthMean =
    Math.round(
      (withGrowth.reduce((s, r) => s + r.learningGrowth.averageAbsoluteDelta!, 0) /
        withGrowth.length) *
        100
    ) / 100;
  assert.equal(agg.averageLearningGrowthDelta, manualGrowthMean);
  assert.equal(agg.averageLearningGrowthDelta, 35); // avg(+40, +30)
});

