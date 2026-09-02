export type StudyProgramRequirements = {
  requiredLevels: Record<string, 'A' | 'B' | '-'>;
  electiveRules: Record<string, '+' | '-' | '*'>;
};

export type StudyProgramOption = {
  name: string;
  city: string;
  institution: string;
  component: string;
  institutionType: string;
  area: string;
  field: string;
  quotaType: string;
  info: string;
  requirements: StudyProgramRequirements;
};

export const INSTITUTION_TYPES = [
  'Javna sveučilišta',
  'Javna veleučilišta',
  'Javne visoke škole',
  'Privatna sveučilišta',
  'Privatna veleučilišta',
  'Privatne visoke škole',
];

export const QUOTA_TYPES = [
  'Bez posebne kvote',
  'Kvota za Hrvate izvan Republike Hrvatske',
  'Kvota za kandidate koji su srednjoškolsko obrazovanje završili prije 2010. godine',
];

export const STUDY_AREAS = [
  'Arhitektura',
  'Biomedicina i zdravstvo',
  'Biotehničke znanosti',
  'Dizajn',
  'Društvene znanosti',
  'Glazbena umjetnost',
  'Humanističke znanosti',
  'Interdisciplinarno znanstveno područje',
  'Likovne umjetnosti',
  'Prirodne znanosti',
  'Tehničke znanosti',
];

export const STUDY_FIELDS = [
  'Arhitektura i urbanizam',
  'Biologija',
  'Dizajn',
  'Ekonomija',
  'Elektrotehnika',
  'Filologija',
  'Fizika',
  'Geografija',
  'Građevinarstvo',
  'Informacijske i komunikacijske znanosti',
  'Kemija',
  'Kineziologija',
  'Likovne umjetnosti',
  'Matematika',
  'Medicina',
  'Pedagogija',
  'Politologija',
  'Pravo',
  'Psihologija',
  'Računarstvo',
  'Sigurnosne i obrambene znanosti',
  'Sociologija',
  'Strojarstvo',
  'Tehnologija prometa i transport',
];

const bLevel = {
  'Hrvatski jezik': 'B',
  Matematika: 'B',
  'Engleski jezik': 'B',
  'Njemački jezik': 'B',
} satisfies StudyProgramRequirements['requiredLevels'];

const aMath = {
  'Hrvatski jezik': 'B',
  Matematika: 'A',
  'Engleski jezik': 'B',
  'Njemački jezik': 'B',
} satisfies StudyProgramRequirements['requiredLevels'];

const aLanguage = {
  'Hrvatski jezik': 'A',
  Matematika: 'B',
  'Engleski jezik': 'A',
  'Njemački jezik': 'A',
} satisfies StudyProgramRequirements['requiredLevels'];

const technicalElectives = { Fizika: '+', Informatika: '*', Kemija: '-', 'Politika i gospodarstvo': '-' } satisfies StudyProgramRequirements['electiveRules'];
const socialElectives = { Psihologija: '+', Sociologija: '*', Povijest: '-', 'Politika i gospodarstvo': '+' } satisfies StudyProgramRequirements['electiveRules'];
const artElectives = { 'Likovna umjetnost': '+', Povijest: '*', Filozofija: '-', Psihologija: '-' } satisfies StudyProgramRequirements['electiveRules'];
const healthElectives = { Biologija: '+', Kemija: '+', Fizika: '*', Psihologija: '-' } satisfies StudyProgramRequirements['electiveRules'];
const economyElectives = { 'Politika i gospodarstvo': '+', Informatika: '-', Geografija: '*', Sociologija: '-' } satisfies StudyProgramRequirements['electiveRules'];

const program = (
  institution: string,
  component: string,
  name: string,
  city: string,
  institutionType: string,
  area: string,
  field: string,
  info: string,
  requiredLevels: StudyProgramRequirements['requiredLevels'],
  electiveRules: StudyProgramRequirements['electiveRules'],
  quotaType = 'Bez posebne kvote',
): StudyProgramOption => ({
  name: `${institution} - ${component} - ${name} - ${city} (${info})`,
  city,
  institution,
  component,
  institutionType,
  area,
  field,
  quotaType,
  info,
  requirements: { requiredLevels, electiveRules },
});

export const STUDY_PROGRAM_CATALOG: StudyProgramOption[] = [
  program('Sveučilište u Zagrebu', 'Učiteljski fakultet Sveučilišta u Zagrebu', 'Učiteljski studij', 'Zagreb', 'Javna sveučilišta', 'Društvene znanosti', 'Pedagogija', 'Redovni integrirani prijediplomski i diplomski studij', bLevel, socialElectives),
  program('Sveučilište u Zagrebu', 'Učiteljski fakultet Sveučilišta u Zagrebu', 'Učiteljski studij', 'Petrinja', 'Javna sveučilišta', 'Društvene znanosti', 'Pedagogija', 'Redovni integrirani prijediplomski i diplomski studij', bLevel, socialElectives),
  program('Sveučilište u Zagrebu', 'Arhitektonski fakultet Sveučilišta u Zagrebu', 'Arhitektura i urbanizam', 'Zagreb', 'Javna sveučilišta', 'Arhitektura', 'Arhitektura i urbanizam', 'Redovni prijediplomski sveučilišni studij', aLanguage, artElectives),
  program('Sveučilište u Zagrebu', 'Fakultet elektrotehnike i računarstva Sveučilišta u Zagrebu', 'Računarstvo', 'Zagreb', 'Javna sveučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Zagrebu', 'Fakultet elektrotehnike i računarstva Sveučilišta u Zagrebu', 'Elektrotehnika i informacijska tehnologija', 'Zagreb', 'Javna sveučilišta', 'Tehničke znanosti', 'Elektrotehnika', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Zagrebu', 'Fakultet prometnih znanosti Sveučilišta u Zagrebu', 'Aeronautika - modul civilni pilot', 'Zagreb', 'Javna sveučilišta', 'Tehničke znanosti', 'Tehnologija prometa i transport', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Zagrebu', 'Ekonomski fakultet Sveučilišta u Zagrebu', 'Poslovna ekonomija', 'Zagreb', 'Javna sveučilišta', 'Društvene znanosti', 'Ekonomija', 'Redovni prijediplomski sveučilišni studij', bLevel, economyElectives),
  program('Sveučilište u Zagrebu', 'Pravni fakultet Sveučilišta u Zagrebu', 'Pravo', 'Zagreb', 'Javna sveučilišta', 'Društvene znanosti', 'Pravo', 'Redovni integrirani prijediplomski i diplomski studij', bLevel, socialElectives),
  program('Sveučilište u Zagrebu', 'Medicinski fakultet Sveučilišta u Zagrebu', 'Medicina', 'Zagreb', 'Javna sveučilišta', 'Biomedicina i zdravstvo', 'Medicina', 'Redovni integrirani prijediplomski i diplomski studij', aMath, healthElectives),
  program('Sveučilište u Zagrebu', 'Filozofski fakultet Sveučilišta u Zagrebu', 'Psihologija', 'Zagreb', 'Javna sveučilišta', 'Društvene znanosti', 'Psihologija', 'Redovni prijediplomski sveučilišni studij', aLanguage, socialElectives),
  program('Sveučilište u Splitu', 'Fakultet elektrotehnike, strojarstva i brodogradnje Sveučilišta u Splitu', 'Računarstvo', 'Split', 'Javna sveučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Splitu', 'Ekonomski fakultet Sveučilišta u Splitu', 'Ekonomija', 'Split', 'Javna sveučilišta', 'Društvene znanosti', 'Ekonomija', 'Redovni prijediplomski sveučilišni studij', bLevel, economyElectives),
  program('Sveučilište u Splitu', 'Medicinski fakultet Sveučilišta u Splitu', 'Medicina', 'Split', 'Javna sveučilišta', 'Biomedicina i zdravstvo', 'Medicina', 'Redovni integrirani prijediplomski i diplomski studij', aMath, healthElectives),
  program('Sveučilište u Rijeci', 'Fakultet informatike i digitalnih tehnologija Sveučilišta u Rijeci', 'Informatika', 'Rijeka', 'Javna sveučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Rijeci', 'Ekonomski fakultet Sveučilišta u Rijeci', 'Ekonomija', 'Rijeka', 'Javna sveučilišta', 'Društvene znanosti', 'Ekonomija', 'Redovni prijediplomski sveučilišni studij', bLevel, economyElectives),
  program('Sveučilište u Rijeci', 'Građevinski fakultet Sveučilišta u Rijeci', 'Građevinarstvo', 'Rijeka', 'Javna sveučilišta', 'Tehničke znanosti', 'Građevinarstvo', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Zadru', 'Pomorski odjel Sveučilišta u Zadru', 'Nautika i tehnologija pomorskog prometa', 'Zadar', 'Javna sveučilišta', 'Tehničke znanosti', 'Tehnologija prometa i transport', 'Redovni prijediplomski sveučilišni studij', bLevel, { 'Politika i gospodarstvo': '+', 'Likovna umjetnost': '-', Informatika: '*', Fizika: '*', Geografija: '-' }),
  program('Sveučilište u Zadru', 'Pomorski odjel Sveučilišta u Zadru', 'Brodostrojarstvo i tehnologija pomorskog prometa', 'Zadar', 'Javna sveučilišta', 'Tehničke znanosti', 'Strojarstvo', 'Redovni prijediplomski sveučilišni studij', bLevel, { 'Politika i gospodarstvo': '+', Informatika: '*', Fizika: '*', Kemija: '-' }),
  program('Sveučilište u Zadru', 'Odjel za informacijske znanosti i tehnologije Sveučilišta u Zadru', 'Informacijske tehnologije', 'Zadar', 'Javna sveučilišta', 'Društvene znanosti', 'Informacijske i komunikacijske znanosti', 'Redovni prijediplomski sveučilišni studij', bLevel, technicalElectives),
  program('Sveučilište u Osijeku', 'Fakultet elektrotehnike, računarstva i informacijskih tehnologija Osijek', 'Računarstvo', 'Osijek', 'Javna sveučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski sveučilišni studij', aMath, technicalElectives),
  program('Sveučilište u Osijeku', 'Ekonomski fakultet Sveučilišta u Osijeku', 'Ekonomija', 'Osijek', 'Javna sveučilišta', 'Društvene znanosti', 'Ekonomija', 'Redovni prijediplomski sveučilišni studij', bLevel, economyElectives),
  program('Sveučilište u Slavonskom Brodu', 'Odjel društveno-humanističkih znanosti Sveučilišta u Slavonskom Brodu', 'Učiteljski studij', 'Slavonski Brod', 'Javna sveučilišta', 'Društvene znanosti', 'Pedagogija', 'Redovni integrirani prijediplomski i diplomski studij', bLevel, socialElectives),
  program('Sveučilište Jurja Dobrile u Puli', 'Fakultet informatike u Puli', 'Informatika', 'Pula', 'Javna sveučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski sveučilišni studij', bLevel, technicalElectives),
  program('Sveučilište Sjever', 'Sveučilište Sjever', 'Sestrinstvo', 'Varaždin', 'Javna sveučilišta', 'Biomedicina i zdravstvo', 'Medicina', 'Redovni prijediplomski sveučilišni studij', bLevel, healthElectives),
  program('Sveučilište Sjever', 'Sveučilište Sjever', 'Medijski dizajn', 'Koprivnica', 'Javna sveučilišta', 'Dizajn', 'Dizajn', 'Redovni prijediplomski sveučilišni studij', bLevel, artElectives),
  program('Tehničko veleučilište u Zagrebu', 'Tehničko veleučilište u Zagrebu', 'Informatika', 'Zagreb', 'Javna veleučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski stručni studij', bLevel, technicalElectives),
  program('Veleučilište u Karlovcu', 'Veleučilište u Karlovcu', 'Poduzetništvo u turizmu i ugostiteljstvu', 'Karlovac', 'Javna veleučilišta', 'Društvene znanosti', 'Ekonomija', 'Redovni prijediplomski stručni studij', bLevel, economyElectives),
  program('Veleučilište u Karlovcu', 'Veleučilište u Karlovcu', 'Sigurnost i zaštita', 'Karlovac', 'Javna veleučilišta', 'Tehničke znanosti', 'Sigurnosne i obrambene znanosti', 'Redovni prijediplomski stručni studij', bLevel, technicalElectives),
  program('Veleučilište u Rijeci', 'Veleučilište u Rijeci', 'Informatika', 'Rijeka', 'Javna veleučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski stručni studij', bLevel, { Informatika: '+', Logika: '-', Fizika: '*', Matematika: '*' }),
  program('Veleučilište u Šibeniku', 'Veleučilište u Šibeniku', 'Računarstvo', 'Šibenik', 'Javna veleučilišta', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski stručni studij', bLevel, technicalElectives),
  program('Zdravstveno veleučilište u Zagrebu', 'Zdravstveno veleučilište u Zagrebu', 'Fizioterapija', 'Zagreb', 'Javna veleučilišta', 'Biomedicina i zdravstvo', 'Medicina', 'Redovni prijediplomski stručni studij', bLevel, healthElectives),
  program('Zagrebačka škola ekonomije i managementa', 'Zagrebačka škola ekonomije i managementa', 'Ekonomija i management', 'Zagreb', 'Privatne visoke škole', 'Društvene znanosti', 'Ekonomija', 'Redovni prijediplomski stručni studij', bLevel, economyElectives),
  program('RIT Croatia', 'RIT Croatia', 'Informacijske tehnologije', 'Zagreb', 'Privatne visoke škole', 'Tehničke znanosti', 'Računarstvo', 'Redovni prijediplomski stručni studij', bLevel, technicalElectives),
  program('Libertas Međunarodno sveučilište', 'Libertas Međunarodno sveučilište', 'Međunarodni odnosi i diplomacija', 'Zagreb', 'Privatna sveučilišta', 'Društvene znanosti', 'Politologija', 'Redovni prijediplomski sveučilišni studij', bLevel, socialElectives),
  program('Sveučilište VERN', 'Sveučilište VERN', 'Novinarstvo', 'Zagreb', 'Privatna sveučilišta', 'Društvene znanosti', 'Informacijske i komunikacijske znanosti', 'Redovni prijediplomski sveučilišni studij', bLevel, socialElectives),
];

export const STUDY_PROGRAM_CITIES = Array.from(new Set(STUDY_PROGRAM_CATALOG.map(program => program.city))).sort((a, b) => a.localeCompare(b, 'hr'));
export const STUDY_PROGRAM_INSTITUTIONS = Array.from(new Set(STUDY_PROGRAM_CATALOG.map(program => program.institution))).sort((a, b) => a.localeCompare(b, 'hr'));
export const STUDY_PROGRAM_COMPONENTS = Array.from(new Set(STUDY_PROGRAM_CATALOG.map(program => program.component))).sort((a, b) => a.localeCompare(b, 'hr'));
