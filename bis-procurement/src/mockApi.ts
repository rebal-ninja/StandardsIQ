import { faker } from '@faker-js/faker';
import { scanTender as realScanTender } from './api';

type Standard = {
  standard_id: string;
  domain: string;
  title: string;
  scope: string;
  status: 'active' | 'superseded' | 'amended';
  superseded_by?: string;
  amendment_no?: string;
};

type Recommendation = {
  standard: Standard;
  match_score: number;
  rationale: string;
  matched_by: 'vector' | 'keyword' | 'hybrid';
};

type HistoryEntry = {
  id: string;
  timestamp: string;
  type: 'search' | 'tender';
  query: string;
  top_result: string;
  match_score: number;
};

type Stats = {
  standards_indexed: number;
  tenders_scanned: number;
  avg_match_score: number;
  domains_covered: number;
  activity_30d: Array<{ date: string; count: number }>;
  domain_breakdown: Array<{ domain: string; count: number }>;
};

const domains = [
  'construction', 'electrical', 'mechanical', 'healthcare', 'agriculture',
  'food', 'textile', 'automotive', 'electronics', 'safety', 'chemicals'
];

const generateStandard = (): Standard => ({
  standard_id: `IS ${faker.number.int({ min: 100, max: 999 })}:${faker.date.past().getFullYear()}`,
  domain: faker.helpers.arrayElement(domains),
  title: faker.lorem.words(6),
  scope: faker.lorem.sentences(2),
  status: faker.helpers.arrayElement(['active', 'superseded', 'amended']),
  ...(faker.datatype.boolean() && { superseded_by: `IS ${faker.number.int({ min: 100, max: 999 })}:${faker.date.recent().getFullYear()}` }),
  ...(faker.datatype.boolean() && { amendment_no: `Amendment ${faker.number.int({ min: 1, max: 5 })}` }),
});

const generateRecommendation = (standard: Standard): Recommendation => ({
  standard,
  match_score: faker.number.int({ min: 0, max: 100 }),
  rationale: faker.lorem.sentences(2),
  matched_by: faker.helpers.arrayElement(['vector', 'keyword', 'hybrid']),
});

const generateHistoryEntry = (): HistoryEntry => ({
  id: faker.string.uuid(),
  timestamp: faker.date.recent().toISOString(),
  type: faker.helpers.arrayElement(['search', 'tender']),
  query: faker.lorem.words(3),
  top_result: `IS ${faker.number.int({ min: 100, max: 999 })}:${faker.date.past().getFullYear()}`,
  match_score: faker.number.int({ min: 60, max: 100 }),
});

const generateStats = (): Stats => ({
  standards_indexed: faker.number.int({ min: 1000, max: 10000 }),
  tenders_scanned: faker.number.int({ min: 100, max: 5000 }),
  avg_match_score: parseFloat(faker.number.float({ min: 60, max: 90, fractionDigits: 2 }).toFixed(2)),
  domains_covered: faker.number.int({ min: 8, max: 11 }),
  activity_30d: Array.from({ length: 30 }, () => ({
    date: faker.date.recent({ days: 30 }).toISOString().split('T')[0],
    count: faker.number.int({ min: 0, max: 100 }),
  })),
  domain_breakdown: domains.map(domain => ({
    domain,
    count: faker.number.int({ min: 50, max: 500 }),
  })),
});

let mockStandards: Standard[] = Array.from({ length: 100 }, generateStandard);
let mockHistory: HistoryEntry[] = Array.from({ length: 20 }, generateHistoryEntry);
let mockStats = generateStats();

export const api = {
  search: async (_query: string): Promise<{ recommendations: Recommendation[] }> => {
    await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 100, max: 500 })));
    const recommendations = mockStandards
      .map(standard => generateRecommendation(standard))
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 5);
    return { recommendations };
  },

  scanTender: async (pdf: File): Promise<{ products: { product_name: string; specification: string; recommendations: Recommendation[] }[] }> => {
    // Delegate to the real backend API — no mock data is used.
    // The PDF content is analysed server-side; the filename is never used for inference.
    const result = await realScanTender(pdf);

    // Map real API response shape to the shape the existing ScanTender UI expects.
    // The real recommendations don't have a nested `standard` object, so we adapt them.
    const products = result.products.map((item) => ({
      product_name:   item.product_name,
      specification:  item.specification,
      source_pages:   item.source_pages,
      raw_context:    item.raw_context,
      recommendations: item.recommendations.map((rec) => ({
        standard: {
          standard_id:   rec.standard_id,
          title:         rec.title ?? '',
          domain:        rec.domain ?? '',
          scope:         rec.scope ?? '',
          status:        (rec.status ?? 'active') as 'active' | 'superseded' | 'amended',
          amendment_no:  undefined,
        },
        match_score:   rec.similarity_score != null
                         ? Math.round(rec.similarity_score * 100)
                         : 0,
        rationale:     rec.rationale ?? '',
        matched_by:    'vector' as const,
      })),
    }));

    return { products };
  },

  compare: async (standardIds: string[]): Promise<{ standards: Standard[] }> => {
    await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 100, max: 500 })));
    const standards = mockStandards.filter(s => standardIds.includes(s.standard_id));
    return { standards };
  },

  getHistory: async (): Promise<{ entries: HistoryEntry[] }> => {
    await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 100, max: 500 })));
    return { entries: mockHistory };
  },

  verify: async (standardId: string): Promise<{ standard: Standard; dataset_date: string }> => {
    await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 100, max: 500 })));
    const standard = mockStandards.find(s => s.standard_id === standardId) || mockStandards[0];
    return { standard, dataset_date: faker.date.recent().toISOString().split('T')[0] };
  },

  getStats: async (): Promise<Stats> => {
    await new Promise(resolve => setTimeout(resolve, faker.number.int({ min: 100, max: 500 })));
    return mockStats;
  },
};