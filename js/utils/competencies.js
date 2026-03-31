// Competency definitions from CDS 4900/5900 Midterm/Final Evaluation Form

export const CLINICAL_SKILLS = [
  { id: 'cs1', label: 'Case history', description: 'Collects case history information and integrates information from clients/patients, family, caregivers, teachers, and relevant others, including other professionals (CFCC V-B, 1b)' },
  { id: 'cs2', label: 'Eval procedures', description: 'Selects appropriate evaluation procedures (CFCC V-B, 1c)' },
  { id: 'cs3', label: 'Test admin', description: 'Administers non-standardized and standardized tests correctly (CFCC V-B, 1c)' },
  { id: 'cs4', label: 'Tx planning', description: 'Develops setting-appropriate intervention plans with measurable and achievable goals (CFCC IV-D, V-B, 2a)' },
  { id: 'cs5', label: 'Materials', description: 'Selects or develops and uses appropriate materials and instrumentation (CFCC V-B, 2c)' },
  { id: 'cs6', label: 'Task intro', description: 'Provides appropriate introduction/explanation of tasks' },
  { id: 'cs7', label: 'Cues/models', description: 'Uses appropriate models, prompts or cues. Allows time for patient response.' },
  { id: 'cs8', label: 'Behavior mgmt', description: 'Demonstrates effective behavior management skills and motivates client' },
  { id: 'cs9', label: 'Data collection', description: 'Measures and evaluates client/patient performance and progress (CFCC V-B, 2d)' },
  { id: 'cs10', label: 'Plan modification', description: 'Modifies intervention plans, strategies, materials, or instrumentation to meet individual client/patient needs (CFCC V-B, 2e)' },
  { id: 'cs11', label: 'Documentation', description: 'Includes complete and accurate details in therapy plans and SOAP notes' },
  { id: 'cs12', label: 'Report writing', description: 'Appropriately summarizes and organizes relevant information in reports' },
  { id: 'cs13', label: 'Impressions', description: 'Generates appropriate clinical impressions and recommendations specific to client in reports' },
  { id: 'cs14', label: 'Grammar/format', description: 'Uses appropriate grammar, format and spelling in weekly documentation and reports' },
  { id: 'cs15', label: 'EBP', description: 'Finds and implements appropriate EBP to guide clinical decisions' },
  { id: 'cs16', label: 'Oral comm', description: 'Demonstrates skills in oral communication sufficient for entry into professional practice (CFCC V-A)' },
];

export const CLINICAL_FOUNDATIONS = [
  { id: 'cf1', label: 'Initiative', description: 'Demonstrates initiative (actively participates, generates ideas, seeks collaboration and resources)' },
  { id: 'cf2', label: 'Analysis', description: 'Demonstrates analysis (interprets, integrates, synthesizes, engages in self evaluation)' },
  { id: 'cf3', label: 'Critical thinking', description: 'Demonstrates critical thinking for decision making (integrates EBP, clinical judgement, recommendations, diagnosis, problem solving)' },
  { id: 'cf4', label: 'Flexibility', description: 'Demonstrates ability to monitor and display flexibility (engages in self evaluation, aware of bias, makes adjustments, anticipates needs, implements feedback)' },
  { id: 'cf5', label: 'Professionalism', description: 'Demonstrates professionalism (adheres to code of ethics; receptive to feedback; prepared and organized; maintains appropriate physical appearance; adheres to timelines, has good attendance and is punctual; demonstrates empathy, enthusiasm; effective collaboration; and passion for client)' },
];

export const ALL_COMPETENCIES = [...CLINICAL_SKILLS, ...CLINICAL_FOUNDATIONS];

export const RATING_SCALE = {
  3: 'Established',
  2: 'Developing',
  1: 'Emerging',
};

export const GRADING_SCALE = [
  { grade: 'A', min: 2.4, max: 3.0 },
  { grade: 'B', min: 1.86, max: 2.39 },
  { grade: 'C', min: 1.0, max: 1.85 },
];

// Essential Functions tracking categories
export const ESSENTIAL_FUNCTIONS = {
  A: {
    label: 'Communication Abilities',
    items: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
  },
  B: {
    label: 'Intellectual/Cognitive',
    items: ['B1', 'B2', 'B3', 'B4', 'B5'],
  },
  C: {
    label: 'Behavioral/Social',
    items: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
  },
  D: {
    label: 'Motor Abilities',
    items: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
  },
  E: {
    label: 'Sensory/Observational',
    items: ['E1a', 'E1b', 'E1c', 'E1d', 'E1e', 'E1f', 'E1g', 'E1h', 'E1i', 'E2', 'E3'],
  },
};
